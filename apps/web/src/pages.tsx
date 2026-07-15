import { useMemo, useRef, useState } from "react";
import { api, isVersionConflict } from "./api";
import { CompletenessBadge, EvidenceList, LoopCard, PageHeader, PartialBanner, SkeletonCards, StatusPanel, formatDate } from "./components";
import { useAsync, usePersistentDraft } from "./hooks";
import { Icon } from "./icons";
import type { OpenLoop, ReviewCandidate } from "./types";

function ActionError({ message, conflict }: { message?: string; conflict?: boolean }) {
  if (!message) return null;
  return <div className="inline-alert" role="alert"><strong>{conflict ? "This item changed elsewhere." : "Action not saved."}</strong> {conflict ? "Refresh to see the newest version before trying again." : message}</div>;
}

export function TodayPage() {
  const state = useAsync(api.today, []);
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<{ message: string; conflict: boolean }>();
  async function changeStatus(item: OpenLoop, status: OpenLoop["status"], scheduledFor?: string) {
    setBusyId(item.id); setActionError(undefined);
    state.setData((current) => current ? { ...current, focus: current.focus.filter((loop) => loop.id !== item.id) } : current);
    try { await api.updateLoop(item.id, item.version, status, scheduledFor); state.reload(); }
    catch (error) { setActionError({ message: error instanceof Error ? error.message : "Unknown error", conflict: isVersionConflict(error) }); state.reload(); }
    finally { setBusyId(undefined); }
  }
  return <>
    <PageHeader eyebrow="Daily focus" title="Continue what matters." description="Three open loops worth moving forward today." />
    {state.loading && !state.data ? <SkeletonCards /> : state.error ? <StatusPanel kind="error" title="Atlas could not load today"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <>
      {state.data.partial && <PartialBanner reason={state.data.partialReason} />}
      <ActionError message={actionError?.message} conflict={actionError?.conflict} />
      <section aria-labelledby="focus-heading" data-testid="today-focus"><div className="section-heading"><div><p className="eyebrow">Your focus</p><h2 id="focus-heading">Top {state.data.focus.length || 3}</h2></div><span className="as-of">{state.data.generatedAt ? `Updated ${formatDate(state.data.generatedAt)}` : "Deterministic local ranking"}</span></div>
      {state.data.focus.length ? <div className="card-stack">{state.data.focus.slice(0, 3).map((item) => <LoopCard key={item.id} item={item} busy={busyId === item.id} onStatus={(status, date) => changeStatus(item, status, date)} />)}</div> : <StatusPanel kind="empty" title="Nothing needs your attention"><p>Your focus list is clear. Capture an idea when something comes up.</p></StatusPanel>}</section>
      <div className="summary-grid"><article><span className="summary-number">{state.data.overdue.length}</span><h3>Overdue</h3><p>Items past their intended date.</p></article><article><span className="summary-number">{state.data.waiting.length}</span><h3>Waiting</h3><p>Commitments that depend on someone else.</p></article><article><span className="summary-number">{state.data.reviewCount}</span><h3>To review</h3><p>Candidates that need your judgement.</p></article></div>
    </> : null}
  </>;
}

type SpeechRecognitionConstructor = new () => { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function CapturePage() {
  const [draft, setDraft] = usePersistentDraft("atlas.quick-capture.draft");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | undefined>(undefined);
  const Recognition = (window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
  function toggleListening() {
    if (!Recognition) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new Recognition(); recognition.continuous = false; recognition.interimResults = false; recognition.lang = navigator.language;
    recognition.onresult = (event) => { const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" "); setDraft((current) => `${current}${current ? " " : ""}${transcript}`); };
    recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setMessage("Voice input stopped. Your existing draft is safe."); };
    recognitionRef.current = recognition; setListening(true); recognition.start();
  }
  async function submit() {
    const text = draft.trim(); if (!text) return;
    setStatus("saving"); setMessage("");
    try { await api.capture(text); setDraft(""); setStatus("saved"); setMessage("Saved locally as a review candidate. No audio was stored."); }
    catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Capture failed. Your draft is still here."); }
  }
  return <>
    <PageHeader eyebrow="Quick capture" title="Get it out of your head." description="Write naturally. Atlas will propose structure, but you remain in control." />
    <section className="capture-panel">
      <label htmlFor="capture-text">What do you want to remember?</label>
      <textarea id="capture-text" data-testid="capture-input" value={draft} onChange={(event) => { setDraft(event.target.value); setStatus("idle"); }} placeholder="For example: Follow up on the CI idea next Thursday…" rows={8} autoFocus />
      <div className="capture-footer"><div className="draft-note"><span className="save-dot"/>Draft saved on this device</div><div className="capture-actions">{Recognition && <button className={`button quiet ${listening ? "active" : ""}`} onClick={toggleListening} type="button"><Icon name="mic"/>{listening ? "Stop listening" : "Voice input"}</button>}<button className="button primary" data-testid="save-capture" disabled={!draft.trim() || status === "saving"} onClick={submit}>{status === "saving" ? "Saving…" : "Save capture"}<Icon name="arrow"/></button></div></div>
      {message && <div className={`inline-alert ${status === "saved" ? "success" : ""}`} role="status">{message}</div>}
    </section>
    <aside className="privacy-note"><Icon name="shield"/><div><h2>Private by default</h2><p>Atlas stores the confirmed text, not microphone audio. Every capture enters Review before becoming an open loop.</p></div></aside>
  </>;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const state = useAsync(() => submitted ? api.search(submitted) : Promise.resolve({ results: [] }), [submitted]);
  return <>
    <PageHeader eyebrow="Sourced search" title="Find the thread again." description="Search decisions, open loops, and references without sending data to a paid AI provider." />
    <form className="search-box" data-testid="search-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); }} role="search"><Icon name="search"/><label className="sr-only" htmlFor="atlas-search">Search Atlas</label><input id="atlas-search" data-testid="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What did I decide about…"/><button className="button primary" disabled={!query.trim()}>Search</button></form>
    {!submitted ? <div className="search-prompt"><p className="eyebrow">Try asking</p><button onClick={() => { setQuery("What am I waiting for?"); setSubmitted("What am I waiting for?"); }}>What am I waiting for?</button><button onClick={() => { setQuery("Decisions from this week"); setSubmitted("Decisions from this week"); }}>Decisions from this week</button></div> : state.loading ? <SkeletonCards count={2}/> : state.error ? <StatusPanel kind="error" title="Search is unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <section aria-live="polite">
      {state.data.partial && <PartialBanner reason={state.data.partialReason}/>}<div className="section-heading"><h2>{state.data.results.length} result{state.data.results.length === 1 ? "" : "s"}</h2><span className="as-of">Evidence-linked local search</span></div>
      {state.data.results.length ? <div className="result-list" data-testid="search-results">{state.data.results.map((result) => <article key={result.id}><div className="result-type">{result.type ?? "Reference"}{result.occurredAt ? ` · ${formatDate(result.occurredAt)}` : ""}</div><h3>{result.title}</h3>{result.summary && <p>{result.summary}</p>}<EvidenceList evidence={result.evidence}/></article>)}</div> : <StatusPanel kind="empty" title="No matching memory"><p>Try fewer words or check Sources to see what Atlas can currently access.</p></StatusPanel>}
    </section> : null}
  </>;
}

export function ReviewPage() {
  const state = useAsync(api.reviews, []);
  const [busy, setBusy] = useState<string>(); const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const sorted = useMemo(() => [...(state.data?.items ?? [])].sort((a, b) => riskScore(b) - riskScore(a)), [state.data]);
  async function decide(item: ReviewCandidate, action: "accept" | "reject") {
    setBusy(item.id); setError(undefined);
    try { await api.review(item.id, action, item.version); state.setData((value) => value ? { items: value.items.filter((candidate) => candidate.id !== item.id) } : value); }
    catch (reason) { setError({ message: reason instanceof Error ? reason.message : "Review failed", conflict: isVersionConflict(reason) }); state.reload(); }
    finally { setBusy(undefined); }
  }
  return <>
    <PageHeader eyebrow="Review queue" title="A few things need your judgement." description="Atlas Alpha auto-accepts nothing. Confirm only what is useful and accurate." />
    <ActionError message={error?.message} conflict={error?.conflict}/>
    {state.loading ? <SkeletonCards/> : state.error ? <StatusPanel kind="error" title="Review queue unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : sorted.length ? <div className="review-list" data-testid="review-queue">{sorted.map((item) => <article className="review-card" data-testid={`review-${item.id}`} key={item.id}><div className="review-top"><div><span className="badge">{item.candidateType ?? "Candidate"}</span>{item.sensitivity && <span className={`badge sensitivity-${item.sensitivity}`}>{item.sensitivity.replaceAll("_", " ")}</span>}</div>{item.confidence != null && <span className="confidence">{Math.round(item.confidence * 100)}% confidence</span>}</div><h2>{item.title}</h2>{item.summary && <p>{item.summary}</p>}<EvidenceList evidence={item.evidence}/><div className="review-actions"><button className="button primary" data-testid={`accept-${item.id}`} disabled={busy === item.id} onClick={() => decide(item, "accept")}><Icon name="check"/>Accept</button><button className="button danger-quiet" data-testid={`reject-${item.id}`} disabled={busy === item.id} onClick={() => decide(item, "reject")}>Reject</button></div></article>)}</div> : <StatusPanel kind="empty" title="Review complete"><p>There are no candidates waiting for you.</p></StatusPanel>}
  </>;
}

function riskScore(item: ReviewCandidate) { return (item.sensitivity === "restricted" ? 100 : item.sensitivity === "work_summary_only" ? 50 : 0) + (1 - (item.confidence ?? 0)) * 20 + (item.duplicateOf ? 10 : 0); }

export function SourcesPage() {
  const state = useAsync(api.sources, []);
  return <>
    <PageHeader eyebrow="Source coverage" title="Know what Atlas knows." description="Access is conditional. Atlas never claims complete ChatGPT history." action={<button className="button quiet" onClick={state.reload}><Icon name="refresh"/>Refresh status</button>}/>
    {state.loading ? <SkeletonCards/> : state.error ? <StatusPanel kind="error" title="Sources unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <>{state.data.partial && <PartialBanner reason={state.data.partialReason}/>}<div className="source-list" data-testid="source-list">{state.data.sources.map((source) => <article key={source.id}><div className="source-icon" aria-hidden="true">{source.name.slice(0, 1).toUpperCase()}</div><div className="source-body"><div><h2>{source.name}</h2><p>{source.detail ?? source.sourceType ?? "Local source"}</p></div><div className="source-meta"><CompletenessBadge value={source.completeness}/>{source.itemCount != null && <span>{source.itemCount} items</span>}{source.lastSyncedAt && <span>Synced {formatDate(source.lastSyncedAt)}</span>}</div></div></article>)}</div>{!state.data.sources.length && <StatusPanel kind="empty" title="No sources connected"><p>Manual capture still works. Connect a supported source when you are ready.</p></StatusPanel>}</> : null}
  </>;
}

export function SettingsPage({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void }) {
  const cost = useAsync(api.costStatus, []); const [backupMessage, setBackupMessage] = useState(""); const [backingUp, setBackingUp] = useState(false);
  async function backup() { setBackingUp(true); setBackupMessage(""); try { const result = await api.createBackup(); setBackupMessage(`Backup created ${formatDate(result.createdAt)}.`); } catch (error) { setBackupMessage(error instanceof Error ? error.message : "Backup failed"); } finally { setBackingUp(false); } }
  return <>
    <PageHeader eyebrow="Preferences" title="Local, legible, under your control." description="Manage appearance, verify zero-incremental-cost mode, and protect your data." />
    <div className="settings-stack"><section><div><h2>Appearance</h2><p>Choose the theme used on this device.</p></div><div className="segmented" aria-label="Color theme"><button aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Icon name="sun"/>Light</button><button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Icon name="moon"/>Dark</button></div></section>
    <section><div><h2>Cost protection</h2><p>Atlas V1 does not configure paid AI providers.</p></div>{cost.loading ? <span className="muted">Checking…</span> : cost.error ? <span className="badge warning">Status unavailable</span> : cost.data ? <div className="cost-box"><Icon name="shield"/><div><strong>${cost.data.externalBudgetUsd} external budget</strong><span>{cost.data.platformApiEnabled || cost.data.paidProvidersEnabled ? "Paid provider enabled — review configuration" : "Platform API and paid providers disabled"}</span></div></div> : null}</section>
    <section><div><h2>Local backup</h2><p>Create a consistent online SQLite backup. Atlas will not upload it.</p>{backupMessage && <p className="setting-message" role="status">{backupMessage}</p>}</div><button className="button quiet" onClick={backup} disabled={backingUp}>{backingUp ? "Creating…" : "Create backup"}</button></section>
    <section><div><h2>Mobile access</h2><p>Use Tailscale Serve for tailnet-only HTTPS. Never enable Funnel for Atlas.</p></div><span className="badge">Manual setup</span></section></div>
  </>;
}
