"use client";

import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, ChevronRight, CircleHelp,
  FileText, Flame, House, Layers3, LibraryBig, LogOut, PanelTop, UploadCloud,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "./brand";
import { LibraryView, PageHeading, ReviewView } from "./study-views";
import { ImportView, importLabels } from "./import-view";
import { ReadingView } from "./reading-view";
import { api, errorMessage, post } from "./study-api";
import type { Entry, ImportSummary, Pair, Passage, Rating, StudyState } from "./study-data";

const navigation = [
  { id: "home", label: "Home", icon: House },
  { id: "library", label: "Library", icon: LibraryBig },
  { id: "review", label: "Review", icon: Layers3 },
  { id: "reading", label: "Reading", icon: BookOpen },
  { id: "imports", label: "Imports", icon: ArrowDownToLine },
] as const;

type View = (typeof navigation)[number]["id"];

function currentView(): View {
  const hash = window.location.hash.slice(1);
  if (hash === "review-due") return "review";
  if (hash === "add-kanji") return "library";
  const active = hash || new URLSearchParams(window.location.search).get("view");
  return navigation.find((item) => item.id === active)?.id ?? "home";
}

function Home({ entries, latest, openReview }: { entries: Entry[]; latest?: ImportSummary; openReview: (mode: "Due" | "Hard") => void }) {
  const kanji = entries.filter((entry) => entry.kind === "Kanji");
  const due = kanji.filter((entry) => !entry.dueAt || entry.dueAt <= Date.now()).length;
  const hard = kanji.filter((entry) => entry.rating === "Hard").length;
  return (
    <>
      <PageHeading title="Study dashboard" action={<a href="#imports" className="button secondary dashboard-import"><UploadCloud size={17} /> Import PDF</a>}>
        Your Japanese study materials, ready to put into practice.
      </PageHeading>
      <section className="daily-hero" aria-labelledby="daily-title">
        <div className="daily-copy">
          <span className="hero-label"><Layers3 size={15} /> KANJI FLASHCARDS</span>
          <h2 id="daily-title">Today’s review</h2>
          <p>{due > 0 ? <><strong>{due} kanji</strong> are ready for a review.</> : kanji.length ? "You’re caught up on your due kanji." : "Add your first kanji or try a sample review."}</p>
          {kanji.length ? <button className="button ink" onClick={() => openReview("Due")}>Start review <ArrowRight size={17} /></button> : <div className="flex flex-wrap gap-2"><a className="button ink" href="#add-kanji">Add a kanji <ArrowRight size={17} /></a><a className="button secondary" href="/demo">Try sample flashcards</a></div>}
        </div>
      </section>
      <div className="dashboard-grid">
        <section aria-labelledby="practice-title">
          <h2 className="section-title" id="practice-title">Keep studying</h2>
          <div className="panel shortcut-list">
            <button className="shortcut" onClick={() => openReview("Hard")}>
              <span className="icon-tile rose"><Flame size={21} /></span>
              <span className="shortcut-text"><strong>Review hard kanji</strong><span>{hard} {hard === 1 ? "character" : "characters"} flagged Hard</span></span>
              <ChevronRight className="row-arrow" size={19} />
            </button>
            <a className="shortcut" href="#reading">
              <span className="icon-tile sage"><BookOpen size={21} /></span>
              <span className="shortcut-text"><strong>Reading practice</strong><span>Meet your learnt words in an N2 passage</span></span>
              <ChevronRight className="row-arrow" size={19} />
            </a>
            <a className="shortcut" href="#library">
              <span className="icon-tile lavender"><LibraryBig size={21} /></span>
              <span className="shortcut-text"><strong>Browse library</strong><span>Look up kanji, vocabulary, and look-alikes</span></span>
              <ChevronRight className="row-arrow" size={19} />
            </a>
          </div>
        </section>
        <section aria-labelledby="library-glance-title">
          <h2 className="section-title" id="library-glance-title">Your library</h2>
          <div className="panel library-glance">
            <div className="library-counts">
              <div><span className="count">{kanji.length}</span><span>Kanji learnt</span></div>
              <div><span className="count">{entries.length - kanji.length}</span><span>Words learnt</span></div>
            </div>
            <a className="recent-import" href="#imports">
              <span className="icon-tile neutral"><FileText size={18} /></span>
              <span><small>Latest import{latest ? ` · ${importLabels[latest.status]}` : ""}</small><strong>{latest?.name ?? "Import a study PDF"}</strong></span>
              <ArrowRight className="row-arrow" size={17} />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

export function StudyApp({ initial }: { initial: StudyState }) {
  const [view, setView] = useState<View>("home");
  const [study, setStudy] = useState(initial);
  const [reviewRequest, setReviewRequest] = useState<"Due" | "Hard" | undefined>();
  const [comparisonQueue, setComparisonQueue] = useState<Entry[]>([]);
  const [sessionKey, setSessionKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState("");
  const [openEditor, setOpenEditor] = useState(false);

  useEffect(() => {
    function syncView() {
      if (window.location.hash === "#review-due") {
        setReviewRequest("Due");
        setComparisonQueue([]);
        setSessionKey((key) => key + 1);
      }
      setOpenEditor(window.location.hash === "#add-kanji" ||
        (!window.location.hash && new URLSearchParams(window.location.search).get("add") === "kanji"));
      setView(currentView());
      window.scrollTo(0, 0);
    }
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    if (view !== "home") return;
    const controller = new AbortController();
    void api<ImportSummary[]>("imports", { signal: controller.signal }).then((imports) => {
      if (!controller.signal.aborted) setStudy((current) => ({ ...current, imports }));
    }).catch(() => {});
    return () => controller.abort();
  }, [view]);

  useEffect(() => {
    if (!help) return;
    function closeHelp(event: KeyboardEvent) {
      if (event.key === "Escape") setHelp(false);
    }
    window.addEventListener("keydown", closeHelp);
    return () => window.removeEventListener("keydown", closeHelp);
  }, [help]);

  async function saveEntry(entry: Entry) {
    const entries = await post<Entry[]>("entry", { entry, edit: study.entries.some((item) => item.id === entry.id) });
    setStudy((current) => ({ ...current, entries }));
    if (openEditor) window.history.replaceState(null, "", "/study#library");
  }

  async function removeEntry(id: string) {
    const result = await post<Pick<StudyState, "entries" | "pairs">>("remove-entry", { id });
    setStudy((current) => ({ ...current, ...result }));
  }

  async function rateEntry(entry: Entry, rating: Rating, event: string) {
    const entries = await post<Entry[]>("rate", { id: entry.id, rating, event });
    setStudy((current) => ({ ...current, entries }));
  }

  async function addPair(first: string, second: string) {
    const pairs = await post<Pair[]>("pair", { first, second });
    setStudy((current) => ({ ...current, pairs }));
  }

  async function signOut() {
    try {
      await post("logout");
      window.location.replace("/");
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }

  function openReview(mode: "Due" | "Hard") {
    setComparisonQueue([]);
    setReviewRequest(mode);
    setSessionKey((key) => key + 1);
    window.location.hash = "review";
  }

  function reviewComparison(entries: Entry[]) {
    setComparisonQueue(entries);
    setReviewRequest(undefined);
    setSessionKey((key) => key + 1);
    window.location.hash = "review";
  }

  const title = navigation.find((item) => item.id === view)?.label;
  const links = navigation.map(({ id, label, icon: Icon }) => (
    <a key={id} href={`#${id}`} aria-current={view === id ? "page" : undefined} className="nav-link"
      onClick={() => { if (id === "review") { setComparisonQueue([]); setReviewRequest(undefined); setSessionKey((key) => key + 1); } }}>
      <Icon size={19} strokeWidth={1.75} /><span>{label}</span>
    </a>
  ));

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
      <aside className="sidebar">
        <Brand href="/study#home" />
        <nav className="side-nav" aria-label="Main navigation">{links}</nav>
        <div className="sidebar-footer">
          <div className="level-note"><span lang="ja" aria-hidden="true">学</span><div><strong>JLPT N2</strong><small>Study workspace</small></div></div>
          <button className="nav-link help-link" onClick={() => setHelp((open) => !open)} aria-expanded={help}><CircleHelp size={18} /> Study guide</button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><PanelTop size={17} /><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div>
          <div className="mobile-brand"><Brand href="/study#home" /></div>
          <button className="top-help" onClick={() => setHelp((open) => !open)} aria-expanded={help} aria-label="Study guide"><CircleHelp size={19} /></button>
          <button className="icon-button" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={19} /></button>
        </header>
        {help ? (
          <div className="help-panel panel">
            <button className="text-button" onClick={() => setHelp(false)}><ArrowLeft size={16} /> Close guide</button>
            <h2>Study guide</h2>
            <p>Import a study PDF or add entries by hand, then review the kanji or read them in context. Your study data is saved to your account.</p>
            <a href="/" className="text-button">Visit the landing page <ArrowRight size={16} /></a>
          </div>
        ) : null}
        <main id="main-content" tabIndex={-1} className="main-content">
          {error ? <p className="error" role="alert">{error}</p> : null}
          {view === "home" ? <Home entries={study.entries} latest={study.imports[0]} openReview={openReview} /> : null}
          {view === "library" ? <LibraryView key={String(openEditor)} addInitially={openEditor} entries={study.entries} pairs={study.pairs} addPair={addPair} save={saveEntry} remove={removeEntry} reviewHard={() => openReview("Hard")} reviewComparison={reviewComparison} /> : null}
          {view === "review" ? <ReviewView key={sessionKey} entries={study.entries} requested={reviewRequest} comparison={comparisonQueue} rate={rateEntry} /> : null}
          {view === "reading" ? <ReadingView entries={study.entries} saved={study.passages} onSaved={(passages: Passage[]) => setStudy((current) => ({ ...current, passages }))} /> : null}
          {view === "imports" ? <ImportView imports={study.imports} update={(next) => setStudy((current) => ({
            ...current, imports: typeof next === "function" ? next(current.imports) : next,
          }))} confirm={setStudy} /> : null}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">{links}</nav>
    </div>
  );
}
