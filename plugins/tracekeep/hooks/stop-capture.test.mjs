import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { inferSensitivity, isValuableTurn, parseCodexTurnTranscript, resolveHookDataDirectory } from "./stop-capture.mjs";

test("parses only the requested Codex turn and keeps its final answer", () => {
  const transcript = [
    { type: "turn_context", payload: { turn_id: "turn-1" } },
    { type: "event_msg", payload: { type: "user_message", message: "谢谢", local_images: [] } },
    { type: "event_msg", payload: { type: "agent_message", phase: "final_answer", message: "不客气" } },
    { type: "turn_context", payload: { turn_id: "turn-2" } },
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "请研究这篇 paper，并保存结论。",
        local_images: ["C:\\learning\\retrieval.pdf"],
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "final_answer",
        message: "The paper compares sparse and dense retrieval.",
      },
    },
  ].map((value) => JSON.stringify(value)).join("\n");

  assert.deepEqual(parseCodexTurnTranscript(transcript, "turn-2"), {
    userText: "请研究这篇 paper，并保存结论。",
    assistantText: "The paper compares sparse and dense retrieval.",
    attachments: [{
      kind: "document",
      title: "retrieval.pdf",
      uri: "C:\\learning\\retrieval.pdf",
      mimeType: undefined,
    }],
  });
});

test("captures substantive turns, skips trivial and credential turns", () => {
  assert.equal(isValuableTurn({ userText: "谢谢", assistantText: "不客气", attachments: [] }), false);
  assert.equal(isValuableTurn({
    userText: "请分析这篇论文并总结三个关键结论。",
    assistantText: "A".repeat(300),
    attachments: [],
  }), true);
  assert.equal(inferSensitivity("Review the WCT Azure DevOps plan"), "work_summary_only");
  assert.equal(isValuableTurn({
    userText: "api_key=super-secret-value",
    assistantText: "Never persist this.",
    attachments: [],
  }), false);
});

test("prefers Tracekeep hook data and reuses a legacy Atlas queue", () => {
  assert.equal(
    resolveHookDataDirectory({ LOCALAPPDATA: "C:\\Local" }, "C:\\Work", (path) => path.endsWith("Atlas\\plugin-data")),
    "C:\\Local\\Atlas\\plugin-data",
  );
  assert.equal(
    resolveHookDataDirectory({ LOCALAPPDATA: "C:\\Local" }, "C:\\Work", (path) => path.endsWith("Tracekeep\\plugin-data")),
    "C:\\Local\\Tracekeep\\plugin-data",
  );
});

test("resolves the Windows hook runner inside PowerShell", async () => {
  const hooks = JSON.parse(await readFile(new URL("./hooks.json", import.meta.url), "utf8"));
  const command = hooks.hooks.Stop[0].hooks[0].commandWindows;

  assert.match(command, /\$env:PLUGIN_ROOT/u);
  assert.match(command, /Join-Path/u);
  assert.doesNotMatch(command, /%PLUGIN_ROOT%/u);
});

test("the Windows installer pins the MCP working directory at install time", async () => {
  const installer = await readFile(
    new URL("../../../packaging/windows/scripts/Install-Tracekeep.ps1", import.meta.url),
    "utf8",
  );

  assert.match(installer, /Add-Member -NotePropertyName "cwd"/u);
  assert.match(installer, /-NotePropertyValue \$pluginDestination/u);
});
