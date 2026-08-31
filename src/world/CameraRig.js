import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp, catmull } from './util.js';

// ═══════════════════════════════════════════════════════════════════════
// THE CAMERA
// Scroll does not fade sections — it flies the camera through one
// continuous world. Every keyframe below is a real position in that world,
// anchored to a section and a fraction of that section's scroll.
// ═══════════════════════════════════════════════════════════════════════

//  sec · f · position · lookAt · fov · fog density · bloom · gold boost
const KEYS = [
  ['hero', 0.00, [-36, 25, 88], [-15, 12, 24], 40, 0.0136, 1.05, 1.00],
  ['hero', 1.00, [-30, 21, 56], [-6, 11, -20], 40, 0.0134, 1.00, 1.00],

  ['s01', 0.00, [-12, 18, 20], [1, 10, -58], 42, 0.0130, 0.98, 1.00],
  ['s01', 0.50, [-24, 15, -74], [0, 10, -132], 44, 0.0124, 0.98, 1.05],
  ['s01', 1.00, [-8, 16, -172], [0, 11, -232], 42, 0.0121, 0.96, 1.05],

  ['s02', 0.32, [32, 17, -216], [0, 13, -272], 38, 0.0115, 0.94, 1.10],
  ['s02', 1.00, [21, 14, -236], [0, 13, -272], 34, 0.0109, 0.88, 1.15],

  ['s03', 0.45, [12.6, 13.4, -247], [0, 13, -272], 28, 0.0104, 0.84, 1.30],
  ['s03', 0.72, [10.5, 12.9, -244], [0, 13.6, -272], 26, 0.0104, 0.86, 1.35],
  ['s03', 1.00, [4, 19, -308], [0, 14, -352], 42, 0.0108, 0.90, 1.10],

  ['s04', 0.50, [-52, 30, -296], [-20, 16, -424], 52, 0.0100, 0.96, 1.05],
  ['s04', 1.00, [-46, 40, -382], [-6, 22, -505], 54, 0.0091, 0.94, 1.00],

  ['s05', 0.50, [0, 61, -472], [0, 45, -626], 58, 0.0075, 0.92, 0.95],
  ['s05', 1.00, [-38, 55, -556], [8, 44, -664], 54, 0.0072, 0.92, 0.95],

  ['s06', 0.50, [-44, 50, -580], [16, 43, -684], 50, 0.0076, 0.98, 1.10],
  ['s06', 1.00, [22, 46, -652], [-10, 39, -744], 46, 0.0081, 0.98, 1.10],

  ['s07', 0.50, [22, 42, -700], [-16, 36, -792], 44, 0.0091, 0.96, 1.05],
  ['s07', 1.00, [-56, 38, -770], [-104, 30, -842], 46, 0.0095, 0.95, 1.05],

  ['s08', 0.18, [-206, 30, -812], [-196, 21, -898], 42, 0.0100, 0.98, 1.15],
  ['s08', 0.50, [0, 30, -812], [0, 21, -898], 42, 0.0100, 0.98, 1.15],
  ['s08', 0.86, [206, 30, -812], [196, 21, -898], 42, 0.0100, 0.98, 1.15],
  ['s08', 1.00, [244, 44, -848], [150, 22, -940], 46, 0.0098, 0.98, 1.10],

  ['live', 0.45, [40, 57, -972], [0, 16, -1052], 52, 0.0094, 1.02, 1.25],
  ['live', 1.00, [0, 76, -1032], [0, 14, -1122], 55, 0.0080, 1.00, 1.20],

  ['final', 0.35, [0, 62, -1064], [0, 34, -1244], 60, 0.0062, 0.98, 1.15],
  ['final', 1.00, [0, 96, -1096], [0, 44, -1404], 68, 0.0048, 1.04, 1.30],
];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.keys = [];

    this.pos = new THREE.Vector3(0, 24, 150);
    this.look = new THREE.Vector3(0, 11, 30);
    this.fov = 40;
    this.fog = 0.019;
    this.bloom = 1;
    this.gold = 1;

    this.tPos = this.pos.clone();
    this.tLook = this.look.clone();

    this.extra = new THREE.Vector3();     // intro dolly, shake, etc.
    this.roll = 0;

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  // Map every keyframe onto a global scroll position using real geometry,
  // so the journey stays in sync however the layout reflows.
  bind(sectionRects, maxScroll) {
    const ms = Math.max(1, maxScroll);
    this.keys = KEYS.map(([sec, f, p, l, fov, fog, bloom, gold]) => {
      const r = sectionRects[sec];
      const t = r ? clamp((r.top + f * Math.max(1, r.travel)) / ms, 0, 1) : 0;
      return { t, p, l, fov, fog, bloom, gold };
    }).sort((a, b) => a.t - b.t);
  }

  sample(t) {
    const K = this.keys;
    if (!K.length) return;

    let i = 0;
    while (i < K.length - 2 && t > K[i + 1].t) i++;

    const k1 = K[i], k2 = K[Math.min(i + 1, K.length - 1)];
    const k0 = K[Math.max(i - 1, 0)], k3 = K[Math.min(i + 2, K.length - 1)];

    const span = Math.max(1e-6, k2.t - k1.t);
    const u = clamp((t - k1.t) / span, 0, 1);
    const e = smoothstep(0, 1, u);

    for (let a = 0; a < 3; a++) {
      this.tPos.setComponent(a, catmull(k0.p[a], k1.p[a], k2.p[a], k3.p[a], u));
      this.tLook.setComponent(a, catmull(k0.l[a], k1.l[a], k2.l[a], k3.l[a], u));
    }
    this.fovT = lerp(k1.fov, k2.fov, e);
    this.fogT = lerp(k1.fog, k2.fog, e);
    this.bloomT = lerp(k1.bloom, k2.bloom, e);
    this.goldT = lerp(k1.gold, k2.gold, e);
  }

  update(dt, t, mouse, time, reduced) {
    this.sample(t);

    // Critically damped follow — scroll proposes, the rig disposes.
    // This is what keeps fast scrolling from feeling like a jump cut.
    const L = reduced ? 9 : 3.4;
    this.pos.x = damp(this.pos.x, this.tPos.x, L, dt);
    this.pos.y = damp(this.pos.y, this.tPos.y, L, dt);
    this.pos.z = damp(this.pos.z, this.tPos.z, L, dt);
    this.look.x = damp(this.look.x, this.tLook.x, L * 1.15, dt);
    this.look.y = damp(this.look.y, this.tLook.y, L * 1.15, dt);
    this.look.z = damp(this.look.z, this.tLook.z, L * 1.15, dt);

    this.fov = damp(this.fov, this.fovT, 3.0, dt);
    this.fog = damp(this.fog, this.fogT, 2.2, dt);
    this.bloom = damp(this.bloom, this.bloomT, 2.4, dt);
    this.gold = damp(this.gold, this.goldT, 2.4, dt);

    // ── handheld life: the shot never sits perfectly still ──
    const amp = reduced ? 0 : 1;
    const dx = (Math.sin(time * 0.11) * 1.7 + Math.sin(time * 0.043) * 1.0) * amp;
    const dy = (Math.cos(time * 0.083) * 0.95 + Math.sin(time * 0.031) * 0.55) * amp;
    const dz = Math.sin(time * 0.067) * 1.25 * amp;

    this._a.copy(this.pos).add(this.extra).add(this._b.set(dx, dy, dz));

    // basis for parallax
    this._fwd.copy(this.look).sub(this._a).normalize();
    this._right.crossVectors(this._fwd, THREE.Object3D.DEFAULT_UP).normalize();
    this._up.crossVectors(this._right, this._fwd).normalize();

    const px = mouse.x * amp, py = mouse.y * amp;
    this._a.addScaledVector(this._right, px * 2.6).addScaledVector(this._up, -py * 1.9);

    this._b.copy(this.look)
      .addScaledVector(this._right, px * 7.5)
      .addScaledVector(this._up, -py * 5.2)
      .addScaledVector(this._fwd, 0);

    this.camera.position.copy(this._a);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._b);

    // a breath of roll — the difference between a render and a shot
    const roll = (Math.sin(time * 0.055) * 0.013 + px * 0.011) * amp;
    this.roll = damp(this.roll, roll, 4, dt);
    this.camera.rotateZ(this.roll);

    if (Math.abs(this.camera.fov - this.fov) > 0.001) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
