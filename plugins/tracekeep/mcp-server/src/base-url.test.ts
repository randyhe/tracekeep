import { describe, expect, it } from "vitest";
import { resolveTracekeepBaseUrl } from "./base-url.js";

describe("resolveTracekeepBaseUrl", () => {
  it.each([
    [undefined, "http://127.0.0.1:4310"],
    ["http://localhost:4312/", "http://localhost:4312"],
    ["http://127.0.0.1:4399", "http://127.0.0.1:4399"],
  ])("accepts loopback-only HTTP endpoints", (input, expected) => {
    expect(resolveTracekeepBaseUrl(input)).toBe(expected);
  });

  it.each([
    "https://127.0.0.1:4310",
    "http://192.168.1.10:4310",
    "http://example.com:4310",
    "http://localhost:4310/api",
    "http://user:pass@localhost:4310",
  ])("rejects non-local or ambiguous endpoints", (input) => {
    expect(() => resolveTracekeepBaseUrl(input)).toThrow();
  });
});
