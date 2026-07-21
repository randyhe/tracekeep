import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveTracekeepBaseUrl } from "./base-url.js";

const baseUrl = resolveTracekeepBaseUrl();
const authToken = (process.env.TRACEKEEP_AUTH_TOKEN ?? process.env.ATLAS_AUTH_TOKEN)?.trim();

type HttpMethod = "GET" | "POST" | "PATCH";

async function tracekeep(path: string, method: HttpMethod = "GET", body?: unknown) {
  const headers = new Headers();
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(10_000),
    headers,
  };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("idempotency-key", randomUUID());
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, init);

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Preserve non-JSON error bodies without executing or interpreting them.
  }

  if (!response.ok) {
    throw new Error(`Tracekeep returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: "tracekeep-memory-local", version: "0.3.0" });
const localReadOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const localMutation = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

server.tool("capture", "Save user-confirmed text from the current Codex conversation as a review-first Tracekeep candidate.", {
  text: z.string().min(1).max(20_000),
  title: z.string().min(1).max(300).optional(),
  candidateType: z.enum(["open_loop", "decision", "reference"]).default("open_loop"),
  sensitivity: z.enum(["personal", "work_summary_only", "restricted"]).default("personal"),
}, localMutation, async (input) => result(await tracekeep("/api/v1/captures", "POST", {
  ...input,
  sourceType: "codex",
})));

server.tool("get_today", "Get at most three current Tracekeep focus items.", {}, localReadOnly, async () =>
  result(await tracekeep("/api/v1/today")));

server.tool("get_open_loops", "List open loops, optionally filtered by status.", {
  status: z.enum(["open", "waiting", "scheduled", "done", "dismissed"]).optional(),
}, localReadOnly, async ({ status }) => result(await tracekeep(`/api/v1/open-loops${status ? `?status=${status}` : ""}`)));

server.tool("complete_open_loop", "Mark an open loop done using optimistic concurrency.", {
  id: z.string().min(1),
  expectedVersion: z.number().int().positive(),
}, localMutation, async ({ id, expectedVersion }) => result(await tracekeep(`/api/v1/open-loops/${encodeURIComponent(id)}`, "PATCH", {
  status: "done", expectedVersion,
})));

server.tool("snooze_open_loop", "Schedule an open loop for a later ISO date/time.", {
  id: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  scheduledFor: z.string().datetime(),
}, localMutation, async ({ id, expectedVersion, scheduledFor }) => result(await tracekeep(`/api/v1/open-loops/${encodeURIComponent(id)}`, "PATCH", {
  status: "scheduled", scheduledFor, expectedVersion,
})));

server.tool("search", "Search local Tracekeep records with SQLite FTS5.", {
  query: z.string().min(1).max(500),
}, localReadOnly, async ({ query }) => result(await tracekeep(`/api/v1/search?q=${encodeURIComponent(query)}`)));

server.tool("ask_with_sources", "Retrieve evidence for a question; synthesis is host-optional and never a paid background call.", {
  question: z.string().min(1).max(500),
}, localReadOnly, async ({ question }) => result(await tracekeep(`/api/v1/search?q=${encodeURIComponent(question)}&answer=true`)));

server.tool("review_candidates", "List or decide Tracekeep review candidates.", {
  action: z.enum(["list", "accept", "reject", "undo"]).default("list"),
  id: z.string().optional(),
  expectedVersion: z.number().int().positive().optional(),
}, localMutation, async ({ action, id, expectedVersion }) => {
  if (action === "list") return result(await tracekeep("/api/v1/reviews"));
  if (!id || !expectedVersion) throw new Error("id and expectedVersion are required for review mutations");
  return result(await tracekeep(`/api/v1/reviews/${encodeURIComponent(id)}/actions`, "POST", { action, expectedVersion }));
});

server.tool("sync_sources", "Report source sync capability; use the Web or import endpoints when an adapter is unavailable.", {
  sourceId: z.string().min(1),
}, localReadOnly, async ({ sourceId }) => result({
  sourceId,
  status: "unavailable",
  reason: "No incremental source adapter is enabled in this Alpha build.",
  fallback: "Use Manual Capture, Daily Log import, or ChatGPT Export import.",
}));

server.tool("get_source_coverage", "Report source capability and coverage without claiming unavailable history.", {}, localReadOnly, async () =>
  result(await tracekeep("/api/v1/sources")));

server.tool("get_cost_status", "Show Tracekeep external-cost protections.", {}, localReadOnly, async () =>
  result(await tracekeep("/api/v1/cost-status")));

const transport = new StdioServerTransport();
await server.connect(transport);
