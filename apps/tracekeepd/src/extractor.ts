import type { CandidateType } from "@tracekeep/contracts";

export const COMPETITION_EXTRACTOR_VERSION = "competition-1";

export interface ExtractionMessage {
  role: string;
  content: string;
}

export interface ExtractedCandidate {
  candidateType: CandidateType;
  title: string;
  summary?: string;
}

const COMPLETED_OR_NEGATED = /(?:已完成|完成了|已经处理|不需要|不用|无需|取消|done\b|completed\b|already (?:done|completed)|no need|don't need|do not need|cancelled?)/i;
const DECISION = /(?:决定|确定|选择|采用|不再|(?:^|[\s:：])(?:decision|decided|we will use|chose|chosen)(?:[\s:：]|$))/i;
const WAITING = /(?:等待|等.{0,30}(?:回复|确认|批准|反馈)|waiting for|awaiting)/i;
const OPEN_LOOP = /(?:待办|下一步|需要|我要|记得|跟进|安排|请提醒|todo|next step|need to|remember to|follow up|must\b)/i;

export function extractCandidates(messages: ExtractionMessage[], fallbackTitle: string): ExtractedCandidate[] {
  const userText = messages
    .filter((message) => isUserAuthored(message.role))
    .flatMap((message) => splitStatements(message.content));

  const classified = userText.flatMap((statement, index) => {
    if (COMPLETED_OR_NEGATED.test(statement)) return [];
    const match = classify(statement);
    return match ? [{ statement, index, ...match }] : [];
  }).sort((left, right) => left.priority - right.priority || left.index - right.index);

  const candidates: ExtractedCandidate[] = [];
  const seen = new Set<string>();
  for (const { statement, candidateType } of classified) {
    const title = cleanTitle(statement);
    if (!title) continue;
    const key = `${candidateType}:${normalize(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ candidateType, title, summary: statement.slice(0, 500) });
    if (candidates.length === 3) break;
  }

  if (candidates.length) return candidates;
  return [{ candidateType: "reference", title: truncate(fallbackTitle.trim() || "Imported reference", 500) }];
}

function isUserAuthored(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return normalized === "user" || normalized === "human" || normalized === "author" || normalized === "manual";
}

function classify(statement: string): { candidateType: CandidateType; priority: number } | undefined {
  if (DECISION.test(` ${statement} `)) return { candidateType: "decision", priority: 0 };
  if (WAITING.test(statement)) return { candidateType: "open_loop", priority: 1 };
  if (OPEN_LOOP.test(statement)) return { candidateType: "open_loop", priority: 2 };
  return undefined;
}

function splitStatements(content: string): string[] {
  return content
    .replace(/\r\n?/g, "\n")
    .split(/\n+|(?<=[。！？!?;；])\s*/u)
    .map((value) => value.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
    .filter((value) => value.length >= 3);
}

function cleanTitle(statement: string): string {
  return truncate(
    statement
      .replace(/^\s*(?:todo|待办|next step|下一步|decision|决定)\s*[:：-]?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim(),
    500,
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength).trimEnd();
}
