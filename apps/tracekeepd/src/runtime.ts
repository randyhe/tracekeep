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
  pathExists: (path: string) => boolean = existsSync,
): string {
  if (explicit) return resolve(explicit);
  if (environment.TRACEKEEP_DATA_DIR) return resolve(environment.TRACEKEEP_DATA_DIR);
  if (environment.ATLAS_DATA_DIR) return resolve(environment.ATLAS_DATA_DIR);
  if (platform === "win32" && environment.LOCALAPPDATA) {
    const current = join(environment.LOCALAPPDATA, "Tracekeep");
    const legacy = join(environment.LOCALAPPDATA, "Atlas");
    return !pathExists(current) && pathExists(legacy) ? legacy : current;
  }
  const current = join(homeDirectory, ".tracekeep");
  const legacy = join(homeDirectory, ".atlas");
  return !pathExists(current) && pathExists(legacy) ? legacy : current;
}

export function resolveDatabasePath(
  dataDirectory: string,
  pathExists: (path: string) => boolean = existsSync,
): string {
  const current = join(dataDirectory, "tracekeep.sqlite");
  const legacy = join(dataDirectory, "atlas.sqlite");
  return !pathExists(current) && pathExists(legacy) ? legacy : current;
}

export function acquireLifetimeLock(dataDirectory: string, owner: "tracekeepd" | "restore"): LifetimeLock {
  mkdirSync(dataDirectory, { recursive: true });
  const legacyPath = join(dataDirectory, ".atlasd.lock");
  const currentPath = join(dataDirectory, ".tracekeepd.lock");
  const paths = [legacyPath, currentPath];
  const descriptors: number[] = [];
  const acquiredPaths: string[] = [];
  try {
    for (const path of paths) {
      removeStaleLock(path);
      const descriptor = openSync(path, "wx");
      acquiredPaths.push(path);
      descriptors.push(descriptor);
      writeFileSync(descriptor, JSON.stringify({ owner, processId: process.pid, startedAt: new Date().toISOString() }));
    }
  } catch {
    descriptors.forEach((descriptor) => closeSync(descriptor));
    acquiredPaths.forEach((path) => rmSync(path, { force: true }));
    throw new Error(`Tracekeep data directory is already in use: ${dataDirectory}`);
  }
  let released = false;
  return {
    path: currentPath,
    release() {
      if (released) return;
      released = true;
      descriptors.forEach((descriptor) => closeSync(descriptor));
      paths.forEach((path) => rmSync(path, { force: true }));
    },
  };
}

function removeStaleLock(path: string): void {
  if (!existsSync(path)) return;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { processId?: unknown };
    if (typeof parsed.processId === "number" && isProcessAlive(parsed.processId)) return;
  } catch {
    throw new Error(`Tracekeep lock cannot be validated: ${path}`);
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
