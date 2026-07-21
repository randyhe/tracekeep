import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import {
  captureInputSchema,
  codexTurnInputSchema,
  dailyLogInputSchema,
  openLoopPatchSchema,
  reviewActionSchema,
  sensitivitySchema,
  type OpenLoop,
} from "@tracekeep/contracts";
import {
  TracekeepStorage,
  IdempotencyConflictError,
  StorageConflictError,
  StorageNotFoundError,
  fingerprint,
  type CaptureBundle,
} from "@tracekeep/storage";
import { COMPETITION_EXTRACTOR_VERSION, extractCandidates } from "./extractor.js";
import { buildCodexTurnCandidates } from "./second-brain.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const reviewQuerySchema = z.object({ status: z.enum(["pending", "accepted", "rejected"]).default("pending") });
const openLoopQuerySchema = z.object({ status: z.enum(["open", "waiting", "scheduled", "done", "dismissed"]).optional() });
const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(500), limit: z.coerce.number().int().min(1).max(100).default(20) });
const learningNotesQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const autoCaptureSettingSchema = z.object({ enabled: z.boolean() });

export interface BuildAppOptions {
  storage: TracekeepStorage;
  logger?: boolean;
  authToken?: string;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  // Request logging remains disabled in V1 because URLs can contain private search text.
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  const { storage } = options;
  const authToken = options.authToken?.trim();

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173") {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    }
  });
  app.options("/*", async (_request, reply) => reply.status(204).send());

  app.addHook("onRequest", async (request, reply) => {
    if (!authToken || request.method === "OPTIONS" || isPublicRoute(request.url)) return;
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : undefined;
    const session = readCookie(request.headers.cookie, "tracekeep_session");
    if (secureEqual(bearer, authToken) || secureEqual(session, authToken)) return;
    return sendError(reply, 401, "AUTH_REQUIRED", "Tracekeep authentication is required");
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Request validation failed", error.issues);
    }
    if (error instanceof StorageNotFoundError) return sendError(reply, 404, "NOT_FOUND", error.message);
    if (error instanceof StorageConflictError) {
      return sendError(reply, 409, "VERSION_CONFLICT", error.message, { currentVersion: error.currentVersion });
    }
    if (error instanceof IdempotencyConflictError) return sendError(reply, 409, "IDEMPOTENCY_CONFLICT", error.message);
    if ((error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return sendError(reply, 413, "PAYLOAD_TOO_LARGE", "Request payload is too large");
    }
    return sendError(reply, 500, "INTERNAL_ERROR", "The request could not be completed");
  });

  app.get("/api/v1/health/live", async () => ({ status: "ok", service: "tracekeepd" }));
  app.get("/api/v1/health/ready", async (_request, reply) => {
    const integrity = storage.integrityCheck();
    if (integrity !== "ok") return reply.status(503).send({ status: "not_ready", integrity });
    return { status: "ready", integrity, schemaVersion: storage.schemaVersion() };
  });
  app.get("/api/v1/cost-status", async () => ({
    mode: "subscription_only",
    platformApiEnabled: false,
    paidTranscriptionEnabled: false,
    externalHostingEnabled: false,
    monthlyExternalBudgetUsd: 0,
  }));
  app.get("/api/v1/settings/auto-capture", async () => ({ enabled: storage.isAutoCaptureEnabled() }));
  app.patch("/api/v1/settings/auto-capture", async (request) => {
    const body = autoCaptureSettingSchema.parse(request.body);
    return idempotent(request, storage, "setting.auto-capture", body, () => ({
      enabled: storage.setAutoCaptureEnabled(body.enabled),
    }));
  });
  app.post("/api/v1/auth/session", async (request, reply) => {
    if (!authToken) return reply.status(204).send();
    const body = z.object({ token: z.string().min(32).max(512) }).parse(request.body);
    if (!secureEqual(body.token, authToken)) return sendError(reply, 401, "AUTH_INVALID", "Tracekeep authentication failed");
    reply.header("Set-Cookie", `tracekeep_session=${encodeURIComponent(authToken)}; HttpOnly; SameSite=Strict; Path=/`);
    return reply.status(204).send();
  });
  app.get("/api/v1/jobs", async () => ({ jobs: storage.listJobs() }));

  app.get("/api/v1/today", async () => ({ items: storage.getToday(3).map(publicOpenLoop), generatedAt: new Date().toISOString() }));
  app.get("/api/v1/open-loops", async (request) => {
    const query = openLoopQuerySchema.parse(request.query);
    return { items: storage.listOpenLoops(query.status).map(publicOpenLoop) };
  });
  app.patch("/api/v1/open-loops/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = openLoopPatchSchema.parse(request.body);
    return idempotent(request, storage, "open-loop.patch", { id, body }, () => ({ item: publicOpenLoop(storage.updateOpenLoop(id, body)) }));
  });
  app.get("/api/v1/open-loops/:id/evidence", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { items: storage.getOpenLoopEvidence(id).map(publicOpenLoopEvidence) };
  });

  app.post("/api/v1/captures", async (request) => {
    const body = captureInputSchema.parse(request.body);
    return idempotent(request, storage, "capture.create", body, () => {
      const bundle = storage.createCaptureBundle({
        source: { type: body.sourceType, title: body.title ?? defaultSourceTitle(body.sourceType), sensitivity: body.sensitivity },
        text: body.text,
        ...(body.candidateType ? { candidateType: body.candidateType } : {}),
        candidateTitle: body.title ?? deriveTitle(body.text),
      });
      return publicBundle(bundle);
    });
  });

  app.get("/api/v1/reviews", async (request) => {
    const query = reviewQuerySchema.parse(request.query);
    return { items: storage.listReviews(query.status).map(publicCandidate) };
  });
  app.post("/api/v1/reviews/:id/actions", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = reviewActionSchema.parse(request.body);
    return idempotent(request, storage, "review.action", { id, body }, () => publicReviewResult(storage.actOnReview(id, body)));
  });

  app.get("/api/v1/search", async (request) => {
    const query = searchQuerySchema.parse(request.query);
    return { results: storage.search(query.q, query.limit) };
  });
  app.get("/api/v1/learning-notes", async (request) => {
    const query = learningNotesQuerySchema.parse(request.query);
    return { items: storage.listLearningNotes(query.limit) };
  });
  app.get("/api/v1/sources", async () => ({
    items: storage.listSources().map((source) => source.sensitivity === "restricted"
      ? { ...source, title: "[restricted source]" }
      : source),
  }));

  app.post("/api/v1/imports/manual", async (request) => {
    const body = captureInputSchema.parse({ ...(request.body as object), sourceType: "manual" });
    return idempotent(request, storage, "import.manual", body, () => {
      const bundle = publicBundle(
        storage.createCaptureWithCandidates({
          source: {
            type: "manual",
            title: body.title ?? "Manual import",
            externalId: `manual:${fingerprint(body.text)}`,
            sensitivity: body.sensitivity,
          },
          text: body.text,
          candidates: extractCandidates([{ role: "manual", content: body.text }], body.title ?? deriveTitle(body.text)),
          extractorVersion: COMPETITION_EXTRACTOR_VERSION,
        }),
      );
      return importResponse([bundle]);
    });
  });

  app.post("/api/v1/imports/daily-log", async (request) => {
    const body = dailyLogInputSchema.parse(request.body);
    return idempotent(request, storage, "import.daily-log", body, () => {
      const bundle = publicBundle(storage.createCaptureWithCandidates({
        source: {
          type: "daily_log",
          title: `Daily log ${body.date}`,
          externalId: body.path ?? body.date,
          completeness: "full",
          sensitivity: body.sensitivity,
        },
        text: body.content,
        candidates: extractCandidates([{ role: "manual", content: body.content }], `Review daily log ${body.date}`),
        extractorVersion: COMPETITION_EXTRACTOR_VERSION,
        ...(body.path ? { locator: body.path } : {}),
      }));
      return importResponse([bundle]);
    });
  });

  app.post("/api/v1/imports/chatgpt-export", async (request) => {
    const normalized = normalizeChatGptExport(request.body);
    return idempotent(request, storage, "import.chatgpt-export", normalized, () => {
      const items = normalized.conversations.map((conversation) => {
        const text = conversation.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
        return publicBundle(
          storage.createCaptureWithCandidates({
            source: {
              type: "chatgpt_export",
              title: conversation.title,
              externalId: conversation.id,
              completeness: "export_backfilled",
              sensitivity: normalized.sensitivity,
            },
            text,
            candidates: extractCandidates(conversation.messages, conversation.title),
            locator: `chatgpt-export:${conversation.id}`,
            extractorVersion: COMPETITION_EXTRACTOR_VERSION,
          }),
        );
      });
      return importResponse(items);
    });
  });

  app.post("/api/v1/imports/codex-turn", async (request) => {
    const body = codexTurnInputSchema.parse(request.body);
    if (!storage.isAutoCaptureEnabled()) {
      return { skipped: true, reason: "auto_capture_disabled", candidates: [], autoAcceptedCount: 0, pendingCount: 0 };
    }
    return idempotent(request, storage, "import.codex-turn", body, () => {
      const text = [
        `user:\n${body.userText}`,
        body.assistantText ? `assistant:\n${body.assistantText}` : undefined,
      ].filter(Boolean).join("\n\n");
      const extractedCandidates = buildCodexTurnCandidates(body);
      const candidateInputs = body.sensitivity === "work_summary_only"
        ? extractedCandidates.map(({ summary: _summary, canonicalUri: _canonicalUri, ...candidate }) => ({
          ...candidate,
          title: sanitizeWorkTitle(candidate.title),
        }))
        : extractedCandidates;
      const bundle = storage.createCaptureWithCandidates({
        source: {
          type: "codex",
          title: body.sensitivity === "work_summary_only"
            ? "Codex work learning turn"
            : `Codex learning turn: ${deriveTitle(body.userText)}`,
          externalId: `codex:${body.sessionId}:${body.turnId}`,
          completeness: "full",
          sensitivity: body.sensitivity,
        },
        text,
        candidates: candidateInputs,
        locator: `codex-session:${body.sessionId}#${body.turnId}`,
        extractorVersion: "second-brain-1",
      });

      let autoAcceptedCount = 0;
      if (body.sensitivity === "personal") {
        for (const candidate of bundle.candidates) {
          if (candidate.candidateType !== "reference") continue;
          storage.actOnReview(candidate.id, { action: "accept", expectedVersion: candidate.version });
          autoAcceptedCount += 1;
        }
      }
      const storedCandidates = bundle.candidates.map((candidate) => publicCandidate(storage.getReview(candidate.id)));
      return {
        ...publicBundle(bundle),
        candidate: storedCandidates[0],
        candidates: storedCandidates,
        autoAcceptedCount,
        pendingCount: storedCandidates.filter((candidate) => candidate.status === "pending").length,
      };
    });
  });

  app.get("/api/v1/exports/sanitized", async () => storage.sanitizedExport());
  app.get("/api/v1/backups", async () => ({ items: await storage.listBackups() }));
  app.post("/api/v1/backups", async (request) => {
    const key = requireIdempotencyKey(request);
    const hash = fingerprint({ operation: "backup.create" });
    const replay = storage.readIdempotent<{ backup: { fileName: string; createdAt: string } }>(key, "backup.create", hash);
    if (replay) return replay;
    const result = { backup: await storage.createBackup() };
    storage.saveIdempotent(key, "backup.create", hash, result);
    return result;
  });

  return app;
}

function idempotent<T>(
  request: FastifyRequest,
  storage: TracekeepStorage,
  operation: string,
  input: unknown,
  execute: () => T,
): T {
  const key = requireIdempotencyKey(request);
  return storage.executeIdempotent(key, operation, fingerprint(input), execute).value;
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key || key.length < 8 || key.length > 200) {
    throw new ZodError([
      { code: "custom", path: ["Idempotency-Key"], message: "A unique Idempotency-Key header (8-200 characters) is required" },
    ]);
  }
  return key;
}

function publicBundle(bundle: CaptureBundle): CaptureBundle {
  if (bundle.capture.sensitivity !== "restricted") return bundle;
  return {
    ...bundle,
    source: { ...bundle.source, title: "[restricted source]" },
    capture: { ...bundle.capture, text: "[restricted]" },
    evidence: {
      id: bundle.evidence.id,
      captureId: bundle.evidence.captureId,
      sourceId: bundle.evidence.sourceId,
      ...(bundle.evidence.locator ? { locator: bundle.evidence.locator } : {}),
      createdAt: bundle.evidence.createdAt,
    },
    candidate: publicCandidate(bundle.candidate),
    candidates: bundle.candidates.map(publicCandidate),
  };
}

function importResponse(items: CaptureBundle[]) {
  return {
    items,
    sourceCount: items.length,
    candidateCount: items.reduce((total, item) => total + item.candidates.length, 0),
  };
}

function publicCandidate<T extends { sensitivity: string; title: string; summary?: string }>(candidate: T): T {
  if (candidate.sensitivity !== "restricted") return candidate;
  const { summary: _summary, ...safe } = candidate;
  return { ...safe, title: "[restricted candidate]" } as T;
}

function publicOpenLoop(openLoop: OpenLoop): OpenLoop {
  if (openLoop.sensitivity !== "restricted") return openLoop;
  const { notes: _notes, ...safe } = openLoop;
  return { ...safe, title: "[restricted open loop]" };
}

function publicReviewResult(result: { candidate: ReturnType<TracekeepStorage["getReview"]>; outcome?: OpenLoop }) {
  return {
    candidate: publicCandidate(result.candidate),
    ...(result.outcome ? { outcome: publicOpenLoop(result.outcome) } : {}),
  };
}

function publicOpenLoopEvidence(item: ReturnType<TracekeepStorage["getOpenLoopEvidence"]>[number]) {
  if (item.source.sensitivity !== "restricted") return item;
  return {
    evidence: {
      id: item.evidence.id,
      captureId: item.evidence.captureId,
      sourceId: item.evidence.sourceId,
      createdAt: item.evidence.createdAt,
    },
    source: { ...item.source, title: "[restricted source]" },
  };
}

function deriveTitle(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || "Untitled capture";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function isPublicRoute(url: string): boolean {
  const path = url.split("?", 1)[0];
  return path === "/api/v1/health/live" || path === "/api/v1/health/ready" || path === "/api/v1/auth/session";
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return undefined; }
  }
  return undefined;
}

function secureEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function defaultSourceTitle(sourceType: z.infer<typeof captureInputSchema>["sourceType"]): string {
  if (sourceType === "codex") return "Codex conversation capture";
  if (sourceType === "daily_log") return "Daily log capture";
  if (sourceType === "chatgpt_export") return "ChatGPT export capture";
  return "Manual capture";
}

function sanitizeWorkTitle(value: string): string {
  return value
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/giu, "[identifier]")
    .replace(/\b(?:internal|private|confidential)[-_][A-Za-z0-9._-]{8,}\b/giu, "[internal item]")
    .replace(/\bhttps?:\/\/\S+/giu, "[link]")
    .replace(/\b[A-Za-z]:\\[^\r\n]+/gu, "[local document]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180) || "Work learning item";
}

interface NormalizedConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
}

function normalizeChatGptExport(input: unknown): { conversations: NormalizedConversation[]; sensitivity: z.infer<typeof sensitivitySchema> } {
  const container = input as { conversations?: unknown; sensitivity?: unknown } | undefined;
  const rawConversations = Array.isArray(input) ? input : container?.conversations;
  if (!Array.isArray(rawConversations) || rawConversations.length === 0 || rawConversations.length > 1_000) {
    throw new ZodError([{ code: "custom", path: ["conversations"], message: "Expected 1-1000 exported conversations" }]);
  }
  const sensitivity = sensitivitySchema.parse(container?.sensitivity ?? "personal");
  const conversations = rawConversations.map((raw, index) => normalizeConversation(raw, index));
  return { conversations, sensitivity };
}

function normalizeConversation(raw: unknown, index: number): NormalizedConversation {
  if (!raw || typeof raw !== "object") throw invalidConversation(index);
  const record = raw as Record<string, unknown>;
  const id = stringValue(record.id) ?? stringValue(record.conversation_id) ?? `export-${fingerprint(record).slice(0, 24)}`;
  const title = stringValue(record.title) ?? `ChatGPT conversation ${index + 1}`;
  const messages: Array<{ role: string; content: string }> = [];
  if (Array.isArray(record.messages)) {
    for (const rawMessage of record.messages) {
      if (!rawMessage || typeof rawMessage !== "object") continue;
      const message = rawMessage as Record<string, unknown>;
      const content = stringValue(message.content);
      if (content) messages.push({ role: stringValue(message.role) ?? "unknown", content });
    }
  } else if (record.mapping && typeof record.mapping === "object") {
    for (const node of Object.values(record.mapping as Record<string, unknown>)) {
      const message = (node as { message?: unknown } | undefined)?.message;
      if (!message || typeof message !== "object") continue;
      const messageRecord = message as Record<string, unknown>;
      const author = messageRecord.author as Record<string, unknown> | undefined;
      const contentObject = messageRecord.content as Record<string, unknown> | undefined;
      const parts = contentObject?.parts;
      const content = Array.isArray(parts) ? parts.filter((part): part is string => typeof part === "string").join("\n") : undefined;
      if (content) messages.push({ role: stringValue(author?.role) ?? "unknown", content });
    }
  }
  if (messages.length === 0) throw invalidConversation(index);
  return { id, title: title.slice(0, 500), messages };
}

function invalidConversation(index: number): ZodError {
  return new ZodError([{ code: "custom", path: ["conversations", index], message: "Conversation has no readable messages" }]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sendError(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  return reply.status(status).send({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}
