import { describe, expect, it } from "vitest";
import {
  buildCodexTurnCandidates,
  containsCredentialLikeText,
  discoverLearningAttachments,
  inferTurnSensitivity,
  shouldCaptureTurn,
} from "./second-brain.js";

describe("second-brain turn extraction", () => {
  it("creates a conversation note plus action and URL learning note", () => {
    const candidates = buildCodexTurnCandidates({
      sessionId: "session-1",
      turnId: "turn-1",
      userText: "下一步：读完这篇文章并整理实践计划 https://example.com/attention-paper",
      assistantText: "The article explains attention and suggests a three-step reading plan.",
      attachments: [],
      sensitivity: "personal",
    });

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateType: "open_loop" }),
      expect.objectContaining({ candidateType: "reference", knowledgeKind: "conversation" }),
      expect.objectContaining({
        candidateType: "reference",
        knowledgeKind: "web_page",
        canonicalUri: "https://example.com/attention-paper",
      }),
    ]));
  });

  it("recognizes paper and document references supplied by the host", () => {
    const input = {
      sessionId: "session-2",
      turnId: "turn-2",
      userText: "请研究这个 paper，并把结论作为学习笔记。",
      assistantText: "The paper compares three retrieval strategies.",
      attachments: [
        { kind: "paper" as const, title: "retrieval.pdf", uri: "C:\\notes\\retrieval.pdf" },
        { kind: "document" as const, title: "notes.docx", uri: "C:\\notes\\notes.docx" },
      ],
      sensitivity: "personal" as const,
    };
    expect(discoverLearningAttachments(input)).toHaveLength(2);
    expect(buildCodexTurnCandidates(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledgeKind: "paper", canonicalUri: "C:\\notes\\retrieval.pdf" }),
      expect.objectContaining({ knowledgeKind: "document", canonicalUri: "C:\\notes\\notes.docx" }),
    ]));
  });

  it("recognizes a discussed PDF or academic URL as a paper", () => {
    const attachments = discoverLearningAttachments({
      sessionId: "session-paper-url",
      turnId: "turn-paper-url",
      userText: "Please study this paper https://example.test/retrieval.pdf and compare it with https://arxiv.org/abs/1234.5678",
      attachments: [],
      sensitivity: "personal",
    });
    expect(attachments).toEqual([
      expect.objectContaining({ kind: "paper", uri: "https://example.test/retrieval.pdf" }),
      expect.objectContaining({ kind: "paper", uri: "https://arxiv.org/abs/1234.5678" }),
    ]);
  });

  it("skips credential-like turns and limits work content to summaries", () => {
    expect(containsCredentialLikeText("api_key=super-secret-value")).toBe(true);
    expect(shouldCaptureTurn({
      userText: "api_key=super-secret-value",
      assistantText: "Do not save this.",
      attachments: [],
    })).toBe(false);
    expect(inferTurnSensitivity("Review the WCT Azure DevOps test plan")).toBe("work_summary_only");
  });

  it("ignores short social turns but captures substantive learning", () => {
    expect(shouldCaptureTurn({ userText: "谢谢", assistantText: "不客气", attachments: [] })).toBe(false);
    expect(shouldCaptureTurn({
      userText: "请解释这个概念，并把它和我之前的项目决策联系起来。",
      assistantText: "A".repeat(300),
      attachments: [],
    })).toBe(true);
  });
});
