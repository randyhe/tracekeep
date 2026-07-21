import { basename, extname } from "node:path";
import type { CodexTurnInput, KnowledgeKind, LearningAttachment } from "@tracekeep/contracts";
import type { CandidateRecordInput } from "@tracekeep/storage";
import { extractCandidates } from "./extractor.js";

const MAX_CANDIDATES_PER_TURN = 12;
const MAX_SUMMARY_LENGTH = 20_000;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/giu;
const FILE_SECTION_PATTERN = /^##\s+(.+\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md))\s*$/gimu;
const SECRET_PATTERN =
  /(?:api[_ -]?key|password|passwd|secret|private[_ -]?key|bearer)\s*[:=]\s*[^\s]{8,}|(?:ghp|gho|github_pat)_[A-Za-z0-9_]{12,}/iu;

export function buildCodexTurnCandidates(input: CodexTurnInput): CandidateRecordInput[] {
  const assistantSummary = cleanAssistantSummary(input.assistantText);
  const title = deriveConversationTitle(input.userText);
  const extracted = extractCandidates([{ role: "user", content: input.userText }], title).map((candidate) => {
    if (candidate.candidateType !== "reference") return candidate;
    return {
      ...candidate,
      knowledgeKind: "conversation" as const,
      ...(assistantSummary ? { summary: assistantSummary } : {}),
    };
  });

  const candidates: CandidateRecordInput[] = [...extracted];
  if (!candidates.some((candidate) => candidate.candidateType === "reference") && isValuableTurn(input)) {
    candidates.push({
      candidateType: "reference",
      title,
      knowledgeKind: "conversation",
      ...(assistantSummary ? { summary: assistantSummary } : {}),
    });
  }

  for (const attachment of discoverLearningAttachments(input)) {
    candidates.push({
      candidateType: "reference",
      title: attachment.title,
      knowledgeKind: attachment.kind,
      canonicalUri: attachment.uri,
      ...(assistantSummary ? { summary: assistantSummary } : {}),
    });
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = [
        candidate.candidateType,
        candidate.knowledgeKind ?? "",
        normalize(candidate.canonicalUri ?? candidate.title),
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES_PER_TURN);
}

export function discoverLearningAttachments(input: CodexTurnInput): LearningAttachment[] {
  const discovered: LearningAttachment[] = input.attachments.map((attachment) => ({
    ...attachment,
    kind: attachment.kind === "document" ? inferFileKind(attachment.uri, input.userText) : attachment.kind,
  }));
  for (const match of input.userText.matchAll(URL_PATTERN)) {
    const uri = trimUrlPunctuation(match[0]);
    try {
      const parsed = new URL(uri);
      discovered.push({
        kind: inferUrlKind(parsed, input.userText),
        title: webTitle(parsed),
        uri: parsed.toString(),
      });
    } catch {
      // Ignore malformed URLs from untrusted conversation text.
    }
  }

  for (const match of input.userText.matchAll(FILE_SECTION_PATTERN)) {
    const uri = match[1]?.trim();
    if (!uri) continue;
    discovered.push({
      kind: inferFileKind(uri, input.userText),
      title: basename(uri),
      uri,
    });
  }

  const seen = new Set<string>();
  return discovered.filter((item) => {
    const key = normalize(item.uri);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function containsCredentialLikeText(text: string): boolean {
  return SECRET_PATTERN.test(text);
}

export function inferTurnSensitivity(text: string): CodexTurnInput["sensitivity"] {
  if (containsCredentialLikeText(text)) return "restricted";
  if (/\b(?:WCT|ADO|Azure DevOps|LINQX|CEMLife|CEMManager|PlugPRO)\b/iu.test(text)) {
    return "work_summary_only";
  }
  return "personal";
}

export function shouldCaptureTurn(input: Pick<CodexTurnInput, "userText" | "assistantText" | "attachments">): boolean {
  if (containsCredentialLikeText(input.userText)) return false;
  return isValuableTurn(input);
}

function isValuableTurn(input: Pick<CodexTurnInput, "userText" | "assistantText" | "attachments">): boolean {
  if (input.attachments.length > 0 || /\bhttps?:\/\/[^\s<>"'`]+/iu.test(input.userText)) return true;
  if (input.userText.trim().length >= 60 || (input.assistantText?.trim().length ?? 0) >= 240) return true;
  return /(?:想法|决定|计划|学习|研究|论文|文档|网址|总结|分析|下一步|待办|记得|跟进|idea|decision|plan|learn|study|research|paper|document|summarize|todo|follow up)/iu.test(
    input.userText,
  );
}

function cleanAssistantSummary(text?: string): string | undefined {
  const normalized = text?.replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/giu, "").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_SUMMARY_LENGTH);
}

function deriveConversationTitle(text: string): string {
  const first = text
    .split(/\r?\n/u)
    .map((line) => line.replace(/^#+\s*/u, "").trim())
    .find((line) => line && !line.startsWith("<") && !line.startsWith("# Files mentioned"));
  return (first || "Conversation learning note").slice(0, 180);
}

function inferFileKind(path: string, surroundingText: string): "document" | "paper" {
  if (extname(path).toLowerCase() === ".pdf" && /(?:paper|论文|研究|学术|journal|arxiv)/iu.test(surroundingText)) {
    return "paper";
  }
  return "document";
}

function inferUrlKind(url: URL, surroundingText: string): "web_page" | "paper" {
  if (
    (url.pathname.toLowerCase().endsWith(".pdf") || /(?:arxiv\.org|doi\.org)$/iu.test(url.hostname))
    && /(?:paper|论文|研究|学术|journal|arxiv|study)/iu.test(surroundingText)
  ) {
    return "paper";
  }
  return "web_page";
}

function webTitle(url: URL): string {
  const path = decodeURIComponent(url.pathname)
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/gu, " ")
    .trim();
  return path ? `${url.hostname}: ${path}`.slice(0, 500) : url.hostname.slice(0, 500);
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[),.;:!?，。；：！？]+$/u, "");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
