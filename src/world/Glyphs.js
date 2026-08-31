import * as THREE from 'three';
import { FOG } from './glsl.js';
import { PAL } from './palette.js';

// ═══════════════════════════════════════════════════════════════════════
// FLOATING VOCABULARY
// Short tokens adrift among the structures — WEB-3, TRUST, HASH, PROOF,
// CONSENSUS — with the IB LAB wordmark as one entry among many rather than
// the whole set. No currency or coin references. Rasterised once into a
// canvas atlas; each entry records its own tight sub-rect and aspect, so a
// short token is not stretched to the width of a wordmark. One draw call.
// ═══════════════════════════════════════════════════════════════════════

const COLS = 4, ROWS = 4, CW = 340, CH = 118;
const FACE = 'Syncopate, Inter, "Segoe UI", sans-serif';

// text · px size · weight · tracking · treatment · chance of reading gold
// Deliberately no currency or coin references — this vocabulary is about
// trust, verification and structure, not about money.
const ITEMS = [
  { t: 'IB LAB',    s: 40, w: 700, k: 8,  deco: 'bracket', gold: 0.45 },
  { t: 'IB LAB',    s: 42, w: 700, k: 8,  deco: 'none',    gold: 0.45 },
  { t: 'WEB-3',     s: 46, w: 700, k: 6,  deco: 'none',    gold: 0.40 },
  { t: 'WEB-3',     s: 44, w: 700, k: 6,  deco: 'outline', gold: 0.40 },
  { t: 'WEB-3',     s: 38, w: 400, k: 10, deco: 'rules',   gold: 0.30 },
  { t: 'TRUST',     s: 46, w: 700, k: 6,  deco: 'none',    gold: 0.55 },
  { t: 'HASH',      s: 48, w: 700, k: 5,  deco: 'none',    gold: 0.20 },
  { t: 'PROOF',     s: 46, w: 700, k: 5,  deco: 'outline', gold: 0.30 },
  { t: 'VERIFY',    s: 42, w: 700, k: 6,  deco: 'none',    gold: 0.25 },
  { t: 'SECURE',    s: 38, w: 700, k: 7,  deco: 'bracket', gold: 0.25 },
  { t: 'LEDGER',    s: 32, w: 400, k: 9,  deco: 'rules',   gold: 0.15 },
  { t: 'SHA-256',   s: 30, w: 400, k: 6,  deco: 'none',    gold: 0.15 },
  { t: 'CONSENSUS', s: 26, w: 400, k: 5,  deco: 'none',    gold: 0.15 },
  { t: 'IMMUTABLE', s: 26, w: 400, k: 5,  deco: 'none',    gold: 0.15 },
  { t: 'KEY',       s: 52, w: 700, k: 5,  deco: 'none',    gold: 0.20 },
  { t: '#',         s: 62, w: 400, k: 0,  deco: 'none',    gold: 0.20 },
];

// Draws the atlas and returns, per entry, the tight UV rect it occupies plus
// its aspect — so every token keeps its own proportions out in the world.
function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = COLS * CW;
  c.height = ROWS * CH;
  const g = c.getContext('2d');

  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const rects = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const cx = (i % COLS) * CW + CW / 2;
    const cy = Math.floor(i / COLS) * CH + CH / 2;

    g.save();
    g.translate(cx, cy);
    g.font = `${it.w} ${it.s}px ${FACE}`;
    if ('letterSpacing' in g) g.letterSpacing = `${it.k}px`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    let halfW = g.measureText(it.t).width / 2;
    let halfH = it.s * 0.62;

    if (it.deco === 'outline') {
      g.lineWidth = Math.max(1.8, it.s * 0.048);
      g.strokeText(it.t, 0, 2);
    } else {
      g.fillText(it.t, 0, 2);
    }

    if (it.deco === 'rules') {
      g.lineWidth = 1.6;
      g.globalAlpha = 0.7;
      const rw = halfW + 12, ry = it.s * 0.78;
      g.beginPath();
      g.moveTo(-rw, -ry); g.lineTo(rw, -ry);
      g.moveTo(-rw, ry); g.lineTo(rw, ry);
      g.stroke();
      g.globalAlpha = 1;
      halfW = rw; halfH = ry + 4;
    }

    if (it.deco === 'bracket') {
      g.lineWidth = 2;
      const bx = halfW + 20, by = it.s * 0.76;
      const arm = Math.min(12, bx * 0.25);
      g.beginPath();
      g.moveTo(-bx + arm, -by); g.lineTo(-bx, -by); g.lineTo(-bx, by); g.lineTo(-bx + arm, by);
      g.moveTo(bx - arm, -by); g.lineTo(bx, -by); g.lineTo(bx, by); g.lineTo(bx - arm, by);
      g.stroke();
      halfW = bx; halfH = by + 4;
    }

    g.restore();

    // pad a little so mipmaps cannot bleed a neighbouring cell in
    const pw = Math.min(CW / 2 - 2, halfW + 8);
    const ph = Math.min(CH / 2 - 2, halfH + 8);

    rects.push({
      u0: (cx - pw) / c.width,
      v0: 1 - (cy + ph) / c.height,     // canvas Y is flipped relative to UV
      du: (pw * 2) / c.width,
      dv: (ph * 2) / c.height,
      aspect: pw / ph,
      gold: it.gold,
    });
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return { tex, rects };
}

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aMeta;    // seed · size · aspect · tone
attribute vec4 aUv;      // u0 · v0 · du · dv

uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uBox;

varying vec2  vUv;
varying float vFade;
varying float vTone;
varying float vAlt;
varying vec3  vW;

void main(){
  float s = aMeta.x;

  // drift, then wrap around the viewer so the field is endless
  vec3 p = aPos + vec3(sin(uTime * 0.09 + s * 61.0),
                       sin(uTime * 0.06 + s * 37.0) * 0.6,
                       cos(uTime * 0.075 + s * 23.0)) * (3.0 + s * 7.0);
  vec3 rel = p - uCamPos;
  rel = mod(rel + uBox * 0.5, uBox) - uBox * 0.5;
  p = uCamPos + rel;

  vec4 mv = viewMatrix * vec4(p, 1.0);

  // Billboard in view space. The tilt stays small — these are words that
  // have to stay readable, not tumbling particles.
  float a = sin(uTime * 0.11 + s * 30.0) * 0.07;
  vec2 q = position.xy * vec2(aMeta.z, 1.0) * aMeta.y;
  mv.xy += vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));

  vUv = aUv.xy + uv * aUv.zw;

  // tokens surface and submerge rather than sitting at a fixed opacity
  vFade = smoothstep(0.0, 0.35, 0.5 + 0.5 * sin(uTime * 0.22 + s * 44.0));
  vTone = aMeta.w;
  // They belong down among the structures. Without this they silhouette
  // against open sky in the high wide shots and take the frame over.
  vAlt = 1.0 - smoothstep(38.0, 78.0, p.y);
  vW = p;

  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform float uOpacity;
uniform float uReveal;
uniform vec3  uGold;
uniform vec3  uRim;
varying vec2  vUv;
varying float vFade;
varying float vTone;
varying float vAlt;
varying vec3  vW;
${FOG}
void main(){
  float m = texture2D(uAtlas, vUv).a;
  if (m < 0.015) discard;

  float dist = distance(cameraPosition, vW);
  // Anything crowding the lens renders enormous, so it fades out of the way
  // well before it gets there.
  float near = smoothstep(14.0, 46.0, dist);

  vec3 col = mix(uRim, uGold, step(0.70, vTone)) * 1.45;
  float a = m * vFade * near * vAlt * uOpacity * uReveal * fogAlpha(dist);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

export class Glyphs {
  constructor(scene, quality, rng) {
    const n = quality.glyphs;
    const pos = new Float32Array(n * 3);
    const meta = new Float32Array(n * 4);
    const uvs = new Float32Array(n * 4);
    const BOX = new THREE.Vector3(190, 105, 190);

    const built = buildAtlas();
    this.texture = built.tex;
    const R = built.rects;

    for (let i = 0; i < n; i++) {
      pos[i * 3 + 0] = (rng() - 0.5) * BOX.x;
      pos[i * 3 + 1] = (rng() - 0.5) * BOX.y;
      pos[i * 3 + 2] = (rng() - 0.5) * BOX.z;

      const r = R[Math.floor(rng() * R.length)];

      meta[i * 4 + 0] = rng();
      // capped so nothing looms: these are asides, not billboards
      meta[i * 4 + 1] = 1.1 + Math.pow(rng(), 1.7) * 2.3;
      meta[i * 4 + 2] = r.aspect;
      meta[i * 4 + 3] = rng() < r.gold ? 0.9 : 0.2;

      uvs[i * 4 + 0] = r.u0;
      uvs[i * 4 + 1] = r.v0;
      uvs[i * 4 + 2] = r.du;
      uvs[i * 4 + 3] = r.dv;
    }

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 4));
    geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(uvs, 4));
    geo.instanceCount = n;
    quad.dispose();

    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uOpacity: { value: 0.46 },
      uCamPos: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uAtlas: { value: this.texture },
      uFogDensity: { value: 0.012 },
      uFogColor: { value: PAL.fog.clone() },
      uFogFar: { value: PAL.fogFar.clone() },
      uGold: { value: PAL.gold.clone() },
      uRim: { value: PAL.rim.clone() },
    };

    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  update(camera) {
    this.uniforms.uCamPos.value.copy(camera.position);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
