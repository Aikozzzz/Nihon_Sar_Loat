"use client";

import { ArrowRight, Layers3, Plus, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Brand } from "../brand";
import { errorMessage, post } from "../study-api";
import "../entry.css";

const choices = [
  { title: "Upload a PDF", description: "Check the extracted kanji and vocabulary before saving them.", href: "/study?start=1&view=imports", icon: UploadCloud, color: "gold" },
  { title: "Add a kanji manually", description: "Save a character you already know, with its reading and meaning.", href: "/study?start=1&view=library&add=kanji", icon: Plus, color: "rose" },
  { title: "Try a sample flashcard", description: "Flip a card and rate how well you recalled the answer.", href: "/demo", icon: Layers3, color: "sage" },
];

export function Onboarding() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function skip() {
    setBusy(true);
    setError("");
    try {
      await post("onboard");
      window.location.replace("/study");
    } catch (problem) {
      setError(errorMessage(problem));
      setBusy(false);
    }
  }

  return <div className="onboarding-page">
    <header className="entry-header"><div className="entry-container entry-header-inner"><Brand /><button className="entry-login-link" disabled={busy} onClick={skip}>Skip for now <ArrowRight size={16} /></button></div></header>
    <main className="onboarding-main">
      <div className="onboarding-print" aria-hidden="true"><span lang="ja">学</span></div>
      <h1>Welcome to your study space.</h1>
      <p className="onboarding-intro">Build a JLPT N2 library with English meanings. Review the kanji you save and meet familiar terms in new reading passages.</p>
      <div className="onboarding-choices">{choices.map(({ title, description, href, icon: Icon, color }) => <Link key={href} className="onboarding-choice" href={href}>
        <span className={`icon-tile ${color}`}><Icon size={20} /></span>
        <span className="onboarding-choice-copy"><strong>{title}</strong><span>{description}</span></span>
        <ArrowRight size={18} />
      </Link>)}</div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </main>
  </div>;
}
