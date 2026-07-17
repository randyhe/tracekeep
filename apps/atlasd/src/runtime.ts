import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface LifetimeLock {
  path: string;
  release(): void;
}

export function resolveDataDirectory(
  explicit?: string,
  environment: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  homeDirectory = homedir(),
): string {
  if (explicit) return resolve(explicit);
  if (environment.ATLAS_DATA_DIR) return resolve(environment.ATLAS_DATA_DIR);
  if (platform === "win32" && environment.LOCALAPPDATA) return join(environment.LOCALAPPDATA, "Atlas");
  return join(homeDirectory, ".atlas");
}

export function acquireLifetimeLock(dataDirectory: string, owner: "atlasd" | "restore"): LifetimeLock {
  mkdirSync(dataDirectory, { recursive: true });
  const path = join(dataDirectory, ".atlasd.lock");
  removeStaleLock(path);
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx");
  } catch {
    throw new Error(`Atlas data directory is already in use: ${path}`);
  }
  writeFileSync(descriptor, JSON.stringify({ owner, processId: process.pid, startedAt: new Date().toISOString() }));
  let released = false;
  return {
    path,
    release() {
      if (released) return;
      released = true;
      closeSync(descriptor);
      rmSync(path, { force: true });
    },
  };
}

function removeStaleLock(path: string): void {
  if (!existsSync(path)) return;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { processId?: unknown };
    if (typeof parsed.processId === "number" && isProcessAlive(parsed.processId)) return;
  } catch {
    throw new Error(`Atlas lock cannot be validated: ${path}`);
  }
  rmSync(path, { force: true });
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
