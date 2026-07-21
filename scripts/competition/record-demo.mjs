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
  await pause(10_000);

  await page.goto(pathToFileURL(conversationPath).href);
  await page.getByText("Simulated Codex view · synthetic data").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "02-conversation-first.png") });
  await pause(25_000);

  await page.goto(`${pathToFileURL(conversationPath).href}?scene=today`);
  await page.getByText("Your three highest-priority open loops").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "03-codex-today.png") });
  await pause(25_000);

  await page.goto(`${pathToFileURL(conversationPath).href}?scene=resume`);
  await page.getByText("You had narrowed the choice to three camps.").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "04-codex-resume.png") });
  await pause(25_000);

  await showHowItWorks(page);
  await page.screenshot({ path: resolve(outputDirectory, "05-conversation-architecture.png") });
  await pause(20_000);

  await page.goto(`${baseUrl}/review`);
  await page.evaluate(() => localStorage.setItem("tracekeep.theme", "light"));
  await page.reload();
  await page.getByRole("heading", { name: "A few things need your judgement." }).waitFor();
  const codexCard = page.locator("article.review-card").filter({ hasText: "Confirm pickup times for the three summer camps." });
  await codexCard.waitFor();
  await pause(5_000);
  await codexCard.getByTestId(`accept-${codexCapture.candidate.id}`).click();
  await page.getByTestId("review-tab-accepted").click();
  const acceptedCodexCard = page.locator("article.review-card").filter({ hasText: "Confirm pickup times for the three summer camps." });
  await acceptedCodexCard.waitFor();
  await acceptedCodexCard.getByRole("button", { name: /View evidence/u }).click();
  await acceptedCodexCard.getByText("Codex conversation capture").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "06-dashboard-review.png") });
  await pause(15_000);

  await page.goto(`${pathToFileURL(conversationPath).href}?scene=build`);
  await page.getByText("I turned the product direction into a verified release").waitFor();
  await page.screenshot({ path: resolve(outputDirectory, "07-codex-built-tracekeep.png") });
  await pause(25_000);

  await showDeliveryEvidence(page);
  await page.screenshot({ path: resolve(outputDirectory, "08-delivery-evidence.png") });
  await pause(17_000);

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

async function showHowItWorks(page) {
  await page.setContent(slide(`
    <div class="kicker">HOW THE CONVERSATION-FIRST LOOP WORKS</div>
    <h1 class="small">Talk → Settle → Recall → Continue</h1>
    <div class="flow">
      <div><b>Codex turn</b><small>Use ordinary language. No prefix or special remember command.</small></div><i>→</i>
      <div><b>Local Stop hook</b><small>A completed meaningful turn becomes Learning or a reviewable proposal.</small></div><i>→</i>
      <div><b>tracekeepd</b><small>Loopback-only API · authenticated, idempotent writes.</small></div><i>→</i>
      <div><b>Local SQLite</b><small>Sources · FTS5 search · evidence · backup.</small></div>
    </div>
    <p class="closing">Ask again in Codex to recover the source, the unfinished decision, and the next action. The Web is only the batch review workspace.</p>
    <div class="footer"><span>Available now: local Codex plugin</span><span>ChatGPT Direct: planned · Export backfill: manual</span></div>
  `));
}

async function showDeliveryEvidence(page) {
  await page.setContent(slide(`
    <div class="kicker">CODEX DELIVERED THE PROJECT END TO END</div>
    <h1 class="small">From product brief to public submission.</h1>
    <div class="evidence">
      <div><b>PR #18</b><span>Automatic second-brain capture</span><small>Merged · CI passed</small></div>
      <div><b>PR #22</b><span>Portable Windows v0.4.0 release</span><small>Merged · checksum published</small></div>
      <div><b>PR #28</b><span>Build Week submission materials</span><small>Merged · privacy reviewed</small></div>
      <div><b>PR #29</b><span>Open-source Kokoro narration</span><small>Merged · CI passed</small></div>
    </div>
    <p class="closing">Requirements, subagent coordination, design, code, tests, UAT, GitHub commits, PR review, CI, Release assets, captions, and submission preparation were carried out in Codex with GPT-5.6.</p>
    <div class="footer"><span>github.com/randyhe/tracekeep</span><span>v0.4.0 · Windows x64 · MIT</span></div>
  `));
}

function slide(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:100vw;height:100vh;overflow:hidden;background:radial-gradient(circle at 78% 20%,#1d4c46 0,#102a29 30%,#081817 70%);color:#f4f1e9;font-family:Inter,Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center}
    main{width:1600px;padding:100px 120px}.kicker{font-weight:800;letter-spacing:.22em;color:#7dd8c8;font-size:23px;margin-bottom:32px}h1{font-size:170px;line-height:.88;margin:0 0 24px;letter-spacing:-.07em}h1.small{font-size:82px;letter-spacing:-.055em;margin-bottom:48px}h2{font-size:48px;font-weight:600;margin:0 0 28px;color:#d9e5df}p{font-size:30px;line-height:1.4;color:#b9cbc4;max-width:1320px}.pills{display:flex;gap:18px;margin-top:55px}.pills span{border:1px solid #4d8178;border-radius:999px;padding:14px 24px;font-size:23px;color:#d9f4ee;background:#143a36}.flow{display:flex;align-items:stretch;gap:16px}.flow div{flex:1;padding:28px 23px;border:1px solid #376c63;border-radius:20px;background:#10322f}.flow b{display:block;font-size:28px;margin-bottom:12px}.flow small{display:block;font-size:18px;line-height:1.4;color:#a9c5be}.flow i{align-self:center;font-size:38px;color:#65cbbb}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:18px}.evidence div{padding:24px 28px;border:1px solid #376c63;border-radius:18px;background:#10322f}.evidence b{display:block;color:#7dd8c8;font-size:24px;margin-bottom:7px}.evidence span{display:block;font-size:25px;font-weight:700}.evidence small{display:block;color:#9ebdb5;font-size:18px;margin-top:8px}.closing{margin-top:42px;color:#eaf7f3}.footer{display:flex;justify-content:space-between;margin-top:38px;padding-top:22px;border-top:1px solid #31524d;color:#8fb2aa;font-size:21px}
  </style></head><body><main>${content}</main></body></html>`;
}

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}
