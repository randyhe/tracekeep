import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const textExtensions = new Set([".json", ".jsonl", ".xml", ".html", ".md", ".txt", ".log", ".csv", ".yaml", ".yml"]);
const excludedExtensions = new Set([".sqlite", ".db", ".db-wal", ".db-shm", ".png", ".jpg", ".jpeg", ".zip"]);

export async function scanCanary({ canary, roots = [], includeGitDiff = true }) {
  if (!canary || canary.length < 16) throw new Error("A high-entropy canary of at least 16 characters is required");
  const hits = [];
  const scanned = [];
  for (const rawRoot of roots) {
    const root = assertCompetitionPath(rawRoot);
    for (const file of await walk(root)) {
      const extension = extname(file).toLocaleLowerCase();
      if (excludedExtensions.has(extension) || (!textExtensions.has(extension) && extension !== "")) continue;
      const content = await readFile(file, "utf8").catch(() => undefined);
      if (content === undefined) continue;
      scanned.push(file);
      if (content.includes(canary)) hits.push({ location: file, kind: "runtime-artifact" });
    }
  }
  if (includeGitDiff) {
    const diff = execFileSync("git", ["diff", "--no-ext-diff", "--", ".", ":(exclude)work/competition-runs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (diff.includes(canary)) hits.push({ location: "git diff", kind: "tracked-change" });
  }
  return { passed: hits.length === 0, scannedTextFiles: scanned.length, excludedLocalDatabaseArtifacts: true, hits };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const canary = process.argv[2];
  const roots = process.argv.slice(3);
  const result = await scanCanary({ canary, roots });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function assertCompetitionPath(path) {
  const target = resolve(repositoryRoot, path);
  const allowed = resolve(repositoryRoot, "work/competition-runs");
  if (target !== allowed && !target.startsWith(`${allowed}\\`) && !target.startsWith(`${allowed}/`)) {
    throw new Error(`Scan roots must stay under ${allowed}`);
  }
  return target;
}
