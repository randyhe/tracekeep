import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  CandidateType,
  BackupInfo,
  Capture,
  Evidence,
  KnowledgeKind,
  OpenLoop,
  OpenLoopEvidence,
  OpenLoopPatch,
  ReviewAction,
  ReviewCandidate,
  RestoreResult,
  SanitizedExport,
  SearchResult,
  Sensitivity,
  Source,
  SourceCompleteness,
  SourceType,
} from "@tracekeep/contracts";
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

export interface CandidateRecordInput {
  candidateType: CandidateType;
  title: string;
  summary?: string;
  knowledgeKind?: KnowledgeKind;
  canonicalUri?: string;
}

export interface MultiCaptureRecordInput {
  source: CaptureRecordInput["source"];
  text: string;
  candidates: CandidateRecordInput[];
  locator?: string;
  extractorVersion?: string;
}

export interface CaptureBundle {
  source: Source;
  capture: Capture;
  evidence: Evidence;
  candidate: ReviewCandidate;
  candidates: ReviewCandidate[];
}

export interface LearningNote {
  id: string;
  title: string;
  summary?: string;
  knowledgeKind: KnowledgeKind;
  canonicalUri?: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceType?: SourceType;
  sourceLocator?: string;
  createdAt: string;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class TracekeepStorage {
  db: Database.Database;

  constructor(
    readonly databasePath: string,
    private readonly backupDirectory: string,
  ) {
    this.db = this.openDatabase();
    this.migrate();
  }

  private openDatabase(): Database.Database {
    const db = new Database(this.databasePath);
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    if (this.databasePath !== ":memory:") db.pragma("journal_mode = WAL");
    return db;
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
    return this.createCaptureWithCandidates({
      source: input.source,
      text: input.text,
      candidates: [{
        candidateType: input.candidateType ?? "open_loop",
        title: input.candidateTitle,
        ...(input.summary ? { summary: input.summary } : {}),
      }],
      ...(input.locator ? { locator: input.locator } : {}),
    });
  }

  createCaptureWithCandidates(input: MultiCaptureRecordInput): CaptureBundle {
    if (input.candidates.length === 0) throw new StorageConflictError("At least one review candidate is required");
    return this.db.transaction(() => this.createCaptureWithCandidatesTransaction(input))();
  }

  private createCaptureWithCandidatesTransaction(input: MultiCaptureRecordInput): CaptureBundle {
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
    if (source.sensitivity !== input.source.sensitivity) {
      throw new StorageConflictError("Source sensitivity cannot change during replay");
    }
    const contentHash = fingerprint(input.text);
    const existingCapture = this.db
      .prepare("SELECT * FROM captures WHERE source_id = ? AND content_hash = ?")
      .get(source.id, contentHash) as Row | undefined;
    if (existingCapture) {
      const existingEvidence = this.db
        .prepare("SELECT * FROM evidence WHERE capture_id = ? ORDER BY created_at LIMIT 1")
        .get(existingCapture.id) as Row;
      const existingCandidates = (this.db
        .prepare("SELECT * FROM review_candidates WHERE capture_id = ? ORDER BY rowid")
        .all(existingCapture.id) as Row[]).map(mapCandidate);
      if (existingCandidates.length === 0) throw new StorageConflictError("Existing capture has no review candidates");
      return {
        source,
        capture: mapCapture(existingCapture),
        evidence: mapEvidence(existingEvidence),
        candidate: existingCandidates[0]!,
        candidates: existingCandidates,
      };
    }
    const captureId = randomUUID();
    const persistedText = input.source.sensitivity === "work_summary_only"
      ? input.candidates.map((candidate) => candidate.title).join("\n")
      : input.text;
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
    const candidates: ReviewCandidate[] = [];
    for (const candidateInput of input.candidates) {
      const candidateId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO review_candidates(
             id, capture_id, candidate_type, title, summary, status, sensitivity,
             knowledge_kind, canonical_uri, created_at, updated_at, version
           )
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          candidateId,
          captureId,
          candidateInput.candidateType,
          candidateInput.title,
          input.source.sensitivity === "work_summary_only" ? null : (candidateInput.summary ?? null),
          input.source.sensitivity,
          candidateInput.knowledgeKind ?? null,
          candidateInput.canonicalUri ?? null,
          timestamp,
          timestamp,
        );
      if (input.source.sensitivity !== "restricted") {
        const searchableBody = input.source.sensitivity === "work_summary_only"
          ? candidateInput.title
          : (candidateInput.summary ?? input.text);
        this.indexDocument("review_candidate", candidateId, source.id, candidateInput.title, searchableBody);
      }
      candidates.push(mapCandidate(this.db.prepare("SELECT * FROM review_candidates WHERE id = ?").get(candidateId) as Row));
    }
    this.recordEvent("capture", captureId, "capture.extracted", {
      sourceId: source.id,
      sensitivity: input.source.sensitivity,
      candidateCount: candidates.length,
      ...(input.extractorVersion ? { extractorVersion: input.extractorVersion } : {}),
    });
    return {
      source,
      capture: mapCapture(this.db.prepare("SELECT * FROM captures WHERE id = ?").get(captureId) as Row),
      evidence: mapEvidence(this.db.prepare("SELECT * FROM evidence WHERE id = ?").get(evidenceId) as Row),
      candidate: candidates[0]!,
      candidates,
    };
  }

  listSources(): Source[] {
    return (this.db.prepare("SELECT * FROM sources ORDER BY updated_at DESC").all() as Row[]).map(mapSource);
  }

  listReviews(status = "pending"): ReviewCandidate[] {
    const candidates = (this.db.prepare("SELECT * FROM review_candidates WHERE status = ? ORDER BY updated_at DESC").all(status) as Row[]).map(mapCandidate);
    if (status !== "pending") return candidates;
    const activeLoops = this.listOpenLoops().filter((item) => item.status !== "done" && item.status !== "dismissed");
    const loopsByTitle = new Map(activeLoops.map((item) => [normalizeComparableTitle(item.title), item.id]));
    return candidates.map((candidate) => {
      if (candidate.candidateType !== "open_loop" || candidate.sensitivity === "restricted") return candidate;
      const duplicateOf = loopsByTitle.get(normalizeComparableTitle(candidate.title));
      return duplicateOf ? { ...candidate, duplicateOf } : candidate;
    });
  }

  getReview(id: string): ReviewCandidate {
    const row = this.db.prepare("SELECT * FROM review_candidates WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new StorageNotFoundError("Review candidate not found");
    return mapCandidate(row);
  }

  actOnReview(id: string, action: ReviewAction): { candidate: ReviewCandidate; outcome?: OpenLoop } {
    return this.db.transaction(() => this.actOnReviewTransaction(id, action))();
  }

  private actOnReviewTransaction(id: string, action: ReviewAction): { candidate: ReviewCandidate; outcome?: OpenLoop } {
    const current = this.getReview(id);
    if (current.version !== action.expectedVersion) throw new StorageConflictError("Review candidate changed", current.version);
    const timestamp = now();

    if (action.action === "edit") {
      if (current.status !== "pending") throw new StorageConflictError("Only pending candidates can be edited", current.version);
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
        if (!current.outcomeVersion) throw new StorageConflictError("Outcome version is missing; manual review is required");
        const outcomeTable = current.candidateType === "open_loop" ? "open_loops" : current.candidateType === "decision" ? "decisions" : "reference_items";
        const outcomeRow = this.db.prepare(`SELECT version, deleted_at FROM ${outcomeTable} WHERE id = ?`).get(current.outcomeId) as
          | { version: number; deleted_at: string | null }
          | undefined;
        if (!outcomeRow || outcomeRow.deleted_at) throw new StorageConflictError("Review outcome is no longer active");
        if (outcomeRow.version !== current.outcomeVersion) {
          throw new StorageConflictError("Review outcome changed after acceptance", outcomeRow.version);
        }
        if (current.outcomeAction === "merged") {
          const evidence = this.db.prepare("SELECT id FROM evidence WHERE capture_id = ? ORDER BY created_at LIMIT 1").get(current.captureId) as { id: string };
          this.db
            .prepare("UPDATE open_loop_evidence SET deleted_at = ? WHERE open_loop_id = ? AND evidence_id = ? AND deleted_at IS NULL")
            .run(timestamp, current.outcomeId, evidence.id);
          this.db
            .prepare("UPDATE open_loops SET updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL")
            .run(timestamp, current.outcomeId, current.outcomeVersion);
          this.recordEvent("open_loop", current.outcomeId, "review.merge_undone", { reviewCandidateId: id, evidenceId: evidence.id });
        } else {
          const table = current.candidateType === "open_loop" ? "open_loops" : current.candidateType === "decision" ? "decisions" : "reference_items";
          this.db
            .prepare(`UPDATE ${table} SET deleted_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL`)
            .run(timestamp, current.outcomeId, current.outcomeVersion);
          this.db.prepare("DELETE FROM search_documents WHERE entity_type = ? AND entity_id = ?").run(current.candidateType, current.outcomeId);
          this.recordEvent(current.candidateType, current.outcomeId, `${current.candidateType}.soft_deleted`, { reviewCandidateId: id });
        }
      }
      this.db
        .prepare(
          `UPDATE review_candidates SET status = 'pending', outcome_id = NULL, outcome_action = NULL, outcome_version = NULL,
           updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
        )
        .run(timestamp, id, action.expectedVersion);
      this.recordEvent("review_candidate", id, "review.undone", {});
      return { candidate: this.getReview(id) };
    }

    if (current.status !== "pending") throw new StorageConflictError("Only pending candidates can be accepted", current.version);
    const capture = this.db.prepare("SELECT * FROM captures WHERE id = ?").get(current.captureId) as Row;
    const sourceId = String(capture.source_id);
    const evidence = this.db.prepare("SELECT id FROM evidence WHERE capture_id = ? ORDER BY created_at LIMIT 1").get(current.captureId) as { id: string };

    if (action.action === "merge") {
      if (!action.targetOpenLoopId || !action.targetExpectedVersion) {
        throw new StorageConflictError("Merge target and target version are required");
      }
      const target = this.getOpenLoop(action.targetOpenLoopId);
      if (target.version !== action.targetExpectedVersion) {
        throw new StorageConflictError("Merge target changed", target.version);
      }
      this.db
        .prepare(
          `INSERT INTO open_loop_evidence(open_loop_id, evidence_id, created_at, deleted_at)
           VALUES (?, ?, ?, NULL)
           ON CONFLICT(open_loop_id, evidence_id) DO UPDATE SET deleted_at = NULL, created_at = excluded.created_at`,
        )
        .run(target.id, evidence.id, timestamp);
      const targetUpdate = this.db
        .prepare(
          `UPDATE open_loops SET updated_at = ?, version = version + 1
           WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .run(timestamp, target.id, action.targetExpectedVersion);
      if (targetUpdate.changes !== 1) throw new StorageConflictError("Merge target changed");
      this.db
        .prepare(
          `UPDATE review_candidates SET status = 'accepted', outcome_id = ?, outcome_action = 'merged', outcome_version = ?,
           candidate_type = 'open_loop', updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
        )
        .run(target.id, action.targetExpectedVersion + 1, timestamp, id, action.expectedVersion);
      this.recordEvent("open_loop", target.id, "review.merged", { reviewCandidateId: id, evidenceId: evidence.id });
      return { candidate: this.getReview(id), outcome: this.getOpenLoop(target.id) };
    }

    let outcome: OpenLoop | undefined;
    let outcomeId = randomUUID();
    const candidateType = action.candidateType ?? current.candidateType;
    const title = action.title ?? current.title;
    const summary = action.summary === null ? undefined : (action.summary ?? current.summary);
    if (candidateType === "open_loop") {
      this.db
        .prepare(
          `INSERT INTO open_loops(id, title, notes, status, priority, due_at, scheduled_for, source_id, sensitivity, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
          current.sensitivity,
          timestamp,
          timestamp,
        );
      outcome = this.getOpenLoop(outcomeId);
      this.db
        .prepare("INSERT INTO open_loop_evidence(open_loop_id, evidence_id, created_at) VALUES (?, ?, ?)")
        .run(outcomeId, evidence.id, timestamp);
      if (current.sensitivity !== "restricted") {
        const searchableBody = current.sensitivity === "work_summary_only" ? (summary ?? title) : (summary ?? "");
        this.indexDocument("open_loop", outcomeId, sourceId, title, searchableBody);
      }
    } else {
      if (candidateType === "decision") {
        this.db
          .prepare("INSERT INTO decisions(id, title, summary, source_id, sensitivity, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(outcomeId, title, summary ?? null, sourceId, current.sensitivity, timestamp);
      } else {
        this.db
          .prepare(
            `INSERT INTO reference_items(
               id, title, summary, source_id, sensitivity, knowledge_kind, canonical_uri, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            outcomeId,
            title,
            summary ?? null,
            sourceId,
            current.sensitivity,
            current.knowledgeKind ?? "note",
            current.canonicalUri ?? null,
            timestamp,
          );
      }
      if (current.sensitivity !== "restricted") {
        const searchableBody = current.sensitivity === "work_summary_only" ? (summary ?? title) : (summary ?? "");
        this.indexDocument(candidateType, outcomeId, sourceId, title, searchableBody);
      }
    }
    this.db
      .prepare(
        `UPDATE review_candidates SET status = 'accepted', outcome_id = ?, outcome_action = 'created', outcome_version = 1,
         candidate_type = ?, title = ?, summary = ?,
         updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
      )
      .run(outcomeId, candidateType, title, summary ?? null, timestamp, id, action.expectedVersion);
    this.recordEvent(candidateType, outcomeId, `${candidateType}.accepted`, { reviewCandidateId: id, sourceId });
    return outcome ? { candidate: this.getReview(id), outcome } : { candidate: this.getReview(id) };
  }

  getOpenLoop(id: string): OpenLoop {
    const row = this.db.prepare("SELECT * FROM open_loops WHERE id = ? AND deleted_at IS NULL").get(id) as Row | undefined;
    if (!row) throw new StorageNotFoundError("Open loop not found");
    return mapOpenLoop(row);
  }

  listOpenLoops(status?: string): OpenLoop[] {
    const rows = status
      ? (this.db.prepare("SELECT * FROM open_loops WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC").all(status) as Row[])
      : (this.db.prepare("SELECT * FROM open_loops WHERE deleted_at IS NULL ORDER BY updated_at DESC").all() as Row[]);
    return rows.map(mapOpenLoop);
  }

  getOpenLoopEvidence(id: string): OpenLoopEvidence[] {
    this.getOpenLoop(id);
    const rows = this.db
      .prepare(
        `SELECT
           e.id AS evidence_id, e.capture_id, e.source_id, e.quote, e.locator, e.created_at AS evidence_created_at,
           s.type, s.title, s.external_id, s.completeness, s.sensitivity,
           s.created_at AS source_created_at, s.updated_at AS source_updated_at, s.version AS source_version
         FROM open_loop_evidence ole
         JOIN evidence e ON e.id = ole.evidence_id
         JOIN sources s ON s.id = e.source_id
         WHERE ole.open_loop_id = ? AND ole.deleted_at IS NULL
         ORDER BY ole.created_at ASC, e.id ASC`,
      )
      .all(id) as Row[];
    return rows.map((row) => ({
      evidence: mapEvidence({
        id: row.evidence_id,
        capture_id: row.capture_id,
        source_id: row.source_id,
        quote: row.quote,
        locator: row.locator,
        created_at: row.evidence_created_at,
      }),
      source: mapSource({
        id: row.source_id,
        type: row.type,
        title: row.title,
        external_id: row.external_id,
        completeness: row.completeness,
        sensitivity: row.sensitivity,
        created_at: row.source_created_at,
        updated_at: row.source_updated_at,
        version: row.source_version,
      }),
    }));
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
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
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
    this.db.prepare("DELETE FROM search_documents WHERE entity_type = 'open_loop' AND entity_id = ?").run(id);
    if (current.sensitivity !== "restricted") {
      const searchableBody = current.sensitivity === "work_summary_only" ? (updated.notes ?? updated.title) : (updated.notes ?? "");
      this.indexDocument("open_loop", id, current.sourceId ?? null, updated.title, searchableBody);
    }
    this.recordEvent("open_loop", id, "open_loop.updated", { fields: Object.keys(patch).filter((key) => key !== "expectedVersion") });
    return this.getOpenLoop(id);
  }

  getToday(limit = 3): OpenLoop[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM open_loops
           WHERE deleted_at IS NULL
             AND status IN ('open', 'scheduled')
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
        `SELECT search_documents.entity_type, search_documents.entity_id,
                search_documents.source_id, search_documents.title,
                sources.title AS source_title, sources.type AS source_type,
                (SELECT evidence.locator
                   FROM evidence
                  WHERE evidence.source_id = search_documents.source_id
                    AND evidence.locator IS NOT NULL
                  ORDER BY evidence.created_at DESC
                  LIMIT 1) AS source_locator,
                snippet(search_documents, 4, '', '', '...', 18) AS snippet
           FROM search_documents
           LEFT JOIN sources ON sources.id = search_documents.source_id
          WHERE search_documents MATCH ?
            AND (sources.sensitivity IS NULL OR sources.sensitivity <> 'restricted')
          LIMIT ?`,
      )
      .all(ftsQuery, Math.min(Math.max(limit, 1), 100)) as Row[];
    return rows.map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      title: String(row.title),
      snippet: String(row.snippet),
      ...(row.source_id ? { sourceId: String(row.source_id) } : {}),
      ...(optionalString(row.source_title) ? { sourceTitle: String(row.source_title) } : {}),
      ...(optionalString(row.source_type) ? { sourceType: String(row.source_type) as SourceType } : {}),
      ...(optionalString(row.source_locator) ? { sourceLocator: String(row.source_locator) } : {}),
    }));
  }

  listJobs(): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT id, type, status, progress, error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt FROM jobs ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
  }

  listLearningNotes(limit = 100): LearningNote[] {
    const rows = this.db.prepare(
      `SELECT
         reference_items.id, reference_items.title, reference_items.summary,
         reference_items.knowledge_kind, reference_items.canonical_uri,
         reference_items.source_id, reference_items.created_at,
         sources.title AS source_title, sources.type AS source_type,
         (SELECT evidence.locator
            FROM evidence
           WHERE evidence.source_id = reference_items.source_id
             AND evidence.locator IS NOT NULL
           ORDER BY evidence.created_at DESC
           LIMIT 1) AS source_locator
       FROM reference_items
       LEFT JOIN sources ON sources.id = reference_items.source_id
       WHERE reference_items.deleted_at IS NULL
         AND reference_items.sensitivity <> 'restricted'
       ORDER BY reference_items.created_at DESC
       LIMIT ?`,
    ).all(Math.min(Math.max(limit, 1), 500)) as Row[];
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      ...(optionalString(row.summary) ? { summary: String(row.summary) } : {}),
      knowledgeKind: (optionalString(row.knowledge_kind) ?? "note") as KnowledgeKind,
      ...(optionalString(row.canonical_uri) ? { canonicalUri: String(row.canonical_uri) } : {}),
      ...(optionalString(row.source_id) ? { sourceId: String(row.source_id) } : {}),
      ...(optionalString(row.source_title) ? { sourceTitle: String(row.source_title) } : {}),
      ...(optionalString(row.source_type) ? { sourceType: String(row.source_type) as SourceType } : {}),
      ...(optionalString(row.source_locator) ? { sourceLocator: String(row.source_locator) } : {}),
      createdAt: String(row.created_at),
    }));
  }

  isAutoCaptureEnabled(): boolean {
    const row = this.db.prepare("SELECT value FROM tracekeep_settings WHERE key = 'auto_capture_enabled'").get() as { value: string } | undefined;
    return row?.value !== "false";
  }

  setAutoCaptureEnabled(enabled: boolean): boolean {
    this.db.prepare(
      `INSERT INTO tracekeep_settings(key, value, updated_at)
       VALUES ('auto_capture_enabled', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(enabled ? "true" : "false", now());
    this.recordEvent("setting", "auto_capture_enabled", "setting.updated", { enabled });
    return enabled;
  }

  sanitizedExport(): SanitizedExport {
    const personalSourceClause = `source_id IN (SELECT id FROM sources WHERE sensitivity = 'personal')`;
    const openLoops = (this.db.prepare(`SELECT * FROM open_loops WHERE deleted_at IS NULL AND ${personalSourceClause} ORDER BY created_at`).all() as Row[]).map(mapOpenLoop);
    const decisions = (this.db.prepare(`SELECT id, title, summary, created_at FROM decisions WHERE deleted_at IS NULL AND ${personalSourceClause} ORDER BY created_at`).all() as Row[]).map(mapKnowledge);
    const references = (this.db.prepare(
      `SELECT id, title, summary, knowledge_kind, canonical_uri, created_at
         FROM reference_items
        WHERE deleted_at IS NULL AND ${personalSourceClause}
        ORDER BY created_at`,
    ).all() as Row[]).map(mapKnowledge);
    return { schemaVersion: 1, generatedAt: now(), openLoops, decisions, references };
  }

  async createBackup(prefix = "tracekeep"): Promise<{ fileName: string; createdAt: string }> {
    await mkdir(this.backupDirectory, { recursive: true });
    const createdAt = now();
    const fileName = `${prefix}-${createdAt.replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.sqlite`;
    const target = join(this.backupDirectory, fileName);
    await this.db.backup(target);
    return { fileName, createdAt };
  }

  async listBackups(): Promise<BackupInfo[]> {
    await mkdir(this.backupDirectory, { recursive: true });
    const names = (await readdir(this.backupDirectory)).filter((name) => isSafeBackupFileName(name));
    const backups = await Promise.all(
      names.map(async (fileName) => {
        const details = await stat(join(this.backupDirectory, fileName));
        return { fileName, createdAt: details.mtime.toISOString(), sizeBytes: details.size };
      }),
    );
    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restoreFromBackup(fileName: string): Promise<RestoreResult> {
    if (this.databasePath === ":memory:") throw new StorageConflictError("In-memory databases cannot be restored");
    if (!isSafeBackupFileName(fileName)) throw new StorageConflictError("Invalid backup file name");
    const source = join(this.backupDirectory, fileName);
    const sourceStats = await stat(source).catch(() => undefined);
    if (!sourceStats?.isFile()) throw new StorageNotFoundError("Backup file not found");
    assertValidDatabase(source);

    const preRestore = await this.createBackup("pre-restore");
    const staged = `${this.databasePath}.restore-${randomUUID()}.tmp`;
    const rollback = `${this.databasePath}.rollback-${randomUUID()}`;
    await copyFile(source, staged);
    assertValidDatabase(staged);

    this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.db.close();
    let liveMoved = false;
    try {
      await rm(`${this.databasePath}-wal`, { force: true });
      await rm(`${this.databasePath}-shm`, { force: true });
      await rename(this.databasePath, rollback);
      liveMoved = true;
      await rename(staged, this.databasePath);
      this.db = this.openDatabase();
      this.migrate();
      if (this.integrityCheck() !== "ok") throw new Error("Restored database failed integrity check");
      await rm(rollback, { force: true });
      return {
        restoredFrom: fileName,
        preRestoreBackup: preRestore.fileName,
        restoredAt: now(),
        integrity: "ok",
      };
    } catch (error) {
      if (this.db.open) this.db.close();
      if (liveMoved) {
        await rm(this.databasePath, { force: true });
        await rename(rollback, this.databasePath);
      }
      await rm(staged, { force: true });
      this.db = this.openDatabase();
      this.migrate();
      throw error;
    }
  }

  integrityCheck(): string {
    const result = this.db.pragma("quick_check", { simple: true });
    return String(result);
  }

  schemaVersion(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
    return row.version;
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

function isSafeBackupFileName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.sqlite$/.test(fileName);
}

function assertValidDatabase(path: string): void {
  const candidate = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = String(candidate.pragma("quick_check", { simple: true }));
    if (integrity !== "ok") throw new StorageConflictError("Backup failed SQLite integrity validation");
    const schema = candidate
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sources', 'captures', 'review_candidates')")
      .all() as Array<{ name: string }>;
    if (schema.length !== 3) throw new StorageConflictError("Backup is not an Tracekeep database");
  } finally {
    candidate.close();
  }
}

function safeQuote(text: string): string {
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function normalizeComparableTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
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
    ...(optionalString(row.outcome_action) ? { outcomeAction: String(row.outcome_action) as "created" | "merged" } : {}),
    ...(row.outcome_version === null || row.outcome_version === undefined ? {} : { outcomeVersion: Number(row.outcome_version) }),
    ...(optionalString(row.knowledge_kind) ? { knowledgeKind: String(row.knowledge_kind) as KnowledgeKind } : {}),
    ...(optionalString(row.canonical_uri) ? { canonicalUri: String(row.canonical_uri) } : {}),
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
    sensitivity: String(row.sensitivity) as Sensitivity,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}

function mapKnowledge(row: Row): {
  id: string;
  title: string;
  summary?: string;
  knowledgeKind?: KnowledgeKind;
  canonicalUri?: string;
  createdAt: string;
} {
  return {
    id: String(row.id),
    title: String(row.title),
    ...(optionalString(row.summary) ? { summary: String(row.summary) } : {}),
    ...(optionalString(row.knowledge_kind) ? { knowledgeKind: String(row.knowledge_kind) as KnowledgeKind } : {}),
    ...(optionalString(row.canonical_uri) ? { canonicalUri: String(row.canonical_uri) } : {}),
    createdAt: String(row.created_at),
  };
}
