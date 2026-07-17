import { useState, type ReactNode } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import type { Completeness, Evidence, OpenLoop } from "./types";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
    </div>
    {action && <div className="page-action">{action}</div>}
  </header>;
}

export function StatusPanel({ kind, title, children, action }: { kind: "loading" | "empty" | "error" | "partial"; title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={`status-panel ${kind}`} role={kind === "error" ? "alert" : "status"}>
    <span className="status-mark" aria-hidden="true">{kind === "loading" ? "···" : kind === "error" ? "!" : kind === "partial" ? "◐" : "○"}</span>
    <div><h2>{title}</h2><div>{children}</div>{action && <div className="status-action">{action}</div>}</div>
  </section>;
}

export function PartialBanner({ reason }: { reason?: string }) {
  return <div className="partial-banner" role="status"><span aria-hidden="true">◐</span><span><strong>Partial view.</strong> {reason ?? "Some sources could not be loaded. Available information is shown below."}</span></div>;
}

export function EvidenceList({ evidence }: { evidence?: Evidence[] }) {
  if (!evidence?.length) return <span className="muted">No source excerpt available</span>;
  return <div className="evidence-list">{evidence.map((item, index) => <details key={item.id ?? index}>
    <summary>{item.sourceTitle ?? item.label ?? "Source"}{item.sourceType ? ` · ${formatSourceType(item.sourceType)}` : ""}{item.occurredAt ? ` · ${formatDate(item.occurredAt)}` : ""}</summary>
    {item.locator && <p className="source-locator"><span>Locator</span><code>{item.locator}</code></p>}
    {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
  </details>)}</div>;
}

function formatSourceType(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function OpenLoopEvidencePanel({ openLoopId }: { openLoopId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  async function toggle() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (evidence) return;
    setLoading(true); setError(undefined);
    try { setEvidence(await api.openLoopEvidence(openLoopId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Evidence could not be loaded"); }
    finally { setLoading(false); }
  }
  const panelId = `evidence-panel-${openLoopId}`;
  return <div className="open-loop-evidence">
    <button className="button quiet compact" type="button" data-testid={`evidence-${openLoopId}`} aria-expanded={expanded} aria-controls={panelId} onClick={toggle}>
      {expanded ? "Hide evidence" : "View evidence"}{evidence ? ` (${evidence.length})` : ""}
    </button>
    {expanded && <div id={panelId} className="evidence-panel" role="region" aria-label="Source evidence">
      {loading ? <span className="muted">Loading evidence…</span> : error ? <span className="inline-alert" role="alert">{error}</span> : <EvidenceList evidence={evidence}/>}
    </div>}
  </div>;
}

export function LoopCard({ item, busy, onStatus }: { item: OpenLoop; busy?: boolean; onStatus: (status: OpenLoop["status"], scheduledFor?: string) => void }) {
  return <article className="loop-card" data-testid={`open-loop-${item.id}`}>
    <div className="loop-index" aria-hidden="true">{item.status === "waiting" ? "W" : "→"}</div>
    <div className="loop-content">
      <div className="loop-meta"><span>{item.project ?? "Unsorted"}</span>{item.dueAt && <span>Due {formatDate(item.dueAt)}</span>}</div>
      <h3>{item.title}</h3>
      {item.summary && <p>{item.summary}</p>}
      <OpenLoopEvidencePanel openLoopId={item.id} />
      <div className="inline-actions">
        <button className="button primary compact" data-testid={`complete-${item.id}`} disabled={busy} onClick={() => onStatus("done")}><Icon name="check" />Done</button>
        <button className="button quiet compact" disabled={busy} onClick={() => onStatus("waiting")}><Icon name="clock" />Waiting</button>
        <button className="button quiet compact" disabled={busy} onClick={() => {
          const date = new Date(); date.setDate(date.getDate() + 7); onStatus("scheduled", date.toISOString());
        }}>Next week</button>
      </div>
    </div>
  </article>;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return <div className="card-stack" aria-label="Loading"><span className="sr-only">Loading</span>{Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index}><span/><span/><span/></div>)}</div>;
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

const completenessLabels: Record<Completeness, string> = {
  full: "Full",
  partial: "Partial",
  reference_only: "Reference only",
  unavailable: "Unavailable",
  export_backfilled: "Export backfilled",
};

export function CompletenessBadge({ value }: { value: Completeness }) {
  return <span className={`badge completeness-${value}`}>{completenessLabels[value]}</span>;
}
