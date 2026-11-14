export type Rating = "Hard" | "Normal" | "Easy";
export type Kind = "Kanji" | "Vocabulary";
export type ImportKind = Kind | "mixed";
export const partOfSpeechLabels = {
  noun: "Noun", "i-adjective": "い-adjective", "na-adjective": "な-adjective",
  verb: "Verb", adverb: "Adverb", pronoun: "Pronoun", determiner: "Determiner",
  particle: "Particle", conjunction: "Conjunction", interjection: "Interjection",
  counter: "Counter", prefix: "Prefix", suffix: "Suffix", expression: "Expression", other: "Other",
} as const;
export type PartOfSpeech = keyof typeof partOfSpeechLabels;
export type KanjiExample = { term: string; reading: string; meaning: string; partsOfSpeech?: PartOfSpeech[] };
export type SourceReference = { title: string; page?: number; document?: string };
export type Pair = [string, string];
export type Entry = {
  id: string;
  kind: Kind;
  term: string;
  reading: string;
  meaning: string;
  source: string;
  page?: number;
  sources?: SourceReference[];
  rating?: Rating;
  dueAt?: number;
  studiedAt?: number;
  examples?: KanjiExample[];
  partsOfSpeech?: PartOfSpeech[];
};

export type ImportExample = KanjiExample & { suggestedPartsOfSpeech?: PartOfSpeech[] };
export type Candidate = Entry & {
  confidence: "high" | "low";
  aiFields: ("reading" | "meaning")[];
  examples?: ImportExample[];
  suggestedPartsOfSpeech?: PartOfSpeech[];
};
export type ImportPage = { page: number; status: "queued" | "processing" | "ready" | "failed"; ocr: boolean; error?: string; candidates: Candidate[] };
export type ImportSummary = { id: string; name: string; status: ImportPage["status"] | "confirmed"; count: number };
export type ImportJob = ImportSummary & { pages: ImportPage[]; estimatedRemainingMs?: number };
export type Format = "Notice" | "Short article";
export type Match = { entry: string; start: number; end: number; reading?: string };
export type Passage = {
  id: string;
  title: string;
  format: Format;
  paragraphs: string[];
  targets: Entry[];
  matches: Match[][];
  sample?: boolean;
};

export const formatOptions: Format[] = ["Notice", "Short article"];
export type StudyState = { entries: Entry[]; pairs: Pair[]; imports: ImportSummary[]; passages: Passage[] };
export const pageLimit = 20;
export const fileLimit = 50 * 1024 * 1024;

export function pageRange(value: string) {
  const match = value.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return start >= 1 && end >= start && end - start < pageLimit && end <= 9999 ? { start, end } : null;
}

export function normalize(value: string) {
  return value.normalize("NFKC").trim();
}

export function importKindFromFilename(filename: string): ImportKind {
  const name = normalize(filename);
  if (/tango|goi|vocabulary|単語|語彙/iu.test(name)) return "Vocabulary";
  return /kanji|漢字/iu.test(name) ? "Kanji" : "mixed";
}

export function importKindForJob(kind: ImportKind | null, kanjiFilename: boolean | null, title: string): ImportKind {
  return kind ?? (kanjiFilename === true ? "Kanji" : kanjiFilename === false ? "mixed" : importKindFromFilename(title));
}

export function kana(value: string) {
  return normalize(value).replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60));
}

export function entryKey(entry: Pick<Entry, "kind" | "term" | "reading">) {
  return entry.kind === "Kanji" ? normalize(entry.term) : `${normalize(entry.term)}\u0000${kana(entry.reading).replace(/\s/g, "")}`;
}

export function references(entry: Entry): SourceReference[] {
  return entry.sources ?? [{ title: entry.source, page: entry.page }];
}

export function sourceTitles(entries: Entry[]) {
  return [...new Set(entries.flatMap((entry) => references(entry).map((ref) => ref.title)))].sort();
}

export function mergeMeanings(before: string, after: string) {
  const meanings = new Map<string, string>();
  for (const meaning of `${before};${after}`.split(";").map((value) => value.trim()).filter(Boolean)) {
    const key = meaning.toLowerCase();
    if (!meanings.has(key)) meanings.set(key, meaning);
  }
  return [...meanings.values()].join("; ");
}

export function entryIssue(entry: Pick<Entry, "kind" | "term" | "reading" | "meaning">): {
  field: "term" | "reading" | "meaning"; message: string;
} | undefined {
  const fields = [
    ["term", entry.kind === "Kanji" ? "kanji character" : "Japanese spelling", 60],
    ["reading", "furigana", 160],
    ["meaning", "English meaning", 500],
  ] as const;
  for (const [field, name, limit] of fields) {
    const value = entry[field];
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
      return { field, message: `Fill in the ${name}.` };
    }
    if (value.length > limit) return { field, message: `Shorten the ${name} to ${limit} characters or fewer.` };
  }
  const term = normalize(entry.term);
  if (entry.kind === "Kanji" && !/^\p{Script=Han}$/u.test(term)) {
    return { field: "term", message: "Enter one kanji character." };
  }
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) {
    return { field: "term", message: "Enter the word in Japanese." };
  }
  let reading = normalize(entry.reading);
  if (entry.kind === "Kanji") {
    // Some dictionaries mark where kana attach to a kanji reading with a dash.
    reading = reading.replace(/[-‐‑−]/g, "");
  }
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\u3099\u309Aー・、,;/()\s]+$/u.test(reading)
    || !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(reading)) {
    return { field: "reading", message: "Enter furigana in hiragana or katakana." };
  }
}

export function validateEntry(entry: Pick<Entry, "kind" | "term" | "reading" | "meaning">) {
  return entryIssue(entry)?.message ?? "";
}

export function kanjiExampleIssue(example: KanjiExample, kanji: string) {
  return entryIssue({ ...example, kind: "Vocabulary" }) ??
    (normalize(example.term) !== normalize(kanji) && normalize(example.term).includes(normalize(kanji))
      ? undefined : { field: "term" as const, message: `Enter a word that uses ${kanji}.` });
}

export function kanjiExampleKey(example: KanjiExample) {
  return entryKey({ ...example, kind: "Vocabulary" });
}

export function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return typeof value === "string" && Object.hasOwn(partOfSpeechLabels, value);
}

export function mergePartsOfSpeech(before?: PartOfSpeech[], after?: PartOfSpeech[]) {
  return [...new Set([...(before ?? []), ...(after ?? [])])];
}

export function mergeKanjiExamples(before: KanjiExample[], after: KanjiExample[]): KanjiExample[] {
  const words = new Map<string, KanjiExample>();
  for (const example of [...before, ...after]) {
    const key = kanjiExampleKey(example);
    const existing = words.get(key);
    words.set(key, existing ? {
      ...existing, meaning: mergeMeanings(existing.meaning, example.meaning),
      partsOfSpeech: mergePartsOfSpeech(existing.partsOfSpeech, example.partsOfSpeech),
    } : example);
  }
  return [...words.values()];
}

export const intervals: Record<Rating, number> = { Hard: 1, Normal: 3, Easy: 7 };
