"use client";

import { post } from "../study-api";
import type { Entry } from "../study-data";
import { FlashcardSession, PageHeading } from "../study-views";

const cards: Entry[] = [
  { id: "sample-1", kind: "Kanji", term: "選", reading: "せん・えら(ぶ)", meaning: "Choose, select", source: "Sample" },
  { id: "sample-2", kind: "Kanji", term: "続", reading: "ぞく・つづ(く)・つづ(ける)", meaning: "Continue", source: "Sample" },
];

export function SampleSession({ onboarding }: { onboarding: boolean }) {
  return <>
    <PageHeading title="Sample flashcards">Recall each reading and meaning before you flip.</PageHeading>
    <FlashcardSession queue={cards} mode="Sample" entries={[]} rate={async (entry) => {
      if (onboarding && entry.id === cards.at(-1)?.id) await post("onboard");
    }} close={() => window.location.assign("/study")} />
  </>;
}
