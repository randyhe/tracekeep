import { describe, expect, it } from "vitest";
import { captureInputSchema, openLoopPatchSchema, restoreInputSchema, reviewActionSchema } from "./index.js";

describe("contracts", () => {
  it("defaults a manual personal capture", () => {
    expect(captureInputSchema.parse({ text: "Remember this" })).toMatchObject({
      sourceType: "manual",
      sensitivity: "personal",
    });
  });

  it("accepts a typed Codex conversation capture", () => {
    expect(captureInputSchema.parse({
      text: "We decided to keep Tracekeep local-first.",
      sourceType: "codex",
      candidateType: "decision",
    })).toMatchObject({ sourceType: "codex", candidateType: "decision" });
  });

  it("requires an actual open-loop update", () => {
    expect(() => openLoopPatchSchema.parse({ expectedVersion: 1 })).toThrow();
  });

  it("requires a versioned target for merge", () => {
    expect(() => reviewActionSchema.parse({ action: "merge", expectedVersion: 1 })).toThrow();
    expect(
      reviewActionSchema.parse({
        action: "merge",
        expectedVersion: 1,
        targetOpenLoopId: "00000000-0000-4000-8000-000000000001",
        targetExpectedVersion: 2,
      }),
    ).toMatchObject({ action: "merge", targetExpectedVersion: 2 });
  });

  it("rejects restore paths", () => {
    expect(() => restoreInputSchema.parse({ backupFileName: "../tracekeep.sqlite", confirmation: "x" })).toThrow();
  });
});
