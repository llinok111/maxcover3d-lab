import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeBox, certifyMaximal } from "./src/core.mjs";

const box = makeBox([0, 0, 0], [0.9, 0.9, 0.9]);
let radius = 0.12;
let seed = 7;
let cert = null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a10);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100);
camera.position.set(1.45, 1.15, 1.55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.45, 0.45, 0.45);
controls.enableDamping = true;

const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const boxEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(boxGeo),
  new THREE.LineBasicMaterial({ color: 0x2a3a52 }),
);
boxEdges.position.set(0.45, 0.45, 0.45);
scene.add(boxEdges);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const dir = new THREE.DirectionalLight(0x9fd8ff, 2.0);
dir.position.set(2, 3, 2);
scene.add(dir);

const baseGeo = new THREE.BufferGeometry();
const addedGeo = new THREE.BufferGeometry();
const baseMat = new THREE.PointsMaterial({ color: 0x5fe3ff, size: 0.012, sizeAttenuation: true });
const addedMat = new THREE.PointsMaterial({ color: 0xffa43d, size: 0.018, sizeAttenuation: true });
const basePoints = new THREE.Points(baseGeo, baseMat);
const addedPoints = new THREE.Points(addedGeo, addedMat);
scene.add(basePoints, addedPoints);

const statsEl = document.getElementById("stats");
const setText = (id, text) => (document.getElementById(id).textContent = text);

function rebuild() {
  const t0 = performance.now();
  cert = certifyMaximal({ box, radius, seed, step: radius / 10, maxRounds: 16 });
  const ms = performance.now() - t0;

  const added = new Set(cert.events.flatMap((e) => e.added.map((p) => p.map((v) => v.toFixed(12)).join(","))));
  const base = cert.samples.filter((p) => !added.has(p.map((v) => v.toFixed(12)).join(",")));
  const fill = (geo, pts) => {
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => arr.set(p, i * 3));
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    geo.computeBoundingSphere();
  };
  fill(baseGeo, base);
  fill(addedGeo, cert.samples.filter((p) => added.has(p.map((v) => v.toFixed(12)).join(","))));

  setText("samples", cert.finalCount);
  setText("added", cert.added + " (" + cert.rounds + " round" + (cert.rounds === 1 ? "" : "s") + ")");
  setText("probes", cert.probes.toLocaleString());
  setText("gap", (cert.maxGapRatio * 100).toFixed(3) + "% of r");
  setText("slack", (cert.slack / radius * 100).toFixed(4) + "% of r");
  setText("sep", (cert.separation / cert.radius).toFixed(4) + " r");
  setText("status", cert.certified ? "CERTIFIED" : cert.status.toUpperCase());
  setText("hash", cert.hash);
  setText("ms", ms.toFixed(0) + " ms");
  document.getElementById("status").dataset.certified = String(cert.certified);
}

document.getElementById("radius").addEventListener("input", (e) => {
  radius = Number(e.target.value);
  setText("rlabel", radius.toFixed(3));
  clearTimeout(rebuild._t);
  rebuild._t = setTimeout(rebuild, 120);
});
document.getElementById("reseed").addEventListener("click", () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  rebuild();
});

rebuild();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});