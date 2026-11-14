"use client";

import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock3, Flame,
  GitCompareArrows, Layers3, Pencil, Plus, RotateCcw, Search, Star, X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "./study-api";
import { isCommonJlptKanji } from "./jlpt-kanji";
import { intervals, kana, kanjiExampleIssue, kanjiExampleKey, partOfSpeechLabels, references, sourceTitles, type Entry, type ImportExample, type KanjiExample, type Kind, type Pair, type PartOfSpeech, type Rating } from "./study-data";

export function PageHeading({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{children}</p></div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="panel empty"><span className="icon-tile neutral">{icon}</span><h2>{title}</h2><p>{children}</p>{action}</div>;
}

export function Term({ entry, annotateKanji = false }: { entry: Pick<Entry, "kind" | "term" | "reading">; annotateKanji?: boolean }) {
  return (entry.kind === "Vocabulary" || annotateKanji) && /\p{Script=Han}/u.test(entry.term) && entry.reading.trim()
    ? <ruby lang="ja">{entry.term}<rp> (</rp><rt>{entry.reading}</rt><rp>)</rp></ruby>
    : <span lang="ja">{entry.term}</span>;
}

export function JlptStar({ entry }: { entry: Pick<Entry, "kind" | "term"> }) {
  return entry.kind === "Kanji" && isCommonJlptKanji(entry.term) ? (
    <span className="jlpt-star" role="img" aria-label="Common JLPT kanji" title="Common JLPT kanji"><Star size={15} fill="currentColor" aria-hidden="true" /></span>
  ) : null;
}

export function PartOfSpeechFields({ parts = [], suggestions = [], change }: {
  parts?: PartOfSpeech[]; suggestions?: PartOfSpeech[]; change: (parts: PartOfSpeech[]) => void;
}) {
  const chosen = parts.map((part) => partOfSpeechLabels[part]).join(", ");
  const pending = suggestions.filter((part) => !parts.includes(part));
  return (
    <div className="part-of-speech-fields">
      <details>
        <summary>Part of speech <span>{chosen || "Unspecified"}</span></summary>
        <div className="part-of-speech-options">{(Object.keys(partOfSpeechLabels) as PartOfSpeech[]).map((part) => (
          <label key={part}>
            <input type="checkbox" checked={parts.includes(part)} onChange={(event) => change(event.target.checked ? [...parts, part] : parts.filter((value) => value !== part))} />
            {partOfSpeechLabels[part]}
          </label>
        ))}</div>
      </details>
      {pending.length ? <div className="part-of-speech-suggestions">
        <span>AI suggestions</span>
        {pending.map((part) => (
          <button key={part} type="button" className="text-button" onClick={() => change([...parts, part])}><Plus size={14} /> Use {partOfSpeechLabels[part]}</button>
        ))}
      </div> : null}
    </div>
  );
}

function PartsOfSpeech({ parts }: { parts?: PartOfSpeech[] }) {
  return parts?.length ? <span className="parts-of-speech">{parts.map((part) => partOfSpeechLabels[part]).join(", ")}</span> : null;
}

export function KanjiExampleFields({ examples, kanji, prefix, showIssues = false, change }: {
  examples: ImportExample[]; kanji: string; prefix: string; showIssues?: boolean; change: (examples: ImportExample[]) => void;
}) {
  const fields = [["term", "Spelling", 60], ["reading", "Furigana", 160], ["meaning", "English meaning", 500]] as const;
  return (
    <fieldset className="kanji-example-fields">
      <legend>Example words</legend>
      {examples.map((example, index) => {
        const issue = showIssues ? kanjiExampleIssue(example, kanji) : undefined;
        return (
          <div className="kanji-example-row" key={index}>
            <div className="kanji-example-preview">
              <Term entry={{ ...example, kind: "Vocabulary" }} />
              <button type="button" className="icon-button" aria-label={`Remove example ${example.term || index + 1}`} onClick={() => change(examples.filter((_, i) => i !== index))}><X size={16} /></button>
            </div>
            {fields.map(([field, label, maxLength]) => {
              const id = `${prefix}-example-${index}-${field}`;
              const invalid = issue?.field === field;
              return (
                <label className="candidate-field" key={field}>
                  {label}
                  <input id={id} maxLength={maxLength} lang={field === "meaning" ? "en" : "ja"} value={example[field]}
                    aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
                    onChange={(event) => change(examples.map((word, i) => i === index ? { ...word, [field]: event.target.value } : word))} />
                  {invalid ? <span id={`${id}-error`} className="error" role="alert">{issue.message}</span> : null}
                </label>
              );
            })}
            <PartOfSpeechFields parts={example.partsOfSpeech} suggestions={example.suggestedPartsOfSpeech}
              change={(partsOfSpeech) => change(examples.map((word, i) => i === index ? { ...word, partsOfSpeech } : word))} />
          </div>
        );
      })}
      <button type="button" className="text-button" onClick={() => change([...examples, { term: "", reading: "", meaning: "" }])}><Plus size={15} /> Add example word</button>
    </fieldset>
  );
}

function KanjiExamples({ examples }: { examples?: KanjiExample[] }) {
  return examples?.length ? <div className="kanji-examples">{examples.map((example) => (
    <div key={kanjiExampleKey(example)}><Term entry={{ ...example, kind: "Vocabulary" }} /> <span>· {example.meaning}</span><PartsOfSpeech parts={example.partsOfSpeech} /></div>
  ))}</div> : null;
}

export function EntryEditor({ entry, close, save, remove }: {
  entry: Entry; close: () => void; save: (entry: Entry) => Promise<void>; remove?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(entry);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      close();
    } catch (problem) {
      setError(errorMessage(problem));
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (![draft.term, draft.reading, draft.meaning].every((value) => value.trim())) return;
    if (draft.kind === "Kanji") {
      for (const [index, example] of (draft.examples ?? []).entries()) {
        const issue = kanjiExampleIssue(example, draft.term);
        if (issue) {
          setShowIssues(true);
          document.getElementById(`entry-example-${index}-${issue.field}`)?.focus();
          return;
        }
      }
    }
    void perform(() => save({
      ...draft,
      examples: draft.kind === "Kanji" ? draft.examples : undefined,
      partsOfSpeech: draft.kind === "Vocabulary" ? draft.partsOfSpeech : undefined,
    }));
  }

  return (
    <dialog className="panel editor" ref={dialog} onCancel={close} aria-labelledby="editor-title">
      <form onSubmit={submit}>
        <div className="editor-heading"><h2 id="editor-title">{remove ? "Edit entry" : "Add an entry"}</h2><button type="button" className="icon-button" aria-label="Close editor" onClick={close}><X size={20} /></button></div>
        {remove ? null : <label>Entry type<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind })}><option>Kanji</option><option>Vocabulary</option></select></label>}
        <label>{draft.kind === "Kanji" ? "Kanji" : "Vocabulary spelling"}<input required maxLength={draft.kind === "Kanji" ? 2 : 60} pattern={draft.kind === "Kanji" ? "[\\p{Script=Han}]" : undefined} title={draft.kind === "Kanji" ? "Enter one kanji character" : undefined} lang="ja" value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} /></label>
        <label>{draft.kind === "Kanji" ? "Furigana (separate readings with ・)" : "Furigana"}<input required lang="ja" maxLength={160} value={draft.reading} onChange={(event) => setDraft({ ...draft, reading: event.target.value })} /></label>
        <label>English meanings<input required maxLength={500} value={draft.meaning} onChange={(event) => setDraft({ ...draft, meaning: event.target.value })} /></label>
        {draft.kind === "Kanji" ? <KanjiExampleFields examples={draft.examples ?? []} kanji={draft.term} prefix="entry" showIssues={showIssues} change={(examples) => setDraft({ ...draft, examples })} /> : null}
        {draft.kind === "Vocabulary" ? <PartOfSpeechFields parts={draft.partsOfSpeech} change={(partsOfSpeech) => setDraft({ ...draft, partsOfSpeech })} /> : null}
        {remove ? <p className="muted">{references(draft).map(({ title, page }) => page ? `${title} · p. ${page}` : title).join(" / ")}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        {confirmRemoval ? <p role="status">Remove this entry from your library?</p> : null}
        <div className="editor-actions">
          {remove ? <button type="button" disabled={busy} className="button danger" onClick={() => { if (confirmRemoval) void perform(remove); else setConfirmRemoval(true); }}>{confirmRemoval ? "Confirm removal" : "Remove"}</button> : null}
          <button type="submit" disabled={busy} className="button ink">Save entry</button>
        </div>
      </form>
    </dialog>
  );
}

const lookAlikes = [["未", "末"], ["申", "由", "甲"], ["土", "士"], ["待", "持", "特"], ["状", "情"], ["緑", "縁"], ["微", "徴"], ["鳥", "烏"], ["練", "錬"]];

function newEntry(kind: Kind): Entry {
  return { id: "", kind, term: "", reading: "", meaning: "", source: "Manual entry" };
}

export function LibraryView({ entries, pairs, addPair, save, remove, reviewHard, reviewComparison, addInitially = false }: {
  entries: Entry[]; pairs: Pair[]; addPair: (first: string, second: string) => Promise<void>;
  save: (entry: Entry) => Promise<void>; remove: (id: string) => Promise<void>; reviewHard: () => void; reviewComparison: (entries: Entry[]) => void; addInitially?: boolean;
}) {
  const [view, setView] = useState<Kind | "Common JLPT">("Kanji");
  const kind: Kind = view === "Vocabulary" ? "Vocabulary" : "Kanji";
  const common = view === "Common JLPT";
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [comparison, setComparison] = useState("");
  const [newMatch, setNewMatch] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState("");
  const [editing, setEditing] = useState<Entry | null>(() => addInitially ? newEntry("Kanji") : null);
  const groups = sourceTitles(entries);
  const kanji = entries.filter((item) => item.kind === "Kanji");
  const hasCommonKanji = common && kanji.some((entry) => isCommonJlptKanji(entry.term));
  const normalizedQuery = kana(query).toLowerCase();
  const selected = kanji.find((item) => item.id === comparison);
  const similar = lookAlikes.filter((group) => selected && group.includes(selected.term)).flat();
  const personal = pairs.filter((pair) => pair.includes(comparison)).flat();
  const matches = kanji.filter((item) => item.id === comparison || similar.includes(item.term) || personal.includes(item.id));
  const filtered = entries.filter((entry) => entry.kind === kind && (!source || references(entry).some((ref) => ref.title === source))
    && (!common || isCommonJlptKanji(entry.term))
    && (kind === "Vocabulary" || ((!difficulty || (entry.rating ?? "Unrated") === difficulty) && (!selected || matches.includes(entry))))
    && [entry, ...(entry.examples ?? [])].some(({ term, reading, meaning, partsOfSpeech }) =>
      [term, reading, meaning, ...(partsOfSpeech ?? []).flatMap((part) => [part, partOfSpeechLabels[part]])]
        .some((field) => kana(field).toLowerCase().includes(normalizedQuery))));
  const availableMatches = kanji.filter((item) => !matches.includes(item));

  async function submitPair(event: FormEvent) {
    event.preventDefault();
    if (!newMatch || !selected || pairBusy) return;
    setPairBusy(true);
    setPairError("");
    try {
      await addPair(selected.id, newMatch);
      setNewMatch("");
    } catch (problem) {
      setPairError(errorMessage(problem));
    } finally {
      setPairBusy(false);
    }
  }

  return (
    <>
      <PageHeading title="Study library" action={<button className="button secondary" onClick={() => setEditing(newEntry(kind))}><Plus size={17} /> Add entry</button>}>Find and edit the kanji and vocabulary you’ve learnt.</PageHeading>
      <div className="segmented library-tabs" role="group" aria-label="Library view">
        {(["Kanji", "Vocabulary", "Common JLPT"] as const).map((type) => <button key={type} aria-pressed={view === type} onClick={() => { setView(type); setComparison(""); }}>{type}</button>)}
      </div>
      {common ? <p className="jlpt-library-note">Common kanji from your learnt library, based on estimated JLPT N2–N5 levels and usage frequency. <a className="underline" href="/jlpt-kanji-notice.txt">Sources</a></p> : null}
      <div className="library-controls">
        <label className="search-box"><Search size={18} /><input aria-label="Search library" placeholder="Search Japanese, kana, or English" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filter by source" value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{groups.map((group) => <option key={group}>{group}</option>)}</select>
        {kind === "Kanji" ? <select aria-label="Filter by difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">All difficulties</option>{["Hard", "Normal", "Easy", "Unrated"].map((flag) => <option key={flag}>{flag}</option>)}</select> : null}
      </div>
      {view === "Kanji" ? (
        <div className="panel compare-panel">
          <div className="compare-header">
            <span className="icon-tile lavender"><GitCompareArrows size={19} /></span>
            <div><h2>Similar kanji</h2><p>Compare look-alike characters in your library.</p></div>
            <select aria-label="Choose kanji to compare" value={comparison} onChange={(event) => { setComparison(event.target.value); setNewMatch(""); setPairError(""); }}><option value="">Choose kanji</option>{kanji.map((item) => <option key={item.id} value={item.id}>{item.term} · {item.meaning}</option>)}</select>
          </div>
          {comparison ? matches.length > 1 ? <div className="compare-cards">{matches.map((item) => {
            const example = item.examples?.[0] ?? entries.find((entry) => entry.kind === "Vocabulary" && entry.term.includes(item.term));
            return <div key={item.id}><span className="compare-term" lang="ja">{item.term}</span><strong>{item.meaning}</strong><span lang="ja">{item.reading}</span>{example ? <Term entry={{ ...example, kind: "Vocabulary" }} /> : null}</div>;
          })}</div> : <p className="compare-empty">No similar characters from this group are in your library.</p> : null}
          {comparison ? <div className="compare-actions">
            {availableMatches.length ? <form onSubmit={submitPair}><select aria-label="Choose a personal look-alike" value={newMatch} onChange={(event) => setNewMatch(event.target.value)}><option value="">Choose a look-alike</option>{availableMatches.map((item) => <option key={item.id} value={item.id}>{item.term} · {item.meaning}</option>)}</select><button className="button secondary" disabled={!newMatch || pairBusy}>Add pair</button></form> : null}
            {matches.length > 1 ? <button className="text-button" onClick={() => reviewComparison(matches)}>Practise these kanji <ArrowRight size={16} /></button> : null}
          </div> : null}
          {pairError ? <p className="error" role="alert">{pairError}</p> : null}
        </div>
      ) : null}
      <div className="list-heading"><h2>{view} <span>{filtered.length}</span></h2>{view === "Kanji" && difficulty === "Hard" ? <button className="text-button" onClick={reviewHard}>Review hard kanji <ArrowRight size={16} /></button> : null}</div>
      {filtered.length === 0 ? common && !hasCommonKanji ? (
        <Empty icon={<Star size={21} />} title="No starred kanji yet">Common JLPT kanji appear here when you save them to your library.</Empty>
      ) : <Empty icon={<Search size={21} />} title="No matching entries">Try another search or change the filters.</Empty> : (
        <ul className="panel entry-list">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <div className="entry-term"><Term entry={entry} /><JlptStar entry={entry} /></div>
              <div className="entry-details">{entry.kind === "Kanji" ? <span lang="ja">{entry.reading}</span> : null}<strong>{entry.meaning}</strong><PartsOfSpeech parts={entry.partsOfSpeech} /><KanjiExamples examples={entry.examples} /><small>{references(entry).map(({ title, page }) => page ? `${title} · p. ${page}` : title).join(" / ")}</small></div>
              {entry.kind === "Kanji" ? <span className={`flag ${(entry.rating ?? "unrated").toLowerCase()}`}>{entry.rating ?? "Unrated"}</span> : null}
              <button className="icon-button" aria-label={`Edit ${entry.term}`} onClick={() => setEditing(entry)}><Pencil size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {editing ? <EntryEditor key={editing.id} entry={editing} save={save} close={() => setEditing(null)} remove={entries.some((item) => item.id === editing.id) ? () => remove(editing.id) : undefined} /> : null}
    </>
  );
}

type Mode = "Due" | "Hard" | "All";
const modes = [
  { name: "Due", title: "Due today", icon: Clock3, description: "Practise new kanji and cards due for review." },
  { name: "Hard", title: "Hard kanji", icon: Flame, description: "Focus on the characters you’ve flagged Hard." },
  { name: "All", title: "All kanji", icon: Layers3, description: "Practise every character in your library." },
] as const;

function reviewQueue(entries: Entry[], mode: Mode) {
  return entries.filter((item) => item.kind === "Kanji" && (
    mode === "All" || (mode === "Hard" ? item.rating === "Hard" : !item.dueAt || item.dueAt <= Date.now())
  ));
}

export function FlashcardSession({ queue, mode, entries, rate, close }: {
  queue: Entry[]; mode: Mode | "Similar" | "Sample"; entries: Entry[]; rate: (entry: Entry, rating: Rating, event: string) => Promise<void>; close: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flipButton = useRef<HTMLButtonElement>(null);
  const answer = useRef<HTMLHeadingElement>(null);
  const finished = useRef<HTMLHeadingElement>(null);
  const advanceLock = useRef(false);
  const event = useRef("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const card = queue[index];
  const example = entries.find((entry) => entry.kind === "Vocabulary" && card && entry.term.includes(card.term));
  const modeTitle = mode === "Sample" ? "Sample review" : mode === "Similar" ? "Similar kanji" : modes.find((item) => item.name === mode)?.title;

  useEffect(() => {
    if (!card) finished.current?.focus();
    else if (flipped) answer.current?.focus();
    else flipButton.current?.focus({ preventScroll: true });
  }, [card, flipped]);

  async function submitRating(rating: Rating) {
    if (!flipped || !card || advanceLock.current) return;
    advanceLock.current = true;
    setSaving(true);
    setError("");
    try {
      event.current ||= crypto.randomUUID();
      await rate(card, rating, event.current);
      event.current = "";
      setIndex(index + 1);
      setFlipped(false);
    } catch (problem) {
      setError(errorMessage(problem));
      advanceLock.current = false;
    } finally {
      setSaving(false);
    }
  }

  if (!card) return (
    <div className="panel empty review-finish">
      <span className="icon-tile sage"><CheckCircle2 size={23} /></span>
      <h2 tabIndex={-1} ref={finished}>Review complete</h2>
      <p>You reviewed {queue.length} {queue.length === 1 ? "kanji card" : "kanji cards"}.</p>
      <button className="button ink" onClick={close}>{mode === "Sample" ? "Open study dashboard" : "Back to review"}</button>
    </div>
  );

  return (
    <section className="session">
      <div className="session-heading">{mode === "Sample" ? <span>{modeTitle} · {index + 1} of {queue.length}</span> : <><button className="text-button" onClick={close}><ArrowLeft size={16} /> Review options</button><span>{modeTitle} · {index + 1} of {queue.length}</span></>}</div>
      <progress value={index + 1} max={queue.length} aria-label="Session progress" />
      <div className="flashcard panel">
        <span className="hero-label">{flipped ? "ANSWER" : "RECALL THE READING AND MEANING"}</span>
        <span className="flash-kanji"><span lang="ja">{card.term}</span><JlptStar entry={card} /></span>
        {flipped ? <div className="flash-answer"><p lang="ja">{card.reading}</p><h2 tabIndex={-1} ref={answer}>{card.meaning}</h2><KanjiExamples examples={card.examples?.length ? card.examples : example ? [example] : []} /></div> : (
          <button ref={flipButton} className="button ink" onClick={() => { advanceLock.current = false; setFlipped(true); }}><RotateCcw size={16} /> Show answer</button>
        )}
      </div>
      {flipped ? <div className="rating-buttons">{(Object.keys(intervals) as Rating[]).map((rating) => <button key={rating} className={`rating ${rating.toLowerCase()}`} disabled={saving} onClick={() => submitRating(rating)}><strong>{rating}</strong>{mode === "Sample" ? null : <span>{intervals[rating]} {intervals[rating] === 1 ? "day" : "days"}</span>}</button>)}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}

export function ReviewView({ entries, requested, comparison, rate }: { entries: Entry[]; requested?: Mode; comparison: Entry[]; rate: (entry: Entry, rating: Rating, event: string) => Promise<void> }) {
  const [mode, setMode] = useState<Mode | "Similar" | null>(comparison.length ? "Similar" : requested ?? null);
  const [queue, setQueue] = useState(() => comparison.length ? comparison : requested ? reviewQueue(entries, requested) : []);

  function start(next: Mode) {
    setQueue(reviewQueue(entries, next));
    setMode(next);
  }

  return (
    <>
      <PageHeading title="Kanji review">Recall the reading and meaning, then rate how well you remembered.</PageHeading>
      {mode ? queue.length ? <FlashcardSession queue={queue} mode={mode} entries={entries} rate={rate} close={() => setMode(null)} /> : (
        <Empty icon={<CheckCircle2 size={22} />} title={mode === "Hard" ? "No hard kanji yet" : "No cards in this session"} action={<button className="button secondary" onClick={() => setMode(null)}>Review options</button>}>
          {mode === "Hard" ? "Rate a card Hard during regular review to add it here." : "Choose another session or add kanji to your library."}
        </Empty>
      ) : <div className="review-options">{modes.map(({ name, title, icon: Icon, description }) => {
        const count = reviewQueue(entries, name).length;
        return <button key={name} className="panel review-option" onClick={() => start(name)}>
          <span className={`icon-tile ${name === "Hard" ? "rose" : name === "Due" ? "gold" : "lavender"}`}><Icon size={22} /></span>
          <strong>{title}</strong><span>{description}</span><span className="review-option-footer">{count} {count === 1 ? "card" : "cards"} <ArrowRight size={18} /></span>
        </button>;
      })}</div>}
    </>
  );
}
