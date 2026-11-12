// src/core.mjs — pure ES module. No three, no DOM, no network, no fs, no env.
// Constructive maximality certificates for Poisson-disk point sets in a box.
//
// Definitions (all lengths in the same unit, no absolute epsilon is used as a
// geometric threshold; every tolerance below is derived from `radius`):
//   sep-separated: every pair of samples is at distance >= sepRadius (default r - guard)
//   r-maximal   : every point of the box is within `radius` of some sample
// The certificate below proves r-maximality *up to the probe lattice*:
//   every box point x is within `guard = step*sqrt(3)/2` of a probe centre p,
//   and d(p, samples) <= maxGap, hence d(x, samples) <= maxGap + guard.
// So maxGap + guard <= radius is a sound (sufficient) proof of r-maximality.

export const SCHEMA = "maxcover3d/1";

/* ---------------------------------------------------------------- rng ---- */
export function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- domain ---- */
export function makeBox(min, max) {
  if (min.length !== 3 || max.length !== 3) throw new Error("box needs 3d corners");
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(min[i]) || !Number.isFinite(max[i]) || max[i] <= min[i]) {
      throw new Error("box has invalid extent on axis " + i);
    }
  }
  return { kind: "box", min: min.slice(), max: max.slice() };
}

export function scaleBox(box, s) {
  if (!(s > 0)) throw new Error("scale must be positive");
  return makeBox(box.min.map((v) => v * s), box.max.map((v) => v * s));
}

export function pointInBox(p, box, tol = 0) {
  for (let i = 0; i < 3; i++) {
    if (p[i] < box.min[i] - tol || p[i] > box.max[i] + tol) return false;
  }
  return true;
}

export function boxDiagonal(box) {
  let s = 0;
  for (let i = 0; i < 3; i++) s += (box.max[i] - box.min[i]) ** 2;
  return Math.sqrt(s);
}

export function boxVolume(box) {
  return (box.max[0] - box.min[0]) * (box.max[1] - box.min[1]) * (box.max[2] - box.min[2]);
}

/* ------------------------------------------------------- spatial hash ---- */
function key(ix, iy, iz) {
  // Packed integer key: 12 bits per axis, offset to keep indices positive.
  return (((ix + 2048) & 4095) << 24) | (((iy + 2048) & 4095) << 12) | ((iz + 2048) & 4095);
}

// A uniform hash grid. Cell edge is independent of the query radius; all
// coordinates are relative to box.min so the same code works at any scale.
export function buildGrid(points, box, cellSize) {
  if (!(cellSize > 0)) throw new Error("cellSize must be positive");
  const cells = new Map();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ix = Math.floor((p[0] - box.min[0]) / cellSize);
    const iy = Math.floor((p[1] - box.min[1]) / cellSize);
    const iz = Math.floor((p[2] - box.min[2]) / cellSize);
    const k = key(ix, iy, iz);
    let bucket = cells.get(k);
    if (!bucket) cells.set(k, (bucket = []));
    bucket.push(i);
  }
  const nx = Math.floor((box.max[0] - box.min[0]) / cellSize) + 1;
  const ny = Math.floor((box.max[1] - box.min[1]) / cellSize) + 1;
  const nz = Math.floor((box.max[2] - box.min[2]) / cellSize) + 1;
  return { points, box, cellSize, cells, nx, ny, nz };
}

// Nearest squared distance from p to every point in the grid. Expanding
// Chebyshev rings; stops once no point in the next ring can be closer.
export function nearestDistanceSq(grid, p) {
  const { box, cellSize, cells, nx, ny, nz } = grid;
  const ix = Math.floor((p[0] - box.min[0]) / cellSize);
  const iy = Math.floor((p[1] - box.min[1]) / cellSize);
  const iz = Math.floor((p[2] - box.min[2]) / cellSize);
  let best = Infinity;
  // Fast path: if a point exists within the 3x3x3 neighbourhood and is closer
  // than one cell edge, it is the exact nearest (ring-2 cells start at 1 cell).
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = cells.get(key(ix + dx, iy + dy, iz + dz));
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n++) {
          const q = grid.points[bucket[n]];
          const ddx = q[0] - p[0];
          const ddy = q[1] - p[1];
          const ddz = q[2] - p[2];
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d2 < best) best = d2;
        }
      }
    }
  }
  if (best < cellSize * cellSize) return best;
  const maxRing = Math.max(nx, ny, nz) + 1;
  for (let ring = 2; ring <= maxRing; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) continue;
          const bucket = cells.get(key(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (let n = 0; n < bucket.length; n++) {
            const q = grid.points[bucket[n]];
            const ddx = q[0] - p[0];
            const ddy = q[1] - p[1];
            const ddz = q[2] - p[2];
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 < best) best = d2;
          }
        }
      }
    }
    if (best < Infinity && best <= (ring * cellSize) ** 2) break;
  }
  return best;
}

export function nearestDistance(grid, p) {
  return Math.sqrt(nearestDistanceSq(grid, p));
}

export function minSeparationGrid(points, box, cellSize) {
  const grid = buildGrid(points, box, cellSize);
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ix = Math.floor((p[0] - box.min[0]) / cellSize);
    const iy = Math.floor((p[1] - box.min[1]) / cellSize);
    const iz = Math.floor((p[2] - box.min[2]) / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.cells.get(key(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (let a = 0; a < bucket.length; a++) {
            const j = bucket[a];
            if (j <= i) continue;
            const q = points[j];
            const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
            if (d2 < best) best = d2;
          }
        }
      }
    }
  }
  return Math.sqrt(best);
}

/* ------------------------------------------------------------ sampling ---- */
// Bridson-style 3D dart throwing. Returns samples with separation >= radius.
export function bridsonSample(box, radius, seed, attempts = 30) {
  const rng = createRng(seed);
  const cell = radius / Math.sqrt(3);
  const samples = [];
  const grid = buildGrid(samples, box, cell);
  const active = [];

  function farEnough(p) {
    const d2 = nearestDistanceSq(grid, p);
    return d2 >= radius * radius * (1 - 1e-12);
  }
  function add(p) {
    const ix = Math.floor((p[0] - box.min[0]) / cell);
    const iy = Math.floor((p[1] - box.min[1]) / cell);
    const iz = Math.floor((p[2] - box.min[2]) / cell);
    const k = key(ix, iy, iz);
    let bucket = grid.cells.get(k);
    if (!bucket) grid.cells.set(k, (bucket = []));
    bucket.push(samples.length);
    samples.push(p);
    active.push(samples.length - 1);
  }

  add([box.min[0] + rng() * (box.max[0] - box.min[0]),
       box.min[1] + rng() * (box.max[1] - box.min[1]),
       box.min[2] + rng() * (box.max[2] - box.min[2])]);

  while (active.length > 0) {
    const pick = Math.floor(rng() * active.length);
    const origin = samples[active[pick]];
    let placed = false;
    for (let k = 0; k < attempts; k++) {
      // uniform direction on the sphere
      const u = 2 * rng() - 1;
      const phi = 2 * Math.PI * rng();
      const s = Math.sqrt(1 - u * u);
      const len = radius * (1 + rng());
      const p = [
        origin[0] + len * s * Math.cos(phi),
        origin[1] + len * s * Math.sin(phi),
        origin[2] + len * u,
      ];
      if (!pointInBox(p, box)) continue;
      if (farEnough(p)) {
        add(p);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const last = active.length - 1;
      active[pick] = active[last];
      active.pop();
    }
  }
  return samples;
}

/* -------------------------------------------------------------- probes ---- */
// Cell-centre probe lattice. Every box point is at distance <= step*sqrt(3)/2
// from a probe centre (cell centres tile the box).
export function probeLattice(box, step) {
  if (!(step > 0)) throw new Error("step must be positive");
  const nx = Math.max(1, Math.ceil((box.max[0] - box.min[0]) / step));
  const ny = Math.max(1, Math.ceil((box.max[1] - box.min[1]) / step));
  const nz = Math.max(1, Math.ceil((box.max[2] - box.min[2]) / step));
  const probes = new Array(nx * ny * nz);
  let n = 0;
  // Cell centres. The last cell on each axis may be truncated by the box;
  // use the centre of the truncated interval so every probe stays inside the
  // box while the half-diagonal bound (<= step*sqrt(3)/2) is preserved.
  const centre = (min, max, i, n) => {
    const start = min + i * step;
    if (i === n - 1 && start + step > max) return (start + max) / 2;
    return start + step / 2;
  };
  for (let i = 0; i < nx; i++) {
    const x = centre(box.min[0], box.max[0], i, nx);
    for (let j = 0; j < ny; j++) {
      const y = centre(box.min[1], box.max[1], j, ny);
      for (let k = 0; k < nz; k++) {
        const z = centre(box.min[2], box.max[2], k, nz);
        probes[n++] = [x, y, z];
      }
    }
  }
  probes.length = n;
  return probes;
}

/* --------------------------------------------------------------- audit ---- */
export function probeGuard(step) {
  return (step * Math.sqrt(3)) / 2;
}

// One pass over the probe lattice. `witnessLimit` bounds the returned list;
// all violating probes are counted, only `witnessLimit` are materialised.
export function auditCoverage(samples, box, radius, probes, opts = {}) {
  const step = opts.step ?? inferStep(probes, box);
  const guard = probeGuard(step);
  const threshold = radius - guard;
  const grid = buildGrid(samples, box, radius);
  const witnessLimit = opts.witnessLimit ?? 8;
  const collect = opts.collect === true;
  const witnesses = [];
  let maxGap = 0;
  let sum = 0;
  let sumSq = 0;
  let uncovered = 0;
  let violations = 0;
  let argmax = null;
  for (let i = 0; i < probes.length; i++) {
    const d = Math.sqrt(nearestDistanceSq(grid, probes[i]));
    if (d > maxGap) { maxGap = d; argmax = probes[i]; }
    if (d > radius) uncovered++;
    if (d > threshold) {
      violations++;
      if (collect) witnesses.push({ p: probes[i], gap: d });
      else if (witnesses.length < witnessLimit) witnesses.push({ p: probes[i], gap: d });
    }
    sum += d;
    sumSq += d * d;
  }
  return {
    probes: probes.length,
    step,
    guard,
    threshold,
    radius,
    maxGap,
    argmax,
    meanGap: sum / probes.length,
    rmsGap: Math.sqrt(sumSq / probes.length),
    uncovered,
    violations,
    witnesses,
    strict: maxGap + guard <= radius,
  };
}

function inferStep(probes, box) {
  if (probes.length < 2) return boxDiagonal(box);
  const n = Math.round(Math.cbrt(probes.length));
  const approx = box.max[0] - box.min[0];
  return n > 0 ? approx / n : approx;
}

/* ------------------------------------------------------- certification ---- */
// Certify, and when the probe lattice finds a gap, add points *at the gap*
// while preserving separation >= radius. Every added point is a genuine
// domain point at distance >= radius from all previous points, so the
// separation invariant is preserved by construction.
export function certifyMaximal(opts) {
  const {
    box,
    radius,
    seed = 1,
    step = radius / 10,
    maxRounds = 48,
    batch = 4000,
    attempts = 30,
    initialSamples,
  } = opts;
  if (!(radius > 0)) throw new Error("radius must be positive");
  if (!(step > 0)) throw new Error("step must be positive");
  // Two radii, both disclosed: coverage radius `radius` and the achieved
  // separation `sepRadius`. sepRadius is chosen just below radius - guard so
  // every probe that violates the strict coverage bound is addable without
  // breaking separation. This is what makes augmentation constructive.
  const guard = probeGuard(step);
  const sepRadius = opts.sepRadius ?? radius * (1 - guard / radius) * (1 - 1e-12);
  if (!(sepRadius > 0 && sepRadius <= radius)) throw new Error("sepRadius must be in (0, radius]");

  const probes = probeLattice(box, step);
  let samples = (initialSamples ?? bridsonSample(box, sepRadius, seed, attempts)).map((p) => p.slice());
  const events = [];
  let audit = auditCoverage(samples, box, radius, probes, { step, collect: true, witnessLimit: 12 });
  let status = audit.strict ? "certified" : "uncertified";

  for (let round = 1; round <= maxRounds && status === "uncertified"; round++) {
    const candidates = audit.witnesses.filter((w) => w.gap >= sepRadius).sort((a, b) => b.gap - a.gap);
    const picked = [];
    const pickPoints = samples.slice();
    const pickGrid = buildGrid(pickPoints, box, sepRadius);
    for (const c of candidates) {
      if (picked.length >= batch) break;
      if (nearestDistanceSq(pickGrid, c.p) >= sepRadius * sepRadius * (1 - 1e-12)) {
        pushedInsert(pickGrid, c.p, box, sepRadius);
        picked.push(c.p);
      }
    }
    if (picked.length === 0) {
      status = "no-safe-augmentation";
      break;
    }
    const before = audit.maxGap;
    samples = samples.concat(picked);
    events.push({ round, before, candidates: candidates.length, added: picked.map((p) => p.slice()) });
    audit = auditCoverage(samples, box, radius, probes, { step, collect: true, witnessLimit: 12 });
    status = audit.strict ? "certified" : "uncertified";
  }

  const minSep = minSeparationGrid(samples, box, sepRadius);
  const separationOk = minSep >= sepRadius * (1 - 1e-9);
  const certificate = {
    schema: SCHEMA,
    box: { min: box.min.slice(), max: box.max.slice() },
    radius,
    sepRadius,
    step,
    guard,
    seed,
    separation: minSep,
    separationOk,
    probes: audit.probes,
    maxGap: audit.maxGap,
    maxGapRatio: audit.maxGap / radius,
    meanGapRatio: audit.meanGap / radius,
    uncoveredProbes: audit.uncovered,
    slack: radius - (audit.maxGap + audit.guard),
    rounds: events.length,
    added: events.reduce((n, e) => n + e.added.length, 0),
    finalCount: samples.length,
    density: samples.length / boxVolume(box),
    status,
    certified: status === "certified" && separationOk,
    events,
    samples,
    hash: "",
  };
  certificate.hash = certificateHash(certificate);
  return certificate;
}

function pushedInsert(grid, p, box, cellSize) {
  const ix = Math.floor((p[0] - box.min[0]) / cellSize);
  const iy = Math.floor((p[1] - box.min[1]) / cellSize);
  const iz = Math.floor((p[2] - box.min[2]) / cellSize);
  const k = key(ix, iy, iz);
  let bucket = grid.cells.get(k);
  if (!bucket) grid.cells.set(k, (bucket = []));
  bucket.push(grid.points.length);
  grid.points.push(p);
}

/* ---------------------------------------------------------------- hash ---- */
// FNV-1a 32-bit over a canonical string. Same input => same hash in any JS
// engine because the string is built from numbers rounded to 1e-12.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function certificateHash(cert) {
  const q = (v) => Math.round(v * 1e12) / 1e12;
  const payload = {
    schema: cert.schema,
    box: cert.box,
    radius: q(cert.radius),
    step: q(cert.step),
    seed: cert.seed,
    status: cert.status,
    certified: cert.certified,
    samples: cert.samples.map((p) => p.map(q)),
    events: cert.events.map((e) => ({ round: e.round, added: e.added.map((p) => p.map(q)) })),
  };
  return "0x" + fnv1a(JSON.stringify(payload)).toString(16).padStart(8, "0");
}

/* ----------------------------------------------------------- scale test ---- */
export function scalePointSet(points, s) {
  return points.map((p) => p.map((v) => v * s));
}

export function decisionOf(cert) {
  return {
    certified: cert.certified,
    status: cert.status,
    separationOk: cert.separationOk,
    rounds: cert.rounds,
  };
}