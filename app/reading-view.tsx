"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, post } from "./study-api";
import { formatOptions, sourceTitles, type Entry, type Format, type Match, type Passage } from "./study-data";
import { PageHeading, Term } from "./study-views";

type Scope = "all" | "source" | "selected";

function markedText(text: string, matches: Match[], targets: Entry[], furigana: boolean, select: (entry: Entry) => void) {
  const nodes: ReactNode[] = [];
  let offset = 0;
  const byId = new Map(targets.map((entry) => [entry.id, entry]));
  for (const { entry, start, end, reading } of [...matches].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const term = byId.get(entry);
    if (!term || start < offset || end > text.length) continue;
    const surface = text.slice(start, end);
    nodes.push(text.slice(offset, start));
    const annotation = surface === term.term ? term : reading ? { ...term, term: surface, reading } : null;
    nodes.push(<button key={start} className="reading-term" onClick={() => select(term)} aria-label={`Show meaning for ${surface}`}>{furigana && annotation ? <Term entry={annotation} /> : surface}</button>);
    offset = end;
  }
  nodes.push(text.slice(offset));
  return nodes;
}

export function ReadingView({ entries, saved, onSaved }: { entries: Entry[]; saved: Passage[]; onSaved: (passages: Passage[]) => void }) {
  const [format, setFormat] = useState<Format>("Notice");
  const [scope, setScope] = useState<Scope>("all");
  const [source, setSource] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [furigana, setFurigana] = useState(true);
  const [term, setTerm] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sources = sourceTitles(entries);
  const isSaved = saved.some((item) => item.id === passage?.id);

  function open(item: Passage | null) {
    setError("");
    setTerm(null);
    setPassage(item);
  }

  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await work(); }
    catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    void perform(async () => open(await post<Passage>("reading", { format, scope, source, targets })));
  }

  return (
    <>
      <PageHeading title="Reading practice">Read an N2-style passage and look up words from your library.</PageHeading>
      {!passage ? (
        <div className="reading-layout">
          <section className="panel form-panel">
            <span className="icon-tile sage"><BookOpen size={22} /></span>
            <h2>Generate a passage</h2>
            <p>Groq uses your selected study terms to write an original passage.</p>
            <form onSubmit={generate}>
              <label>Passage format<select value={format} onChange={(event) => setFormat(event.target.value as Format)}>{formatOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Study terms<select value={scope} onChange={(event) => setScope(event.target.value as Scope)}><option value="all">Whole library</option><option value="source">From a source</option><option value="selected">Specific entries</option></select></label>
              {scope === "source" ? <label>Source<select required value={source} onChange={(event) => setSource(event.target.value)}><option value="">Choose a source</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
              {scope === "selected" ? <div className="reading-targets" aria-label="Choose study terms" role="group">{entries.map((item) => <label className="check-label" key={item.id}><input type="checkbox" checked={targets.includes(item.id)} onChange={(event) => setTargets(event.target.checked ? [...targets, item.id] : targets.filter((id) => id !== item.id))} /><span lang="ja">{item.term}</span> {item.meaning}</label>)}</div> : null}
              {entries.length ? <button className="button ink" disabled={busy || (scope === "source" && !source) || (scope === "selected" && !targets.length)}>{busy ? "Generating…" : "Generate passage"} <ArrowRight size={17} /></button> : <div className="flex flex-wrap gap-3"><a href="#imports" className="button ink">Import study terms <ArrowRight size={17} /></a><a href="#library" className="button secondary">Add entries</a></div>}
            </form>
          </section>
          <section className="panel form-panel saved-reading">
            <h2>Saved passages</h2>
            {saved.length ? saved.map((item) => <button key={item.id} className="text-button" lang="ja" disabled={busy} onClick={() => open(item)}>{item.title} <ArrowRight size={16} /></button>) : <p>Save a passage to come back to it later.</p>}
          </section>
        </div>
      ) : (
        <div className="reader">
          <div className="reader-toolbar">
            <button className="text-button" onClick={() => open(null)}><ArrowLeft size={16} /> Passages</button>
            <button className="button secondary" aria-pressed={furigana} onClick={() => setFurigana(!furigana)}>Furigana {furigana ? "on" : "off"}</button>
            <button className="button secondary" disabled={busy} aria-pressed={isSaved} onClick={() => perform(async () => onSaved(await post<Passage[]>("save-reading", { id: passage.id, saved: !isSaved })))}>{isSaved ? <><Check size={16} /> Saved</> : "Save passage"}</button>
          </div>
          <article className="panel passage">
            <span className="flag unrated">AI-generated · {passage.format}</span>
            <h2 lang="ja">{passage.title}</h2>
            {passage.paragraphs.map((paragraph, index) => <p key={index} lang="ja">{markedText(paragraph, passage.matches[index] ?? [], passage.targets, furigana, setTerm)}</p>)}
          </article>
          {term ? <div className="panel selected-term" role="status"><div><strong><Term entry={term} /></strong><span lang="ja">{term.reading}</span><span>{term.meaning}</span></div><button className="icon-button" aria-label="Close definition" onClick={() => setTerm(null)}><X size={18} /></button></div> : null}
          <section className="panel form-panel glossary"><h2>Study terms in this passage</h2><ul>{passage.targets.map((entry) => <li key={entry.id}><button className="reading-term" onClick={() => setTerm(entry)} aria-label={`Show meaning for ${entry.term}`}>{furigana ? <Term entry={entry} /> : <span lang="ja">{entry.term}</span>}</button><span>{entry.meaning}</span></li>)}</ul></section>
        </div>
      )}
      {error ? <p className="error mt-3" role="alert">{error}</p> : null}
    </>
  );
}
