import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import staticPlugin from "@fastify/static";
import { TracekeepStorage } from "@tracekeep/storage";
import { buildApp } from "./app.js";
import { acquireLifetimeLock, resolveDatabasePath, resolveDataDirectory } from "./runtime.js";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, "../../..");
const runtimeDirectory = resolveDataDirectory();
mkdirSync(runtimeDirectory, { recursive: true });
const lifetimeLock = acquireLifetimeLock(runtimeDirectory, "tracekeepd");

const storage = new TracekeepStorage(resolveDatabasePath(runtimeDirectory), resolve(runtimeDirectory, "backups"));
const authToken = process.env.TRACEKEEP_AUTH_TOKEN ?? process.env.ATLAS_AUTH_TOKEN;
const app = buildApp({
  storage,
  logger: true,
  ...(authToken ? { authToken } : {}),
});
const webDirectory = resolve(repositoryRoot, "apps/web/dist");
await app.register(staticPlugin, { root: webDirectory, wildcard: false });
app.setNotFoundHandler((request, reply) => {
  if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
  return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
});
const port = Number.parseInt(process.env.TRACEKEEP_PORT ?? process.env.ATLAS_PORT ?? "4310", 10);

const shutdown = async () => {
  await app.close();
  storage.close();
  lifetimeLock.release();
};
process.on("exit", () => lifetimeLock.release());
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: "127.0.0.1", port });
