import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AtlasStorage } from "@atlas/storage";
import { buildApp } from "./app.js";

let storage: AtlasStorage;
let app: FastifyInstance;

beforeEach(async () => {
  storage = new AtlasStorage(":memory:", ".runtime-test/backups");
  app = buildApp({ storage });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  storage.close();
});

describe("atlasd", () => {
  it("reports the applied schema version", async () => {
    const ready = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(ready.json()).toMatchObject({ status: "ready", integrity: "ok", schemaVersion: 2 });
  });

  it("runs the capture-review-today-search lifecycle", async () => {
    const capture = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: { "idempotency-key": "capture-0001" },
      payload: { text: "Finish Atlas integration", title: "Finish Atlas integration" },
    });
    expect(capture.statusCode).toBe(200);
    const candidate = capture.json().candidate as { id: string; version: number };

    const accept = await app.inject({
      method: "POST",
      url: `/api/v1/reviews/${candidate.id}/actions`,
      headers: { "idempotency-key": "review-accept-0001" },
      payload: { action: "accept", expectedVersion: candidate.version, priority: 3 },
    });
    expect(accept.statusCode).toBe(200);

    const today = await app.inject({ method: "GET", url: "/api/v1/today" });
    expect(today.json().items).toHaveLength(1);

    const search = await app.inject({ method: "GET", url: "/api/v1/search?q=Atlas" });
    expect(search.json().results.length).toBeGreaterThan(0);
    expect(search.json().results[0]).toMatchObject({
      sourceTitle: "Finish Atlas integration",
      sourceType: "manual",
    });
  });

  it("protects private APIs with a local bearer or HttpOnly session", async () => {
    const protectedStorage = new AtlasStorage(":memory:", ".runtime-test/auth-backups");
    const protectedApp = buildApp({ storage: protectedStorage, authToken: "a".repeat(64) });
    await protectedApp.ready();
    try {
      const ready = await protectedApp.inject({ method: "GET", url: "/api/v1/health/ready" });
      expect(ready.statusCode).toBe(200);

      const denied = await protectedApp.inject({ method: "GET", url: "/api/v1/today" });
      expect(denied.statusCode).toBe(401);

      const bearer = await protectedApp.inject({
        method: "GET",
        url: "/api/v1/today",
        headers: { authorization: `Bearer ${"a".repeat(64)}` },
      });
      expect(bearer.statusCode).toBe(200);

      const session = await protectedApp.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        payload: { token: "a".repeat(64) },
      });
      expect(session.statusCode).toBe(204);
      expect(session.headers["set-cookie"]).toContain("HttpOnly");
      expect(session.headers["set-cookie"]).toContain("SameSite=Strict");
    } finally {
      await protectedApp.close();
      protectedStorage.close();
    }
  });

  it("preserves Codex source and candidate type for conversation capture", async () => {
    const capture = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: { "idempotency-key": "codex-decision-capture-0001" },
      payload: {
        text: "Decision: keep the dashboard as the review workspace.",
        title: "Keep the dashboard as the review workspace",
        sourceType: "codex",
        candidateType: "decision",
      },
    });

    expect(capture.statusCode).toBe(200);
    expect(capture.json()).toMatchObject({
      source: { type: "codex" },
      candidate: { candidateType: "decision", status: "pending" },
    });
  });

  it("returns human-readable imported source metadata in search", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/imports/daily-log",
      headers: { "idempotency-key": "search-source-metadata-0001" },
      payload: {
        date: "2026-07-16",
        path: "C:\\synthetic\\daily-log.md",
        content: "Decision: use English captions for the demo.",
        sensitivity: "personal",
      },
    });
    expect(imported.statusCode).toBe(200);

    const search = await app.inject({ method: "GET", url: "/api/v1/search?q=captions" });
    expect(search.json().results).toEqual([expect.objectContaining({
      sourceTitle: "Daily log 2026-07-16",
      sourceType: "daily_log",
      sourceLocator: "C:\\synthetic\\daily-log.md",
    })]);
  });

  it("replays a capture without duplicating it", async () => {
    const request = {
      method: "POST" as const,
      url: "/api/v1/captures",
      headers: { "idempotency-key": "capture-replay-0001" },
      payload: { text: "Only once" },
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(second.json()).toEqual(first.json());
    expect(storage.listReviews()).toHaveLength(1);
  });

  it("returns 409 for stale expected versions", async () => {
    const bundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Test", sensitivity: "personal" },
      text: "Concurrent item",
      candidateTitle: "Concurrent item",
    });
    const openLoop = storage.actOnReview(bundle.candidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    const first = await app.inject({
      method: "PATCH",
      url: `/api/v1/open-loops/${openLoop.id}`,
      headers: { "idempotency-key": "patch-version-0001" },
      payload: { expectedVersion: 1, status: "done" },
    });
    expect(first.statusCode).toBe(200);
    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/open-loops/${openLoop.id}`,
      headers: { "idempotency-key": "patch-version-0002" },
      payload: { expectedVersion: 1, status: "dismissed" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("VERSION_CONFLICT");
  });

  it("merges a review into a target and exposes active evidence metadata", async () => {
    const create = async (key: string, text: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/captures",
        headers: { "idempotency-key": key },
        payload: { text },
      });
      return response.json().candidate as { id: string; version: number };
    };
    const targetCandidate = await create("merge-target-capture", "Target item");
    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/reviews/${targetCandidate.id}/actions`,
      headers: { "idempotency-key": "merge-target-accept" },
      payload: { action: "accept", expectedVersion: targetCandidate.version },
    });
    const target = accepted.json().outcome as { id: string; version: number };
    const incoming = await create("merge-incoming-capture", "Supporting evidence");
    const merged = await app.inject({
      method: "POST",
      url: `/api/v1/reviews/${incoming.id}/actions`,
      headers: { "idempotency-key": "merge-action-0001" },
      payload: {
        action: "merge",
        expectedVersion: incoming.version,
        targetOpenLoopId: target.id,
        targetExpectedVersion: target.version,
      },
    });
    expect(merged.json().candidate).toMatchObject({
      status: "accepted",
      outcomeId: target.id,
      outcomeAction: "merged",
    });
    const evidence = await app.inject({ method: "GET", url: `/api/v1/open-loops/${target.id}/evidence` });
    expect(evidence.json().items).toHaveLength(2);
    expect(evidence.json().items[1]).toHaveProperty("source.title");
  });

  it("accepts the native ChatGPT export mapping shape as untrusted data", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/chatgpt-export",
      headers: { "idempotency-key": "chatgpt-export-0001" },
      payload: [
        {
          conversation_id: "conversation-1",
          title: "Imported chat",
          mapping: {
            node: { message: { author: { role: "user" }, content: { parts: ["Remember this idea"] } } },
          },
        },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0].candidate).toMatchObject({ title: "Imported chat", status: "pending" });
    expect(response.json()).toMatchObject({ sourceCount: 1, candidateCount: 1 });
    expect(response.json().items[0].candidates).toHaveLength(1);
  });

  it("extracts multiple user candidates but never assistant suggestions from imports", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/chatgpt-export",
      headers: { "idempotency-key": "chatgpt-export-multi-0001" },
      payload: [{
        id: "conversation-multi",
        title: "Planning conversation",
        messages: [
          { role: "assistant", content: "Need to send an unrequested email." },
          { role: "user", content: "决定采用本地SQLite。\n下一步：验证备份。\n等 Mark 回复确认。" },
        ],
      }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sourceCount: 1, candidateCount: 3 });
    expect(response.json().items[0].candidate).toEqual(response.json().items[0].candidates[0]);
    expect(response.json().items[0].candidates.map((candidate: { title: string }) => candidate.title).join(" ")).not.toContain("email");
  });

  it("redacts every restricted candidate in plural import responses", async () => {
    const canary = "ATLAS_IMPORT_CANARY_4AC82";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/daily-log",
      headers: { "idempotency-key": "restricted-import-0001" },
      payload: { date: "2026-07-15", content: `TODO: ${canary}`, sensitivity: "restricted" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain(canary);
    expect(response.json().items[0].candidates).toHaveLength(1);
  });

  it("redacts restricted source titles in singular and plural bundle fields", async () => {
    const canary = `restricted-title-${randomUUID()}`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/chatgpt-export",
      headers: { "idempotency-key": "restricted-title-0001" },
      payload: {
        sensitivity: "restricted",
        conversations: [{ id: "restricted-title", title: canary, messages: [{ role: "user", content: "TODO: local private action" }] }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain(canary);
    expect(response.json().items[0].source.title).toBe("[restricted source]");
  });

  it("reports a zero-incremental-cost configuration", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/cost-status" });
    expect(response.json()).toMatchObject({ platformApiEnabled: false, monthlyExternalBudgetUsd: 0 });
  });

  it("keeps restricted text out of ordinary review, source, and search responses", async () => {
    const canary = `restricted-body-${randomUUID()}`;
    const capture = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: { "idempotency-key": "restricted-canary-0001" },
      payload: { text: canary, sensitivity: "restricted" },
    });
    expect(JSON.stringify(capture.json())).not.toContain(canary);
    const reviews = await app.inject({ method: "GET", url: "/api/v1/reviews" });
    const sources = await app.inject({ method: "GET", url: "/api/v1/sources" });
    const search = await app.inject({ method: "GET", url: `/api/v1/search?q=${canary}` });
    expect(JSON.stringify(reviews.json())).not.toContain(canary);
    expect(JSON.stringify(sources.json())).not.toContain(canary);
    expect(JSON.stringify(search.json())).not.toContain(canary);
    expect(search.json().results).toHaveLength(0);

    const candidate = capture.json().candidate as { id: string; version: number };
    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/reviews/${candidate.id}/actions`,
      headers: { "idempotency-key": "restricted-accept-0001" },
      payload: { action: "accept", expectedVersion: candidate.version },
    });
    expect(JSON.stringify(accepted.json())).not.toContain(canary);
    const outcome = accepted.json().outcome as { id: string; version: number };
    const today = await app.inject({ method: "GET", url: "/api/v1/today" });
    const openLoops = await app.inject({ method: "GET", url: "/api/v1/open-loops" });
    expect(JSON.stringify(today.json())).not.toContain(canary);
    expect(JSON.stringify(openLoops.json())).not.toContain(canary);

    const patchedCanary = `restricted-patch-${randomUUID()}`;
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/open-loops/${outcome.id}`,
      headers: { "idempotency-key": "restricted-patch-0001" },
      payload: { expectedVersion: outcome.version, title: patchedCanary, status: "waiting" },
    });
    expect(JSON.stringify(patched.json())).not.toContain(patchedCanary);
    for (const query of [canary, patchedCanary]) {
      const result = await app.inject({ method: "GET", url: `/api/v1/search?q=${query}` });
      expect(result.json().results).toHaveLength(0);
      expect(JSON.stringify(result.json())).not.toContain(query);
    }
    const exported = await app.inject({ method: "GET", url: "/api/v1/exports/sanitized" });
    expect(JSON.stringify(exported.json())).not.toContain(canary);
    expect(JSON.stringify(exported.json())).not.toContain(patchedCanary);
  });
});
