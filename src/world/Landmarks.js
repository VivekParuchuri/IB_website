import * as THREE from 'three';
import { FOG } from './glsl.js';
import { PAL } from './palette.js';
import { LANDMARKS } from './layout.js';
import { Structure, makeCircuitMaterial, makeShellMaterial } from './CircuitBlock.js';
import { damp } from './util.js';

// ═══════════════════════════════════════════════════════════════════════
// LANDMARKS
// The fixed structures the camera travels between. Everything here shares
// the world's fog uniforms, so a landmark never looks pasted on top of the
// environment — it is lit by the same atmosphere.
// ═══════════════════════════════════════════════════════════════════════

const BEAM_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uBreak, uActive, uFlowSeed;
uniform vec3 uGold, uGoldHi, uRed;
varying vec2 vUv;
varying vec3 vW;
${FOG}
void main(){
  float u = vUv.y;
  float across = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.1, 1.0, across);

  float energy = 0.0;
  for (int i = 0; i < 2; i++){
    float head = fract(uTime * (0.26 + 0.12 * float(i)) + uFlowSeed + float(i) * 0.5);
    energy += exp(-pow((u - head) / 0.09, 2.0));
  }

  vec3 col = uGold * (0.18 + energy * 0.8) + uGoldHi * energy * core * 1.05;
  float a = (0.13 + energy * 0.95) * core * (0.45 + 0.55 * uActive);

  if (uBreak > 0.001){
    float dash = step(0.5, fract(u * 16.0 - uTime * 0.6));
    col = mix(col, uRed * (0.5 + dash * 1.3), uBreak);
    a = mix(a, a * dash * 0.55 + 0.06 * dash, uBreak);
  }

  a *= fogAlpha(distance(cameraPosition, vW));
  gl_FragColor = vec4(col, a);
}
`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// A data ring: a dim gold circumference with a bright arc sweeping it.
// The generic glow shell read as lens scratches on a near-edge-on torus.
const RING_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uActivate, uSpin, uSeed;
uniform vec3 uGold, uGoldHi;
varying vec2 vUv;
varying vec3 vW;
${FOG}
void main(){
  float a0 = vUv.x;                       // 0..1 around the ring
  float head = fract(uTime * uSpin + uSeed);
  float d = abs(fract(a0 - head + 0.5) - 0.5);
  float arc = exp(-pow(d / 0.055, 2.0));
  float ticks = step(0.72, fract(a0 * 64.0));

  vec3 col = uGold * (0.30 + ticks * 0.35) + uGoldHi * arc * 1.9;
  float a = (0.16 + ticks * 0.12 + arc * 1.1) * (0.35 + 0.65 * uActivate);
  a *= fogAlpha(distance(cameraPosition, vW));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

function makeRingMaterial(fogU, coreU, spin, seed) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: RING_FRAG,
    uniforms: {
      uTime: fogU.uTime,
      uActivate: coreU.uActivate,
      uFogDensity: fogU.uFogDensity,
      uFogColor: fogU.uFogColor,
      uFogFar: fogU.uFogFar,
      uSpin: { value: spin },
      uSeed: { value: seed },
      uGold: { value: PAL.gold.clone() },
      uGoldHi: { value: PAL.goldHi.clone() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);

export class Beam {
  constructor(scene, fogU, seed = 0) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uTime: fogU.uTime,
        uFogDensity: fogU.uFogDensity,
        uFogColor: fogU.uFogColor,
        uFogFar: fogU.uFogFar,
        uBreak: { value: 0 },
        uActive: { value: 1 },
        uFlowSeed: { value: seed },
        uGold: { value: PAL.gold.clone() },
        uGoldHi: { value: PAL.goldHi.clone() },
        uRed: { value: PAL.red.clone() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(BEAM_GEO, this.material);
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  set(a, b, radius = 0.34) {
    this._d.subVectors(b, a);
    const len = this._d.length();
    this.mesh.position.copy(a).addScaledVector(this._d, 0.5);
    this._q.setFromUnitVectors(UP, this._d.normalize());
    this.mesh.quaternion.copy(this._q);
    this.mesh.scale.set(radius, len, radius);
  }

  dispose() { this.material.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════

export class Landmarks {
  constructor(scene, fogU, quality, rng) {
    this.scene = scene;
    this.fogU = fogU;
    this.hoverables = [];
    this.t = 0;

    const boxGeo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    this.boxGeo = boxGeo;

    // ── HERO: the glowing block the camera first moves toward ──────────
    this.hero = new Structure(scene, boxGeo, fogU, {
      position: new THREE.Vector3(LANDMARKS.hero.x, 9, LANDMARKS.hero.z),
      scale: new THREE.Vector3(15, 15, 15),
      density: 8,
      seed: 0.21,
      activate: 1,
    });
    this.hero.group.rotation.y = 0.42;
    this.hoverables.push({ mesh: this.hero.mesh, s: this.hero, label: 'GENESIS' });

    this.heroSats = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const r = 26 + rng() * 12;
      const s = new Structure(scene, boxGeo, fogU, {
        position: new THREE.Vector3(
          LANDMARKS.hero.x + Math.cos(a) * r,
          4 + rng() * 9,
          LANDMARKS.hero.z + Math.sin(a) * r * 0.75
        ),
        scale: new THREE.Vector3(3.4 + rng() * 2.6, 3.4 + rng() * 3.4, 3.4 + rng() * 2.6),
        density: 6,
        seed: rng(),
        activate: 0.35,
        shell: false,
      });
      s.group.rotation.y = rng() * Math.PI;
      this.heroSats.push(s);
    }

    // ── 01 LEDGER HUB: one important block, several connected ──────────
    const L1 = LANDMARKS.ledger;
    this.ledger = new Structure(scene, boxGeo, fogU, {
      position: new THREE.Vector3(L1.x, 11, L1.z),
      scale: new THREE.Vector3(13, 13, 13),
      density: 8,
      seed: 0.63,
      activate: 0,
    });
    this.hoverables.push({ mesh: this.ledger.mesh, s: this.ledger, label: 'LEDGER' });

    this.ledgerSats = [];
    this.ledgerBeams = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.7;
      const r = 34 + rng() * 10;
      const pos = new THREE.Vector3(L1.x + Math.cos(a) * r, 6 + rng() * 12, L1.z + Math.sin(a) * r * 0.8);
      const s = new Structure(scene, boxGeo, fogU, {
        position: pos,
        scale: new THREE.Vector3(5 + rng() * 3, 5 + rng() * 4, 5 + rng() * 3),
        density: 6,
        seed: rng(),
        activate: 0,
        shell: false,
      });
      s.group.rotation.y = rng() * Math.PI;
      this.ledgerSats.push(s);
      this.hoverables.push({ mesh: s.mesh, s, label: 'NODE' });

      const beam = new Beam(scene, fogU, rng());
      beam.set(new THREE.Vector3(L1.x, 11, L1.z), pos.clone(), 0.22);
      this.ledgerBeams.push(beam);
    }

    // ── 02/03 ANATOMY: the block the camera flies into ─────────────────
    const L2 = LANDMARKS.anatomy;
    this.anatomy = new Structure(scene, boxGeo, fogU, {
      position: new THREE.Vector3(L2.x, 13, L2.z),
      scale: new THREE.Vector3(26, 26, 26),
      density: 11,
      seed: 0.11,
      activate: 0,
    });
    this.hoverables.push({ mesh: this.anatomy.mesh, s: this.anatomy, label: 'BLOCK #10245' });

    // data rings orbiting the anatomy block — the holographic readout in 3D
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.TorusGeometry(1, 0.006 + i * 0.003, 6, 160);
      const mat = makeRingMaterial(fogU, this.anatomy.material.uniforms,
        (0.06 + rng() * 0.09) * (i % 2 ? -1 : 1), rng());
      const m = new THREE.Mesh(geo, mat);
      m.position.set(L2.x, 13, L2.z);
      m.scale.setScalar(25 + i * 7);
      m.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.6;
      m.rotation.y = rng() * Math.PI;
      m.renderOrder = 6;
      scene.add(m);
      this.rings.push({ mesh: m, geo, mat, speed: (0.05 + rng() * 0.08) * (i % 2 ? -1 : 1) });
    }

    // ── 04 THE CHAIN: five blocks, four cryptographic links ────────────
    const L4 = LANDMARKS.chain;
    this.chain = [];
    this.chainBeams = [];
    // The chain runs diagonally away from the camera rather than flat across
    // it: five blocks perpendicular to the lens overflow any usable frame.
    const spread = 20, depth = 15;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * spread;
      const z = L4.z + (i - 2) * depth;
      const s = new Structure(scene, boxGeo, fogU, {
        position: new THREE.Vector3(L4.x + x, 15, z),
        scale: new THREE.Vector3(13, 13, 13),
        density: 8,
        seed: 0.17 + i * 0.19,
        activate: 0,
      });
      s.group.rotation.y = 0.2 + i * 0.06;
      this.chain.push(s);
      this.hoverables.push({ mesh: s.mesh, s, label: `BLOCK 0${i + 1}` });
      if (i > 0) {
        // link runs from the face of the previous block to the face of this one
        const a = new THREE.Vector3(L4.x + (i - 3) * spread, 15, L4.z + (i - 3) * depth);
        const b = new THREE.Vector3(L4.x + x, 15, z);
        const dir = b.clone().sub(a).normalize();
        const beam = new Beam(scene, fogU, i * 0.27);
        beam.set(a.addScaledVector(dir, 6.6), b.addScaledVector(dir, -6.6), 0.42);
        this.chainBeams.push(beam);
      }
    }

    // ── 08 APPLICATIONS: five distinct forms in the landscape ──────────
    this.apps = buildApplications(scene, fogU, rng);
    for (const a of this.apps) this.hoverables.push({ mesh: a.primary, s: a, label: a.label });

    this.state = {
      heroA: 1, ledgerA: 0, anatomyA: 0, chainA: 0, tamper: 0, appIndex: 0, appsA: 0,
    };
  }

  // ── per-frame ───────────────────────────────────────────────────────
  update(dt, t, s) {
    this.t = t;

    // hero cluster: always alive, gently turning
    this.hero.group.rotation.y += dt * 0.06;
    this.hero.u.uActivate.value = damp(this.hero.u.uActivate.value, s.heroA, 2.5, dt);
    for (let i = 0; i < this.heroSats.length; i++) {
      const sat = this.heroSats[i];
      sat.group.rotation.y += dt * (0.05 + i * 0.012);
      sat.group.position.y += Math.sin(t * 0.5 + i) * dt * 0.6;
    }

    // ledger hub
    this.ledger.group.rotation.y += dt * 0.08;
    this.ledger.u.uActivate.value = damp(this.ledger.u.uActivate.value, s.ledgerA, 2.2, dt);
    for (let i = 0; i < this.ledgerSats.length; i++) {
      const sat = this.ledgerSats[i];
      sat.group.rotation.y -= dt * 0.05;
      sat.u.uActivate.value = damp(sat.u.uActivate.value, s.ledgerA * 0.75, 2.0, dt);
      this.ledgerBeams[i].material.uniforms.uActive.value = s.ledgerA;
    }

    // anatomy block — the slow hero rotation of section 02
    this.anatomy.group.rotation.y += dt * 0.075;
    this.anatomy.group.rotation.x = Math.sin(t * 0.13) * 0.05;
    this.anatomy.u.uActivate.value = damp(this.anatomy.u.uActivate.value, s.anatomyA, 2.0, dt);
    for (const r of this.rings) {
      r.mesh.rotation.z += dt * r.speed;
      r.mesh.rotation.y += dt * r.speed * 0.4;
    }

    // the chain and its tamper failure
    for (let i = 0; i < this.chain.length; i++) {
      const b = this.chain[i];
      b.group.rotation.y += dt * (0.05 + i * 0.008);
      b.u.uActivate.value = damp(b.u.uActivate.value, s.chainA, 2.0, dt);
      // block 03 is the one that gets altered; everything after it is invalidated
      const target = i === 2 ? s.tamper : i > 2 ? s.tamper * 0.42 : 0;
      b.u.uTamper.value = damp(b.u.uTamper.value, target, 3.4, dt);
      if (i === 2 && s.tamper > 0.01) {
        b.group.position.y = 15 + Math.sin(t * 17) * 0.5 * s.tamper;
        b.group.rotation.z = Math.sin(t * 13) * 0.05 * s.tamper;
      } else if (i === 2) {
        b.group.position.y = damp(b.group.position.y, 15, 4, dt);
        b.group.rotation.z = damp(b.group.rotation.z, 0, 4, dt);
      }
    }
    for (let i = 0; i < this.chainBeams.length; i++) {
      const bm = this.chainBeams[i].material.uniforms;
      bm.uActive.value = s.chainA;
      bm.uBreak.value = damp(bm.uBreak.value, i >= 2 ? s.tamper : 0, 3.2, dt);
    }

    // applications light up as the camera arrives at each
    for (let i = 0; i < this.apps.length; i++) {
      const app = this.apps[i];
      const near = 1 - Math.min(1, Math.abs(i - s.appIndex));
      app.u.uActivate.value = damp(app.u.uActivate.value, (0.28 + 0.72 * near) * s.appsA, 2.4, dt);
      app.group.rotation.y += dt * app.spin;
      app.group.position.y = app.baseY + Math.sin(t * 0.45 + i * 1.3) * 1.4;
      for (const sub of app.subs) sub.tick(dt, t);
    }

    // hover falls off smoothly everywhere
    for (const h of this.hoverables) {
      const u = h.s.u ?? h.s.material?.uniforms;
      if (u) u.uHover.value = damp(u.uHover.value, h.s.hoverTarget ?? 0, 5, dt);
    }
  }

  dispose() {
    this.boxGeo.dispose();
    for (const r of this.rings) { r.geo.dispose(); r.mat.dispose(); }
    for (const s of [this.hero, this.ledger, this.anatomy, ...this.heroSats, ...this.ledgerSats, ...this.chain]) {
      s.dispose();
    }
    for (const b of [...this.ledgerBeams, ...this.chainBeams]) b.dispose();
    for (const a of this.apps) {
      a.material.dispose();
      a.shellMat.dispose();
      for (const g of a.geos) g.dispose();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FIVE APPLICATION FORMS — each a different structure inside the world
// ═══════════════════════════════════════════════════════════════════════

function buildApplications(scene, fogU, rng) {
  const L = LANDMARKS.apps;
  const XS = [-200, -100, 0, 100, 200];
  const LABELS = ['FINANCE', 'SUPPLY CHAIN', 'DIGITAL IDENTITY', 'SMART CONTRACTS', 'DIGITAL ASSETS'];
  const out = [];

  for (let i = 0; i < 5; i++) {
    // Triplanar traces smear on curvature, so the rounded forms carry a much
    // finer grid than the slab-shaped ones.
    const DENSITY = [9, 9, 16, 16, 12];
    const mat = makeCircuitMaterial(fogU, { density: DENSITY[i], seed: 0.13 + i * 0.31, activate: 0 });
    const shellMat = makeShellMaterial(fogU, mat.uniforms);
    const group = new THREE.Group();
    const baseY = 20;
    group.position.set(L.x + XS[i], baseY, L.z);
    scene.add(group);

    const geos = new Set();
    const subs = [];
    let primary = null;

    const add = (geo, pos, scale, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      if (scale) m.scale.copy(scale);
      if (rot) m.rotation.copy(rot);
      group.add(m);
      geos.add(geo);
      if (!primary) primary = m;
      return m;
    };

    if (i === 0) {
      // FINANCE — a tower of settled ledgers
      for (let k = 0; k < 5; k++) {
        const s = 15 - k * 2.1;
        const m = add(new THREE.BoxGeometry(1, 1, 1),
          new THREE.Vector3(0, -10 + k * 4.6, 0),
          new THREE.Vector3(s, 3.2, s),
          new THREE.Euler(0, k * 0.16, 0));
        subs.push({ tick: (dt, t) => { m.rotation.y += dt * 0.10 * (k % 2 ? -1 : 1); } });
      }
    } else if (i === 1) {
      // SUPPLY CHAIN — a traced route of linked containers
      for (let k = 0; k < 7; k++) {
        const a = (k / 6 - 0.5) * 2.3;
        const m = add(new THREE.BoxGeometry(1, 1, 1),
          new THREE.Vector3(Math.sin(a) * 17, Math.cos(a) * 9 - 6, Math.cos(a * 1.7) * 5),
          new THREE.Vector3(5.4, 5.4, 8.2),
          new THREE.Euler(0, a * 0.8, a * 0.2));
        subs.push({ tick: (dt, t) => { m.position.y += Math.sin(t * 1.1 + k) * dt * 1.4; } });
      }
    } else if (i === 2) {
      // DIGITAL IDENTITY — a credential: portrait panel, data lines, and a
      // verification ring that keeps turning against it
      const box = new THREE.BoxGeometry(1, 1, 1);
      add(box, new THREE.Vector3(0, 0, 0), new THREE.Vector3(19, 25, 1.6));           // card
      add(box, new THREE.Vector3(-5, 6, 1.1), new THREE.Vector3(7.5, 8.5, 0.7));      // portrait
      add(box, new THREE.Vector3(5.5, 2.6, 1.1), new THREE.Vector3(4.6, 3.2, 0.7));   // chip
      for (let k = 0; k < 4; k++) {
        add(box, new THREE.Vector3(-1.4 - k * 0.9, -4.4 - k * 2.6, 1.1),
          new THREE.Vector3(12.4 - k * 1.8, 0.85, 0.6));                              // data lines
      }
      const ring = add(new THREE.TorusGeometry(1, 0.09, 6, 64),
        new THREE.Vector3(6.4, -8.6, 2.2), new THREE.Vector3(5.6, 5.6, 5.6));         // verified
      subs.push({ tick: (dt) => { ring.rotation.z += dt * 0.7; } });

    } else if (i === 3) {
      // SMART CONTRACTS — a signed document driving a pair of meshed gears:
      // an agreement that executes itself
      const box = new THREE.BoxGeometry(1, 1, 1);
      add(box, new THREE.Vector3(-7, 0, 0), new THREE.Vector3(17, 22, 1.4));          // document
      for (let k = 0; k < 5; k++) {
        add(box, new THREE.Vector3(-8.4 + (k % 2) * 1.2, 6.5 - k * 3.0, 1.0),
          new THREE.Vector3(11.5 - (k % 2) * 2.4, 0.8, 0.6));                         // clauses
      }
      add(new THREE.CylinderGeometry(1, 1, 1, 18),
        new THREE.Vector3(-11.5, -8.4, 1.2), new THREE.Vector3(2.6, 0.8, 2.6),
        new THREE.Euler(Math.PI / 2, 0, 0));                                          // seal

      const gear = (cx, cy, r, teeth, dir) => {
        const g = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.TorusGeometry(1, 0.30, 8, 40), mat);
        hub.scale.setScalar(r);
        g.add(hub);
        geos.add(hub.geometry);
        for (let k = 0; k < teeth; k++) {
          const a = (k / teeth) * Math.PI * 2;
          const t = new THREE.Mesh(box, mat);
          t.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
          t.scale.set(r * 0.30, r * 0.30, r * 0.34);
          t.rotation.z = a;
          g.add(t);
        }
        g.position.set(cx, cy, 0);
        group.add(g);
        subs.push({ tick: (dt) => { g.rotation.z += dt * 0.55 * dir; } });
        return g;
      };
      gear(9, 3.5, 7.5, 10, 1);
      gear(9 + 11.2, -3.5, 4.4, 8, -1);

    } else {
      // DIGITAL ASSETS — a vault: ownership and value held, not traded
      const box = new THREE.BoxGeometry(1, 1, 1);
      add(box, new THREE.Vector3(0, 0, 0), new THREE.Vector3(22, 22, 15));            // body
      add(box, new THREE.Vector3(0, 0, 7.8), new THREE.Vector3(17, 17, 1.0));         // door
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        add(box, new THREE.Vector3(Math.cos(a) * 7.4, Math.sin(a) * 7.4, 8.4),
          new THREE.Vector3(1.7, 1.7, 1.1));                                          // bolts
      }
      const dial = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 8, 48), mat);
      rim.scale.setScalar(4.6);
      dial.add(rim);
      geos.add(rim.geometry);
      for (let k = 0; k < 3; k++) {
        const spoke = new THREE.Mesh(box, mat);
        spoke.scale.set(9.0, 0.7, 0.7);
        spoke.rotation.z = (k / 3) * Math.PI;
        dial.add(spoke);
      }
      dial.position.set(0, 0, 9.0);
      group.add(dial);
      subs.push({ tick: (dt) => { dial.rotation.z -= dt * 0.5; } });

      // held records, drifting just clear of the vault
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const m = add(box, new THREE.Vector3(Math.cos(a) * 21, 0, Math.sin(a) * 21),
          new THREE.Vector3(5.4, 0.9, 5.4), new THREE.Euler(0, a, 0));
        subs.push({ tick: (dt, t) => { m.position.y = Math.sin(t * 0.7 + k * 2.1) * 5.5; } });
      }
    }

    const shell = new THREE.Mesh(primary.geometry, shellMat);
    shell.position.copy(primary.position);
    shell.scale.copy(primary.scale).multiplyScalar(1.09);
    shell.rotation.copy(primary.rotation);
    shell.renderOrder = 6;
    group.add(shell);

    out.push({
      group, primary, subs, geos, material: mat, shellMat, label: LABELS[i],
      baseY, spin: 0.07 + rng() * 0.06, hoverTarget: 0,
      get u() { return mat.uniforms; },
    });
  }

  return out;
}
