// Naive O(n) per-query / O(n^2) baseline. Deliberately simple.
export function nearestDistanceBrute(points, p) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const q = points[i];
    const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

export function minSeparationBrute(points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const d2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

export function auditBrute(samples, probes) {
  let maxGap = 0;
  let sum = 0;
  for (const p of probes) {
    const d = nearestDistanceBrute(samples, p);
    if (d > maxGap) maxGap = d;
    sum += d;
  }
  return { probes: probes.length, maxGap, meanGap: sum / probes.length };
}