import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:4310";
export function parseCodexTurnTranscript(jsonl, requestedTurnId) {
  let currentTurnId;
  const turns = new Map();
  for (const line of jsonl.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "turn_context") {
      currentTurnId = record.payload?.turn_id;
      if (currentTurnId && !turns.has(currentTurnId)) {
        turns.set(currentTurnId, { userMessages: [], assistantMessages: [], attachments: [] });
      }
      continue;
    }
    if (!currentTurnId || !turns.has(currentTurnId) || record.type !== "event_msg") continue;
    const turn = turns.get(currentTurnId);
    const payload = record.payload ?? {};
    if (payload.type === "user_message") {
      if (typeof payload.message === "string" && payload.message.trim()) turn.userMessages.push(payload.message.trim());
      for (const path of payload.local_images ?? []) {
        if (typeof path !== "string") continue;
        turn.attachments.push({
          kind: "document",
          title: basename(path),
          uri: path,
          mimeType: imageMimeType(path),
        });
      }
    }
    if (payload.type === "agent_message" && payload.phase === "final_answer" && typeof payload.message === "string") {
      turn.assistantMessages.push(payload.message.trim());
    }
    if (payload.type === "task_complete" && turn.assistantMessages.length === 0 && typeof payload.last_agent_message === "string") {
      turn.assistantMessages.push(payload.last_agent_message.trim());
    }
  }

  const selected = turns.get(requestedTurnId) ?? Array.from(turns.values()).at(-1);
  if (!selected) return undefined;
  return {
    userText: selected.userMessages.map(stripInternalContext).filter(Boolean).join("\n\n"),
    assistantText: selected.assistantMessages.filter(Boolean).at(-1),
    attachments: deduplicateAttachments(selected.attachments),
  };
}

export function inferSensitivity(text) {
  if (/(?:api[_ -]?key|password|passwd|secret|private[_ -]?key|bearer)\s*[:=]\s*[^\s]{8,}|(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}/iu.test(text)) {
    return "restricted";
  }
  if (/\b(?:WCT|ADO|Azure DevOps|LINQX|CEMLife|CEMManager|PlugPRO)\b/iu.test(text)) return "work_summary_only";
  return "personal";
}

export function isValuableTurn(turn) {
  if (!turn?.userText?.trim() || inferSensitivity(turn.userText) === "restricted") return false;
  if (turn.attachments.length > 0 || /\bhttps?:\/\/\S+/iu.test(turn.userText)) return true;
  if (turn.userText.trim().length >= 60 || (turn.assistantText?.trim().length ?? 0) >= 240) return true;
  return /(?:想法|决定|计划|学习|研究|论文|文档|网址|总结|分析|下一步|待办|记得|跟进|idea|decision|plan|learn|study|research|paper|document|summarize|todo|follow up)/iu.test(
    turn.userText,
  );
}

async function main() {
  if (String(process.env.TRACEKEEP_AUTO_CAPTURE ?? process.env.ATLAS_AUTO_CAPTURE ?? "on").toLowerCase() === "off") return;
  const input = await readStdinJson();
  if (input.hook_event_name !== "Stop" || !input.transcript_path || !input.session_id || !input.turn_id) return;
  const transcript = await readFile(input.transcript_path, "utf8");
  const turn = parseCodexTurnTranscript(transcript, input.turn_id);
  if (!isValuableTurn(turn)) return;

  const sensitivity = inferSensitivity(turn.userText);
  const payload = {
    sessionId: input.session_id,
    turnId: input.turn_id,
    userText: turn.userText.slice(0, 200_000),
    ...(turn.assistantText ? { assistantText: turn.assistantText.slice(0, 200_000) } : {}),
    attachments: turn.attachments.slice(0, 20),
    sensitivity,
  };
  const dataDirectory = resolveHookDataDirectory();
  const queueDirectory = join(dataDirectory, "pending-turns");
  await mkdir(queueDirectory, { recursive: true });
  await flushQueue(queueDirectory);
  try {
    await sendTurn(payload);
  } catch {
    await queueTurn(queueDirectory, minimizeQueuedPayload(payload));
  }
}

async function sendTurn(payload) {
  const baseUrl = normalizeBaseUrl(process.env.TRACEKEEP_BASE_URL || process.env.ATLAS_BASE_URL || DEFAULT_BASE_URL);
  const token = process.env.TRACEKEEP_TOKEN || process.env.ATLAS_TOKEN;
  const response = await fetch(`${baseUrl}/api/v1/imports/codex-turn`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `codex-turn:${payload.sessionId}:${payload.turnId}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Tracekeep returned ${response.status}`);
}

export function resolveHookDataDirectory(
  environment = process.env,
  currentWorkingDirectory = process.cwd(),
  pathExists = existsSync,
) {
  if (environment.PLUGIN_DATA) return environment.PLUGIN_DATA;
  const root = environment.LOCALAPPDATA || currentWorkingDirectory;
  const current = join(root, "Tracekeep", "plugin-data");
  const legacy = join(root, "Atlas", "plugin-data");
  return !pathExists(current) && pathExists(legacy) ? legacy : current;
}

async function flushQueue(queueDirectory) {
  const files = (await readdir(queueDirectory)).filter((name) => name.endsWith(".json")).slice(0, 10);
  for (const file of files) {
    const path = join(queueDirectory, file);
    try {
      const payload = JSON.parse(await readFile(path, "utf8"));
      await sendTurn(payload);
      await rm(path);
    } catch {
      break;
    }
  }
}

async function queueTurn(queueDirectory, payload) {
  const id = createHash("sha256").update(`${payload.sessionId}:${payload.turnId}`).digest("hex");
  const finalPath = join(queueDirectory, `${id}.json`);
  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, finalPath);
}

function minimizeQueuedPayload(payload) {
  if (payload.sensitivity !== "work_summary_only") return payload;
  const title = payload.userText.split(/\r?\n/u).find((line) => line.trim())?.trim().slice(0, 300) || "Work learning note";
  return {
    ...payload,
    userText: title,
    assistantText: undefined,
    attachments: [],
  };
}

function stripInternalContext(text) {
  return text
    .replace(/<codex_internal_context[\s\S]*?<\/codex_internal_context>/giu, "")
    .replace(/<in-app-browser-context[\s\S]*?<\/in-app-browser-context>/giu, "")
    .trim();
}

function deduplicateAttachments(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.uri.normalize("NFKC").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function imageMimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return undefined;
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("TRACEKEEP_BASE_URL must use local loopback HTTP");
  }
  return parsed.origin;
}

async function readStdinJson() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text || "{}");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    // A Stop hook must never block the conversation. Failures are retried from the local queue.
  });
}
