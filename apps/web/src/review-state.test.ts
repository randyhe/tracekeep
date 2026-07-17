import { describe, expect, it } from "vitest";
import { getReviewUndoState } from "./review-state";
import type { OpenLoop, ReviewCandidate } from "./types";

const acceptedCandidate: ReviewCandidate = {
  id: "review-1",
  title: "Add the release checksum",
  candidateType: "open_loop",
  status: "accepted",
  version: 2,
  outcomeId: "loop-1",
  outcomeVersion: 1,
};

const acceptedLoop: OpenLoop = {
  id: "loop-1",
  title: "Add the release checksum",
  status: "open",
  version: 1,
};

describe("review undo state", () => {
  it("allows undo while the accepted outcome is unchanged", () => {
    expect(getReviewUndoState(acceptedCandidate, [acceptedLoop])).toEqual({
      allowed: true,
      outcome: acceptedLoop,
    });
  });

  it("blocks undo with a useful explanation after the outcome changes", () => {
    const doneLoop = { ...acceptedLoop, status: "done" as const, version: 2 };
    expect(getReviewUndoState(acceptedCandidate, [doneLoop])).toEqual({
      allowed: false,
      outcome: doneLoop,
      reason: "This item changed after acceptance and is now done. Manage it in Today instead.",
    });
  });

  it("keeps rejection undo available because it has no accepted outcome", () => {
    expect(getReviewUndoState({ ...acceptedCandidate, status: "rejected", outcomeId: undefined }, [])).toEqual({ allowed: true });
  });
});
