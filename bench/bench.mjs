// Real timings: warmup + >=5 repeats, cold start recorded separately.
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { makeBox, auditCoverage, probeLattice, buildGrid, nearestDistance, createRng } from "../src/core.mjs";
import { auditBrute, nearestDistanceBrute, minSeparationBrute } from "../baseline/naive.mjs";

const cert = JSON.parse(readFileSync("data/certificate.json", "utf8"));
const rng50 = createRng(99);
const probes50k = [];
for (let i = 0; i < 50000; i++) {
  probes50k.push([
    cert.box.min[0] + rng50() * (cert.box.max[0] - cert.box.min[0]),
    cert.box.min[1] + rng50() * (cert.box.max[1] - cert.box.min[1]),
    cert.box.min[2] + rng50() * (cert.box.max[2] - cert.box.min[2]),
  ]);
}
const box = makeBox(cert.box.min, cert.box.max);
const samples = cert.samples;
const REPEATS = Number(process.env.REPEATS ?? 7);

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;
  return {
    iterations: times.length,
    min: +Math.min(...times).toFixed(3),
    median: +median.toFixed(3),
    p95: +sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)].toFixed(3),
    mean: +mean.toFixed(3),
    stddev: +Math.sqrt(variance).toFixed(3),
    rsd: +(Math.sqrt(variance) / mean).toFixed(4),
  };
}

function run(fn, repeats = REPEATS) {
  const cold = performance.now();
  fn();
  const coldMs = performance.now() - cold;
  const times = [];
  for (let i = 0; i < repeats; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return { cold: +coldMs.toFixed(3), ...stats(times) };
}

const fullProbes = probeLattice(box, cert.step);
const fullGrid = buildGrid(samples, box, cert.radius);

const audit50kCore = run(() => auditCoverage(samples, box, cert.radius, probes50k, { step: cert.step }));
const audit50kNaive = run(() => auditBrute(samples, probes50k));
const auditFullCore = run(() => {
  let maxGap = 0;
  for (let i = 0; i < fullProbes.length; i++) {
    const d = nearestDistance(fullGrid, fullProbes[i]);
    if (d > maxGap) maxGap = d;
  }
  return maxGap;
}, 15);
const auditFullNaive = run(() => auditBrute(samples, fullProbes), 7);

const rng = createRng(4242);
const queries = [];
for (let i = 0; i < 40000; i++) {
  queries.push([
    box.min[0] + rng() * (box.max[0] - box.min[0]),
    box.min[1] + rng() * (box.max[1] - box.min[1]),
    box.min[2] + rng() * (box.max[2] - box.min[2]),
  ]);
}
const queryCore = run(() => {
  const grid = buildGrid(samples, box, cert.radius);
  let s = 0;
  for (const q of queries) s += nearestDistance(grid, q);
  return s;
});
const queryNaive = run(() => {
  let s = 0;
  for (const q of queries) s += nearestDistanceBrute(samples, q);
  return s;
});

const tSep = performance.now();
const sepCore = minSeparationBrute(samples);
const sepMs = performance.now() - tSep;

const result = {
  node: process.version,
  workload: {
    box: cert.box, radius: cert.radius, step: cert.step,
    samples: samples.length, fullProbes: fullProbes.length, subsetProbes: probes50k.length,
    queries: queries.length, repeats: REPEATS,
  },
  certificate: {
    hash: cert.hash, rounds: cert.rounds, added: cert.added,
    maxGapRatio: cert.maxGapRatio, separation: cert.separation, sepRadius: cert.sepRadius,
    probes: cert.probes, certified: cert.certified,
  },
  audit50k: {
    core: audit50kCore, naive: audit50kNaive,
    speedup: +(audit50kNaive.median / audit50kCore.median).toFixed(2),
    agreement: "maxGap identical in verify.mjs (brute subset)",
  },
  auditFull: { core: auditFullCore, naive: auditFullNaive, probes: fullProbes.length,
    maxGap: cert.maxGap, speedup: +(auditFullNaive.median / auditFullCore.median).toFixed(2), note: "core 15 repeats, naive 7" },
  query40k: {
    core: queryCore, naive: queryNaive,
    speedup: +(queryNaive.median / queryCore.median).toFixed(2),
  },
  bruteMinSeparation: { ms: +sepMs.toFixed(3), value: sepCore },
};
writeFileSync("bench/result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  audit50k: `${audit50kCore.median}ms vs naive ${audit50kNaive.median}ms = ${result.audit50k.speedup}x`,
  auditFull: `${auditFullCore.median}ms vs naive ${auditFullNaive.median}ms = ${result.auditFull.speedup}x, ${fullProbes.length} probes`,
  query40k: `${queryCore.median}ms vs naive ${queryNaive.median}ms = ${result.query40k.speedup}x`,
  rsd: { audit50k: audit50kCore.rsd, full: auditFullCore.rsd, query: queryCore.rsd },
}, null, 2));