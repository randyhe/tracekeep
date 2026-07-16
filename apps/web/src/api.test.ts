import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, importCounts, isVersionConflict, normalizeOpenLoop } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("import counts", () => {
  it("counts backward-compatible singular and plural candidates", () => {
    expect(importCounts({ items: [{ candidate: {} }, { candidates: [{}, {}] }] })).toEqual({ sourceCount: 2, candidateCount: 3 });
    expect(importCounts({ items: [], sourceCount: 4, candidateCount: 7 })).toEqual({ sourceCount: 4, candidateCount: 7 });
  });
});

function mockJson(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" });
  return fetchMock;
}

describe("isVersionConflict", () => {
  it("recognizes HTTP 409 conflicts", () => {
    expect(isVersionConflict(new ApiError("stale", 409))).toBe(true);
  });

  it("recognizes backend version conflict codes", () => {
    expect(isVersionConflict(new ApiError("stale", 400, "VERSION_CONFLICT"))).toBe(true);
  });

  it("does not hide ordinary failures as conflicts", () => {
    expect(isVersionConflict(new ApiError("offline", 503))).toBe(false);
  });
});

describe("review actions", () => {
  it("sends undo with optimistic concurrency", async () => {
    const fetchMock = mockJson({ candidate: { id: "review-1" } });
    await api.review("review-1", "undo", 4);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/reviews/review-1/actions", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "undo", expectedVersion: 4 }),
    }));
  });

  it("merges into a versioned existing open loop", async () => {
    const fetchMock = mockJson({ candidate: { id: "review-1" } });
    await api.review("review-1", "merge", 2, { targetOpenLoopId: "loop-1", targetExpectedVersion: 7 });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ action: "merge", expectedVersion: 2, targetOpenLoopId: "loop-1", targetExpectedVersion: 7 }));
  });

  it("preserves merge outcome history for target display", async () => {
    mockJson({ items: [{ id: "review-1", title: "Duplicate", version: 3, status: "accepted", outcomeAction: "merged", outcomeId: "loop-1" }] });
    const result = await api.reviews("accepted");
    expect(result.items[0]).toMatchObject({ outcomeAction: "merged", outcomeId: "loop-1" });
  });
});

describe("open-loop evidence", () => {
  it("maps backend evidence into the shared evidence presentation", () => {
    const item = normalizeOpenLoop({
      id: "loop-1",
      title: "Follow up",
      notes: "Check the result",
      status: "open",
      version: 2,
      evidence: [{ id: "evidence-1", sourceId: "source-1", quote: "I should follow up", locator: "codex:thread-1", createdAt: "2026-07-15T12:00:00Z" }],
    });
    expect(item.summary).toBe("Check the result");
    expect(item.evidence?.[0]).toMatchObject({ label: "codex:thread-1", excerpt: "I should follow up", occurredAt: "2026-07-15T12:00:00Z" });
  });
});

describe("imports", () => {
  it("imports ChatGPT export data with an explicit sensitivity", async () => {
    const fetchMock = mockJson({ items: [] });
    await api.importChatGpt([{ conversation_id: "chat-1", mapping: {} }], "work_summary_only");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/imports/chatgpt-export");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"sensitivity":"work_summary_only"');
  });

  it("imports a dated daily log without inventing a path", async () => {
    const fetchMock = mockJson({ items: [] });
    await api.importDailyLog({ date: "2026-07-15", content: "Reviewed log", sensitivity: "personal" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/imports/daily-log");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ date: "2026-07-15", content: "Reviewed log", sensitivity: "personal" }));
  });
});
