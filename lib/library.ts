import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { entryKey, intervals, isPartOfSpeech, kanjiExampleIssue, mergeKanjiExamples, mergeMeanings, mergePartsOfSpeech, normalize, normalizeReading, validateEntry, type Entry, type KanjiExample, type Pair, type PartOfSpeech, type Passage, type Rating, type SourceReference } from "../app/study-data.ts";
import { AppError, database, lockAccount, transaction } from "./database.ts";

type EntryRow = Omit<Entry, "source" | "page" | "sources" | "rating" | "dueAt"> & { rating: Rating | null; due: number | null; studied: number; parts_of_speech: PartOfSpeech[] };
type ReferenceRow = { title: string; document: string; page: number };

export async function entriesFor(owner: string): Promise<Entry[]> {
  const { rows } = await database().query<EntryRow & { refs: ReferenceRow[] | null }>(`
    SELECT e.id, e.kind, e.term, e.reading, e.meaning, e.rating, e.due, e.studied, e.examples, e.parts_of_speech,
      (SELECT jsonb_agg(jsonb_build_object('title', s.title, 'document', s.document, 'page', s.page) ORDER BY s.title, s.page)
        FROM nihon_private.sources s WHERE s.entry=e.id) AS refs
    FROM nihon_private.entries e WHERE e.owner=$1 ORDER BY e.studied DESC, e.id
  `, [owner]);
  return rows.map(({ id, kind, term, reading, meaning, rating, due, studied, refs, examples, parts_of_speech: partsOfSpeech }) => {
    const sources: SourceReference[] = refs?.map(({ title, document, page }) => ({ title, document, page: page || undefined }))
      ?? [{ title: "Manual entry" }];
    return { id, kind, term, reading, meaning, examples, partsOfSpeech, rating: rating ?? undefined, dueAt: due ?? undefined, studiedAt: studied, sources, source: sources[0].title, page: sources[0].page };
  });
}

export function readPartsOfSpeech(value: unknown, status = 400): PartOfSpeech[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isPartOfSpeech)) throw new AppError("Choose a valid part of speech.", status);
  return mergePartsOfSpeech(value);
}

// Call within a transaction that has locked the owner's account.
export async function writeEntry(db: PoolClient, owner: string, input: unknown, options: { edit?: boolean; reference?: SourceReference } = {}) {
  if (!input || typeof input !== "object") throw new AppError("Choose an entry to save.");
  const data = input as Entry;
  if (data.kind !== "Kanji" && data.kind !== "Vocabulary") throw new AppError("Choose Kanji or Vocabulary.");
  const invalid = validateEntry(data);
  if (invalid) throw new AppError(invalid);
  const entry = { ...data, term: normalize(data.term), reading: normalizeReading(data.kind, data.reading), meaning: data.meaning.trim() };
  const parts = readPartsOfSpeech(data.partsOfSpeech);
  if (entry.kind === "Kanji" && parts?.length) throw new AppError("Assign parts of speech to words.");
  let examples: KanjiExample[] | undefined;
  if (data.examples !== undefined) {
    if (!Array.isArray(data.examples) || (entry.kind !== "Kanji" && data.examples.length)) {
      throw new AppError("Save examples under a kanji entry.");
    }
    examples = data.examples.map((example) => {
      if (!example || typeof example !== "object") throw new AppError("Enter a valid example word.");
      const issue = kanjiExampleIssue(example, entry.term);
      if (issue) throw new AppError(issue.message);
      return { term: normalize(example.term), reading: normalize(example.reading), meaning: example.meaning.trim(), partsOfSpeech: readPartsOfSpeech(example.partsOfSpeech) };
    });
  }
  // The vocabulary identity uses a NUL separator, which PostgreSQL text cannot store.
  const key = Buffer.from(entryKey(entry));
  const { rows: [existing] } = await db.query<{ id: string; reading: string; meaning: string; examples: KanjiExample[]; parts_of_speech: PartOfSpeech[] }>(
    "SELECT id, reading, meaning, examples, parts_of_speech FROM nihon_private.entries WHERE owner=$1 AND kind=$2 AND identity=$3", [owner, entry.kind, key]);
  let id: string;
  if (options.edit) {
    const { rows: [saved] } = await db.query<{ kind: Entry["kind"]; examples: KanjiExample[] }>("SELECT kind, examples FROM nihon_private.entries WHERE owner=$1 AND id=$2",
      [owner, typeof entry.id === "string" && !entry.id.includes("\0") ? entry.id : ""]);
    if (!saved) throw new AppError("This entry is no longer in your library.", 404);
    if (saved.kind !== entry.kind || (existing && existing.id !== entry.id)) throw new AppError("That entry already exists in your library.", 409);
    id = entry.id;
    const updated = examples ?? saved.examples;
    if (updated.some((example) => kanjiExampleIssue(example, entry.term))) throw new AppError("Update the examples to match this kanji.");
    await db.query("UPDATE nihon_private.entries SET identity=$1, term=$2, reading=$3, meaning=$4, examples=$5, parts_of_speech=COALESCE($6, parts_of_speech) WHERE owner=$7 AND id=$8",
      [key, entry.term, entry.reading, entry.meaning, JSON.stringify(mergeKanjiExamples([], updated)), parts ?? null, owner, id]);
  } else if (existing) {
    id = existing.id;
    const reading = entry.kind === "Kanji" ? [...new Set(`${normalizeReading("Kanji", existing.reading)}・${entry.reading}`.split(/[・、]/).map((value) => value.trim()).filter(Boolean))].join("・") : existing.reading;
    await db.query("UPDATE nihon_private.entries SET meaning=$1, reading=$2, examples=$3, parts_of_speech=$4 WHERE owner=$5 AND id=$6",
      [mergeMeanings(existing.meaning, entry.meaning), reading, JSON.stringify(mergeKanjiExamples(existing.examples, examples ?? [])), mergePartsOfSpeech(existing.parts_of_speech, parts), owner, id]);
  } else {
    id = randomUUID();
    await db.query("INSERT INTO nihon_private.entries(id, owner, kind, identity, term, reading, meaning, studied, examples, parts_of_speech) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id, owner, entry.kind, key, entry.term, entry.reading, entry.meaning, Date.now(), JSON.stringify(mergeKanjiExamples([], examples ?? [])), parts ?? []]);
  }
  const ref = options.reference ?? { title: "Manual entry", document: "manual" };
  if (options.reference || (!options.edit && !existing)) {
    await db.query("INSERT INTO nihon_private.sources(entry, document, title, page) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [id, ref.document ?? ref.title, ref.title, ref.page ?? 0]);
  }
  return id;
}

export function saveEntry(owner: string, input: unknown, edit: boolean) {
  return transaction(async (db) => {
    await lockAccount(db, owner);
    await writeEntry(db, owner, input, { edit });
    await db.query("UPDATE nihon_private.accounts SET onboarded=1 WHERE id=$1 AND onboarded=0", [owner]);
  });
}

export function removeEntry(owner: string, id: string) {
  return transaction(async (db) => {
    await lockAccount(db, owner);
    await db.query("DELETE FROM nihon_private.entries WHERE owner=$1 AND id=$2", [owner, id]);
  });
}

export function rateEntry(owner: string, id: string, rating: unknown, event: string) {
  if (typeof rating !== "string" || !Object.hasOwn(intervals, rating) || !/^[a-f0-9-]{36}$/.test(event)) throw new AppError("Choose a review rating.");
  return transaction(async (db) => {
    await lockAccount(db, owner);
    const card = await db.query("SELECT id FROM nihon_private.entries WHERE owner=$1 AND id=$2 AND kind='Kanji'", [owner, id]);
    if (!card.rowCount) throw new AppError("This kanji is no longer in your library.", 404);
    const now = Date.now();
    const due = now + intervals[rating as Rating] * 86_400_000;
    const result = await db.query("INSERT INTO nihon_private.reviews(id, entry, rating, reviewed, due) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [event, id, rating, now, due]);
    if (result.rowCount) await db.query("UPDATE nihon_private.entries SET rating=$1, due=$2 WHERE owner=$3 AND id=$4", [rating, due, owner, id]);
  });
}

export function savePair(owner: string, first: string, second: string) {
  if (first === second) throw new AppError("Choose two different kanji.");
  const ids = [first, second].sort();
  return transaction(async (db) => {
    await lockAccount(db, owner);
    const cards = await db.query("SELECT id FROM nihon_private.entries WHERE owner=$1 AND kind='Kanji' AND id IN ($2,$3)", [owner, ...ids]);
    if (cards.rowCount !== 2) throw new AppError("Choose two kanji from your library.");
    await db.query("INSERT INTO nihon_private.pairs(owner, first, second) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [owner, ...ids]);
  });
}

export async function pairsFor(owner: string): Promise<Pair[]> {
  const { rows } = await database().query<{ first: string; second: string }>("SELECT first, second FROM nihon_private.pairs WHERE owner=$1", [owner]);
  return rows.map(({ first, second }) => [first, second]);
}

export async function passagesFor(owner: string): Promise<Passage[]> {
  const { rows } = await database().query<{ data: Passage }>("SELECT data FROM nihon_private.passages WHERE owner=$1 AND saved=1 ORDER BY created DESC", [owner]);
  return rows.map(({ data }) => data);
}
