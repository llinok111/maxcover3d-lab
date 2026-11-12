// Independent maximality verifier.
// Deliberately does NOT import src/core.mjs. It eats only:
//   data/certificate.json  (samples + radius + step + augmentation events)
// and re-derives every claim with its own brute-force code.
import { readFileSync } from "node:fs";

const cert = JSON.parse(readFileSync(new URL("../data/certificate.json", import.meta.url), "utf8"));
const { box, radius, sepRadius, step, samples } = cert;
const guard = (step * Math.sqrt(3)) / 2;

function d2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
function inside(p) {
  return p.every((v, i) => v >= box.min[i] - 1e-12 && v <= box.max[i] + 1e-12);
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? " = " + detail : ""}`);
  if (!ok) failures++;
}

/* 1. replay augmentation: initial = final minus all added points */
const addedAll = cert.events.flatMap((e) => e.added);
const addedKey = new Set(addedAll.map((p) => p.join(",")));
const initial = samples.filter((p) => !addedKey.has(p.join(",")));
check("all event points are in final set", initial.length + addedAll.length === samples.length,
      `${initial.length}+${addedAll.length}=${samples.length}`);

let current = initial.slice();
let minSep = Infinity;
let replayOk = true;
for (const ev of cert.events) {
  for (const p of ev.added) {
    if (!inside(p)) replayOk = false;
    for (const q of current) {
      const d = Math.sqrt(d2(p, q));
      if (d < minSep) minSep = d;
      if (d < sepRadius * (1 - 1e-12)) replayOk = false;
    }
    // added points must lie on the disclosed probe lattice
    const onLattice = p.every((v, i) => {
      const k = (v - box.min[i]) / step - 0.5;
      return Math.abs(k - Math.round(k)) < 1e-9;
    });
    if (!onLattice) replayOk = false;
    current.push(p);
  }
}
check("every augmentation preserved separation and lattice membership", replayOk);
check("replayed set == certificate samples", current.length === samples.length);

/* 2. exact min separation, all pairs (O(n^2), own code) */
let sep = Infinity;
for (let i = 0; i < samples.length; i++) {
  for (let j = i + 1; j < samples.length; j++) {
    const d = Math.sqrt(d2(samples[i], samples[j]));
    if (d < sep) sep = d;
  }
}
check("brute-force separation >= sepRadius", sep >= sepRadius * (1 - 1e-12), sep.toFixed(9));
check("brute-force separation matches certificate", Math.abs(sep - cert.separation) < 1e-9,
      `${sep.toFixed(9)} vs ${cert.separation.toFixed(9)}`);

/* 3. full probe lattice, brute-force nearest over all samples */
const nx = Math.ceil((box.max[0] - box.min[0]) / step);
const ny = Math.ceil((box.max[1] - box.min[1]) / step);
const nz = Math.ceil((box.max[2] - box.min[2]) / step);
let probes = 0, maxGap = 0, uncovered = 0;
for (let i = 0; i < nx; i++) {
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nz; k++) {
      const p = [box.min[0] + (i + 0.5) * step, box.min[1] + (j + 0.5) * step, box.min[2] + (k + 0.5) * step];
      let best = Infinity;
      for (let s = 0; s < samples.length; s++) {
        const dd = d2(p, samples[s]);
        if (dd < best) best = dd;
      }
      const d = Math.sqrt(best);
      if (d > maxGap) maxGap = d;
      if (d > radius) uncovered++;
      probes++;
    }
  }
}
check("probe count matches certificate", probes === cert.probes, probes);
check("brute-force maxGap <= radius - guard (strict proof)", maxGap + guard <= radius,
      `${maxGap.toFixed(9)} + ${guard.toFixed(9)} = ${(maxGap + guard).toFixed(9)} <= ${radius}`);
check("brute-force maxGap matches certificate", Math.abs(maxGap - cert.maxGap) < 1e-9,
      `${maxGap.toFixed(9)} vs ${cert.maxGap.toFixed(9)}`);
check("zero uncovered probes", uncovered === 0, uncovered);
check("density = n / volume", Math.abs(cert.density - samples.length /
      ((box.max[0] - box.min[0]) * (box.max[1] - box.min[1]) * (box.max[2] - box.min[2]))) < 1e-9);

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: independent verifier, ${probes} probes brute-forced, ${samples.length} samples`);
process.exit(failures === 0 ? 0 : 1);