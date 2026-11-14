"use client";

import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileText, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ApiError, api, errorMessage, post } from "./study-api";
import { entryIssue, fileLimit, importKindFromFilename, kanjiExampleIssue, pageRange, type Candidate, type ImportJob, type ImportSummary, type StudyState } from "./study-data";
import { Empty, JlptStar, KanjiExampleFields, PageHeading, PartOfSpeechFields, Term } from "./study-views";

export const importLabels = { queued: "In progress", processing: "In progress", ready: "Ready to check", failed: "Needs attention", confirmed: "Confirmed" };
const working = (job: ImportSummary) => job.status === "queued" || job.status === "processing";
const progressTimeout = 180_000;

function estimateLabel(job: ImportJob) {
  if (job.estimatedRemainingMs === undefined) return "Estimating time remaining…";
  const minutes = Math.max(1, Math.round(job.estimatedRemainingMs / 60_000));
  const duration = job.estimatedRemainingMs < 60_000 ? "Under a minute" : `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${duration} ${job.status === "queued" ? "once the import starts" : "remaining"}`;
}

function withSummary(imports: ImportSummary[], { id, name, status, count }: ImportJob) {
  const summary = { id, name, status, count };
  return imports.some((item) => item.id === id)
    ? imports.map((item) => item.id === id ? summary : item)
    : [summary, ...imports].slice(0, 25);
}

export function ImportView({ imports, update, confirm }: {
  imports: ImportSummary[]; update: Dispatch<SetStateAction<ImportSummary[]>>; confirm: (state: StudyState) => void;
}) {
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState("");
  const [range, setRange] = useState("1");
  const [layout, setLayout] = useState("auto");
  const [consent, setConsent] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [edits, setEdits] = useState<Record<string, Candidate>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const updateRef = useRef(update);
  updateRef.current = update;
  const tracked = job && working(job) ? job.id : undefined;
  const pending = !job && imports.some(working);

  useEffect(() => {
    if (busy || (!tracked && !pending)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1_500;
    let progress = "";
    let lastChange = Date.now();
    let failures = 0;
    async function poll() {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
        let snapshot: string;
        if (tracked) {
          const next = await api<ImportJob>(`imports?id=${tracked}`, { signal });
          if (controller.signal.aborted) return;
          setJob((current) => current?.id === next.id ? next : current);
          updateRef.current((imports) => withSummary(imports, next));
          if (!working(next)) {
            setStatusMessage("");
            return;
          }
          snapshot = next.pages.map(({ page, status }) => `${page}:${status}`).join(",");
        } else {
          const list = await api<ImportSummary[]>("imports", { signal });
          if (controller.signal.aborted) return;
          updateRef.current(list);
          if (!list.some(working)) {
            setStatusMessage("");
            return;
          }
          snapshot = list.map(({ id, status }) => `${id}:${status}`).join(",");
        }
        failures = 0;
        if (progress !== snapshot) {
          progress = snapshot;
          lastChange = Date.now();
          delay = 1_500;
          setStatusMessage("");
        } else if (Date.now() - lastChange >= progressTimeout) {
          setStatusMessage("This import is taking longer than expected.");
          return;
        } else {
          delay = Math.min(delay * 2, 15_000);
        }
      } catch (problem) {
        if (controller.signal.aborted) return;
        failures++;
        if ((problem instanceof ApiError && [401, 403, 404].includes(problem.status)) || failures >= 3) {
          setStatusMessage(errorMessage(problem));
          return;
        }
        delay = Math.min(delay * 2, 15_000);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [tracked, pending, busy, refresh]);

  function selectFile(next?: File) {
    if (!next) return;
    if (!/\.pdf$/i.test(next.name) || next.size > fileLimit || !next.size) {
      setFile(undefined);
      setError("Choose a PDF up to 50 MB.");
      return;
    }
    setFile(next);
    setSource(next.name.replace(/\.pdf$/i, "").slice(0, 160));
    setError("");
  }

  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await work(); }
    catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }

  function open(next: ImportJob | null) {
    setEdits({});
    setExcluded([]);
    setShowIssues(false);
    setStatusMessage("");
    setJob(next);
    if (next) update((imports) => withSummary(imports, next));
  }

  function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !consent) return;
    if (!pageRange(range)) { setError("Enter up to 20 pages, for example 1–2."); return; }
    const query = new URLSearchParams({ range, name: source.trim() || file.name.slice(0, 160), layout, consent: "yes" });
    void perform(async () => {
      open(await api<ImportJob>(`upload?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "X-PDF-Filename": encodeURIComponent(file.name) },
        body: file,
      }));
      setFile(undefined);
      setConsent(false);
    });
  }

  const items = (job?.pages ?? []).flatMap((page) => page.candidates).map((item) => edits[item.id] ?? item);
  const selected = items.filter((item) => !excluded.includes(item.id));
  const fileKind = file ? importKindFromFilename(file.name) : "mixed";
  const failedPages = job?.pages.filter((page) => page.status === "failed") ?? [];
  const importInProgress = job ? working(job) : false;

  async function save() {
    if (!job) return;
    for (const item of selected) {
      const issue = entryIssue(item);
      if (issue) {
        setShowIssues(true);
        document.getElementById(`candidate-${item.id}-${issue.field}`)?.focus();
        return;
      }
      for (const [index, example] of (item.examples ?? []).entries()) {
        const exampleIssue = kanjiExampleIssue(example, item.term);
        if (exampleIssue) {
          setShowIssues(true);
          document.getElementById(`candidate-${item.id}-example-${index}-${exampleIssue.field}`)?.focus();
          return;
        }
      }
    }
    const result = await post<{ job: ImportJob; state: StudyState }>("confirm-import", {
      id: job.id,
      selection: selected.map(({ id, term, reading, meaning, examples, partsOfSpeech }) => ({
        id, term, reading, meaning, confirmedPartsOfSpeech: partsOfSpeech,
        examples: examples?.map(({ term, reading, meaning, partsOfSpeech, sentence, translation }) => ({
          term, reading, meaning, sentence, translation, confirmedPartsOfSpeech: partsOfSpeech,
        })),
      })),
    });
    open(result.job);
    confirm(result.state);
  }

  return (
    <>
      <PageHeading title="PDF imports">Check kanji and vocabulary from a study PDF before adding them to your library.</PageHeading>
      {!job ? <div className="reading-layout">
        <form className="panel form-panel import-form" onSubmit={upload}>
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" hidden onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ""; }} />
          <button type="button" className="dropzone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}>
            <span className="icon-tile gold"><UploadCloud size={23} /></span><strong>{file?.name || "Choose or drop a PDF"}</strong><span>PDF up to 50 MB</span>
          </button>
          {fileKind === "Kanji" ? <p>Kanji import. Example words will appear under their kanji.</p> : null}
          {fileKind === "Vocabulary" ? <p>Vocabulary import. Each word will have its own entry.</p> : null}
          <label>Source title<input maxLength={160} placeholder="N2 study notes" value={source} onChange={(event) => setSource(event.target.value)} /></label>
          <label>Page range<input maxLength={20} placeholder="1–2" value={range} onChange={(event) => setRange(event.target.value)} /></label>
          <label>Scan orientation<select value={layout} onChange={(event) => setLayout(event.target.value)}><option value="auto">Automatic</option><option value="horizontal">Horizontal text</option><option value="vertical">Vertical text</option></select></label>
          <label className="check-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I have permission to process this PDF. The selected pages’ text will be sent to Groq for extraction. <a className="underline" href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">Groq data controls</a></span></label>
          <button className="button ink" disabled={!file || !consent || busy}>{busy ? "Uploading…" : "Start import"} <ArrowRight size={17} /></button>
        </form>
        <section className="panel form-panel latest-panel">
          <h2>Recent imports</h2>
          {imports.length ? imports.map((item) => (
            <button key={item.id} className="import-summary text-left" disabled={busy} onClick={() => perform(async () => open(await api<ImportJob>(`imports?id=${item.id}`)))}>
              <span className="icon-tile neutral"><FileText size={18} /></span><span><strong>{item.name}</strong><span className="block muted">{importLabels[item.status]}{item.status === "confirmed" ? ` · ${item.count} entries` : ""}</span></span>
            </button>
          )) : <p>Your imports will appear here.</p>}
        </section>
      </div> : job.status === "confirmed" ? (
        <Empty icon={<CheckCircle2 size={22} />} title="Entries confirmed" action={<div className="flex flex-wrap justify-center gap-3"><a className="button ink" href="#library">Open library <ArrowRight size={17} /></a><button className="button secondary" onClick={() => open(null)}>Start another import</button></div>}>{job.count} entries are ready to study.</Empty>
      ) : (
        <section className="panel form-panel candidates">
          <button className="text-button" onClick={() => { setError(""); open(null); }}><ArrowLeft size={16} /> All imports</button>
          <h2>{job.name}</h2>
          {importInProgress ? (
            <div className="import-estimate">
              {statusMessage ? null : <p role="status"><Clock3 size={17} aria-hidden="true" /> {estimateLabel(job)}</p>}
              <span>You can come back later.</span>
            </div>
          ) : <p role="status">{importLabels[job.status]}</p>}
          {!importInProgress && failedPages.length ? <p className="error">
            {failedPages.length === 1 ? "One page couldn’t be imported." : `${failedPages.length} pages couldn’t be imported.`}
            {failedPages.every(({ error }) => error === failedPages[0].error) && failedPages[0].error ? ` ${failedPages[0].error}` : ""}
          </p> : null}
          {!importInProgress && items.length ? <>
            <label className="check-label"><input type="checkbox" checked={selected.length === items.length} onChange={(event) => setExcluded(event.target.checked ? [] : items.map((item) => item.id))} /> Select all</label>
            <div className="candidate-list">{items.map((item) => {
              const checked = !excluded.includes(item.id);
              const issue = showIssues && checked ? entryIssue(item) : undefined;
              const fields = [
                ["term", item.kind === "Kanji" ? "Kanji" : "Vocabulary spelling", 60],
                ["reading", item.kind === "Kanji" ? "Furigana readings" : "Furigana", 160],
                ["meaning", "English meaning", 500],
              ] as const;
              return (
                <fieldset className="candidate" key={item.id}>
                  <legend>{item.kind} · Page {item.page}{item.confidence === "low" ? " · Low confidence" : ""}</legend>
                  <div className="candidate-preview"><Term entry={item} annotateKanji /><JlptStar entry={item} /></div>
                  <label className="check-label"><input type="checkbox" aria-label={`Select ${item.term}`} checked={checked} onChange={(event) => setExcluded(event.target.checked ? excluded.filter((id) => id !== item.id) : [...excluded, item.id])} /></label>
                  {fields.map(([field, label, maxLength]) => {
                    const id = `candidate-${item.id}-${field}`;
                    const invalid = issue?.field === field;
                    return (
                      <div className={`candidate-field candidate-${field}`} key={field}>
                        <label htmlFor={id}>{label}{field !== "term" && item.aiFields.includes(field) ? " · AI suggestion" : ""}</label>
                        <input id={id} maxLength={maxLength} lang={field === "meaning" ? "en" : "ja"} value={item[field]}
                          aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
                          onChange={(event) => setEdits((current) => ({ ...current, [item.id]: { ...item, [field]: event.target.value } }))} />
                        {invalid ? <span id={`${id}-error`} className="error" role="alert">{issue.message}</span> : null}
                      </div>
                    );
                  })}
                  {item.kind === "Kanji" ? <KanjiExampleFields examples={item.examples ?? []} kanji={item.term} prefix={`candidate-${item.id}`} showIssues={showIssues && checked}
                    change={(examples) => setEdits((current) => ({ ...current, [item.id]: { ...item, examples } }))} /> : (
                    <PartOfSpeechFields parts={item.partsOfSpeech} suggestions={item.suggestedPartsOfSpeech}
                      change={(partsOfSpeech) => setEdits((current) => ({ ...current, [item.id]: { ...item, partsOfSpeech } }))} />
                  )}
                </fieldset>
              );
            })}</div>
          </> : !importInProgress && !failedPages.length ? <p>No entries were found. You can <a className="underline" href="#library">add entries manually</a>.</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {!importInProgress && selected.length ? <button className="button ink" disabled={busy} onClick={() => perform(save)}><Check size={17} /> Save {selected.length} as learnt</button> : null}
            {!importInProgress && failedPages.length ? <button className="button secondary" disabled={busy} onClick={() => perform(async () => {
              const next = await post<ImportJob>("retry-import", { id: job.id });
              setJob(next);
              update((imports) => withSummary(imports, next));
            })}>Retry failed pages</button> : null}
            <button className="button secondary" disabled={busy} onClick={() => perform(async () => { update(await post<ImportSummary[]>("cancel-import", { id: job.id })); open(null); })}>Cancel import</button>
          </div>
        </section>
      )}
      {statusMessage ? <div className="mt-3"><p className="error" role="status">{statusMessage}</p>
        <button className="text-button" onClick={() => { setStatusMessage(""); setRefresh((value) => value + 1); }}>Refresh status</button>
      </div> : null}
      {error ? <p className="error mt-3" role="alert">{error}</p> : null}
    </>
  );
}
