import { describe, expect, it } from "vitest";
import { extractCandidates } from "./extractor.js";

describe("competition extractor", () => {
  it("extracts at most three actionable user statements in Chinese and English", () => {
    const result = extractCandidates(
      [
        { role: "user", content: "下一步：整理比赛演示。\n等 Mark 回复时间。\nWe decided to use SQLite.\nNeed to publish the test build." },
      ],
      "Fallback",
    );
    expect(result).toHaveLength(3);
    expect(result.map((item) => item.candidateType)).toEqual(["decision", "open_loop", "open_loop"]);
  });

  it("does not turn assistant suggestions into user commitments", () => {
    const result = extractCandidates(
      [{ role: "assistant", content: "You need to publish this and follow up tomorrow." }],
      "Imported conversation",
    );
    expect(result).toEqual([{ candidateType: "reference", title: "Imported conversation" }]);
  });

  it("ignores completed and negated statements", () => {
    const result = extractCandidates(
      [{ role: "user", content: "已经完成：更新 README。\nNo need to call the API." }],
      "Completed work",
    );
    expect(result).toEqual([{ candidateType: "reference", title: "Completed work" }]);
  });

  it("deduplicates repeated atomic statements", () => {
    const result = extractCandidates(
      [{ role: "user", content: "TODO: Verify backup.\nTODO: Verify backup." }],
      "Fallback",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ candidateType: "open_loop", title: "Verify backup." });
  });

  it("recognizes Chinese decisions without spaces and normalizes width", () => {
    const result = extractCandidates(
      [{ role: "user", content: "决定采用ＳＱＬｉｔｅ。\n决定采用SQLite。" }],
      "Architecture",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.candidateType).toBe("decision");
  });
});
