import { importsFor } from "./imports";
import { entriesFor, pairsFor, passagesFor } from "./library";
import type { StudyState } from "../app/study-data";

export async function studyState(owner: string): Promise<StudyState> {
  const [entries, pairs, imports, passages] = await Promise.all([
    entriesFor(owner), pairsFor(owner), importsFor(owner), passagesFor(owner),
  ]);
  return { entries, pairs, imports, passages };
}
