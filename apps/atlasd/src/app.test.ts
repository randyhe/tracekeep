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
  });

  it("reports a zero-incremental-cost configuration", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/cost-status" });
    expect(response.json()).toMatchObject({ platformApiEnabled: false, monthlyExternalBudgetUsd: 0 });
  });

  it("keeps restricted text out of ordinary review, source, and search responses", async () => {
    const canary = "ATLAS_RESTRICTED_CANARY_7F6C91";
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
  });
});
