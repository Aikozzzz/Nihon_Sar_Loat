import { kanjiExampleKey, type CompoundCard, type CompoundReview, type Entry, type KanjiExample, type ReviewCard } from "./study-data.ts";

const hai: KanjiExample[] = [
  { term: "配る", reading: "くばる", meaning: "to hand out", sentence: "授業の前に先生がプリントを配った。", translation: "The teacher handed out worksheets before class." },
  { term: "気を配る", reading: "きをくばる", meaning: "to pay attention to", sentence: "介護士は利用者の小さな変化にも気を配る。", translation: "Care workers pay attention even to small changes in the people they care for." },
  { term: "配達", reading: "はいたつ", meaning: "delivery", sentence: "荷物の配達は明日の午後です。", translation: "The package is scheduled for delivery tomorrow afternoon." },
  { term: "心配", reading: "しんぱい", meaning: "worry", sentence: "弟がまだ帰ってこないので心配です。", translation: "I’m worried because my younger brother hasn’t come home yet." },
  { term: "配分", reading: "はいぶん", meaning: "allocation", sentence: "試験では時間の配分に気をつけよう。", translation: "Pay attention to how you allocate your time during the exam." },
];

export function reviewExamples(card: Entry, entries: Entry[], suggestions: KanjiExample[] = []) {
  const vocabulary = entries.filter(({ kind, term }) => kind === "Vocabulary" && term !== card.term && term.includes(card.term));
  const examples = new Map<string, KanjiExample>();
  const words: KanjiExample[] = [...(card.examples ?? []), ...vocabulary, ...(card.term === "配" ? hai : []), ...suggestions];
  for (const word of words) {
    const key = kanjiExampleKey(word);
    const known = examples.get(key);
    if (!known) examples.set(key, word);
    else if (word.sentence && (!known.sentence || !known.translation && known.sentence === word.sentence)) {
      examples.set(key, { ...known, sentence: word.sentence, translation: word.translation });
    }
  }
  return [...examples.values()];
}

export function dueReviewCards(entries: Entry[], reviews: CompoundReview[], now = Date.now()) {
  const schedule = new Map(reviews.map((review) => [kanjiExampleKey(review), review.dueAt]));
  const cards: ReviewCard[] = [];
  const compounds = new Map<string, CompoundCard>();
  const kanji = entries.filter((entry) => entry.kind === "Kanji");
  const vocabulary = entries.filter((entry) => entry.kind === "Vocabulary");
  for (const card of kanji) {
    if (!card.dueAt || card.dueAt <= now) cards.push(card);
    for (const example of reviewExamples(card, vocabulary)) {
      const id = kanjiExampleKey(example);
      if ((schedule.get(id) ?? 0) > now) continue;
      const existing = compounds.get(id);
      if (existing) {
        if (!existing.sentence && example.sentence) {
          existing.sentence = example.sentence;
          existing.translation = example.translation;
        }
        continue;
      }
      const compound: CompoundCard = { ...example, id, kind: "Compound", kanji: card.term };
      compounds.set(id, compound);
      cards.push(compound);
    }
  }
  return cards;
}
