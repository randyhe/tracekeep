import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLifetimeLock, resolveDatabasePath, resolveDataDirectory } from "./runtime.js";

describe("runtime safety", () => {
  it("uses LOCALAPPDATA Tracekeep as the Windows default", () => {
    expect(resolveDataDirectory(undefined, { LOCALAPPDATA: "C:\\Local" }, "win32", "C:\\Home")).toBe("C:\\Local\\Tracekeep");
  });

  it("accepts the legacy data environment variable", () => {
    expect(resolveDataDirectory(undefined, { ATLAS_DATA_DIR: "C:\\Legacy" }, "win32", "C:\\Home")).toBe(
      "C:\\Legacy",
    );
  });

  it("reuses a legacy Windows data directory until a Tracekeep directory exists", () => {
    const legacy = "C:\\Local\\Atlas";
    expect(
      resolveDataDirectory(undefined, { LOCALAPPDATA: "C:\\Local" }, "win32", "C:\\Home", (path) => path === legacy),
    ).toBe(legacy);
  });

  it("prefers the Tracekeep database and falls back to the legacy database", () => {
    expect(resolveDatabasePath("C:\\Data", (path) => path.endsWith("atlas.sqlite"))).toBe("C:\\Data\\atlas.sqlite");
    expect(resolveDatabasePath("C:\\Data", (path) => path.endsWith("tracekeep.sqlite"))).toBe(
      "C:\\Data\\tracekeep.sqlite",
    );
  });

  it("refuses a second active lifetime lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tracekeep-lock-"));
    const first = acquireLifetimeLock(directory, "tracekeepd");
    expect(first.path).toBe(join(directory, ".tracekeepd.lock"));
    expect(() => acquireLifetimeLock(directory, "restore")).toThrow("already in use");
    first.release();
    const second = acquireLifetimeLock(directory, "restore");
    second.release();
    await rm(directory, { recursive: true, force: true });
  });
});
