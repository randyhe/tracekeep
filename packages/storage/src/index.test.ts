import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { TracekeepStorage, StorageConflictError, fingerprint } from "./index.js";
import { migrations } from "./migrations.js";

function createStorage(): TracekeepStorage {
  return new TracekeepStorage(":memory:", ".runtime-test/backups");
}

describe("TracekeepStorage", () => {
  it("creates a pending candidate and accepts it into an open loop", () => {
    const storage = createStorage();
    const bundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Manual capture", sensitivity: "personal" },
      text: "Finish the Tracekeep backend",
      candidateTitle: "Finish the Tracekeep backend",
    });
    const accepted = storage.actOnReview(bundle.candidate.id, {
      action: "accept",
      expectedVersion: 1,
      priority: 3,
    });
    expect(accepted.outcome).toMatchObject({ title: "Finish the Tracekeep backend", priority: 3, status: "open" });
    expect(storage.getToday()).toHaveLength(1);
    storage.close();
  });

  it("keeps waiting and future scheduled items out of Today focus", () => {
    const storage = createStorage();
    const waitingBundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Waiting capture", sensitivity: "personal" },
      text: "Wait for the review",
      candidateTitle: "Wait for the review",
    });
    const waiting = storage.actOnReview(waitingBundle.candidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    storage.updateOpenLoop(waiting.id, { expectedVersion: waiting.version, status: "waiting" });

    const scheduledBundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Scheduled capture", sensitivity: "personal" },
      text: "Check next week",
      candidateTitle: "Check next week",
    });
    const scheduled = storage.actOnReview(scheduledBundle.candidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    storage.updateOpenLoop(scheduled.id, { expectedVersion: scheduled.version, status: "scheduled", scheduledFor: "2999-01-01T00:00:00.000Z" });

    expect(storage.getToday()).toEqual([]);
    expect(storage.listOpenLoops("waiting")).toHaveLength(1);
    expect(storage.listOpenLoops("scheduled")).toHaveLength(1);
    storage.close();
  });

  it("creates and replays multiple candidates for one capture atomically", () => {
    const storage = createStorage();
    const input = {
      source: { type: "chatgpt_export" as const, title: "Conversation", externalId: "conversation-atomic", sensitivity: "personal" as const },
      text: "Need to verify backup. We decided to use SQLite.",
      candidates: [
        { candidateType: "open_loop" as const, title: "Verify backup" },
        { candidateType: "decision" as const, title: "Use SQLite" },
      ],
      extractorVersion: "competition-1",
    };
    const first = storage.createCaptureWithCandidates(input);
    const replay = storage.createCaptureWithCandidates(input);
    expect(first.candidates).toHaveLength(2);
    expect(replay.candidates.map((candidate) => candidate.id)).toEqual(first.candidates.map((candidate) => candidate.id));
    expect(new Set(first.candidates.map((candidate) => candidate.captureId))).toEqual(new Set([first.capture.id]));
    expect(storage.listReviews()).toHaveLength(2);
    storage.close();
  });

  it("persists learning-note metadata through review acceptance and export", () => {
    const storage = createStorage();
    const bundle = storage.createCaptureWithCandidates({
      source: {
        type: "codex",
        title: "Codex paper discussion",
        externalId: "codex:session:turn",
        sensitivity: "personal",
      },
      text: "Discussed a retrieval paper.",
      candidates: [{
        candidateType: "reference",
        title: "Retrieval paper",
        summary: "Compared sparse, dense, and hybrid retrieval.",
        knowledgeKind: "paper",
        canonicalUri: "C:\\learning\\retrieval.pdf",
      }],
    });
    expect(bundle.candidate).toMatchObject({
      knowledgeKind: "paper",
      canonicalUri: "C:\\learning\\retrieval.pdf",
    });

    storage.actOnReview(bundle.candidate.id, { action: "accept", expectedVersion: 1 });
    expect(storage.sanitizedExport().references).toEqual([
      expect.objectContaining({
        title: "Retrieval paper",
        knowledgeKind: "paper",
        canonicalUri: "C:\\learning\\retrieval.pdf",
      }),
    ]);
    storage.close();
  });

  it("lists accepted learning notes with source metadata and controls automatic capture", () => {
    const storage = createStorage();
    expect(storage.isAutoCaptureEnabled()).toBe(true);
    expect(storage.setAutoCaptureEnabled(false)).toBe(false);
    expect(storage.isAutoCaptureEnabled()).toBe(false);
    expect(storage.setAutoCaptureEnabled(true)).toBe(true);

    const bundle = storage.createCaptureWithCandidates({
      source: { type: "codex", title: "Paper discussion", sensitivity: "personal" },
      text: "A sourced paper discussion",
      locator: "codex-session:test#turn",
      candidates: [{
        candidateType: "reference",
        title: "Spaced repetition paper",
        summary: "Retrieval practice improves long-term retention.",
        knowledgeKind: "paper",
        canonicalUri: "https://example.test/paper.pdf",
      }],
    });
    storage.actOnReview(bundle.candidate.id, { action: "accept", expectedVersion: 1 });
    expect(storage.listLearningNotes()).toEqual([expect.objectContaining({
      title: "Spaced repetition paper",
      knowledgeKind: "paper",
      canonicalUri: "https://example.test/paper.pdf",
      sourceTitle: "Paper discussion",
      sourceType: "codex",
      sourceLocator: "codex-session:test#turn",
    })]);
    storage.close();
  });

  it("returns safe source metadata with search results", () => {
    const storage = createStorage();
    storage.createCaptureWithCandidates({
      source: { type: "chatgpt_export", title: "Synthetic planning conversation", externalId: "search-source", sensitivity: "personal" },
      text: "Decision: use SQLite for Tracekeep.",
      candidates: [{ candidateType: "decision", title: "Use SQLite for Tracekeep" }],
      locator: "chatgpt-export:search-source",
    });

    expect(storage.search("SQLite")).toEqual([expect.objectContaining({
      sourceTitle: "Synthetic planning conversation",
      sourceType: "chatgpt_export",
      sourceLocator: "chatgpt-export:search-source",
    })]);
    storage.close();
  });

  it("rejects replay that attempts to change an external source sensitivity", () => {
    const storage = createStorage();
    const base = {
      source: { type: "chatgpt_export" as const, title: "Conversation", externalId: "sensitivity-source", sensitivity: "personal" as const },
      text: "TODO: Keep this local",
      candidates: [{ candidateType: "open_loop" as const, title: "Keep this local" }],
    };
    storage.createCaptureWithCandidates(base);
    expect(() => storage.createCaptureWithCandidates({
      ...base,
      source: { ...base.source, sensitivity: "restricted" },
    })).toThrow("Source sensitivity cannot change during replay");
    expect(storage.listSources()).toHaveLength(1);
    expect(storage.listSources()[0]?.sensitivity).toBe("personal");
    storage.close();
  });

  it("rolls back source, capture, evidence, and candidates when one candidate insert fails", () => {
    const storage = createStorage();
    expect(() => storage.createCaptureWithCandidates({
      source: { type: "manual", title: "Rollback", sensitivity: "personal" },
      text: "Atomic rollback",
      candidates: [
        { candidateType: "open_loop", title: "Valid candidate" },
        { candidateType: "decision", title: null as unknown as string },
      ],
    })).toThrow();
    for (const table of ["sources", "captures", "evidence", "review_candidates", "audit_events"]) {
      const row = storage.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      expect(row.count, table).toBe(0);
    }
    storage.close();
  });

  it("persists only minimal candidate titles for work-summary-only imports", () => {
    const storage = createStorage();
    const secret = "raw work content must not persist";
    const bundle = storage.createCaptureWithCandidates({
      source: { type: "daily_log", title: "Work log", sensitivity: "work_summary_only" },
      text: secret,
      candidates: [{ candidateType: "open_loop", title: "Review sanitized summary", summary: secret }],
    });
    expect(bundle.capture.text).toBe("Review sanitized summary");
    expect(bundle.evidence.quote).toBeUndefined();
    expect(bundle.candidate.summary).toBeUndefined();
    expect(JSON.stringify(storage.sanitizedExport())).not.toContain(secret);
    storage.close();
  });

  it("adds a dynamic duplicate hint only for active non-restricted open loops", () => {
    const storage = createStorage();
    const targetCandidate = storage.createCaptureBundle({
      source: { type: "manual", title: "Target", sensitivity: "personal" },
      text: "Follow up with Mark",
      candidateTitle: "Follow up with Mark",
    }).candidate;
    const target = storage.actOnReview(targetCandidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    const duplicate = storage.createCaptureBundle({
      source: { type: "manual", title: "Duplicate", sensitivity: "personal" },
      text: "Follow-up, with Mark!",
      candidateTitle: "Follow-up, with Mark!",
    }).candidate;
    expect(storage.listReviews().find((item) => item.id === duplicate.id)?.duplicateOf).toBe(target.id);

    storage.updateOpenLoop(target.id, { expectedVersion: target.version, status: "done" });
    expect(storage.listReviews().find((item) => item.id === duplicate.id)?.duplicateOf).toBeUndefined();
    storage.close();
  });

  it("prevents silent concurrent updates", () => {
    const storage = createStorage();
    const bundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Manual capture", sensitivity: "personal" },
      text: "Ship it",
      candidateTitle: "Ship it",
    });
    const outcome = storage.actOnReview(bundle.candidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    storage.updateOpenLoop(outcome.id, { expectedVersion: 1, status: "done" });
    expect(() => storage.updateOpenLoop(outcome.id, { expectedVersion: 1, status: "dismissed" })).toThrow(StorageConflictError);
    storage.close();
  });

  it("replays identical idempotent operations", () => {
    const storage = createStorage();
    let calls = 0;
    const request = { text: "one" };
    const first = storage.executeIdempotent("key", "capture", fingerprint(request), () => ({ value: ++calls }));
    const second = storage.executeIdempotent("key", "capture", fingerprint(request), () => ({ value: ++calls }));
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ value: { value: 1 }, replayed: true });
    expect(calls).toBe(1);
    storage.close();
  });

  it("creates a complete online SQLite backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tracekeep-storage-"));
    const databasePath = join(directory, "tracekeep.sqlite");
    const backupDirectory = join(directory, "backups");
    const storage = new TracekeepStorage(databasePath, backupDirectory);
    storage.createCaptureBundle({
      source: { type: "manual", title: "Backup test", sensitivity: "personal" },
      text: "Persist this",
      candidateTitle: "Persist this",
    });
    const backup = await storage.createBackup();
    expect(existsSync(join(backupDirectory, backup.fileName))).toBe(true);
    const restored = new TracekeepStorage(join(backupDirectory, backup.fileName), join(directory, "restored-backups"));
    expect(restored.integrityCheck()).toBe("ok");
    expect(restored.listReviews()).toHaveLength(1);
    restored.close();
    storage.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("merges evidence into a versioned target and undo only removes the merge", () => {
    const storage = createStorage();
    const targetCandidate = storage.createCaptureBundle({
      source: { type: "manual", title: "Target", sensitivity: "personal" },
      text: "Existing target",
      candidateTitle: "Existing target",
    }).candidate;
    const target = storage.actOnReview(targetCandidate.id, { action: "accept", expectedVersion: 1 }).outcome!;
    const incomingBundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Incoming", sensitivity: "personal" },
      text: "Additional evidence",
      candidateTitle: "Additional evidence",
    });
    const incoming = incomingBundle.candidate;
    const merged = storage.actOnReview(incoming.id, {
      action: "merge",
      expectedVersion: 1,
      targetOpenLoopId: target.id,
      targetExpectedVersion: target.version,
    });
    expect(merged.candidate).toMatchObject({ status: "accepted", outcomeAction: "merged", outcomeVersion: 2 });
    expect(merged.outcome?.version).toBe(2);
    expect(storage.getOpenLoopEvidence(target.id)).toHaveLength(2);
    const undone = storage.actOnReview(incoming.id, { action: "undo", expectedVersion: 2 });
    expect(undone.candidate).toMatchObject({ status: "pending", version: 3 });
    expect(storage.getOpenLoop(target.id).version).toBe(3);
    expect(storage.listOpenLoops()).toHaveLength(1);
    const link = storage.db
      .prepare("SELECT deleted_at FROM open_loop_evidence WHERE open_loop_id = ? AND evidence_id = ?")
      .get(target.id, incomingBundle.evidence.id) as { deleted_at: string | null };
    expect(link.deleted_at).not.toBeNull();
    expect(storage.getOpenLoopEvidence(target.id)).toHaveLength(1);
    storage.close();
  });

  it("refuses accepted edits and undo after the created outcome changed", () => {
    const storage = createStorage();
    const candidate = storage.createCaptureBundle({
      source: { type: "manual", title: "Outcome", sensitivity: "personal" },
      text: "Editable outcome",
      candidateTitle: "Editable outcome",
    }).candidate;
    const accepted = storage.actOnReview(candidate.id, { action: "accept", expectedVersion: 1 });
    expect(() => storage.actOnReview(candidate.id, { action: "edit", expectedVersion: 2, title: "Diverged" })).toThrow(
      "Only pending candidates can be edited",
    );
    storage.updateOpenLoop(accepted.outcome!.id, { expectedVersion: 1, title: "User changed title" });
    expect(() => storage.actOnReview(candidate.id, { action: "undo", expectedVersion: 2 })).toThrow(
      "Review outcome changed after acceptance",
    );
    expect(storage.getReview(candidate.id).status).toBe("accepted");
    expect(storage.getOpenLoop(accepted.outcome!.id).title).toBe("User changed title");
    storage.close();
  });

  it("soft-deletes an unchanged created outcome on undo", () => {
    const storage = createStorage();
    const candidate = storage.createCaptureBundle({
      source: { type: "manual", title: "Undo", sensitivity: "personal" },
      text: "Undo this",
      candidateTitle: "Undo this",
    }).candidate;
    const accepted = storage.actOnReview(candidate.id, { action: "accept", expectedVersion: 1 });
    storage.actOnReview(candidate.id, { action: "undo", expectedVersion: 2 });
    expect(storage.listOpenLoops()).toHaveLength(0);
    const row = storage.db.prepare("SELECT deleted_at FROM open_loops WHERE id = ?").get(accepted.outcome!.id) as {
      deleted_at: string | null;
    };
    expect(row.deleted_at).not.toBeNull();
    storage.close();
  });

  it("migrates a v1 database and supports decision/reference accept and undo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tracekeep-v1-"));
    const databasePath = join(directory, "tracekeep.sqlite");
    const raw = new Database(databasePath);
    raw.exec(migrations[0].sql);
    raw.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
    raw.close();

    const storage = new TracekeepStorage(databasePath, join(directory, "backups"));
    for (const candidateType of ["decision", "reference"] as const) {
      const candidate = storage.createCaptureBundle({
        source: { type: "manual", title: candidateType, sensitivity: "personal" },
        text: `${candidateType} body`,
        candidateTitle: `${candidateType} title`,
        candidateType,
      }).candidate;
      storage.actOnReview(candidate.id, { action: "accept", expectedVersion: 1 });
      storage.actOnReview(candidate.id, { action: "undo", expectedVersion: 2 });
      expect(storage.getReview(candidate.id).status).toBe("pending");
    }
    const decisions = storage.db.prepare("SELECT deleted_at, version FROM decisions").all() as Array<RowShape>;
    const references = storage.db.prepare("SELECT deleted_at, version FROM reference_items").all() as Array<RowShape>;
    expect([...decisions, ...references].every((row) => row.deleted_at !== null && row.version === 2)).toBe(true);
    storage.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("restores from a validated backup after creating a pre-restore backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tracekeep-restore-"));
    const databasePath = join(directory, "tracekeep.sqlite");
    const backupDirectory = join(directory, "backups");
    const storage = new TracekeepStorage(databasePath, backupDirectory);
    storage.createCaptureBundle({
      source: { type: "manual", title: "Before", sensitivity: "personal" },
      text: "Before backup",
      candidateTitle: "Before backup",
    });
    const backup = await storage.createBackup();
    storage.createCaptureBundle({
      source: { type: "manual", title: "After", sensitivity: "personal" },
      text: "After backup",
      candidateTitle: "After backup",
    });
    expect(storage.listReviews()).toHaveLength(2);
    const result = await storage.restoreFromBackup(backup.fileName);
    expect(result).toMatchObject({ restoredFrom: backup.fileName, integrity: "ok" });
    expect(storage.listReviews()).toHaveLength(1);
    expect(existsSync(join(backupDirectory, result.preRestoreBackup))).toBe(true);
    storage.close();
    await rm(directory, { recursive: true, force: true });
  });
});

interface RowShape {
  deleted_at: string | null;
  version: number;
}
