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

  it("keeps scheduled dates when normalizing open loops", () => {
    expect(normalizeOpenLoop({ id: "loop-1", title: "Later", status: "scheduled", version: 2, scheduledFor: "2026-07-23T12:00:00Z" })).toMatchObject({
      scheduledFor: "2026-07-23T12:00:00Z",
    });
  });

  it("loads sanitized source evidence on demand", async () => {
    const fetchMock = mockJson({ items: [{
      evidence: { id: "evidence-1", sourceId: "source-1", quote: "Follow up", createdAt: "2026-07-15T12:00:00Z" },
      source: { id: "source-1", type: "manual", title: "Manual capture" },
    }] });
    const result = await api.openLoopEvidence("loop-1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/open-loops/loop-1/evidence");
    expect(result).toEqual([{ id: "evidence-1", label: "Manual capture", sourceTitle: "Manual capture", sourceType: "manual", occurredAt: "2026-07-15T12:00:00Z", excerpt: "Follow up" }]);
  });

  it("does not invent an excerpt when restricted evidence is redacted", async () => {
    mockJson({ items: [{
      evidence: { id: "evidence-2", sourceId: "source-2", createdAt: "2026-07-15T12:00:00Z" },
      source: { id: "source-2", type: "manual", title: "[restricted source]" },
    }] });
    const result = await api.openLoopEvidence("loop-2");
    expect(result).toEqual([{ id: "evidence-2", label: "[restricted source]", sourceTitle: "[restricted source]", sourceType: "manual", occurredAt: "2026-07-15T12:00:00Z" }]);
    expect(result[0]).not.toHaveProperty("excerpt");
  });
});

describe("search source attribution", () => {
  it("maps human-readable source metadata and a safe locator", async () => {
    mockJson({ results: [{
      entityType: "decision",
      entityId: "decision-1",
      title: "Use SQLite",
      snippet: "Use SQLite for Tracekeep",
      sourceId: "source-1",
      sourceTitle: "Synthetic planning conversation",
      sourceType: "chatgpt_export",
      sourceLocator: "chatgpt-export:uat-chat-multi",
    }] });

    const result = await api.search("SQLite");
    expect(result.results[0]?.evidence).toEqual([{
      id: "source-1",
      label: "Synthetic planning conversation",
      sourceTitle: "Synthetic planning conversation",
      sourceType: "chatgpt_export",
      locator: "chatgpt-export:uat-chat-multi",
    }]);
  });

  it("keeps a backward-compatible fallback when metadata is unavailable", async () => {
    mockJson({ results: [{ entityType: "decision", entityId: "decision-1", title: "Use SQLite", sourceId: "source-1" }] });
    const result = await api.search("SQLite");
    expect(result.results[0]?.evidence).toEqual([{ id: "source-1", label: "Source record" }]);
  });
});

describe("today status management", () => {
  it("loads complete Waiting and Upcoming lists outside the three-item focus", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      const payload = input.includes("/today")
        ? { items: [{ id: "focus-1", title: "Focus", status: "open", version: 1 }] }
        : input.includes("/reviews")
          ? { items: [] }
          : { items: [
            { id: "waiting-1", title: "Waiting", status: "waiting", version: 2 },
            { id: "later-1", title: "Later", status: "scheduled", version: 3, scheduledFor: "2026-07-23T12:00:00Z" },
          ] };
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.today();
    expect(result.focus.map((item) => item.id)).toEqual(["focus-1"]);
    expect(result.waiting.map((item) => item.id)).toEqual(["waiting-1"]);
    expect(result.upcoming.map((item) => item.id)).toEqual(["later-1"]);
  });

  it("clears the schedule when moving an item back to Today", async () => {
    const fetchMock = mockJson({ item: { id: "loop-1", title: "Later", status: "open", version: 4 } });
    const result = await api.updateLoop("loop-1", 3, "open", null);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ expectedVersion: 3, status: "open", scheduledFor: null }));
    expect(result).toMatchObject({ id: "loop-1", status: "open", version: 4 });
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

describe("second-brain settings and learning notes", () => {
  it("updates the automatic capture setting with an idempotency key", async () => {
    const fetchMock = mockJson({ enabled: false });
    const result = await api.updateAutoCaptureSetting(false);
    expect(result).toEqual({ enabled: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/settings/auto-capture");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("Idempotency-Key")).toBe(true);
  });

  it("loads sourced learning notes", async () => {
    mockJson({ items: [{
      id: "note-1",
      title: "Useful paper",
      knowledgeKind: "paper",
      sourceTitle: "Codex learning turn",
      createdAt: "2026-07-19T12:00:00Z",
    }] });
    const result = await api.learningNotes();
    expect(result[0]).toMatchObject({ title: "Useful paper", knowledgeKind: "paper", sourceTitle: "Codex learning turn" });
  });
});
