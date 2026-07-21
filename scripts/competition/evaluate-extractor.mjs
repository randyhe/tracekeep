import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalTextSha256, verifyDatasetManifest } from "./evaluation-integrity.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repositoryRoot, process.argv[2] ?? "tests/competition/fixtures/development.json");
const outputPath = process.argv[3] ? assertCompetitionOutput(process.argv[3]) : undefined;
const extractorPath = resolve(repositoryRoot, "apps/tracekeepd/dist/extractor.js");
const { extractCandidates, COMPETITION_EXTRACTOR_VERSION } = await import(pathToFileURL(extractorPath).href);
const fixtureBytes = await readFile(fixturePath);
const dataset = JSON.parse(fixtureBytes.toString("utf8"));
const datasetSha256 = canonicalTextSha256(fixtureBytes);
const manifestIntegrity = await verifyDatasetManifest(fixturePath, dataset, datasetSha256);

const classes = ["open_loop", "decision"];
const totals = Object.fromEntries(classes.map((name) => [name, { tp: 0, fp: 0, fn: 0 }]));
const failures = [];

for (const sample of dataset.samples) {
  const actual = extractCandidates(sample.messages, `Reference ${sample.id}`)
    .filter((item) => item.candidateType !== "reference")
    .map((item) => ({ candidateType: item.candidateType, normalizedIntent: normalize(item.title) }));
  const expected = sample.expected;
  const unmatchedActual = [...actual];
  const unmatchedExpected = [];
  for (const wanted of expected) {
    const index = unmatchedActual.findIndex((item) => item.candidateType === wanted.candidateType && item.normalizedIntent === wanted.normalizedIntent);
    if (index >= 0) {
      totals[wanted.candidateType].tp += 1;
      unmatchedActual.splice(index, 1);
    } else {
      totals[wanted.candidateType].fn += 1;
      unmatchedExpected.push(wanted);
    }
  }
  for (const unexpected of unmatchedActual) totals[unexpected.candidateType].fp += 1;
  if (unmatchedExpected.length || unmatchedActual.length) failures.push({ id: sample.id, expected, actual });
}

const metrics = Object.fromEntries(classes.map((name) => [name, summarize(totals[name])]));
const macroF1 = average(classes.map((name) => metrics[name].f1));
const report = {
  dataset: dataset.dataset,
  datasetSha256,
  integrity: {
    canonicalLineEndings: "LF",
    ...manifestIntegrity,
  },
  extractorVersion: COMPETITION_EXTRACTOR_VERSION,
  sampleCount: dataset.samples.length,
  metrics,
  macroF1,
  thresholds: { openLoopPrecision: 0.85, openLoopRecall: 0.75 },
  passed: metrics.open_loop.precision >= 0.85 && metrics.open_loop.recall >= 0.75,
  failures,
};

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;

function summarize({ tp, fp, fn }) {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return {
    tp, fp, fn, precision, recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    precision95: wilson(tp, tp + fp),
    recall95: wilson(tp, tp + fn),
  };
}

function wilson(successes, trials) {
  if (!trials) return [0, 1];
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0; }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function normalize(value) { return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
function assertCompetitionOutput(path) {
  const target = resolve(repositoryRoot, path);
  const allowed = resolve(repositoryRoot, "work/competition-runs");
  if (target !== allowed && !target.startsWith(`${allowed}\\`) && !target.startsWith(`${allowed}/`)) {
    throw new Error(`Output must stay under ${allowed}`);
  }
  return target;
}
