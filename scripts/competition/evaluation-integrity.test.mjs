import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalTextSha256, verifyDatasetManifest } from "./evaluation-integrity.mjs";

test("canonicalTextSha256 produces the same hash for LF and CRLF", () => {
  const lf = "{\n  \"dataset\": \"example\"\n}\n";
  const crlf = lf.replaceAll("\n", "\r\n");

  assert.equal(canonicalTextSha256(lf), canonicalTextSha256(crlf));
});

test("verifyDatasetManifest accepts a canonical hash and rejects a mismatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracekeep-evaluator-"));
  try {
    const fixturePath = join(directory, "holdout-v1.json");
    const content = '{\r\n  "dataset": "example",\r\n  "samples": []\r\n}\r\n';
    const hash = canonicalTextSha256(content);
    await writeFile(fixturePath, content, "utf8");
    await writeFile(
      join(directory, "manifest-v1.json"),
      `${JSON.stringify({ dataset: "example", file: "holdout-v1.json", sha256: hash, sampleCount: 0 })}\n`,
      "utf8",
    );

    const verified = await verifyDatasetManifest(fixturePath, { dataset: "example", samples: [] }, hash);
    assert.deepEqual(verified, { manifestVerified: true, manifest: "manifest-v1.json" });
    await assert.rejects(
      () => verifyDatasetManifest(fixturePath, { dataset: "example", samples: [] }, "invalid"),
      /Frozen dataset manifest mismatch/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
