import type { CostStatus, Evidence, OpenLoop, ReviewCandidate, SearchResult, SourceRecord, TodayData } from "./types";

export interface ImportResult {
  items: Array<{ candidate?: unknown; candidates?: unknown[] }>;
  sourceCount?: number;
  candidateCount?: number;
}

interface WireOpenLoop {
  id: string;
  title: string;
  notes?: string;
  status: OpenLoop["status"];
  version: number;
  dueAt?: string;
  scheduledFor?: string;
  updatedAt?: string;
  evidence?: Array<{ id: string; sourceId: string; quote?: string; locator?: string; createdAt: string }>;
}

interface WireOpenLoopEvidence {
  evidence: { id: string; sourceId: string; quote?: string; locator?: string; createdAt: string };
  source: { id: string; type: string; title: string };
}

export function normalizeOpenLoop(item: WireOpenLoop): OpenLoop {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    version: item.version,
    ...(item.notes ? { summary: item.notes } : {}),
    ...(item.dueAt ? { dueAt: item.dueAt } : {}),
    ...(item.scheduledFor ? { scheduledFor: item.scheduledFor } : {}),
    ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    ...(item.evidence?.length ? { evidence: item.evidence.map((evidence) => ({ id: evidence.id, label: evidence.locator ?? "Source evidence", occurredAt: evidence.createdAt, excerpt: evidence.quote })) } : {}),
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/v1${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    throw new ApiError(payload.error?.message ?? `Request failed (${response.status})`, response.status, payload.error?.code, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function idempotencyKey() {
  return crypto.randomUUID();
}

export const api = {
  health: () => request<{ status: string; version?: string }>("/health/ready"),
  today: async (): Promise<TodayData> => {
    const [result, reviewResult, openLoopResult] = await Promise.all([
      request<{ items: WireOpenLoop[]; generatedAt?: string }>("/today"),
      request<ReviewCandidate[] | { items: ReviewCandidate[] }>("/reviews?status=pending").catch(() => [] as ReviewCandidate[]),
      request<{ items: WireOpenLoop[] }>("/open-loops"),
    ]);
    const now = Date.now();
    const reviews = Array.isArray(reviewResult) ? reviewResult : reviewResult.items;
    const items = result.items.map(normalizeOpenLoop);
    const openLoops = openLoopResult.items.map(normalizeOpenLoop);
    return {
      focus: items,
      overdue: openLoops.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < now && !["done", "dismissed"].includes(item.status)),
      waiting: openLoops.filter((item) => item.status === "waiting"),
      upcoming: openLoops.filter((item) => item.status === "scheduled"),
      reviewCount: reviews.length,
      generatedAt: result.generatedAt,
    };
  },
  capture: (text: string) => request<{ id: string; candidateId?: string }>("/captures", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ text, sourceType: "manual" }),
  }),
  updateLoop: async (id: string, expectedVersion: number, status: string, scheduledFor?: string | null) => {
    const result = await request<{ item: WireOpenLoop }>(`/open-loops/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey() },
      body: JSON.stringify({ expectedVersion, status, scheduledFor }),
    });
    return normalizeOpenLoop(result.item);
  },
  openLoops: async () => {
    const result = await request<{ items: WireOpenLoop[] }>("/open-loops");
    return result.items.map(normalizeOpenLoop);
  },
  openLoopEvidence: async (id: string): Promise<Evidence[]> => {
    const result = await request<{ items: WireOpenLoopEvidence[] }>(`/open-loops/${encodeURIComponent(id)}/evidence`);
    return result.items.map((item) => ({
      id: item.evidence.id,
      label: item.source.title,
      sourceTitle: item.source.title,
      sourceType: item.source.type,
      occurredAt: item.evidence.createdAt,
      ...(item.evidence.locator ? { locator: item.evidence.locator } : {}),
      ...(item.evidence.quote ? { excerpt: item.evidence.quote } : {}),
    }));
  },
  search: async (query: string): Promise<{ results: SearchResult[]; partial?: boolean; partialReason?: string }> => {
    const result = await request<{ results: Array<{ entityType: string; entityId: string; title: string; snippet?: string; sourceId?: string; sourceTitle?: string; sourceType?: string; sourceLocator?: string }> }>(`/search?q=${encodeURIComponent(query)}&limit=30`);
    return { results: result.results.map((item): SearchResult => ({
      id: item.entityId,
      type: item.entityType,
      title: item.title,
      summary: item.snippet,
      evidence: item.sourceId ? [{
        id: item.sourceId,
        label: item.sourceTitle ?? "Source record",
        ...(item.sourceTitle ? { sourceTitle: item.sourceTitle } : {}),
        ...(item.sourceType ? { sourceType: item.sourceType } : {}),
        ...(item.sourceLocator ? { locator: item.sourceLocator } : {}),
      }] : [],
    })) };
  },
  reviews: async (status: "pending" | "accepted" | "rejected" = "pending") => {
    const result = await request<ReviewCandidate[] | { items: ReviewCandidate[] }>(`/reviews?status=${status}`);
    return Array.isArray(result) ? { items: result } : result;
  },
  review: (id: string, action: "accept" | "edit" | "reject" | "undo" | "merge", expectedVersion: number, changes?: object) => request<{ candidate: ReviewCandidate }>(`/reviews/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ action, expectedVersion, ...changes }),
  }),
  sources: async (): Promise<{ sources: SourceRecord[]; partial?: boolean; partialReason?: string }> => {
    const result = await request<Array<{ id: string; type: string; title: string; completeness: SourceRecord["completeness"]; updatedAt: string }> | { items: Array<{ id: string; type: string; title: string; completeness: SourceRecord["completeness"]; updatedAt: string }> } | { sources: SourceRecord[] }>("/sources");
    if ("sources" in result) return result;
    const items = Array.isArray(result) ? result : result.items;
    return { sources: items.map((item) => ({ id: item.id, name: item.title, sourceType: item.type, completeness: item.completeness, lastSyncedAt: item.updatedAt })) };
  },
  costStatus: async (): Promise<CostStatus> => {
    const result = await request<{ mode: string; platformApiEnabled: boolean; paidTranscriptionEnabled: boolean; externalHostingEnabled: boolean; monthlyExternalBudgetUsd: number }>("/cost-status");
    return {
      mode: result.mode,
      platformApiEnabled: result.platformApiEnabled,
      paidProvidersEnabled: result.paidTranscriptionEnabled || result.externalHostingEnabled,
      externalBudgetUsd: result.monthlyExternalBudgetUsd,
    };
  },
  createBackup: async () => {
    const result = await request<{ backup: { fileName: string; createdAt: string } }>("/backups", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey() },
    });
    return { backupId: result.backup.fileName, createdAt: result.backup.createdAt };
  },
  importChatGpt: (payload: unknown, sensitivity: "personal" | "work_summary_only" | "restricted") => request<ImportResult>("/imports/chatgpt-export", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify(Array.isArray(payload) ? { conversations: payload, sensitivity } : { ...(payload as object), sensitivity }),
  }),
  importDailyLog: (input: { date: string; content: string; path?: string; sensitivity: "personal" | "work_summary_only" | "restricted" }) => request<ImportResult>("/imports/daily-log", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify(input),
  }),
};

export function importCounts(result: ImportResult): { sourceCount: number; candidateCount: number } {
  return {
    sourceCount: result.sourceCount ?? result.items.length,
    candidateCount: result.candidateCount ?? result.items.reduce((total, item) => total + (item.candidates?.length ?? (item.candidate ? 1 : 0)), 0),
  };
}

export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.code === "VERSION_CONFLICT");
}
