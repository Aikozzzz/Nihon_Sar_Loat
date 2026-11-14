import { reviewExamples } from "../app/kanji-review-examples.ts";
import { intervals, kana, kanjiExampleKey, normalize, type CompoundReview, type Rating } from "../app/study-data.ts";
import { AppError, database, lockAccount, transaction } from "./database.ts";
import { entriesFor, writeEntry } from "./library.ts";

export async function compoundReviewsFor(owner: string): Promise<CompoundReview[]> {
  const { rows } = await database().query<CompoundReview>(`
    SELECT DISTINCT ON (term, reading) term, reading, rating, due AS "dueAt"
    FROM nihon_private.compound_reviews WHERE owner=$1
    ORDER BY term, reading, id DESC
  `, [owner]);
  return rows;
}

export function rateCompound(owner: string, kanji: string, term: string, reading: string, rating: unknown, event: string) {
  if (typeof rating !== "string" || !Object.hasOwn(intervals, rating)) throw new AppError("Choose a review rating.");
  return transaction(async (db) => {
    await lockAccount(db, owner);
    const entries = await entriesFor(owner, db);
    const parent = entries.find((entry) => entry.kind === "Kanji" && entry.term === kanji);
    const key = kanjiExampleKey({ term, reading });
    if (!parent || !reviewExamples(parent, entries).some((example) => kanjiExampleKey(example) === key)) {
      throw new AppError("This word is no longer in your kanji review.", 404);
    }
    const now = Date.now();
    const dueAt = now + intervals[rating as Rating] * 86_400_000;
    await db.query(`
      INSERT INTO nihon_private.compound_reviews (event, owner, term, reading, rating, reviewed, due)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (owner, event) DO NOTHING
    `, [event, owner, normalize(term), kana(reading).replace(/\s/g, ""), rating, now, dueAt]);
  });
}

export function addKanjiReviewExamples(owner: string, id: string, examples: unknown) {
  if (!Array.isArray(examples) || !examples.length || examples.length > 5) throw new AppError("Choose examples to add to review.");
  return transaction(async (db) => {
    await lockAccount(db, owner);
    const parent = (await entriesFor(owner, db)).find((entry) => entry.kind === "Kanji" && entry.id === id);
    if (!parent) throw new AppError("Choose a kanji from your library.", 404);
    await writeEntry(db, owner, { ...parent, examples: [...(parent.examples ?? []), ...examples] }, { edit: true });
  });
}
