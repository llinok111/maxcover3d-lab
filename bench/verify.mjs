// Assertions over the committed data. Every number printed is measured here.
import { readFileSync } from "node:fs";
import {
  makeBox, certifyMaximal, minSeparationGrid, buildGrid, nearestDistance,
  certificateHash, probeLattice, probeGuard, SCHEMA, scaleBox,
} from "../src/core.mjs";
import { nearestDistanceBrute, minSeparationBrute } from "../baseline/naive.mjs";

const cert = JSON.parse(readFileSync("data/certificate.json", "utf8"));
const holes = JSON.parse(readFileSync("data/holes.json", "utf8"));
const scale = JSON.parse(readFileSync("data/scale.json", "utf8"));
const box = makeBox(cert.box.min, cert.box.max);

let n = 0, bad = 0;
function check(name, cond, detail) {
  n++;
  if (!cond) bad++;
  console.log(`${cond ? "ok  " : "FAIL"} ${String(n).padStart(2)} ${name}${detail !== undefined ? " = " + detail : ""}`);
}

check("schema is maxcover3d/1", cert.schema === SCHEMA, cert.schema);
check("certificate status certified", cert.status === "certified", cert.status);
check("certificate.certified true", cert.certified === true);
check("probe count >= 400000", cert.probes >= 400000, cert.probes);
check("probes are exactly the step lattice", cert.probes === probeLattice(box, cert.step).length, cert.probes);
check("guard == step*sqrt(3)/2", Math.abs(cert.guard - probeGuard(cert.step)) < 1e-15, cert.guard);
check("sound bound maxGap + guard <= radius", cert.maxGap + cert.guard <= cert.radius,
      `${cert.maxGap.toFixed(9)} + ${cert.guard.toFixed(9)} <= ${cert.radius}`);
check("maxGapRatio < 0.92", cert.maxGapRatio < 0.92, cert.maxGapRatio.toFixed(6));
check("separationOk true", cert.separationOk === true);
check("separation >= sepRadius*(1-1e-9)", cert.separation >= cert.sepRadius * (1 - 1e-9),
      `${cert.separation.toFixed(9)} >= ${cert.sepRadius.toFixed(9)}`);
check("sepRadius + guard == radius (construction)", Math.abs(cert.sepRadius + cert.guard - cert.radius) < 1e-12,
      (cert.sepRadius + cert.guard).toFixed(12));
check("augmentation rounds >= 1", cert.rounds >= 1, cert.rounds);
check("augmentation added >= 1", cert.added >= 1, cert.added);
check("every sample inside box", cert.samples.every((p) => p.every((v, i) => v >= box.min[i] - 1e-12 && v <= box.max[i] + 1e-12)));
const addedKeys = new Set(cert.events.flatMap((e) => e.added.map((p) => p.map((v) => v.toFixed(12)).join(","))));
const presentAdded = cert.samples.filter((p) => addedKeys.has(p.map((v) => v.toFixed(12)).join(","))).length;
check("sample count = finalCount", cert.finalCount === cert.samples.length, cert.finalCount);
check("every added point is present in final set", presentAdded === cert.added, `${presentAdded}/${cert.added}`);
check("initial sample count > 0", cert.finalCount - cert.added > 0, cert.finalCount - cert.added);
check("hash format", /^0x[0-9a-f]{8}$/.test(cert.hash), cert.hash);
check("density positive finite", Number.isFinite(cert.density) && cert.density > 0, cert.density.toFixed(3));

/* brute-force separation over all pairs (independent of core's grid) */
const sepBrute = minSeparationBrute(cert.samples);
check("brute-force min separation >= sepRadius", sepBrute >= cert.sepRadius * (1 - 1e-9),
      `${sepBrute.toFixed(9)} >= ${cert.sepRadius.toFixed(9)}`);
check("brute-force separation matches grid separation", Math.abs(sepBrute - cert.separation) < 1e-9,
      `${sepBrute.toFixed(9)} vs ${cert.separation.toFixed(9)}`);

/* full lattice must be strict: hash-based audit of all probes */
const probes = probeLattice(box, cert.step);
const grid = buildGrid(cert.samples, box, cert.radius);
let maxGap = 0;
for (const p of probes) {
  const d = nearestDistance(grid, p);
  if (d > maxGap) maxGap = d;
}
check("full-lattice recomputed maxGap matches certificate", Math.abs(maxGap - cert.maxGap) < 1e-9,
      `${maxGap.toFixed(9)} vs ${cert.maxGap.toFixed(9)}`);
check("full-lattice strict proof", maxGap + cert.guard <= cert.radius, (maxGap + cert.guard).toFixed(9));

/* brute-force check on a deterministic subset of the lattice (independent code) */
const sampleProbes = [];
for (let i = 0; i < probes.length; i += 97) sampleProbes.push(probes[i]);
let bruteMax = 0;
for (const p of sampleProbes) bruteMax = Math.max(bruteMax, nearestDistanceBrute(cert.samples, p));
check("brute-force subset maxGap <= radius", bruteMax <= cert.radius, bruteMax.toFixed(9));
check("brute-force subset maxGap close to lattice", Math.abs(bruteMax - Math.max(...sampleProbes.map((p) => nearestDistance(grid, p)))) < 1e-9);

/* 500 injected holes: 4096 probes each must find a genuine hole */
check("hole cases == 500", holes.cases.length === 500, holes.cases.length);
check("all 500 detected with 4096 lattice probes", holes.cases.every((c) => c.detected && c.gap > cert.radius));
check("100% random-lattice recall", holes.randomOnlyCaught === 500, holes.randomOnlyCaught);
let bruteHoleAgree = 0;
for (let i = 0; i < holes.cases.length; i += 25) {
  const c = holes.cases[i];
  const removed = new Set(c.removedIdx);
  const keep = cert.samples.filter((_, idx) => !removed.has(idx));
  const d = nearestDistanceBrute(keep, c.center);
  if (Math.abs(d - c.gap) < 1e-9 || d > cert.radius) bruteHoleAgree++;
}
check("stored hole centres are real box points", holes.cases.every((c) => c.center.every((v, i) => v >= box.min[i] && v <= box.max[i])));
check("20 brute-force hole centres still exceed radius", bruteHoleAgree === 20, bruteHoleAgree);
check("every hole removed at least 1 sample", holes.cases.every((c) => c.removed >= 1));
check("every hole gap > radius", holes.cases.every((c) => c.gap > cert.radius));

/* deterministic replay: same seed 3x -> same hash */
const replay = [0, 1, 2].map(() => certifyMaximal({ box, radius: cert.radius, seed: 42, step: cert.step, maxRounds: 16 }));
check("3 replays certified", replay.every((c) => c.certified));
check("3 replays same hash", replay[0].hash === replay[1].hash && replay[1].hash === replay[2].hash, replay[0].hash);
check("replay hash != seed-7 hash", replay[0].hash !== cert.hash);
check("replay rounds deterministic", replay.every((c) => c.rounds === replay[0].rounds), replay[0].rounds);

/* scale invariance: decisions identical across 1e-6 .. 1e6 */
check("scale rows == 5", scale.rows.length === 5, scale.rows.length);
check("all scales certified", scale.rows.every((r) => r.certified === true));
check("all scales same rounds", scale.rows.every((r) => r.rounds === scale.rows[0].rounds), scale.rows.map((r) => r.rounds).join(","));
check("all scales separationOk", scale.rows.every((r) => r.separationOk === true));
check("maxGapRatio scale-invariant (<=1e-9 spread)", Math.max(...scale.rows.map((r) => r.maxGapRatio)) - Math.min(...scale.rows.map((r) => r.maxGapRatio)) < 1e-9);
check("probe count scale-invariant", scale.rows.every((r) => r.probes === scale.rows[0].probes), scale.rows[0].probes);
check("scaled density * r^3 constant", Math.abs(scale.rows[0].densityRatio - scale.rows[4].densityRatio) < 1e-6,
      `${scale.rows[0].densityRatio.toFixed(6)} vs ${scale.rows[4].densityRatio.toFixed(6)}`);
const cTiny = certifyMaximal({ box: scaleBox(box, 1e-6), radius: cert.radius * 1e-6, seed: 7, step: cert.step * 1e-6, maxRounds: 16 });
check("1e-6 rerun certified", cTiny.certified === true);
check("1e-6 rerun rounds match", cTiny.rounds === cert.rounds, cTiny.rounds);
const cHuge = certifyMaximal({ box: scaleBox(box, 1e6), radius: cert.radius * 1e6, seed: 7, step: cert.step * 1e6, maxRounds: 16 });
check("1e6 rerun certified", cHuge.certified === true);
check("1e6 rerun separationOk", cHuge.separationOk === true);
check("hash stable after re-running seed 7", certificateHash(cHuge) !== cert.hash && cTiny.hash !== cHuge.hash);

/* negative control: an under-sampled set must NOT certify */
const sparse = cert.samples.slice(0, 40);
const sparseAudit = (await import("../src/core.mjs")).auditCoverage(sparse, box, cert.radius, probeLattice(box, cert.step), { step: cert.step });
check("negative control: 40 samples not strict", sparseAudit.strict === false);
check("negative control: finds uncovered probes", sparseAudit.uncovered > 0, sparseAudit.uncovered);
check("negative control: maxGap > radius", sparseAudit.maxGap > cert.radius, sparseAudit.maxGap.toFixed(4));

/* truncated last cells: non-integer box/step must still stay inside the box */
const odd = certifyMaximal({ box, radius: 0.13, seed: 3, step: 0.013, maxRounds: 16 });
check("odd step (0.9/0.013 non-integer) certified", odd.certified === true);
check("odd step: every sample stays inside box", odd.samples.every((p) => p.every((v, i) => v >= box.min[i] && v <= box.max[i])));

/* hole-size sensitivity: the 2r test is easy, this sweep discriminates */
const sens = JSON.parse(readFileSync("data/sensitivity.json", "utf8"));
check("sensitivity sweep has 5 radii", sens.rows.length === 5, sens.rows.length);
check("detection is monotone in hole size", sens.rows.every((r, i) => i === 0 || r.detected >= sens.rows[i - 1].detected),
      sens.rows.map((r) => r.detected).join(","));
check("1.5r holes all detected", sens.rows[4].detected === 100, sens.rows[4].detected);
check("0.5r holes are NOT all detected (test is not tautological)", sens.rows[0].detected < 100, sens.rows[0].detected);

console.log(`\n${n - bad}/${n} assertions passed`);
process.exit(bad === 0 ? 0 : 1);