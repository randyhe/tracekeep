import type { CostStatus, ReviewCandidate, SearchResult, SourceRecord, TodayData } from "./types";

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
    const [result, reviewResult] = await Promise.all([
      request<{ items: TodayData["focus"]; generatedAt?: string }>("/today"),
      request<ReviewCandidate[] | { items: ReviewCandidate[] }>("/reviews?status=pending").catch(() => [] as ReviewCandidate[]),
    ]);
    const now = Date.now();
    const reviews = Array.isArray(reviewResult) ? reviewResult : reviewResult.items;
    return {
      focus: result.items,
      overdue: result.items.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < now),
      waiting: result.items.filter((item) => item.status === "waiting"),
      reviewCount: reviews.length,
      generatedAt: result.generatedAt,
    };
  },
  capture: (text: string) => request<{ id: string; candidateId?: string }>("/captures", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ text, sourceType: "manual" }),
  }),
  updateLoop: (id: string, expectedVersion: number, status: string, scheduledFor?: string) => request(`/open-loops/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ expectedVersion, status, scheduledFor }),
  }),
  search: async (query: string): Promise<{ results: SearchResult[]; partial?: boolean; partialReason?: string }> => {
    const result = await request<{ results: Array<{ entityType: string; entityId: string; title: string; snippet?: string; sourceId?: string }> }>(`/search?q=${encodeURIComponent(query)}&limit=30`);
    return { results: result.results.map((item): SearchResult => ({ id: item.entityId, type: item.entityType, title: item.title, summary: item.snippet, evidence: item.sourceId ? [{ id: item.sourceId, label: "Source record" }] : [] })) };
  },
  reviews: async () => {
    const result = await request<ReviewCandidate[] | { items: ReviewCandidate[] }>("/reviews?status=pending");
    return Array.isArray(result) ? { items: result } : result;
  },
  review: (id: string, action: "accept" | "reject", expectedVersion: number, changes?: object) => request(`/reviews/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ action, expectedVersion, changes }),
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
};

export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.code === "VERSION_CONFLICT");
}
