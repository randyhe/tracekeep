import { useMemo, useRef, useState } from "react";
import { api, importCounts, isVersionConflict } from "./api";
import { CompletenessBadge, EvidenceList, LoopCard, OpenLoopEvidencePanel, PageHeader, PartialBanner, SkeletonCards, StatusPanel, formatDate } from "./components";
import { useAsync, usePersistentDraft } from "./hooks";
import { Icon } from "./icons";
import { getReviewUndoState } from "./review-state";
import type { OpenLoop, ReviewCandidate } from "./types";

function ActionError({ message, conflict }: { message?: string; conflict?: boolean }) {
  if (!message) return null;
  return <div className="inline-alert" role="alert"><strong>{conflict ? "This item changed elsewhere." : "Action not saved."}</strong> {conflict ? "Refresh to see the newest version before trying again." : message}</div>;
}

export function TodayPage() {
  const state = useAsync(api.today, []);
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<{ message: string; conflict: boolean }>();
  const [lastAction, setLastAction] = useState<{ before: OpenLoop; after: OpenLoop; message: string }>();
  async function changeStatus(item: OpenLoop, status: OpenLoop["status"], scheduledFor?: string) {
    setBusyId(item.id); setActionError(undefined); setLastAction(undefined);
    try {
      const after = await api.updateLoop(item.id, item.version, status, status === "scheduled" ? scheduledFor : null);
      const message = status === "open" ? "Moved back to Today." : status === "waiting" ? "Moved to Waiting." : status === "scheduled" ? "Scheduled for next week." : status === "done" ? "Marked done." : "Status updated.";
      setLastAction({ before: item, after, message }); state.reload();
    }
    catch (error) { setActionError({ message: error instanceof Error ? error.message : "Unknown error", conflict: isVersionConflict(error) }); state.reload(); }
    finally { setBusyId(undefined); }
  }
  async function undoLastAction() {
    if (!lastAction) return;
    setBusyId(lastAction.after.id); setActionError(undefined);
    try {
      await api.updateLoop(lastAction.after.id, lastAction.after.version, lastAction.before.status, lastAction.before.scheduledFor ?? null);
      setLastAction(undefined); state.reload();
    } catch (error) {
      setActionError({ message: error instanceof Error ? error.message : "Undo failed", conflict: isVersionConflict(error) }); state.reload();
    } finally { setBusyId(undefined); }
  }
  return <>
    <PageHeader eyebrow="Daily focus" title="Continue what matters." description="Three open loops worth moving forward today." />
    {state.loading && !state.data ? <SkeletonCards /> : state.error ? <StatusPanel kind="error" title="Tracekeep could not load today"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <>
      {state.data.partial && <PartialBanner reason={state.data.partialReason} />}
      <ActionError message={actionError?.message} conflict={actionError?.conflict} />
      {lastAction && <div className="inline-alert success status-undo" role="status"><strong>{lastAction.message}</strong><button className="button quiet compact" disabled={busyId === lastAction.after.id} onClick={undoLastAction}>Undo</button></div>}
      <section aria-labelledby="focus-heading" data-testid="today-focus"><div className="section-heading"><div><p className="eyebrow">Your focus</p><h2 id="focus-heading">Top {state.data.focus.length || 3}</h2></div><span className="as-of">{state.data.generatedAt ? `Updated ${formatDate(state.data.generatedAt)}` : "Deterministic local ranking"}</span></div>
      {state.data.focus.length ? <div className="card-stack">{state.data.focus.slice(0, 3).map((item) => <LoopCard key={item.id} item={item} busy={busyId === item.id} onStatus={(status, date) => changeStatus(item, status, date)} />)}</div> : <StatusPanel kind="empty" title="Nothing needs your attention"><p>Your focus list is clear. Capture an idea when something comes up.</p></StatusPanel>}</section>
      <div className="summary-grid"><article><span className="summary-number">{state.data.overdue.length}</span><h3>Overdue</h3><p>Items past their intended date.</p></article><article><span className="summary-number">{state.data.waiting.length}</span><h3>Waiting</h3><p>Commitments that depend on someone else.</p></article><article><span className="summary-number">{state.data.reviewCount}</span><h3>To review</h3><p>Candidates that need your judgement.</p></article></div>
      <DeferredSection title="Waiting" description="Bring an item back when you no longer need to wait." items={state.data.waiting} busyId={busyId} onRestore={(item) => changeStatus(item, "open")} />
      <DeferredSection title="Upcoming" description="Scheduled items stay out of Today until their date arrives." items={state.data.upcoming} busyId={busyId} onRestore={(item) => changeStatus(item, "open")} />
    </> : null}
  </>;
}

function DeferredSection({ title, description, items, busyId, onRestore }: { title: string; description: string; items: OpenLoop[]; busyId?: string; onRestore: (item: OpenLoop) => void }) {
  if (!items.length) return null;
  const headingId = `deferred-${title.toLowerCase()}`;
  return <section className="deferred-section" aria-labelledby={headingId}>
    <div className="section-heading"><div><p className="eyebrow">Manage later</p><h2 id={headingId}>{title}</h2></div><span className="as-of">{description}</span></div>
    <div className="deferred-list">{items.map((item) => <article key={item.id} data-testid={`deferred-${item.id}`}><div><h3>{item.title}</h3>{item.scheduledFor && <p>Scheduled {formatDate(item.scheduledFor)}</p>}</div><button className="button quiet compact" disabled={busyId === item.id} onClick={() => onRestore(item)}>Back to Today</button></article>)}</div>
  </section>;
}

type SpeechRecognitionConstructor = new () => { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function CapturePage() {
  const [draft, setDraft] = usePersistentDraft("tracekeep.quick-capture.draft", "atlas.quick-capture.draft");
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
    <PageHeader eyebrow="Quick capture" title="Get it out of your head." description="Write naturally. Tracekeep will propose structure, but you remain in control." />
    <section className="capture-panel">
      <label htmlFor="capture-text">What do you want to remember?</label>
      <textarea id="capture-text" data-testid="capture-input" value={draft} onChange={(event) => { setDraft(event.target.value); setStatus("idle"); }} placeholder="For example: Follow up on the CI idea next Thursday…" rows={8} autoFocus />
      <div className="capture-footer"><div className="draft-note"><span className="save-dot"/>Draft saved on this device</div><div className="capture-actions">{Recognition && <button className={`button quiet ${listening ? "active" : ""}`} onClick={toggleListening} type="button"><Icon name="mic"/>{listening ? "Stop listening" : "Voice input"}</button>}<button className="button primary" data-testid="save-capture" disabled={!draft.trim() || status === "saving"} onClick={submit}>{status === "saving" ? "Saving…" : "Save capture"}<Icon name="arrow"/></button></div></div>
      {message && <div className={`inline-alert ${status === "saved" ? "success" : ""}`} role="status">{message}</div>}
    </section>
    <aside className="privacy-note"><Icon name="shield"/><div><h2>Private by default</h2><p>Tracekeep stores the confirmed text, not microphone audio. Every capture enters Review before becoming an open loop.</p></div></aside>
  </>;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const state = useAsync(() => submitted ? api.search(submitted) : Promise.resolve({ results: [] }), [submitted]);
  return <>
    <PageHeader eyebrow="Sourced search" title="Find the thread again." description="Search decisions, open loops, and references without sending data to a paid AI provider." />
    <form className="search-box" data-testid="search-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); }} role="search"><Icon name="search"/><label className="sr-only" htmlFor="tracekeep-search">Search Tracekeep</label><input id="tracekeep-search" data-testid="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What did I decide about…"/><button className="button primary" disabled={!query.trim()}>Search</button></form>
    {!submitted ? <div className="search-prompt"><p className="eyebrow">Try asking</p><button onClick={() => { setQuery("What am I waiting for?"); setSubmitted("What am I waiting for?"); }}>What am I waiting for?</button><button onClick={() => { setQuery("Decisions from this week"); setSubmitted("Decisions from this week"); }}>Decisions from this week</button></div> : state.loading ? <SkeletonCards count={2}/> : state.error ? <StatusPanel kind="error" title="Search is unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <section aria-live="polite">
      {state.data.partial && <PartialBanner reason={state.data.partialReason}/>}<div className="section-heading"><h2>{state.data.results.length} result{state.data.results.length === 1 ? "" : "s"}</h2><span className="as-of">Evidence-linked local search</span></div>
      {state.data.results.length ? <div className="result-list" data-testid="search-results">{state.data.results.map((result) => <article key={result.id}><div className="result-type">{result.type ?? "Reference"}{result.occurredAt ? ` · ${formatDate(result.occurredAt)}` : ""}</div><h3>{result.title}</h3>{result.summary && <p>{result.summary}</p>}<EvidenceList evidence={result.evidence}/></article>)}</div> : <StatusPanel kind="empty" title="No matching memory"><p>Try fewer words or check Sources to see what Tracekeep can currently access.</p></StatusPanel>}
    </section> : null}
  </>;
}

export function ReviewPage() {
  const [tab, setTab] = useState<"pending" | "accepted" | "rejected">("pending");
  const state = useAsync(() => api.reviews(tab), [tab]);
  const loops = useAsync(api.openLoops, []);
  const [busy, setBusy] = useState<string>(); const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const [editing, setEditing] = useState<string>();
  const [editTitle, setEditTitle] = useState(""); const [editSummary, setEditSummary] = useState("");
  const [merging, setMerging] = useState<string>(); const [mergeTarget, setMergeTarget] = useState("");
  const sorted = useMemo(() => [...(state.data?.items ?? [])].sort((a, b) => riskScore(b) - riskScore(a)), [state.data]);
  async function decide(item: ReviewCandidate, action: "accept" | "edit" | "reject" | "undo" | "merge", changes?: object) {
    setBusy(item.id); setError(undefined);
    try { await api.review(item.id, action, item.version, changes); setEditing(undefined); setMerging(undefined); state.reload(); loops.reload(); }
    catch (reason) { setError({ message: reason instanceof Error ? reason.message : "Review failed", conflict: isVersionConflict(reason) }); state.reload(); }
    finally { setBusy(undefined); }
  }
  return <>
    <PageHeader eyebrow="Review queue" title="A few things need your judgement." description="Edit, merge, accept, or reject with a visible history you can undo." />
    <div className="review-tabs" role="tablist" aria-label="Review status">
      {(["pending", "accepted", "rejected"] as const).map((status) => <button key={status} role="tab" aria-selected={tab === status} data-testid={`review-tab-${status}`} onClick={() => { setTab(status); setError(undefined); }}>{status === "pending" ? "To review" : status === "accepted" ? "Accepted" : "Rejected"}</button>)}
    </div>
    <ActionError message={error?.message} conflict={error?.conflict}/>
    {state.loading ? <SkeletonCards/> : state.error ? <StatusPanel kind="error" title="Review queue unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : sorted.length ? <div className="review-list" data-testid="review-queue">{sorted.map((item) => {
      const undoState = getReviewUndoState(item, loops.data ?? [], loops.loading);
      const undoReasonId = `undo-reason-${item.id}`;
      return <article className="review-card" data-testid={`review-${item.id}`} key={item.id}>
      <div className="review-top"><div><span className="badge">{item.candidateType ?? "Candidate"}</span>{item.knowledgeKind && <span className="badge">{item.knowledgeKind.replaceAll("_", " ")}</span>}{item.sensitivity && <span className={`badge sensitivity-${item.sensitivity}`}>{item.sensitivity.replaceAll("_", " ")}</span>}{item.outcomeAction && <span className="badge">{item.outcomeAction}</span>}</div>{item.updatedAt && <span className="confidence">Updated {formatDate(item.updatedAt)}</span>}</div>
      {item.outcomeId && <div className="outcome-reference" data-testid={`outcome-${item.id}`}><strong>{item.outcomeAction === "merged" ? "Merged into" : "Created outcome"}</strong><span>{item.candidateType === "open_loop" ? (loops.data?.find((loop) => loop.id === item.outcomeId)?.title ?? "Open loop") : (item.knowledgeKind?.replaceAll("_", " ") ?? item.candidateType ?? "Memory")}</span><code>{item.outcomeId}</code></div>}
      {item.duplicateOf && <div className="duplicate-hint" data-testid={`duplicate-${item.id}`}><strong>Possible duplicate</strong><span>{loops.data?.find((loop) => loop.id === item.duplicateOf)?.title ?? "Existing open loop"}</span></div>}
      {editing === item.id ? <form className="review-edit" data-testid={`edit-form-${item.id}`} onSubmit={(event) => { event.preventDefault(); decide(item, "edit", { title: editTitle.trim(), summary: editSummary.trim() || null }); }}>
        <label htmlFor={`edit-title-${item.id}`}>Title</label><input id={`edit-title-${item.id}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required maxLength={500}/>
        <label htmlFor={`edit-summary-${item.id}`}>Summary</label><textarea id={`edit-summary-${item.id}`} value={editSummary} onChange={(event) => setEditSummary(event.target.value)} rows={4}/>
        <div className="review-actions"><button className="button primary" disabled={busy === item.id || !editTitle.trim()}>Save changes</button><button className="button quiet" type="button" onClick={() => setEditing(undefined)}>Cancel</button></div>
      </form> : <><h2>{item.title}</h2>{item.summary && <p>{item.summary}</p>}{item.canonicalUri && <p className="source-locator"><strong>Original source</strong><code>{item.canonicalUri}</code></p>}<EvidenceList evidence={item.evidence}/>{tab === "accepted" && item.candidateType === "open_loop" && item.outcomeId && <OpenLoopEvidencePanel openLoopId={item.outcomeId}/>}</>}
      {merging === item.id && <form className="merge-panel" data-testid={`merge-form-${item.id}`} onSubmit={(event) => { event.preventDefault(); const target = loops.data?.find((loop) => loop.id === mergeTarget); if (target) decide(item, "merge", { targetOpenLoopId: target.id, targetExpectedVersion: target.version }); }}>
        <label htmlFor={`merge-target-${item.id}`}>Existing open loop to keep</label><select id={`merge-target-${item.id}`} value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} required><option value="">Choose an active open loop…</option>{loops.data?.filter((loop) => !["done", "dismissed"].includes(loop.status)).map((loop) => <option key={loop.id} value={loop.id}>{loop.title} · {loop.status}</option>)}</select>
        <p>The candidate’s evidence will be attached to the selected open loop. Its title and status stay unchanged.</p>
        <div className="review-actions"><button className="button primary" disabled={!mergeTarget || busy === item.id}>Merge evidence</button><button className="button quiet" type="button" onClick={() => setMerging(undefined)}>Cancel</button></div>
      </form>}
      {!editing && !merging && <div className="review-actions">{tab === "pending" ? <><button className="button primary" data-testid={`accept-${item.id}`} disabled={busy === item.id} onClick={() => decide(item, "accept")}><Icon name="check"/>Accept</button><button className="button quiet" data-testid={`edit-${item.id}`} onClick={() => { setEditing(item.id); setEditTitle(item.title); setEditSummary(item.summary ?? ""); }}>Edit</button>{item.candidateType === "open_loop" && <button className="button quiet" data-testid={`merge-${item.id}`} disabled={loops.loading || !loops.data?.length} onClick={() => { setMerging(item.id); setMergeTarget(item.duplicateOf ?? ""); }}>Merge</button>}<button className="button danger-quiet" data-testid={`reject-${item.id}`} disabled={busy === item.id} onClick={() => decide(item, "reject")}>Reject</button></> : <button className="button quiet" data-testid={`undo-${item.id}`} disabled={busy === item.id || !undoState.allowed} aria-describedby={!undoState.allowed ? undoReasonId : undefined} onClick={() => decide(item, "undo")}><Icon name="refresh"/>Undo {tab === "accepted" ? "acceptance" : "rejection"}</button>}</div>}
      {tab === "accepted" && !undoState.allowed && !loops.loading && <div className="undo-unavailable" id={undoReasonId} data-testid={`undo-unavailable-${item.id}`}><strong>Undo unavailable</strong><span>{undoState.reason}</span>{undoState.outcome && <a href="/today">Manage in Today</a>}</div>}
    </article>;
    })}</div> : <StatusPanel kind="empty" title={tab === "pending" ? "Review complete" : "No history yet"}><p>{tab === "pending" ? "There are no candidates waiting for you." : `No ${tab} candidates to show.`}</p></StatusPanel>}
  </>;
}

function riskScore(item: ReviewCandidate) { return (item.sensitivity === "restricted" ? 100 : item.sensitivity === "work_summary_only" ? 50 : 0) + (item.duplicateOf ? 10 : 0); }

type Sensitivity = "personal" | "work_summary_only" | "restricted";

function SourceImports({ onImported }: { onImported: () => void }) {
  const [sensitivity, setSensitivity] = useState<Sensitivity>("personal");
  const [chatFile, setChatFile] = useState<File>(); const [chatStatus, setChatStatus] = useState(""); const [chatBusy, setChatBusy] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); const [path, setPath] = useState(""); const [content, setContent] = useState(""); const [logStatus, setLogStatus] = useState(""); const [logBusy, setLogBusy] = useState(false);
  async function importChat() {
    if (!chatFile) return; setChatBusy(true); setChatStatus("");
    try {
      if (chatFile.size > 12 * 1024 * 1024) throw new Error("File exceeds the 12 MB local import limit.");
      const payload = JSON.parse(await chatFile.text()) as unknown;
      const result = await api.importChatGpt(payload, sensitivity); const counts = importCounts(result); setChatStatus(`Imported ${counts.sourceCount} conversation${counts.sourceCount === 1 ? "" : "s"} and ${counts.candidateCount} candidate${counts.candidateCount === 1 ? "" : "s"} into Review.`); onImported();
    } catch (error) { setChatStatus(error instanceof Error ? error.message : "Import failed"); }
    finally { setChatBusy(false); }
  }
  async function importLog() {
    if (!content.trim()) return; setLogBusy(true); setLogStatus("");
    try { const result = await api.importDailyLog({ date, content: content.trim(), sensitivity, ...(path.trim() ? { path: path.trim() } : {}) }); const counts = importCounts(result); setLogStatus(`Imported ${counts.sourceCount} daily log and ${counts.candidateCount} candidate${counts.candidateCount === 1 ? "" : "s"} into Review.`); setContent(""); onImported(); }
    catch (error) { setLogStatus(error instanceof Error ? error.message : "Import failed"); }
    finally { setLogBusy(false); }
  }
  return <section className="imports-section" aria-labelledby="imports-heading"><div className="section-heading"><div><p className="eyebrow">Local import</p><h2 id="imports-heading">Bring in trusted files deliberately</h2></div></div>
    <div className="import-policy"><Icon name="shield"/><p>Imported text is untrusted data. Tracekeep never executes commands, opens links, or follows instructions found inside it.</p></div>
    <div className="import-controls"><label htmlFor="import-sensitivity">Sensitivity for this import</label><select id="import-sensitivity" value={sensitivity} onChange={(event) => setSensitivity(event.target.value as Sensitivity)}><option value="personal">Personal</option><option value="work_summary_only">Work summary only</option><option value="restricted">Restricted</option></select></div>
    <div className="import-grid">
      <article><h3>ChatGPT Export</h3><p>Select a local <code>conversations.json</code> file. Up to 1,000 conversations per import.</p><label className="file-picker" htmlFor="chatgpt-file">Choose JSON file<input id="chatgpt-file" data-testid="chatgpt-import-file" type="file" accept="application/json,.json" onChange={(event) => setChatFile(event.target.files?.[0])}/></label>{chatFile && <p className="selected-file">{chatFile.name} · {(chatFile.size / 1024).toFixed(0)} KB</p>}<button className="button primary" data-testid="chatgpt-import-submit" disabled={!chatFile || chatBusy} onClick={importChat}>{chatBusy ? "Importing…" : "Import ChatGPT export"}</button>{chatStatus && <p className="setting-message" role="status">{chatStatus}</p>}</article>
      <article><h3>Daily Learning Log</h3><p>Paste a reviewed Markdown log. The original path is stored only as a source locator.</p><div className="form-row"><label htmlFor="daily-date">Log date</label><input id="daily-date" data-testid="daily-log-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></div><div className="form-row"><label htmlFor="daily-path">Original path <span>(optional)</span></label><input id="daily-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\…\\2026-07-15.md"/></div><div className="form-row"><label htmlFor="daily-content">Reviewed Markdown</label><textarea id="daily-content" data-testid="daily-log-content" rows={5} value={content} onChange={(event) => setContent(event.target.value)}/></div><button className="button primary" data-testid="daily-log-submit" disabled={!content.trim() || !date || logBusy} onClick={importLog}>{logBusy ? "Importing…" : "Import daily log"}</button>{logStatus && <p className="setting-message" role="status">{logStatus}</p>}</article>
    </div>
  </section>;
}

export function SourcesPage() {
  const state = useAsync(api.sources, []);
  return <>
    <PageHeader eyebrow="Source coverage" title="Know what Tracekeep knows." description="Access is conditional. Tracekeep never claims complete ChatGPT history." action={<button className="button quiet" onClick={state.reload}><Icon name="refresh"/>Refresh status</button>}/>
    {state.loading ? <SkeletonCards/> : state.error ? <StatusPanel kind="error" title="Sources unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data ? <>{state.data.partial && <PartialBanner reason={state.data.partialReason}/>}<div className="source-list" data-testid="source-list">{state.data.sources.map((source) => <article key={source.id}><div className="source-icon" aria-hidden="true">{source.name.slice(0, 1).toUpperCase()}</div><div className="source-body"><div><h2>{source.name}</h2><p>{source.detail ?? source.sourceType ?? "Local source"}</p></div><div className="source-meta"><CompletenessBadge value={source.completeness}/>{source.itemCount != null && <span>{source.itemCount} items</span>}{source.lastSyncedAt && <span>Synced {formatDate(source.lastSyncedAt)}</span>}</div></div></article>)}</div>{!state.data.sources.length && <StatusPanel kind="empty" title="No sources connected"><p>Manual capture still works. Connect a supported source when you are ready.</p></StatusPanel>}</> : null}
    <SourceImports onImported={state.reload}/>
  </>;
}

export function LearningNotesPage() {
  const state = useAsync(api.learningNotes, []);
  return <>
    <PageHeader eyebrow="Second-brain memory" title="Learning notes collected from your work." description="Meaningful conversations, documents, papers, and web pages are stored locally with their source." action={<button className="button quiet" onClick={state.reload}><Icon name="refresh"/>Refresh notes</button>}/>
    {state.loading ? <SkeletonCards/> : state.error ? <StatusPanel kind="error" title="Learning notes unavailable"><p>{state.error.message}</p><button className="button quiet" onClick={state.reload}>Try again</button></StatusPanel> : state.data?.length ? <div className="result-list" data-testid="learning-notes">{state.data.map((note) => <article key={note.id}>
      <div className="result-type">{note.knowledgeKind.replaceAll("_", " ")} · {formatDate(note.createdAt)}</div>
      <h2>{note.title}</h2>
      {note.summary && <p>{note.summary}</p>}
      {note.canonicalUri && <p className="source-locator"><strong>Original source</strong><code>{note.canonicalUri}</code></p>}
      <EvidenceList evidence={note.sourceTitle || note.sourceLocator ? [{ label: note.sourceTitle ?? "Source", sourceTitle: note.sourceTitle, sourceType: note.sourceType, locator: note.sourceLocator }] : []}/>
    </article>)}</div> : <StatusPanel kind="empty" title="No learning notes yet"><p>Finish a meaningful Codex turn, discuss a document or paper, or share a URL. Tracekeep will preserve the useful result automatically.</p></StatusPanel>}
  </>;
}

export function SettingsPage({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void }) {
  const cost = useAsync(api.costStatus, []); const autoCapture = useAsync(api.autoCaptureSetting, []); const [backupMessage, setBackupMessage] = useState(""); const [backingUp, setBackingUp] = useState(false); const [confirmBackup, setConfirmBackup] = useState(false); const [captureMessage, setCaptureMessage] = useState(""); const [savingCapture, setSavingCapture] = useState(false);
  async function backup() { setBackingUp(true); setBackupMessage(""); try { const result = await api.createBackup(); setBackupMessage(`Backup created ${formatDate(result.createdAt)}.`); } catch (error) { setBackupMessage(error instanceof Error ? error.message : "Backup failed"); } finally { setBackingUp(false); } }
  async function toggleAutoCapture() { if (!autoCapture.data) return; setSavingCapture(true); setCaptureMessage(""); try { const result = await api.updateAutoCaptureSetting(!autoCapture.data.enabled); setCaptureMessage(result.enabled ? "Automatic learning capture is on." : "Automatic learning capture is paused."); autoCapture.reload(); } catch (error) { setCaptureMessage(error instanceof Error ? error.message : "Setting could not be saved."); } finally { setSavingCapture(false); } }
  return <>
    <PageHeader eyebrow="Preferences" title="Local, legible, under your control." description="Manage appearance, verify zero-incremental-cost mode, and protect your data." />
    <div className="settings-stack"><section><div><h2>Appearance</h2><p>Choose the theme used on this device.</p></div><div className="segmented" aria-label="Color theme"><button aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Icon name="sun"/>Light</button><button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Icon name="moon"/>Dark</button></div></section>
    <section><div><h2>Automatic second-brain capture</h2><p>At the end of each meaningful Codex turn, save learning notes automatically and send actions or decisions to Review. Short social messages and credential-like text are skipped.</p>{captureMessage && <p className="setting-message" role="status">{captureMessage}</p>}</div>{autoCapture.loading ? <span className="muted">Checking…</span> : autoCapture.error ? <span className="badge warning">Status unavailable</span> : autoCapture.data ? <button className={`button ${autoCapture.data.enabled ? "primary" : "quiet"}`} data-testid="auto-capture-toggle" aria-pressed={autoCapture.data.enabled} disabled={savingCapture} onClick={toggleAutoCapture}>{savingCapture ? "Saving…" : autoCapture.data.enabled ? "Automatic capture: On" : "Automatic capture: Off"}</button> : null}</section>
    <section><div><h2>Cost protection</h2><p>Tracekeep V1 does not configure paid AI providers.</p></div>{cost.loading ? <span className="muted">Checking…</span> : cost.error ? <span className="badge warning">Status unavailable</span> : cost.data ? <div className="cost-box"><Icon name="shield"/><div><strong>${cost.data.externalBudgetUsd} external budget</strong><span>{cost.data.platformApiEnabled || cost.data.paidProvidersEnabled ? "Paid provider enabled — review configuration" : "Platform API and paid providers disabled"}</span></div></div> : null}</section>
    <section><div><h2>Local backup</h2><p>Create a consistent online SQLite backup. Tracekeep will not upload it.</p>{backupMessage && <p className="setting-message" role="status">{backupMessage}</p>}</div><button className="button quiet" data-testid="backup-start" onClick={() => setConfirmBackup(true)} disabled={backingUp}>{backingUp ? "Creating…" : "Create backup"}</button></section>
    <section><div><h2>Restore</h2><p>Web restore is unavailable because replacing a live database is unsafe. Restore requires stopping Tracekeep and using the verified local recovery workflow.</p></div><span className="badge warning">Service must be stopped</span></section>
    <section><div><h2>Mobile access</h2><p>Use Tailscale Serve for tailnet-only HTTPS. Never enable Funnel for Tracekeep.</p></div><span className="badge">Manual setup</span></section></div>
    {confirmBackup && <div className="dialog-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" data-testid="backup-confirm-dialog"><h2 id="backup-dialog-title">Create a local backup?</h2><p>Tracekeep will create a consistent SQLite backup in its configured local backup directory. Nothing is uploaded.</p><div className="review-actions"><button className="button primary" data-testid="backup-confirm" autoFocus onClick={async () => { setConfirmBackup(false); await backup(); }}>Create backup</button><button className="button quiet" onClick={() => setConfirmBackup(false)}>Cancel</button></div></div></div>}
  </>;
}
