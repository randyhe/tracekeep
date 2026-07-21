import type { OpenLoop, ReviewCandidate } from "./types";

export interface ReviewUndoState {
  allowed: boolean;
  outcome?: OpenLoop;
  reason?: string;
}

export function getReviewUndoState(
  item: ReviewCandidate,
  openLoops: OpenLoop[],
  openLoopsLoading = false,
): ReviewUndoState {
  if (item.status !== "accepted" || item.candidateType !== "open_loop" || !item.outcomeId) {
    return { allowed: true };
  }

  if (openLoopsLoading) {
    return { allowed: false, reason: "Checking the accepted item before undo." };
  }

  const outcome = openLoops.find((loop) => loop.id === item.outcomeId);
  if (!outcome) {
    return {
      allowed: false,
      reason: "The accepted item is no longer active, so Tracekeep cannot undo it safely.",
    };
  }

  if (!item.outcomeVersion || outcome.version !== item.outcomeVersion) {
    return {
      allowed: false,
      outcome,
      reason: `This item changed after acceptance and is now ${outcome.status}. Manage it in Today instead.`,
    };
  }

  return { allowed: true, outcome };
}
