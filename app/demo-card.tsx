"use client";

import { Layers3, RotateCcw } from "lucide-react";
import { useState } from "react";

export function DemoCard() {
  const [flipped, setFlipped] = useState(false);
  return <button className="landing-flashcard" type="button" aria-expanded={flipped} onClick={() => setFlipped((value) => !value)}>
    <span className="entry-eyebrow"><Layers3 size={13} /> KANJI FLASHCARD</span>
    <span className="landing-kanji" lang="ja">確</span>
    {flipped ? <span className="demo-card-answer" aria-live="polite"><span className="landing-kana" lang="ja">かく・たしか</span><strong>Certain, definite</strong></span>
      : <span className="landing-kana demo-card-cue"><RotateCcw size={14} /> Flip to reveal</span>}
  </button>;
}
