import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(repositoryRoot, "output/playwright/final-video");
const runDirectory = resolve(repositoryRoot, `work/competition-runs/final-video-${Date.now()}`);
const dataDirectory = resolve(runDirectory, "data");
const fixturePath = resolve(repositoryRoot, "docs/competition/synthetic-conversations.json");
const conversationPath = resolve(repositoryRoot, "scripts/competition/codex-tracekeep-conversation.html");
const playwrightPath = process.env.TRACEKEEP_PLAYWRIGHT_PATH;
const browserExecutable = process.env.TRACEKEEP_BROWSER_EXECUTABLE;
if (!playwrightPath) throw new Error("TRACEKEEP_PLAYWRIGHT_PATH is required.");

await mkdir(outputDirectory, { recursive: true });
await mkdir(dataDirectory, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(playwrightPath, "index.mjs")).href);

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const tracekeep = spawn(process.execPath, [resolve(repositoryRoot, "apps/tracekeepd/dist/main.js")], {
  env: { ...process.env, TRACEKEEP_DATA_DIR: dataDirectory, TRACEKEEP_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let tracekeepError = "";
tracekeep.stdout.on("data", (chunk) => { tracekeepError += chunk.toString(); });
tracekeep.stderr.on("data", (chunk) => { tracekeepError += chunk.toString(); });

let browser;
let context;
try {
  await waitForTracekeep();
  await seedExistingOpenLoop();
  const codexCapture = await seedCodexConversationCapture();
  await seedSyntheticConversationImport();

  browser = await chromium.launch({ headless: true, ...(browserExecutable ? { executablePath: browserExecutable } : {}) });
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: "light",
    recordVideo: { dir: outputDirectory, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const video = page.video();

  await showTitle(page);
  await page.screenshot({ path: resolve(outputDirectory, "01-title.png") });
  await pause(12_000);

  await page.goto(pathToFileURL(conversationPath).href);
  await page.getByText("Simulated conversation · synthetic data").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "02-conversation-first.png") });
  await pause(24_000);

  await page.goto(`${baseUrl}/review`);
  await page.evaluate(() => localStorage.setItem("tracekeep.theme", "light"));
  await page.reload();
  await page.getByRole("heading", { name: "A few things need your judgement." }).waitFor();
  const codexCard = page.locator("article.review-card").filter({ hasText: "Confirm pickup times for the three summer camps." });
  await codexCard.waitFor();
  await pause(7_000);
  await codexCard.getByTestId(`accept-${codexCapture.candidate.id}`).click();
  await page.getByTestId("review-tab-accepted").click();
  const acceptedCodexCard = page.locator("article.review-card").filter({ hasText: "Confirm pickup times for the three summer camps." });
  await acceptedCodexCard.waitFor();
  await acceptedCodexCard.getByRole("button", { name: /View evidence/u }).click();
  await acceptedCodexCard.getByText("Codex conversation capture").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "03-codex-review.png") });
  await pause(13_000);
  await page.getByTestId("review-tab-pending").click();

  const duplicateCard = page.locator("article.review-card").filter({ hasText: "Verify the Windows release checksum." });
  await duplicateCard.getByText("Possible duplicate").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "04-review-duplicate.png") });
  await pause(10_000);
  await duplicateCard.getByRole("button", { name: "Merge" }).click();
  await pause(4_000);
  await duplicateCard.getByRole("button", { name: "Merge evidence" }).click();
  await page.getByTestId("review-tab-accepted").click();
  const acceptedDuplicate = page.locator("article.review-card")
    .filter({ hasText: "Verify the Windows release checksum." })
    .filter({ hasText: "Merged into" });
  await acceptedDuplicate.getByText("Merged into").waitFor();
  await pause(4_000);
  await acceptedDuplicate.getByRole("button", { name: /View evidence/u }).click();
  await acceptedDuplicate.getByText("Synthetic Build Week planning conversation").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "05-merged-evidence.png") });
  await pause(10_000);

  await page.getByTestId("review-tab-pending").click();
  const decisionCard = page.locator("article.review-card").filter({ hasText: "keep Tracekeep local-first and review-first" });
  await decisionCard.waitFor();
  await pause(3_000);
  await decisionCard.getByRole("button", { name: "Accept" }).click();
  await pause(4_000);

  await page.getByRole("link", { name: "Today" }).click();
  const targetLoop = page.locator("article.loop-card").filter({ hasText: "Verify the Windows release checksum." });
  await targetLoop.waitFor();
  await pause(4_000);
  await targetLoop.getByRole("button", { name: /View evidence/u }).click();
  await targetLoop.getByText("Synthetic Build Week planning conversation").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "06-today-evidence.png") });
  await pause(5_000);
  await targetLoop.getByRole("button", { name: "Next week" }).click();
  await page.getByText("Scheduled for next week.").waitFor();
  await pause(4_000);
  await page.getByRole("button", { name: "Undo" }).click();
  await targetLoop.waitFor();
  await page.getByText("Scheduled for next week.").waitFor({ state: "detached" });
  await pause(4_000);

  await page.getByRole("link", { name: "Search" }).click();
  await page.getByTestId("search-input").fill("local-first");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByTestId("search-results").waitFor();
  await pause(4_000);
  const searchResult = page.getByTestId("search-results").locator("article").first();
  await searchResult.locator("summary").click();
  await page.screenshot({ path: resolve(outputDirectory, "07-sourced-search.png") });
  await pause(14_000);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByText("$0 external budget").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "08-cost-protection.png") });
  await pause(13_000);

  await showArchitecture(page);
  await page.screenshot({ path: resolve(outputDirectory, "09-architecture.png") });
  await pause(14_000);

  await page.close();
  await context.close();
  context = undefined;
  const recordedPath = await video.path();
  const finalPath = resolve(outputDirectory, "tracekeep-build-week-raw.webm");
  await rename(recordedPath, finalPath);
  process.stdout.write(`${JSON.stringify({ finalPath, dataDirectory, baseUrl, syntheticOnly: true }, null, 2)}\n`);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  tracekeep.kill();
  await Promise.race([
    new Promise((done) => tracekeep.once("exit", done)),
    pause(3_000),
  ]);
}

async function waitForTracekeep() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (tracekeep.exitCode !== null) throw new Error(`Isolated Tracekeep exited with ${tracekeep.exitCode}: ${tracekeepError}`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/health/ready`);
      if (response.ok) return;
    } catch {
      // Retry while the isolated server starts.
    }
    await pause(100);
  }
  throw new Error(`Isolated Tracekeep did not become ready: ${tracekeepError}`);
}

async function findFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return rejectPort(new Error("Could not reserve a local port."));
      const selectedPort = address.port;
      server.close(() => resolvePort(selectedPort));
    });
  });
}

async function seedExistingOpenLoop() {
  const capture = await request("/api/v1/captures", "POST", {
    text: "Verify the Windows release checksum.",
    sensitivity: "personal",
  });
  await request(`/api/v1/reviews/${capture.candidate.id}/actions`, "POST", {
    action: "accept",
    expectedVersion: capture.candidate.version,
    priority: 3,
  });
}

async function seedCodexConversationCapture() {
  return request("/api/v1/captures", "POST", {
    text: "Confirm pickup times for the three summer camps.",
    sourceType: "codex",
    candidateType: "open_loop",
    sensitivity: "personal",
  });
}

async function seedSyntheticConversationImport() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  await request("/api/v1/imports/chatgpt-export", "POST", {
    conversations: fixture,
    sensitivity: "personal",
  });
}

async function request(path, method, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function showTitle(page) {
  await page.setContent(slide(`
    <div class="kicker">OPENAI BUILD WEEK · APPS FOR YOUR LIFE</div>
    <h1>Tracekeep</h1>
    <h2>Local-First AI Memory &amp; Action System</h2>
    <p>Recover the important things you already said — and move them forward.</p>
    <div class="pills"><span>Review first</span><span>Sourced</span><span>Reversible</span><span>Local</span></div>
  `));
}

async function showArchitecture(page) {
  await page.setContent(slide(`
    <div class="kicker">LOCAL-FIRST ARCHITECTURE</div>
    <h1 class="small">Chat → Review → Action</h1>
    <div class="flow">
      <div><b>Conversation</b><small>Codex skill · Local MCP</small></div><i>→</i>
      <div><b>Review</b><small>Edit · Merge · Reject · Undo</small></div><i>→</i>
      <div><b>Tracekeep API</b><small>Fastify · Idempotent writes</small></div><i>→</i>
      <div><b>SQLite</b><small>Evidence · FTS5 · Backup</small></div>
    </div>
    <p class="closing">Codex and GPT-5.6 turned product decisions into implementation, tests, privacy checks, and a judge-ready Windows release.</p>
    <div class="footer"><span>github.com/randyhe/tracekeep</span><span>Windows x64 · $0 external budget</span></div>
  `));
}

function slide(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:100vw;height:100vh;overflow:hidden;background:radial-gradient(circle at 78% 20%,#1d4c46 0,#102a29 30%,#081817 70%);color:#f4f1e9;font-family:Inter,Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center}
    main{width:1600px;padding:100px 120px}.kicker{font-weight:800;letter-spacing:.22em;color:#7dd8c8;font-size:23px;margin-bottom:32px}h1{font-size:170px;line-height:.88;margin:0 0 24px;letter-spacing:-.07em}h1.small{font-size:94px;letter-spacing:-.055em;margin-bottom:65px}h2{font-size:48px;font-weight:600;margin:0 0 28px;color:#d9e5df}p{font-size:32px;line-height:1.45;color:#b9cbc4;max-width:1200px}.pills{display:flex;gap:18px;margin-top:55px}.pills span{border:1px solid #4d8178;border-radius:999px;padding:14px 24px;font-size:23px;color:#d9f4ee;background:#143a36}.flow{display:flex;align-items:stretch;gap:20px}.flow div{flex:1;padding:32px 26px;border:1px solid #376c63;border-radius:20px;background:#10322f}.flow b{display:block;font-size:31px;margin-bottom:14px}.flow small{display:block;font-size:20px;line-height:1.4;color:#a9c5be}.flow i{align-self:center;font-size:42px;color:#65cbbb}.closing{margin-top:58px;color:#eaf7f3}.footer{display:flex;justify-content:space-between;margin-top:54px;padding-top:24px;border-top:1px solid #31524d;color:#8fb2aa;font-size:22px}
  </style></head><body><main>${content}</main></body></html>`;
}

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}
