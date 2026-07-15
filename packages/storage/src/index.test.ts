import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AtlasStorage, StorageConflictError, fingerprint } from "./index.js";

function createStorage(): AtlasStorage {
  return new AtlasStorage(":memory:", ".runtime-test/backups");
}

describe("AtlasStorage", () => {
  it("creates a pending candidate and accepts it into an open loop", () => {
    const storage = createStorage();
    const bundle = storage.createCaptureBundle({
      source: { type: "manual", title: "Manual capture", sensitivity: "personal" },
      text: "Finish the Atlas backend",
      candidateTitle: "Finish the Atlas backend",
    });
    const accepted = storage.actOnReview(bundle.candidate.id, {
      action: "accept",
      expectedVersion: 1,
      priority: 3,
    });
    expect(accepted.outcome).toMatchObject({ title: "Finish the Atlas backend", priority: 3, status: "open" });
    expect(storage.getToday()).toHaveLength(1);
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
    const directory = await mkdtemp(join(tmpdir(), "atlas-storage-"));
    const databasePath = join(directory, "atlas.sqlite");
    const backupDirectory = join(directory, "backups");
    const storage = new AtlasStorage(databasePath, backupDirectory);
    storage.createCaptureBundle({
      source: { type: "manual", title: "Backup test", sensitivity: "personal" },
      text: "Persist this",
      candidateTitle: "Persist this",
    });
    const backup = await storage.createBackup();
    expect(existsSync(join(backupDirectory, backup.fileName))).toBe(true);
    const restored = new AtlasStorage(join(backupDirectory, backup.fileName), join(directory, "restored-backups"));
    expect(restored.integrityCheck()).toBe("ok");
    expect(restored.listReviews()).toHaveLength(1);
    restored.close();
    storage.close();
    await rm(directory, { recursive: true, force: true });
  });
});
