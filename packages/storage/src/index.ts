import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  CandidateType,
  Capture,
  Evidence,
  OpenLoop,
  OpenLoopPatch,
  ReviewAction,
  ReviewCandidate,
  SanitizedExport,
  SearchResult,
  Sensitivity,
  Source,
  SourceCompleteness,
  SourceType,
} from "@atlas/contracts";
import { migrations } from "./migrations.js";

type Row = Record<string, unknown>;

export class StorageNotFoundError extends Error {}
export class StorageConflictError extends Error {
  constructor(message: string, public readonly currentVersion?: number) {
    super(message);
  }
}
export class IdempotencyConflictError extends Error {}

export interface CaptureRecordInput {
  source: {
    type: SourceType;
    title: string;
    externalId?: string;
    completeness?: SourceCompleteness;
    sensitivity: Sensitivity;
  };
  text: string;
  candidateTitle: string;
  candidateType?: CandidateType;
  summary?: string;
  locator?: string;
}

export interface CaptureBundle {
  source: Source;
  capture: Capture;
  evidence: Evidence;
  candidate: ReviewCandidate;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class AtlasStorage {
  readonly db: Database.Database;

  constructor(
    readonly databasePath: string,
    private readonly backupDirectory: string,
  ) {
    this.db = new Database(databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    if (databasePath !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const applied = new Set(
      (this.db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, now());
      })();
    }
  }

  executeIdempotent<T>(
    key: string,
    operation: string,
    requestHash: string,
    execute: () => T,
  ): { value: T; replayed: boolean } {
    const run = this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT operation, request_hash, response_json FROM idempotency_records WHERE idempotency_key = ?")
        .get(key) as { operation: string; request_hash: string; response_json: string } | undefined;
      if (existing) {
        if (existing.operation !== operation || existing.request_hash !== requestHash) {
          throw new IdempotencyConflictError("Idempotency key was already used for a different request");
        }
        return { value: JSON.parse(existing.response_json) as T, replayed: true };
      }
      const value = execute();
      this.db
        .prepare(
          "INSERT INTO idempotency_records(idempotency_key, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(key, operation, requestHash, JSON.stringify(value), now());
      return { value, replayed: false };
    });
    return run();
  }

  readIdempotent<T>(key: string, operation: string, requestHash: string): T | undefined {
    const existing = this.db
      .prepare("SELECT operation, request_hash, response_json FROM idempotency_records WHERE idempotency_key = ?")
      .get(key) as { operation: string; request_hash: string; response_json: string } | undefined;
    if (!existing) return undefined;
    if (existing.operation !== operation || existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError("Idempotency key was already used for a different request");
    }
    return JSON.parse(existing.response_json) as T;
  }

  saveIdempotent<T>(key: string, operation: string, requestHash: string, value: T): void {
    try {
      this.db
        .prepare(
          "INSERT INTO idempotency_records(idempotency_key, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(key, operation, requestHash, JSON.stringify(value), now());
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) {
        const existing = this.readIdempotent<T>(key, operation, requestHash);
        if (existing !== undefined) return;
      }
      throw error;
    }
  }

  createCaptureBundle(input: CaptureRecordInput): CaptureBundle {
    const timestamp = now();
    let sourceRow: Row | undefined;
    if (input.source.externalId) {
      sourceRow = this.db
        .prepare("SELECT * FROM sources WHERE type = ? AND external_id = ?")
        .get(input.source.type, input.source.externalId) as Row | undefined;
    }
    if (!sourceRow) {
      const sourceId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO sources(id, type, title, external_id, completeness, sensitivity, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          sourceId,
          input.source.type,
          input.source.title,
          input.source.externalId ?? null,
          input.source.completeness ?? "full",
          input.source.sensitivity,
          timestamp,
          timestamp,
        );
      sourceRow = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as Row;
    }

    const source = mapSource(sourceRow);
    const contentHash = fingerprint(input.text);
    const existingCapture = this.db
      .prepare("SELECT * FROM captures WHERE source_id = ? AND content_hash = ?")
      .get(source.id, contentHash) as Row | undefined;
    if (existingCapture) {
      const existingEvidence = this.db
        .prepare("SELECT * FROM evidence WHERE capture_id = ? ORDER BY created_at LIMIT 1")
        .get(existingCapture.id) as Row;
      const existingCandidate = this.db
        .prepare("SELECT * FROM review_candidates WHERE capture_id = ? ORDER BY created_at LIMIT 1")
        .get(existingCapture.id) as Row;
      return {
        source,
        capture: mapCapture(existingCapture),
        evidence: mapEvidence(existingEvidence),
        candidate: mapCandidate(existingCandidate),
      };
    }
    const captureId = randomUUID();
    const persistedText = input.source.sensitivity === "work_summary_only" ? input.candidateTitle : input.text;
    this.db
      .prepare("INSERT INTO captures(id, source_id, text, content_hash, sensitivity, created_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)")
      .run(captureId, source.id, persistedText, contentHash, input.source.sensitivity, timestamp);
    const evidenceId = randomUUID();
    this.db
      .prepare("INSERT INTO evidence(id, capture_id, source_id, quote, locator, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        evidenceId,
        captureId,
        source.id,
        input.source.sensitivity === "personal" ? safeQuote(input.text) : null,
        input.locator ?? null,
        timestamp,
      );
    const candidateId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO review_candidates(id, capture_id, candidate_type, title, summary, status, sensitivity, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1)`,
      )
      .run(
        candidateId,
        captureId,
        input.candidateType ?? "open_loop",
        input.candidateTitle,
        input.summary ?? null,
        input.source.sensitivity,
        timestamp,
        timestamp,
      );

    if (input.source.sensitivity !== "restricted") {
      const searchableBody = input.source.sensitivity === "work_summary_only"
        ? (input.summary ?? input.candidateTitle)
        : (input.summary ?? input.text);
      this.indexDocument("review_candidate", candidateId, source.id, input.candidateTitle, searchableBody);
    }
    this.recordEvent("capture", captureId, "capture.created", { sourceId: source.id, sensitivity: input.source.sensitivity });
    return {
      source,
      capture: mapCapture(this.db.prepare("SELECT * FROM captures WHERE id = ?").get(captureId) as Row),
      evidence: mapEvidence(this.db.prepare("SELECT * FROM evidence WHERE id = ?").get(evidenceId) as Row),
      candidate: mapCandidate(this.db.prepare("SELECT * FROM review_candidates WHERE id = ?").get(candidateId) as Row),
    };
  }

  listSources(): Source[] {
    return (this.db.prepare("SELECT * FROM sources ORDER BY updated_at DESC").all() as Row[]).map(mapSource);
  }

  listReviews(status = "pending"): ReviewCandidate[] {
    return (this.db.prepare("SELECT * FROM review_candidates WHERE status = ? ORDER BY updated_at DESC").all(status) as Row[]).map(
      mapCandidate,
    );
  }

  getReview(id: string): ReviewCandidate {
    const row = this.db.prepare("SELECT * FROM review_candidates WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new StorageNotFoundError("Review candidate not found");
    return mapCandidate(row);
  }

  actOnReview(id: string, action: ReviewAction): { candidate: ReviewCandidate; outcome?: OpenLoop } {
    const current = this.getReview(id);
    if (current.version !== action.expectedVersion) throw new StorageConflictError("Review candidate changed", current.version);
    const timestamp = now();

    if (action.action === "edit") {
      this.db
        .prepare(
          `UPDATE review_candidates SET candidate_type = ?, title = ?, summary = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .run(
          action.candidateType ?? current.candidateType,
          action.title ?? current.title,
          action.summary === null ? null : (action.summary ?? current.summary ?? null),
          timestamp,
          id,
          action.expectedVersion,
        );
      const updated = this.getReview(id);
      const capture = this.db.prepare("SELECT source_id FROM captures WHERE id = ?").get(updated.captureId) as { source_id: string };
      this.indexDocument("review_candidate", id, capture.source_id, updated.title, updated.summary ?? "");
      this.recordEvent("review_candidate", id, "review.edited", {});
      return { candidate: updated };
    }

    if (action.action === "reject") {
      if (current.status !== "pending") throw new StorageConflictError("Only pending candidates can be rejected", current.version);
      this.db
        .prepare("UPDATE review_candidates SET status = 'rejected', updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
        .run(timestamp, id, action.expectedVersion);
      this.recordEvent("review_candidate", id, "review.rejected", {});
      return { candidate: this.getReview(id) };
    }

    if (action.action === "undo") {
      if (current.status === "pending") throw new StorageConflictError("Pending candidate has nothing to undo", current.version);
      if (current.outcomeId && current.status === "accepted") {
        const table = current.candidateType === "open_loop" ? "open_loops" : current.candidateType === "decision" ? "decisions" : "reference_items";
        this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(current.outcomeId);
        this.db.prepare("DELETE FROM search_documents WHERE entity_type = ? AND entity_id = ?").run(current.candidateType, current.outcomeId);
      }
      this.db
        .prepare(
          "UPDATE review_candidates SET status = 'pending', outcome_id = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?",
        )
        .run(timestamp, id, action.expectedVersion);
      this.recordEvent("review_candidate", id, "review.undone", {});
      return { candidate: this.getReview(id) };
    }

    if (current.status !== "pending") throw new StorageConflictError("Only pending candidates can be accepted", current.version);
    const capture = this.db.prepare("SELECT * FROM captures WHERE id = ?").get(current.captureId) as Row;
    const sourceId = String(capture.source_id);
    let outcome: OpenLoop | undefined;
    let outcomeId = randomUUID();
    const candidateType = action.candidateType ?? current.candidateType;
    const title = action.title ?? current.title;
    const summary = action.summary === null ? undefined : (action.summary ?? current.summary);
    if (candidateType === "open_loop") {
      this.db
        .prepare(
          `INSERT INTO open_loops(id, title, notes, status, priority, due_at, scheduled_for, source_id, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          outcomeId,
          title,
          summary ?? null,
          action.status ?? "open",
          action.priority ?? 1,
          action.dueAt ?? null,
          action.scheduledFor ?? null,
          sourceId,
          timestamp,
          timestamp,
        );
      outcome = this.getOpenLoop(outcomeId);
      this.indexDocument("open_loop", outcomeId, sourceId, title, summary ?? "");
    } else {
      const table = candidateType === "decision" ? "decisions" : "reference_items";
      this.db
        .prepare(`INSERT INTO ${table}(id, title, summary, source_id, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(outcomeId, title, summary ?? null, sourceId, timestamp);
      this.indexDocument(candidateType, outcomeId, sourceId, title, summary ?? "");
    }
    this.db
      .prepare(
        `UPDATE review_candidates SET status = 'accepted', outcome_id = ?, candidate_type = ?, title = ?, summary = ?,
         updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
      )
      .run(outcomeId, candidateType, title, summary ?? null, timestamp, id, action.expectedVersion);
    this.recordEvent(candidateType, outcomeId, `${candidateType}.accepted`, { reviewCandidateId: id, sourceId });
    return outcome ? { candidate: this.getReview(id), outcome } : { candidate: this.getReview(id) };
  }

  getOpenLoop(id: string): OpenLoop {
    const row = this.db.prepare("SELECT * FROM open_loops WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new StorageNotFoundError("Open loop not found");
    return mapOpenLoop(row);
  }

  listOpenLoops(status?: string): OpenLoop[] {
    const rows = status
      ? (this.db.prepare("SELECT * FROM open_loops WHERE status = ? ORDER BY updated_at DESC").all(status) as Row[])
      : (this.db.prepare("SELECT * FROM open_loops ORDER BY updated_at DESC").all() as Row[]);
    return rows.map(mapOpenLoop);
  }

  updateOpenLoop(id: string, patch: OpenLoopPatch): OpenLoop {
    const current = this.getOpenLoop(id);
    if (current.version !== patch.expectedVersion) throw new StorageConflictError("Open loop changed", current.version);
    const updated = {
      title: patch.title ?? current.title,
      notes: patch.notes === null ? undefined : (patch.notes ?? current.notes),
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      dueAt: patch.dueAt === null ? undefined : (patch.dueAt ?? current.dueAt),
      scheduledFor: patch.scheduledFor === null ? undefined : (patch.scheduledFor ?? current.scheduledFor),
    };
    const result = this.db
      .prepare(
        `UPDATE open_loops SET title = ?, notes = ?, status = ?, priority = ?, due_at = ?, scheduled_for = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(
        updated.title,
        updated.notes ?? null,
        updated.status,
        updated.priority,
        updated.dueAt ?? null,
        updated.scheduledFor ?? null,
        now(),
        id,
        patch.expectedVersion,
      );
    if (result.changes !== 1) throw new StorageConflictError("Open loop changed");
    this.indexDocument("open_loop", id, current.sourceId ?? null, updated.title, updated.notes ?? "");
    this.recordEvent("open_loop", id, "open_loop.updated", { fields: Object.keys(patch).filter((key) => key !== "expectedVersion") });
    return this.getOpenLoop(id);
  }

  getToday(limit = 3): OpenLoop[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM open_loops
           WHERE status IN ('open', 'waiting', 'scheduled')
             AND (status != 'scheduled' OR scheduled_for IS NULL OR scheduled_for <= ?)
           ORDER BY
             CASE WHEN due_at IS NOT NULL AND due_at <= ? THEN 0 ELSE 1 END,
             priority DESC,
             COALESCE(due_at, scheduled_for, '9999-12-31T23:59:59.999Z') ASC,
             updated_at ASC
           LIMIT ?`,
        )
        .all(now(), now(), Math.min(limit, 3)) as Row[]
    ).map(mapOpenLoop);
  }

  search(query: string, limit = 20): SearchResult[] {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const rows = this.db
      .prepare(
        `SELECT entity_type, entity_id, source_id, title,
                snippet(search_documents, 4, '', '', '...', 18) AS snippet
         FROM search_documents WHERE search_documents MATCH ? LIMIT ?`,
      )
      .all(ftsQuery, Math.min(Math.max(limit, 1), 100)) as Row[];
    return rows.map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      title: String(row.title),
      snippet: String(row.snippet),
      ...(row.source_id ? { sourceId: String(row.source_id) } : {}),
    }));
  }

  listJobs(): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT id, type, status, progress, error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt FROM jobs ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
  }

  sanitizedExport(): SanitizedExport {
    const personalSourceClause = `source_id IN (SELECT id FROM sources WHERE sensitivity = 'personal')`;
    const openLoops = (this.db.prepare(`SELECT * FROM open_loops WHERE ${personalSourceClause} ORDER BY created_at`).all() as Row[]).map(mapOpenLoop);
    const decisions = (this.db.prepare(`SELECT id, title, summary, created_at FROM decisions WHERE ${personalSourceClause} ORDER BY created_at`).all() as Row[]).map(mapKnowledge);
    const references = (this.db.prepare(`SELECT id, title, summary, created_at FROM reference_items WHERE ${personalSourceClause} ORDER BY created_at`).all() as Row[]).map(mapKnowledge);
    return { schemaVersion: 1, generatedAt: now(), openLoops, decisions, references };
  }

  async createBackup(): Promise<{ fileName: string; createdAt: string }> {
    await mkdir(this.backupDirectory, { recursive: true });
    const createdAt = now();
    const fileName = `atlas-${createdAt.replaceAll(":", "-")}.sqlite`;
    const target = join(this.backupDirectory, fileName);
    await this.db.backup(target);
    return { fileName, createdAt };
  }

  integrityCheck(): string {
    const result = this.db.pragma("quick_check", { simple: true });
    return String(result);
  }

  private indexDocument(entityType: string, entityId: string, sourceId: string | null, title: string, body: string): void {
    this.db.prepare("DELETE FROM search_documents WHERE entity_type = ? AND entity_id = ?").run(entityType, entityId);
    this.db
      .prepare("INSERT INTO search_documents(entity_type, entity_id, source_id, title, body) VALUES (?, ?, ?, ?, ?)")
      .run(entityType, entityId, sourceId, title, body);
  }

  private recordEvent(aggregateType: string, aggregateId: string, eventType: string, payload: Record<string, unknown>): void {
    const occurredAt = now();
    const auditId = randomUUID();
    const outboxId = randomUUID();
    const serialized = JSON.stringify(payload);
    this.db
      .prepare(
        `INSERT INTO audit_events(event_id, aggregate_type, aggregate_id, event_type, payload_json, actor, occurred_at, schema_version)
         VALUES (?, ?, ?, ?, ?, 'local-user', ?, 1)`,
      )
      .run(auditId, aggregateType, aggregateId, eventType, serialized, occurredAt);
    this.db
      .prepare("INSERT INTO outbox_events(event_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?)")
      .run(outboxId, eventType, serialized, occurredAt);
  }
}

function now(): string {
  return new Date().toISOString();
}

function safeQuote(text: string): string {
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function toFtsQuery(input: string): string | undefined {
  const tokens = input.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function mapSource(row: Row): Source {
  return {
    id: String(row.id),
    type: String(row.type) as SourceType,
    title: String(row.title),
    ...(optionalString(row.external_id) ? { externalId: String(row.external_id) } : {}),
    completeness: String(row.completeness) as SourceCompleteness,
    sensitivity: String(row.sensitivity) as Sensitivity,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}

function mapCapture(row: Row): Capture {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    text: String(row.text),
    sensitivity: String(row.sensitivity) as Sensitivity,
    createdAt: String(row.created_at),
    version: Number(row.version),
  };
}

function mapEvidence(row: Row): Evidence {
  return {
    id: String(row.id),
    captureId: String(row.capture_id),
    sourceId: String(row.source_id),
    ...(optionalString(row.quote) ? { quote: String(row.quote) } : {}),
    ...(optionalString(row.locator) ? { locator: String(row.locator) } : {}),
    createdAt: String(row.created_at),
  };
}

function mapCandidate(row: Row): ReviewCandidate {
  return {
    id: String(row.id),
    captureId: String(row.capture_id),
    candidateType: String(row.candidate_type) as CandidateType,
    title: String(row.title),
    ...(optionalString(row.summary) ? { summary: String(row.summary) } : {}),
    status: String(row.status) as ReviewCandidate["status"],
    sensitivity: String(row.sensitivity) as Sensitivity,
    ...(optionalString(row.outcome_id) ? { outcomeId: String(row.outcome_id) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}

function mapOpenLoop(row: Row): OpenLoop {
  return {
    id: String(row.id),
    title: String(row.title),
    ...(optionalString(row.notes) ? { notes: String(row.notes) } : {}),
    status: String(row.status) as OpenLoop["status"],
    priority: Number(row.priority),
    ...(optionalString(row.due_at) ? { dueAt: String(row.due_at) } : {}),
    ...(optionalString(row.scheduled_for) ? { scheduledFor: String(row.scheduled_for) } : {}),
    ...(optionalString(row.source_id) ? { sourceId: String(row.source_id) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}

function mapKnowledge(row: Row): { id: string; title: string; summary?: string; createdAt: string } {
  return {
    id: String(row.id),
    title: String(row.title),
    ...(optionalString(row.summary) ? { summary: String(row.summary) } : {}),
    createdAt: String(row.created_at),
  };
}
