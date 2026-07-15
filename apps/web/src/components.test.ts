import { describe, expect, it } from "vitest";
import { formatDate } from "./components";

describe("formatDate", () => {
  it("preserves invalid date labels", () => {
    expect(formatDate("TBD")).toBe("TBD");
  });

  it("formats valid dates for the active locale", () => {
    expect(formatDate("2026-07-15T12:00:00Z")).not.toBe("2026-07-15T12:00:00Z");
  });
});
