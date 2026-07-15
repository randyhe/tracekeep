import { describe, expect, it } from "vitest";
import { captureInputSchema, openLoopPatchSchema } from "./index.js";

describe("contracts", () => {
  it("defaults a manual personal capture", () => {
    expect(captureInputSchema.parse({ text: "Remember this" })).toMatchObject({
      sourceType: "manual",
      sensitivity: "personal",
    });
  });

  it("requires an actual open-loop update", () => {
    expect(() => openLoopPatchSchema.parse({ expectedVersion: 1 })).toThrow();
  });
});
