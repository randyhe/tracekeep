import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { resolve } from "node:path";
import { restoreInputSchema } from "@tracekeep/contracts";
import { TracekeepStorage, fingerprint } from "@tracekeep/storage";
import { acquireLifetimeLock, resolveDatabasePath, resolveDataDirectory } from "./runtime.js";

const args = parseArgs(process.argv.slice(2));
const input = restoreInputSchema.parse({ backupFileName: args.backup, confirmation: args.confirm });
if (input.confirmation !== `RESTORE ${input.backupFileName}`) {
  throw new Error(`Confirmation must exactly equal: RESTORE ${input.backupFileName}`);
}
if (!args.idempotencyKey || args.idempotencyKey.length < 8) {
  throw new Error("--idempotency-key with at least 8 characters is required");
}

const dataDirectory = resolveDataDirectory(args.dataDir);
const port = Number.parseInt(args.port ?? process.env.TRACEKEEP_PORT ?? process.env.ATLAS_PORT ?? "4310", 10);
if (await isPortListening(port)) {
  throw new Error(`tracekeepd is running on 127.0.0.1:${port}; stop the service before restore`);
}

const lock = acquireLifetimeLock(dataDirectory, "restore");
let storage: TracekeepStorage | undefined;
try {
  storage = new TracekeepStorage(resolveDatabasePath(dataDirectory), resolve(dataDirectory, "backups"));
  const requestHash = fingerprint({ backupFileName: input.backupFileName });
  const replay = storage.readIdempotent<unknown>(args.idempotencyKey, "restore.database", requestHash);
  if (replay) {
    process.stdout.write(`${JSON.stringify({ replayed: true, result: replay })}\n`);
  } else {
    const result = await storage.restoreFromBackup(input.backupFileName);
    storage.saveIdempotent(args.idempotencyKey, "restore.database", requestHash, result);
    process.stdout.write(`${JSON.stringify({ replayed: false, result })}\n`);
  }
} finally {
  storage?.close();
  lock.release();
}

function parseArgs(values: string[]): Record<string, string | undefined> & {
  backup?: string;
  confirm?: string;
  idempotencyKey?: string;
  dataDir?: string;
  port?: string;
} {
  const result: Record<string, string | undefined> = {};
  const names: Record<string, string> = {
    "--backup": "backup",
    "--confirm": "confirm",
    "--idempotency-key": "idempotencyKey",
    "--data-dir": "dataDir",
    "--port": "port",
  };
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key || !names[key] || !value) throw new Error(`Invalid restore argument: ${key ?? "<missing>"}`);
    result[names[key]] = value;
  }
  return result;
}

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(750);
    socket.once("connect", () => {
      socket.destroy();
      resolveResult(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolveResult(false);
    });
    socket.once("error", () => resolveResult(false));
  });
}
