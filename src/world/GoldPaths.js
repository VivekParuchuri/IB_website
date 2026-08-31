import * as THREE from 'three';
import { FOG, WRAP, NOISE } from './glsl.js';
import { PAL } from './palette.js';
import { BAND } from './layout.js';

// ═══════════════════════════════════════════════════════════════════════
// GOLDEN BLOCKCHAIN PATHWAYS
// Circuit traces cut through the landscape at ground level, elevated data
// highways arc above it, and packets of light run along every one of them.
// Two draw calls total: one ribbon mesh, one point cloud.
// ═══════════════════════════════════════════════════════════════════════

// collapse the grid walk into straight runs — fewer, longer segments
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const d1x = b[0] - a[0], d1z = b[2] - a[2];
    const d2x = c[0] - b[0], d2z = c[2] - b[2];
    const cross = d1x * d2z - d1z * d2x;
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const RIBBON_VERT = /* glsl */ `
attribute float aDist;
attribute float aLen;
attribute float aSide;
attribute float aCenterZ;
attribute float aSeed;
attribute float aKind;    // 0 trace · 1 pylon
attribute float aY01;

uniform float uTime;

varying float vDist, vLen, vSide, vSeed, vKind, vY01;
varying vec3  vW;

${WRAP}

void main(){
  vec3 p = position;
  p.z += wrapZ(aCenterZ) - aCenterZ;

  vDist = aDist; vLen = aLen; vSide = aSide;
  vSeed = aSeed; vKind = aKind; vY01 = aY01;
  vW = p;

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uReveal;
uniform float uFlow;
uniform vec3  uGold;
uniform vec3  uGoldHi;
uniform vec3  uGoldDeep;

varying float vDist, vLen, vSide, vSeed, vKind, vY01;
varying vec3  vW;

${NOISE}
${FOG}

void main(){
  float across = 1.0 - abs(vSide);
  float core = smoothstep(0.0, 0.5, across);
  float glow = smoothstep(0.0, 1.0, across);

  // the trace itself: a dim, always-on filament
  float base = 0.32 + 0.11 * sin(uTime * 0.7 + vSeed * 22.0);

  // packets of data running the route
  float energy = 0.0;
  float u = vDist / max(vLen, 0.001);
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float speed = (0.030 + 0.016 * fi) * uFlow;
    float head = fract(uTime * speed + vSeed * 3.13 + fi * 0.41);
    float d = abs(fract(u - head + 0.5) - 0.5) * vLen;
    energy += exp(-pow(d / 8.5, 2.0)) * (1.0 - 0.24 * fi);
  }

  vec3 col = uGoldDeep * base * glow * 2.1
           + uGold * energy * glow * 0.95
           + uGoldHi * energy * core * 1.5;

  float a = (base * 1.05 + energy * 1.7) * mix(glow, core, 0.3);

  if (vKind > 0.5) {          // support pylon: fades toward the ground
    a *= (1.0 - vY01) * 0.16;
    col = uGoldDeep * (base * 2.0 + energy * 0.8);
  }

  float dist = distance(cameraPosition, vW);
  a *= uReveal * fogAlpha(dist);
  if (a < 0.002) discard;

  gl_FragColor = vec4(col, a);
}
`;

const PACKET_VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute float aPhase;
attribute float aSpeed;
attribute float aCenterZ;
attribute float aSize;
attribute float aTone;

uniform float uTime;
uniform float uFlow;
uniform float uPR;

varying float vA;
varying float vTone;
varying vec3  vW;

${WRAP}

void main(){
  float t = fract(uTime * aSpeed * uFlow + aPhase);
  vec3 p = mix(aA, aB, t);
  p.z += wrapZ(aCenterZ) - aCenterZ;

  vA = smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.9, 1.0, t));
  vTone = aTone;
  vW = p;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPR * (260.0 / max(-mv.z, 1.0));
  gl_Position = projectionMatrix * mv;
}
`;

const PACKET_FRAG = /* glsl */ `
precision highp float;
uniform float uReveal;
uniform vec3 uGold;
uniform vec3 uGoldHi;
varying float vA;
varying float vTone;
varying vec3 vW;
${FOG}
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float f = exp(-d * 11.0);
  vec3 col = mix(uGold, uGoldHi, vTone) * (0.7 + 1.5 * f);
  float a = f * vA * uReveal * fogAlpha(distance(cameraPosition, vW));
  gl_FragColor = vec4(col, a);
}
`;

export class GoldPaths {
  constructor(scene, layout, quality) {
    const rnd = layout.rng;
    const paths = layout.paths.map((p) => ({ ...p, pts: simplify(p.pts) })).filter((p) => p.pts.length > 1);

    // ── ribbons ────────────────────────────────────────────────────────
    const pos = [], dist = [], len = [], side = [], cz = [], seed = [], kind = [], y01 = [];
    const idx = [];
    let v = 0;

    const quad = (p0, p1, p2, p3, d0, d1, total, centerZ, sd, kd, ya, yb) => {
      const P = [p0, p1, p2, p3];
      const D = [d0, d0, d1, d1];
      const S = [1, -1, 1, -1];
      const Y = [ya, ya, yb, yb];
      for (let i = 0; i < 4; i++) {
        pos.push(P[i][0], P[i][1], P[i][2]);
        dist.push(D[i]); len.push(total); side.push(S[i]);
        cz.push(centerZ); seed.push(sd); kind.push(kd); y01.push(Y[i]);
      }
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    };

    const packA = [], packB = [], packPhase = [], packSpeed = [], packCZ = [], packSize = [], packTone = [];

    for (let pi = 0; pi < paths.length; pi++) {
      const path = paths[pi];
      const pts = path.pts;
      const w = path.width;
      const sd = (pi * 0.6180339887) % 1;

      let total = 0;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
        cum.push(total);
      }
      if (total < 4) continue;

      let sumZ = 0;
      for (const p of pts) sumZ += p[2];
      const centerZ = sumZ / pts.length;

      for (let i = 0; i < pts.length - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        let dx = B[0] - A[0], dz = B[2] - A[2];
        const l = Math.hypot(dx, dz);
        if (l < 0.001) continue;
        dx /= l; dz /= l;
        const px = -dz * w * 0.5, pz = dx * w * 0.5;
        const ex = dx * w * 0.5, ez = dz * w * 0.5;

        const a0 = [A[0] - ex + px, A[1], A[2] - ez + pz];
        const a1 = [A[0] - ex - px, A[1], A[2] - ez - pz];
        const b0 = [B[0] + ex + px, B[1], B[2] + ez + pz];
        const b1 = [B[0] + ex - px, B[1], B[2] + ez - pz];
        quad(a0, a1, b0, b1, cum[i], cum[i + 1], total, centerZ, sd, 0, 0, 0);

        // travelling packets, density scaled to segment length
        const n = Math.max(1, Math.min(6, Math.round(l / 26) + (path.sky ? 2 : 1)));
        const packets = Math.max(1, Math.round(n * quality.packetMul));
        for (let k = 0; k < packets; k++) {
          packA.push(A[0], A[1] + (path.sky ? 0.35 : 0.3), A[2]);
          packB.push(B[0], B[1] + (path.sky ? 0.35 : 0.3), B[2]);
          packPhase.push(rnd());
          packSpeed.push((0.10 + rnd() * 0.22) * (26 / Math.max(l, 6)));
          packCZ.push(centerZ);
          packSize.push(path.sky ? 2.6 + rnd() * 2.2 : 1.9 + rnd() * 1.8);
          packTone.push(rnd());
        }
      }

      // elevated highways get support pylons — crossed quads so they read
      // from every angle without billboarding
      if (path.sky) {
        for (let i = 0; i < pts.length; i += 3) {
          const P = pts[i];
          const h = P[1];
          const hw = 0.16;
          quad([P[0] - hw, 0, P[2]], [P[0] + hw, 0, P[2]], [P[0] - hw, h, P[2]], [P[0] + hw, h, P[2]],
            0, 1, 1, centerZ, sd, 1, 1, 0);
          quad([P[0], 0, P[2] - hw], [P[0], 0, P[2] + hw], [P[0], h, P[2] - hw], [P[0], h, P[2] + hw],
            0, 1, 1, centerZ, sd, 1, 1, 0);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    geo.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    geo.setAttribute('aCenterZ', new THREE.Float32BufferAttribute(cz, 1));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    geo.setAttribute('aY01', new THREE.Float32BufferAttribute(y01, 1));
    geo.setIndex(idx);

    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFlow: { value: 1 },
      uCamZ: { value: 0 },
      uBand: { value: BAND },
      uFogDensity: { value: 0.018 },
      uFogColor: { value: PAL.fog.clone() },
      uFogFar: { value: PAL.fogFar.clone() },
      uGold: { value: PAL.gold.clone() },
      uGoldHi: { value: PAL.goldHi.clone() },
      uGoldDeep: { value: PAL.goldDeep.clone() },
    };

    this.ribbons = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    this.ribbons.frustumCulled = false;
    this.ribbons.renderOrder = 3;
    scene.add(this.ribbons);

    // ── packets ────────────────────────────────────────────────────────
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(packPhase.length * 3), 3));
    pgeo.setAttribute('aA', new THREE.Float32BufferAttribute(packA, 3));
    pgeo.setAttribute('aB', new THREE.Float32BufferAttribute(packB, 3));
    pgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(packPhase, 1));
    pgeo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(packSpeed, 1));
    pgeo.setAttribute('aCenterZ', new THREE.Float32BufferAttribute(packCZ, 1));
    pgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(packSize, 1));
    pgeo.setAttribute('aTone', new THREE.Float32BufferAttribute(packTone, 1));

    this.packetUniforms = {
      uTime: this.uniforms.uTime,
      uFlow: this.uniforms.uFlow,
      uReveal: this.uniforms.uReveal,
      uCamZ: this.uniforms.uCamZ,
      uBand: this.uniforms.uBand,
      uFogDensity: this.uniforms.uFogDensity,
      uFogColor: this.uniforms.uFogColor,
      uFogFar: this.uniforms.uFogFar,
      uGold: this.uniforms.uGold,
      uGoldHi: this.uniforms.uGoldHi,
      uPR: { value: 1 },
    };

    this.packets = new THREE.Points(pgeo, new THREE.ShaderMaterial({
      vertexShader: PACKET_VERT,
      fragmentShader: PACKET_FRAG,
      uniforms: this.packetUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.packets.frustumCulled = false;
    this.packets.renderOrder = 4;
    scene.add(this.packets);

    this.packetCount = packPhase.length;
  }

  dispose() {
    this.ribbons.geometry.dispose(); this.ribbons.material.dispose();
    this.packets.geometry.dispose(); this.packets.material.dispose();
  }
}
