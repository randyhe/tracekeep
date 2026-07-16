export type LoopStatus = "open" | "waiting" | "scheduled" | "done" | "dismissed";
export type Completeness = "full" | "partial" | "reference_only" | "unavailable" | "export_backfilled";

export interface Evidence {
  id?: string;
  label?: string;
  sourceTitle?: string;
  occurredAt?: string;
  excerpt?: string;
}

export interface OpenLoop {
  id: string;
  title: string;
  summary?: string;
  status: LoopStatus;
  version: number;
  project?: string;
  dueAt?: string;
  updatedAt?: string;
  evidence?: Evidence[];
}

export interface ReviewCandidate {
  id: string;
  title: string;
  candidateType?: string;
  summary?: string;
  confidence?: number;
  sensitivity?: "personal" | "work_summary_only" | "restricted";
  version: number;
  evidence?: Evidence[];
  duplicateOf?: string;
  status?: "pending" | "accepted" | "rejected";
  updatedAt?: string;
  outcomeAction?: "created" | "merged";
  outcomeId?: string;
}

export interface SearchResult {
  id: string;
  type?: string;
  title: string;
  summary?: string;
  status?: string;
  occurredAt?: string;
  evidence?: Evidence[];
}

export interface SourceRecord {
  id: string;
  name: string;
  sourceType?: string;
  completeness: Completeness;
  lastSyncedAt?: string;
  itemCount?: number;
  detail?: string;
}

export interface TodayData {
  focus: OpenLoop[];
  overdue: OpenLoop[];
  waiting: OpenLoop[];
  reviewCount: number;
  generatedAt?: string;
  partial?: boolean;
  partialReason?: string;
}

export interface CostStatus {
  mode: string;
  platformApiEnabled: boolean;
  paidProvidersEnabled: boolean;
  externalBudgetUsd: number;
}
