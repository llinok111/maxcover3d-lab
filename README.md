# maxcover3d-lab

**A 3D Poisson-disk set that proves its own maximality on 421,875 probe cells — and when the proof fails it emits a concrete addable point instead of guessing: 0 uncovered cells, 500/500 injected holes caught, 91 repair points added in 1 round.**

Upstream: none

This is an original tool. `src/core.mjs` is a pure ES module (no three.js, no DOM, no I/O,
no environment variables) and is shared verbatim by Node and the browser.

## What it does

For a box domain and a coverage radius `r`, the library builds a point set that is:

- **r-covered** — every point of the box is within `r` of a sample (this is what "maximal"
  means here, *not* minimum distance), and
- **sep-separated** — every pair of samples is at distance `>= sep = r - guard`.

The certificate is sound, not a heuristic. With cell-centre probes of step `s`, every box
point is within `guard = s·√3/2` of a probe centre `p`; if `d(p, samples) <= maxGap` for all
probes then every box point is within `maxGap + guard` of a sample. So

```
maxGap + guard <= r   ==>   the set is r-maximal
```

The verifier publishes the actual `maxGap`, `guard`, separation, slack and the probe count,
so the inequality can be re-checked by hand.

If the inequality fails, the failure is **constructive**: the violating probe itself is a
domain point at distance `>= sep` from every existing sample, so it can be added without
breaking separation. `certifyMaximal()` adds those points, round by round, and records every
coordinate in the certificate (`events[]`). In the committed run it added **91 points in 1
round** (384 initial → 475 final, 651.58 samples per unit³) and then passed.

## Run it

```bash
node tools/gen-sample.mjs        # deterministic samples (fixed seeds, 4.8 s)
node bench/verify.mjs            # 57 assertions, exit 0
node bench/verify-maximal.mjs    # independent brute-force verifier, no core import
node bench/bench.mjs             # writes bench/result.json (real timings)
```

Browser (three.js `0.169.0`, pinned CDN importmap):

```bash
python3 -m http.server 4173      # then open http://localhost:4173
```

The page re-runs the same `src/core.mjs` live on the radius slider and shows the same
certificate hash that Node prints, plus the repair points in orange.

## Evidence (all measured, see `bench/result.json`)

| Claim | Measured |
|---|---|
| Probe cells in the committed certificate | **421,875** (`step = r/10 = 0.012`) |
| Strict proof | `maxGap 0.109511847 + guard 0.010392305 = 0.119904152 <= r 0.12` |
| Uncovered probes | **0** |
| Separation (brute-force all pairs) | `0.109641803 >= sep 0.109607695` (= 0.9134·r) |
| Constructive repair | **91** points, **1** round; 91/91 present in final set |
| Injections (remove every sample within 2r of a centre) | **500/500** caught with 4,096 lattice probes/case. This is an end-to-end witness test and is structurally easy. |
| **Hole-size sensitivity** (100 cases per radius h, random sample as centre) | h=0.5r: **11/100**, 0.75r: **27/100**, 1.0r: **89/100**, 1.25r: **100/100**, 1.5r: **100/100** |
| Full-lattice audit, 421,875 probes | **209.51 ms** vs brute-force **830.12 ms** → **3.96×** (15 vs 7 repeats, RSD 0.73%) |
| 50,000-probe audit | 50.22 ms vs 100.19 ms → 1.99× (RSD 2.11%) |
| 40,000 nearest queries | 39.16 ms vs 79.61 ms → **2.03×** (RSD 3.63%) |
| Determinism | seed 7 → `0xf4f65939`; seed 42 replayed 3× → `0x94876fd5` |
| Scale invariance | 1e-6, 1e-3, 1, 1e3, 1e6: all certified, same 421,875 probes, same rounds, `maxGap/r` spread `< 1e-9` |

`bench/verify-maximal.mjs` is the independent oracle: it does **not** import `src/core.mjs`;
it re-implements distance, probe generation and augmentation replay, then brute-forces all
421,875 probes against all 475 samples. It passes 10/10.

## Known limitations

- **The proof is discrete, not continuous.** It is sound up to the probe lattice: the guard
  band `s·√3/2 = 0.0103923` is exactly what bridges the lattice to the continuum. A finer
  `step` shrinks the band but raises the probe count as `1/step³`.
- **Separation is 0.9134·r, not r.** `sep = r - guard` by construction; that is what lets
  every violating probe be addable without breaking the separation invariant. Do not cite
  this as an r-separated Poisson-disk set.
- **The committed slack is small** (`0.0000958`, 0.08% of r). The inequality holds, but this
  is a proof at this configuration, not a stability claim under perturbation.
- **Speedup is modest (3.96×), and that is expected**: the committed set has only 475
  samples, so each hash query still touches a handful of candidate points. The brute-force
  comparison is reported on the same 421,875 probes; nothing is extrapolated.
- **Timings move between runs**: the headline full-lattice loop has RSD 0.73% across 15
  repeats (cold 214.75 ms, median 209.51 ms, p95 214.25 ms); smaller loops are noisier.
- **The 500/500 figure is not a sensitivity claim.** Removing a ball of radius 2r
  guarantees a surviving point farther than r from the hole centre; the test exercises the witness
  path end-to-end. The discriminating number is the sweep above: at h<=r detection is partial
  (11/27/89 of 100), which is why the sweep is reported alongside it.
- **No automated headless-browser run.** Browser automation is out of scope in this environment. The
  page is checked statically (HTTP 200 + importmap present) and uses the same module as Node;
  the browser hash display is not asserted by an automated browser.
- Probe lattice uses cell centres; points exactly on the box boundary are covered by the
  guard argument, not by an explicit boundary sample.

## 本轮创新

**失败即证书：把"极大性不成立"变成一个可直接加入的坐标，再由独立 verifier 重放整个补点过程。**
Existing Poisson-disk code (including our earlier `poisson3d-cert`) proves only minimum
distance, which Bridson gives for free; coverage maximality is usually left unstated. Here a
failed probe is a *witness point*, the repair adds exactly that point while preserving the
separation invariant, and `bench/verify-maximal.mjs` replay-checks every addition and
brute-forces the whole 421,875-cell lattice without importing the implementation. That
combination — quantified failure witness + constructive repair + independent replay — is the
new part. Tier **B**.

## License

MIT © 2026 llinok111. See `LICENSE`.