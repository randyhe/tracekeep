import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLifetimeLock, resolveDataDirectory } from "./runtime.js";

describe("runtime safety", () => {
  it("uses LOCALAPPDATA Atlas as the Windows default", () => {
    expect(resolveDataDirectory(undefined, { LOCALAPPDATA: "C:\\Local" }, "win32", "C:\\Home")).toBe("C:\\Local\\Atlas");
  });

  it("refuses a second active lifetime lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "atlas-lock-"));
    const first = acquireLifetimeLock(directory, "atlasd");
    expect(() => acquireLifetimeLock(directory, "restore")).toThrow("already in use");
    first.release();
    const second = acquireLifetimeLock(directory, "restore");
    second.release();
    await rm(directory, { recursive: true, force: true });
  });
});
