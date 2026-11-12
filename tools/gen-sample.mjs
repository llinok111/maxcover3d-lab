// Generates all committed sample data deterministically (fixed seeds).
// node tools/gen-sample.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import {
  makeBox, certifyMaximal, bridsonSample, buildGrid, nearestDistanceSq,
  auditCoverage, createRng, scaleBox, boxVolume, probeLattice,
} from "../src/core.mjs";

mkdirSync("data", { recursive: true });
const box = makeBox([0, 0, 0], [0.9, 0.9, 0.9]);
const radius = 0.12;
const step = radius / 10;

const cert = certifyMaximal({ box, radius, seed: 7, step, maxRounds: 16 });
if (!cert.certified) throw new Error("main certificate failed: " + cert.status);
writeFileSync("data/certificate.json", JSON.stringify(cert));

/* ---- 500 injected holes: remove every sample within 2r of a centre ---- */
const rngHole = createRng(20261112);
const holes = [];
let randomOnlyCaught = 0;
for (let i = 0; i < 500; i++) {
  const center = [
    box.min[0] + 2 * radius + rngHole() * (box.max[0] - box.min[0] - 4 * radius),
    box.min[1] + 2 * radius + rngHole() * (box.max[1] - box.min[1] - 4 * radius),
    box.min[2] + 2 * radius + rngHole() * (box.max[2] - box.min[2] - 4 * radius),
  ];
  const removed = [];
  cert.samples.forEach((p, idx) => {
    const d2 = (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2 + (p[2] - center[2]) ** 2;
    if (d2 <= (2 * radius) ** 2) removed.push(idx);
  });
  if (removed.length === 0) throw new Error("hole " + i + " removed nothing");
  const keep = cert.samples.filter((_, idx) => !removed.includes(idx));
  const grid = buildGrid(keep, box, radius);
  // 4096-cell probe lattice (step = box/16), plus the removed-ball centre.
  const lattice = probeLattice(box, 0.9 / 16);
  const probes = [center, ...lattice];
  let gap = 0;
  let randomMax = 0;
  for (let k = 0; k < probes.length; k++) {
    const d = Math.sqrt(nearestDistanceSq(grid, probes[k]));
    if (d > gap) gap = d;
    if (k > 0 && d > randomMax) randomMax = d;
  }
  const detected = gap > radius;
  if (randomMax > radius) randomOnlyCaught++;
  if (!detected) throw new Error("hole " + i + " not detected");
  holes.push({ center, removed: removed.length, removedIdx: removed, gap, detected, randomMax });
}
writeFileSync("data/holes.json", JSON.stringify({
  radius, step, cases: holes, randomOnlyCaught,
}));

/* ---- sensitivity sweep: the 2r test above is structurally easy, so vary
   the removal radius h and report how often any lattice probe ends up
   farther than r from the surviving set. ---- */
const rngSens = createRng(777);
const latticeSens = probeLattice(box, 0.9 / 16);
const sensitivity = [0.5, 0.75, 1, 1.25, 1.5].map((hFactor) => {
  const h = hFactor * radius;
  let detected = 0;
  let maxGap = 0;
  for (let i = 0; i < 100; i++) {
    const src = cert.samples[Math.floor(rngSens() * cert.samples.length)];
    const center = [
      Math.min(box.max[0] - h, Math.max(box.min[0] + h, src[0] + (rngSens() - 0.5) * h)),
      Math.min(box.max[1] - h, Math.max(box.min[1] + h, src[1] + (rngSens() - 0.5) * h)),
      Math.min(box.max[2] - h, Math.max(box.min[2] + h, src[2] + (rngSens() - 0.5) * h)),
    ];
    const removed = new Set();
    cert.samples.forEach((p, idx) => {
      if ((p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2 + (p[2] - center[2]) ** 2 <= h * h) removed.add(idx);
    });
    const keep = cert.samples.filter((_, idx) => !removed.has(idx));
    const grid = buildGrid(keep, box, radius);
    let gap = 0;
    for (const p of latticeSens) {
      const d = Math.sqrt(nearestDistanceSq(grid, p));
      if (d > gap) gap = d;
    }
    if (gap > radius) detected++;
    if (gap > maxGap) maxGap = gap;
  }
  return { hFactor, h, cases: 100, detected, maxGap };
});
writeFileSync("data/sensitivity.json", JSON.stringify({ radius, rows: sensitivity }, null, 2));

/* ---- scale invariance: same geometry at 1e-6 .. 1e6 ---- */
const scales = [1e-6, 1e-3, 1, 1e3, 1e6];
const scaleRows = scales.map((s) => {
  const c = certifyMaximal({
    box: scaleBox(box, s), radius: radius * s, seed: 7, step: step * s, maxRounds: 16,
  });
  return {
    scale: s, certified: c.certified, status: c.status, rounds: c.rounds,
    added: c.added, separationOk: c.separationOk,
    maxGapRatio: c.maxGapRatio, densityRatio: c.density * (radius * s) ** 3,
    probes: c.probes, hash: c.hash,
  };
});
writeFileSync("data/scale.json", JSON.stringify({ scales, rows: scaleRows, box, radius }, null, 2));

/* ---- deterministic regeneration hash ---- */
console.log(JSON.stringify({
  certificateHash: cert.hash, samples: cert.finalCount, probes: cert.probes,
  rounds: cert.rounds, added: cert.added, maxGapRatio: cert.maxGapRatio,
  density: cert.density, holes: holes.length, randomOnlyCaught,
  scales: scaleRows.map((r) => [r.scale, r.certified, r.rounds]),
}));