import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export function canonicalTextSha256(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const canonicalText = text.replace(/\r\n?/g, "\n");
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

export async function verifyDatasetManifest(fixturePath, dataset, datasetSha256) {
  const fixtureName = basename(fixturePath);
  const match = /^holdout-(.+)\.json$/u.exec(fixtureName);
  if (!match) return { manifestVerified: false };

  const manifestPath = join(dirname(fixturePath), `manifest-${match[1]}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const mismatches = [];

  if (manifest.file !== fixtureName) mismatches.push(`file expected ${manifest.file}, received ${fixtureName}`);
  if (manifest.dataset !== dataset.dataset) mismatches.push(`dataset expected ${manifest.dataset}, received ${dataset.dataset}`);
  if (manifest.sampleCount !== dataset.samples.length) {
    mismatches.push(`sampleCount expected ${manifest.sampleCount}, received ${dataset.samples.length}`);
  }
  if (manifest.sha256 !== datasetSha256) {
    mismatches.push(`sha256 expected ${manifest.sha256}, received ${datasetSha256}`);
  }

  if (mismatches.length) {
    throw new Error(`Frozen dataset manifest mismatch: ${mismatches.join("; ")}`);
  }

  return { manifestVerified: true, manifest: basename(manifestPath) };
}
