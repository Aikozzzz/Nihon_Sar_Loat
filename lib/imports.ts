import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { fileLimit, importKindForJob, importKindFromFilename, mergeKanjiExamples, normalize, pageRange, partOfSpeechLabels, type Candidate, type Entry, type ImportJob, type ImportKind, type ImportPage, type ImportSummary, type KanjiExample } from "../app/study-data.ts";
import { AppError, database, lockAccount, metric, transaction } from "./database.ts";
import { requireGroq } from "./groq.ts";
import { field, identifier, object, readBytes } from "./http.ts";
import { readPartsOfSpeech, writeEntry } from "./library.ts";

const retention = 86_400_000;
const pageLeaseMs = 180_000;
const defaultPageMs = 35_000;
type ImportRow = { id: string; name: string; document: string; count: number; created: number; confirmed: number | null; import_kind: ImportKind | null; kanji_filename: boolean | null };
type ExtractedCandidate = Entry & Pick<Candidate, "confidence" | "aiFields">;
type PageRow = { page: number; status: ImportPage["status"]; ocr: number; error: string | null; candidates: ExtractedCandidate[] | null; until: number | null };

export async function sweep() {
  const now = Date.now();
  const db = database();
  await db.query("DELETE FROM nihon_private.imports WHERE confirmed IS NULL AND expires <= $1", [now]);
  await db.query("DELETE FROM nihon_private.passages WHERE saved=0 AND created <= $1", [now - retention]);
  await db.query("DELETE FROM nihon_private.metrics WHERE created <= $1", [now - 30 * retention]);
  await db.query("DELETE FROM nihon_private.email_tokens WHERE expires <= $1", [now]);
  await db.query("DELETE FROM nihon_private.sessions WHERE expires <= $1", [now]);
  await db.query("DELETE FROM nihon_private.auth_attempts WHERE expires <= $1", [now]);
}

function state(pages: Pick<PageRow, "status">[]): ImportPage["status"] {
  if (pages.some(({ status }) => status === "processing")) return "processing";
  if (pages.some(({ status }) => status === "queued")) return "queued";
  return pages.some(({ status }) => status === "ready") ? "ready" : "failed";
}

export async function importsFor(owner: string): Promise<ImportSummary[]> {
  const { rows } = await database().query<ImportSummary>(`
    SELECT i.id,i.name,i.count,
      CASE WHEN i.confirmed IS NOT NULL THEN 'confirmed'
           WHEN p.processing THEN 'processing' WHEN p.queued THEN 'queued'
           WHEN p.ready THEN 'ready' ELSE 'failed' END AS status
    FROM (SELECT id,name,count,confirmed,created FROM nihon_private.imports
      WHERE owner=$1 AND (expires>$2 OR confirmed IS NOT NULL)
      ORDER BY created DESC,id LIMIT 25) i
    LEFT JOIN LATERAL (
      SELECT bool_or(status='processing') AS processing, bool_or(status='queued') AS queued, bool_or(status='ready') AS ready
      FROM nihon_private.import_pages WHERE job=i.id
    ) p ON i.confirmed IS NULL
    ORDER BY i.created DESC,i.id
  `, [owner, Date.now()]);
  return rows;
}

async function ownedJob(db: Pool | PoolClient, owner: string, id: string, lock = false) {
  const { rows: [job] } = await db.query<ImportRow>(`
    SELECT id,name,document,created,confirmed,count,import_kind,kanji_filename FROM nihon_private.imports WHERE owner=$1 AND id=$2
      AND (confirmed IS NOT NULL OR expires>$3)${lock ? " FOR NO KEY UPDATE" : ""}
  `, [owner, id, Date.now()]);
  if (!job) throw new AppError("This import is unavailable or expired. Upload the PDF again.", 404);
  return job;
}

async function jobPages(db: PoolClient, job: ImportRow) {
  return job.confirmed ? [] : (await db.query<PageRow>(`
    SELECT page,status,ocr,error,candidates,until FROM nihon_private.import_pages WHERE job=$1 ORDER BY page
  `, [job.id])).rows;
}

function previewPages(rows: PageRow[], job: ImportRow): ImportPage[] {
  const kind = importKindForJob(job.import_kind, job.kanji_filename, job.name);
  return rows.map(({ page, status, ocr, error, candidates }) => ({
    page, status, ocr: Boolean(ocr), error: error ?? undefined,
    candidates: groupLegacyCandidates(candidates ?? [], kind).map(({ partsOfSpeech, examples, ...entry }): Candidate => ({
      ...entry,
      suggestedPartsOfSpeech: partsOfSpeech,
      examples: examples?.map(({ partsOfSpeech, ...example }) => ({ ...example, suggestedPartsOfSpeech: partsOfSpeech })),
    })),
  }));
}

async function estimateRemaining(db: PoolClient, pages: PageRow[]) {
  const now = Date.now();
  const { rows: [{ average }] } = await db.query<{ average: number | null }>(`
    SELECT avg(duration)::double precision AS average FROM (
      SELECT duration FROM nihon_private.metrics
      WHERE operation='import_page' AND result='ready' AND created>$1
      ORDER BY created DESC LIMIT 30
    ) recent
  `, [now - 30 * retention]);
  const pageMs = Math.max(5_000, average ?? defaultPageMs);
  let remainingMs = 0;
  for (const page of pages) {
    if (page.status === "queued" || (page.status === "processing" && (!page.until || page.until <= now))) {
      remainingMs += pageMs;
    } else if (page.status === "processing" && page.until) {
      const elapsedMs = Math.max(0, now - (page.until - pageLeaseMs));
      remainingMs += Math.max(pageMs / 2, pageMs - elapsedMs);
    }
  }
  return remainingMs;
}

function groupLegacyCandidates(candidates: ExtractedCandidate[], kind: ImportKind): ExtractedCandidate[] {
  if (candidates.every((candidate) => candidate.examples !== undefined)) return candidates;
  if (kind === "Vocabulary") return candidates.map((candidate) => ({ ...candidate, kind, examples: undefined }));
  if (kind !== "Kanji") return candidates;

  const words = candidates.filter((candidate) => candidate.kind === "Vocabulary");
  return candidates.filter((candidate) => candidate.kind === "Kanji").map((entry) => {
    const examples = words.filter((word) => word.term !== entry.term && word.term.includes(entry.term))
      .map(({ term, reading, meaning, partsOfSpeech }) => ({ term, reading, meaning, partsOfSpeech }));
    return { ...entry, examples: mergeKanjiExamples(entry.examples ?? [], examples) };
  });
}

export function importFor(owner: string, id: string): Promise<ImportJob> {
  return transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const job = await ownedJob(db, owner, id);
    const pages = await jobPages(db, job);
    const status = job.confirmed ? "confirmed" : state(pages);
    const estimatedRemainingMs = status === "queued" || status === "processing" ? await estimateRemaining(db, pages) : undefined;
    return { id, name: job.name, count: job.count, status, pages: previewPages(pages, job), estimatedRemainingMs };
  });
}

async function activeCount(db: Pool | PoolClient, owner: string) {
  const { rows: [{ count }] } = await db.query<{ count: number }>(
    "SELECT count(*) AS count FROM nihon_private.imports WHERE owner=$1 AND confirmed IS NULL AND expires>$2", [owner, Date.now()]);
  return count;
}

export async function queueImport(owner: string, request: Request) {
  const url = new URL(request.url);
  const range = pageRange(url.searchParams.get("range") ?? "");
  if (!range) throw new AppError("Enter up to 20 pages, for example 1–2.");
  if (url.searchParams.get("consent") !== "yes") throw new AppError("Confirm that the selected page text may be sent to Groq.");
  const name = field(url.searchParams.get("name"), "source title", 160);
  const encodedFilename = request.headers.get("x-pdf-filename");
  let filename = name;
  if (encodedFilename !== null) {
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch {
      throw new AppError("Choose a PDF with a valid filename.");
    }
  }
  const importKind = importKindFromFilename(filename);
  const layout = url.searchParams.get("layout") ?? "auto";
  if (!["auto", "horizontal", "vertical"].includes(layout)) throw new AppError("Choose an OCR layout.");
  if (request.headers.get("content-type") !== "application/pdf") throw new AppError("Choose a PDF file.", 415);
  if (await activeCount(database(), owner) >= 2) throw new AppError("Finish or cancel an existing import before starting another.", 429);
  requireGroq();
  const bytes = await readBytes(request, fileLimit, "Choose a PDF up to 50 MB.");
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new AppError("The file could not be read as a PDF.");
  const document = createHash("sha256").update(bytes).digest("hex");
  const id = randomUUID();
  const now = Date.now();
  await transaction(async (db) => {
    await lockAccount(db, owner);
    if (await activeCount(db, owner) >= 2) throw new AppError("Finish or cancel an existing import before starting another.", 429);
    await db.query("INSERT INTO nihon_private.imports(id,owner,name,document,pdf,created,expires,layout,kanji_filename,import_kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id, owner, name, document, bytes, now, now + retention, layout, importKind === "Kanji", importKind]);
    await db.query("INSERT INTO nihon_private.import_pages(job,page) SELECT $1, generate_series($2::integer,$3::integer)", [id, range.start, range.end]);
  });
  return importFor(owner, id);
}

export async function retryImport(owner: string, id: string) {
  requireGroq();
  const updated = await transaction(async (db) => {
    const job = await ownedJob(db, owner, id, true);
    if (job.confirmed) throw new AppError("Upload the PDF again to retry this import.", 409);
    const result = await db.query(`
      UPDATE nihon_private.import_pages SET status='queued',error=NULL,lease=NULL,until=NULL
      WHERE job=$1 AND status='failed'
    `, [id]);
    return result.rowCount;
  });
  if (updated) await metric("import_retry", "queued", Date.now());
  return importFor(owner, id);
}

export async function confirmImport(owner: string, id: string, selection: unknown) {
  if (!Array.isArray(selection) || selection.length < 1 || selection.length > 1200) {
    throw new AppError("Select at least one candidate to save.");
  }
  const created = await transaction(async (db) => {
    await lockAccount(db, owner);
    const job = await ownedJob(db, owner, id, true);
    if (job.confirmed) return null;
    const pages = await jobPages(db, job);
    if (pages.some(({ status }) => status === "queued" || status === "processing")) {
      throw new AppError("Wait for processing to finish before confirming.", 409);
    }
    const candidates = new Map(previewPages(pages, job).flatMap((page) => page.candidates).map((item) => [item.id, item]));
    const used = new Set<string>();
    const entries = new Set<string>();
    for (const value of selection) {
      const edit = object(value);
      const candidate = candidates.get(identifier(edit.id));
      if (!candidate || used.has(candidate.id)) throw new AppError("Choose candidates from this import.");
      used.add(candidate.id);
      const submittedExamples = edit.examples ?? candidate.examples;
      const examples = Array.isArray(submittedExamples) ? submittedExamples.map((value) => {
        const example = object(value);
        return { ...example, partsOfSpeech: example.confirmedPartsOfSpeech };
      }) : submittedExamples;
      entries.add(await writeEntry(db, owner, {
        ...candidate, term: edit.term, reading: edit.reading, meaning: edit.meaning,
        examples, partsOfSpeech: edit.confirmedPartsOfSpeech,
      }, {
        reference: { title: job.name, document: job.document, page: candidate.page },
      }));
    }
    await db.query("UPDATE nihon_private.imports SET confirmed=$1,count=$2,pdf=NULL WHERE id=$3", [Date.now(), entries.size, id]);
    await db.query("DELETE FROM nihon_private.import_pages WHERE job=$1", [id]);
    await db.query("UPDATE nihon_private.accounts SET onboarded=1 WHERE id=$1 AND onboarded=0", [owner]);
    return job.created;
  });
  if (created !== null) await metric("import", "confirmed", created);
  return importFor(owner, id);
}

export async function cancelImport(owner: string, id: string) {
  await database().query("DELETE FROM nihon_private.imports WHERE owner=$1 AND id=$2 AND confirmed IS NULL", [owner, id]);
}

type ClaimedPage = { job: string; page: number; name: string; layout: string; kanji_filename: boolean | null; import_kind: ImportKind | null };

export async function claimPage() {
  const lease = randomUUID();
  const page = await transaction(async (db) => {
    // Serialize only lease acquisition so two workers cannot claim different pages for one owner.
    await db.query("SELECT pg_advisory_xact_lock($1, $2)", [1368330062, 1]);
    const now = Date.now();
    const { rows: [page] } = await db.query<ClaimedPage>(`
      WITH next_page AS (
        SELECT p.job,p.page,i.name,i.layout,i.kanji_filename,i.import_kind FROM nihon_private.import_pages p JOIN nihon_private.imports i ON i.id=p.job
        WHERE i.expires>$1 AND i.confirmed IS NULL
          AND (p.status='queued' OR (p.status='processing' AND p.until<=$1))
          AND NOT EXISTS (SELECT 1 FROM nihon_private.import_pages q JOIN nihon_private.imports j ON j.id=q.job
            WHERE j.owner=i.owner AND q.status='processing' AND q.until>$1)
        ORDER BY i.created,p.page,p.job LIMIT 1 FOR UPDATE OF p SKIP LOCKED
      )
      UPDATE nihon_private.import_pages p SET status='processing',lease=$2,until=$3,attempts=p.attempts+1
      FROM next_page n WHERE p.job=n.job AND p.page=n.page RETURNING n.*
    `, [now, lease, now + pageLeaseMs]);
    return page;
  });
  if (!page) return null;
  const { rows: [upload] } = await database().query<{ pdf: Buffer }>(`
    SELECT i.pdf FROM nihon_private.imports i JOIN nihon_private.import_pages p ON p.job=i.id
    WHERE i.id=$1 AND p.page=$2 AND p.lease=$3 AND i.expires>$4
  `, [page.job, page.page, lease, Date.now()]);
  return upload?.pdf ? { ...page, lease, pdf: upload.pdf } : null;
}

export async function pageIsCurrent(job: string, page: number, lease: string) {
  const result = await database().query(`
    SELECT 1 FROM nihon_private.import_pages p JOIN nihon_private.imports i ON i.id=p.job
    WHERE p.job=$1 AND p.page=$2 AND p.lease=$3 AND p.until>$4 AND i.expires>$4
  `, [job, page, lease, Date.now()]);
  return Boolean(result.rowCount);
}

export async function finishPage(job: string, page: number, lease: string, ocr: boolean, candidates: ExtractedCandidate[] | null, error: string | null, start: number) {
  const result = await database().query(`
    UPDATE nihon_private.import_pages p SET status=$1,ocr=$2,candidates=$3,error=$4,lease=NULL,until=NULL
    FROM nihon_private.imports i WHERE i.id=p.job AND p.job=$5 AND p.page=$6 AND p.lease=$7 AND p.until>$8 AND i.expires>$8
  `, [candidates ? "ready" : "failed", Number(ocr), candidates ? JSON.stringify(candidates) : null, error, job, page, lease, Date.now()]);
  if (result.rowCount) await metric("import_page", candidates ? "ready" : "failed", start);
}

const partsOfSpeech = { type: "array", items: { type: "string", enum: Object.keys(partOfSpeechLabels) } };
const exampleFields = { term: { type: "string" }, reading: { type: "string" }, meaning: { type: "string" }, partsOfSpeech };
const candidateFields = {
  kind: { type: "string", enum: ["Kanji", "Vocabulary"] }, term: { type: "string" },
  reading: { type: "string" }, meaning: { type: "string" }, confidence: { type: "string", enum: ["high", "low"] },
  aiFields: { type: "array", items: { type: "string", enum: ["reading", "meaning"] } },
  partsOfSpeech,
  examples: { type: "array", items: {
    type: "object", additionalProperties: false, required: Object.keys(exampleFields), properties: exampleFields,
  } },
};
export function extractSchema(kind: ImportKind) {
  const properties = kind === "mixed" ? candidateFields : { ...candidateFields, kind: { type: "string", enum: [kind] } };
  return {
    type: "object", additionalProperties: false, required: ["candidates"],
    properties: { candidates: { type: "array", items: {
      type: "object", additionalProperties: false, required: Object.keys(properties), properties,
    } } },
  };
}

export function parseCandidates(value: unknown, name: string, page: number, ocr: boolean, importKind: ImportKind): ExtractedCandidate[] {
  const { candidates } = object(value);
  if (!Array.isArray(candidates) || candidates.length > 60) throw new AppError("Groq returned invalid extraction data. Retry this page.", 502);
  return candidates.map((raw) => {
    const item = object(raw);
    const { kind, confidence, aiFields, examples } = item;
    const term = normalize(field(item.term, "Japanese term", 60));
    if ((kind !== "Kanji" && kind !== "Vocabulary") || (confidence !== "high" && confidence !== "low")
      || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)
      || (kind === "Kanji" && !/^\p{Script=Han}$/u.test(term))
      || (importKind !== "mixed" && kind !== importKind)
      || !Array.isArray(aiFields) || aiFields.some((value) => value !== "reading" && value !== "meaning")
      || !Array.isArray(examples) || examples.length > 12 || (kind === "Vocabulary" && examples.length)) {
      throw new AppError("Groq returned invalid extraction data. Retry this page.", 502);
    }
    const reading = field(item.reading, "reading", 160, true);
    const meaning = field(item.meaning, "meaning", 500, true);
    const parts = readPartsOfSpeech(item.partsOfSpeech, 502);
    if (kind === "Kanji" && parts?.length) throw new AppError("Groq returned a part of speech for a single kanji. Retry this page.", 502);
    const words: KanjiExample[] = examples.map((raw) => {
      const word = object(raw);
      const spelling = normalize(field(word.term, "example spelling", 60));
      if (spelling === term || !spelling.includes(term)) throw new AppError("Groq returned an example without its kanji. Retry this page.", 502);
      return {
        term: spelling, reading: field(word.reading, "example furigana", 160, true),
        meaning: field(word.meaning, "example meaning", 500, true), partsOfSpeech: readPartsOfSpeech(word.partsOfSpeech, 502),
      };
    });
    return {
      id: randomUUID(), kind, term, reading, meaning, source: name, page,
      examples: mergeKanjiExamples([], words), partsOfSpeech: parts,
      confidence: ocr || !reading || !meaning ? "low" : confidence, aiFields: [...new Set(aiFields)],
    };
  });
}
