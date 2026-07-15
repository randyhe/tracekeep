import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import staticPlugin from "@fastify/static";
import { AtlasStorage } from "@atlas/storage";
import { buildApp } from "./app.js";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, "../../..");
const defaultRuntimeDirectory = process.platform === "win32" && process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, "Atlas")
  : resolve(repositoryRoot, ".runtime");
const runtimeDirectory = process.env.ATLAS_DATA_DIR
  ? resolve(process.env.ATLAS_DATA_DIR)
  : defaultRuntimeDirectory;
mkdirSync(runtimeDirectory, { recursive: true });

const storage = new AtlasStorage(resolve(runtimeDirectory, "atlas.sqlite"), resolve(runtimeDirectory, "backups"));
const app = buildApp({ storage, logger: true });
const webDirectory = resolve(repositoryRoot, "apps/web/dist");
await app.register(staticPlugin, { root: webDirectory, wildcard: false });
app.setNotFoundHandler((request, reply) => {
  if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
  return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
});
const port = Number.parseInt(process.env.ATLAS_PORT ?? "4310", 10);

const shutdown = async () => {
  await app.close();
  storage.close();
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: "127.0.0.1", port });
