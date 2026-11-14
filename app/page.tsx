import { ArrowDown, ArrowRight, BookOpen, Layers3, UploadCloud } from "lucide-react";
import Link from "next/link";
import { account } from "../lib/auth";
import { AppError } from "../lib/database";
import { Brand } from "./brand";
import { DemoCard } from "./demo-card";
import "./entry.css";

const steps = [
  { title: "Import your material", body: "Bring a study PDF. Check the kanji, readings, and meanings before saving the terms you’ve learnt.", icon: UploadCloud, color: "gold" },
  { title: "Review the hard ones", body: "Recall a kanji’s reading and meaning, then rate how well you remembered. Return to the characters that need more practice.", icon: Layers3, color: "rose" },
  { title: "Read them in context", body: "Find familiar words in an N2-style passage. Toggle furigana or tap a word to see its meaning.", icon: BookOpen, color: "sage" },
];

export default async function LandingPage() {
  let setupError = "";
  const user = await account().catch((error: unknown) => {
    if (!(error instanceof AppError) || error.status !== 503) throw error;
    setupError = error.message;
    return undefined;
  });
  const destination = user ? user.onboarded ? "/study" : "/onboarding" : "/sign-up";
  const action = user ? "Open study dashboard" : "Get started";
  return (
    <div className="landing">
      <header className="entry-header">
        <div className="entry-container entry-header-inner">
          <Brand />
          <nav aria-label="Main navigation" className="landing-nav">
            <a className="landing-nav-anchor" href="#how-it-works">How it works</a>
            {!user ? <Link className="entry-login-link" href="/log-in">Log in</Link> : null}
            <Link className="button ink" href={destination}>{action} <ArrowRight size={15} /></Link>
          </nav>
        </div>
      </header>
      <main>
        {setupError && process.env.NODE_ENV === "development" ? <p className="entry-container error py-3" role="status">{setupError}</p> : null}
        <section className="entry-container landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <span className="entry-eyebrow"><span /> FOR JLPT N2 LEARNERS</span>
            <h1 id="landing-title">Make the Japanese<br className="landing-break" /> you study <em>stick.</em></h1>
            <p>Turn your study PDFs into a personal library. Review the kanji you find difficult, then meet familiar words in a new passage.</p>
            <div className="landing-actions">
              <Link href={destination} className="button ink">{action} <ArrowRight size={18} /></Link>
              <a href="#demo-flashcard" className="button secondary">Try a flashcard</a>
            </div>
          </div>
          <figure className="landing-figure" id="demo-flashcard">
            <div className="landing-print">
              <DemoCard />
            </div>
            <figcaption><span>Sample flashcard</span><span lang="ja">確かめる</span></figcaption>
          </figure>
        </section>
        <section className="landing-workflow" id="how-it-works" aria-labelledby="workflow-title">
          <div className="entry-container">
            <div className="workflow-heading">
              <h2 id="workflow-title">From page to practice.</h2>
              <a className="text-button" href="#study-next">Get started <ArrowDown size={16} /></a>
            </div>
            <div className="workflow-grid">
              {steps.map(({ title, body, icon: Icon, color }) => (
                <article key={title}>
                  <span className={`icon-tile ${color}`}><Icon size={22} /></span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="entry-container landing-next" id="study-next">
          <div><h2>Start with one page.</h2><p>Bring your own material or try a sample review during setup.</p></div>
          <Link href={destination} className="button ink">{action} <ArrowRight size={18} /></Link>
        </section>
      </main>
      <footer className="entry-footer"><div className="entry-container"><Brand /><nav className="legal-links" aria-label="Legal"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms</Link></nav></div></footer>
    </div>
  );
}
