import { describe, expect, it } from "vitest";
import { ApiError, isVersionConflict } from "./api";

describe("isVersionConflict", () => {
  it("recognizes HTTP 409 conflicts", () => {
    expect(isVersionConflict(new ApiError("stale", 409))).toBe(true);
  });

  it("recognizes backend version conflict codes", () => {
    expect(isVersionConflict(new ApiError("stale", 400, "VERSION_CONFLICT"))).toBe(true);
  });

  it("does not hide ordinary failures as conflicts", () => {
    expect(isVersionConflict(new ApiError("offline", 503))).toBe(false);
  });
});
