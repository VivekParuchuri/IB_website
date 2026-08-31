import * as THREE from 'three';
import { FOG } from './glsl.js';
import { PAL } from './palette.js';

// ═══════════════════════════════════════════════════════════════════════
// FLOATING CRYPTOGRAPHIC SYMBOLS
// Hex fragments and cipher marks adrift in the environment. One instanced
// draw call against a procedurally drawn atlas — no font files, no external
// glyphs that might not resolve on a given machine.
// ═══════════════════════════════════════════════════════════════════════

const COLS = 6, ROWS = 4, CELL = 96;   // 24 glyphs

function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = COLS * CELL;
  c.height = ROWS * CELL;
  const x = c.getContext('2d');

  x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = '#fff';
  x.fillStyle = '#fff';
  x.lineCap = 'round';
  x.lineJoin = 'round';

  const at = (i) => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL];
  const HEX = '0123456789ABCDEF';

  // 0–15: hexadecimal — the alphabet a hash is written in
  for (let i = 0; i < 16; i++) {
    const [ox, oy] = at(i);
    x.save();
    x.translate(ox + CELL / 2, oy + CELL / 2);
    x.font = '600 62px ui-monospace, "JetBrains Mono", Consolas, monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(HEX[i], 0, 2);
    x.restore();
  }

  // 16–23: cipher marks, drawn as paths so they render identically anywhere
  const marks = [
    // hexagon
    (g) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 - Math.PI / 2; const px = Math.cos(a) * 30, py = Math.sin(a) * 30; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.stroke(); },
    // diamond in diamond
    (g) => { g.beginPath(); g.moveTo(0, -32); g.lineTo(32, 0); g.lineTo(0, 32); g.lineTo(-32, 0); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(0, -13); g.lineTo(13, 0); g.lineTo(0, 13); g.lineTo(-13, 0); g.closePath(); g.fill(); },
    // chain link
    (g) => { g.beginPath(); g.roundRect(-32, -13, 34, 26, 13); g.stroke(); g.beginPath(); g.roundRect(-2, -13, 34, 26, 13); g.stroke(); },
    // key grid
    (g) => { g.beginPath(); g.rect(-28, -28, 56, 56); g.stroke(); g.beginPath(); g.moveTo(-28, -4); g.lineTo(4, -4); g.moveTo(4, -28); g.lineTo(4, 28); g.stroke(); },
    // signature chevrons
    (g) => { g.beginPath(); g.moveTo(-26, -20); g.lineTo(-6, 0); g.lineTo(-26, 20); g.moveTo(4, -20); g.lineTo(24, 0); g.lineTo(4, 20); g.stroke(); },
    // merkle fork
    (g) => { g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -6); g.moveTo(-24, 30); g.lineTo(-24, 6); g.lineTo(24, 6); g.lineTo(24, 30); g.moveTo(-24, 6); g.lineTo(24, 6); g.moveTo(0, -6); g.lineTo(0, 6); g.stroke(); },
    // sealed block
    (g) => { g.beginPath(); g.moveTo(0, -30); g.lineTo(28, -14); g.lineTo(28, 16); g.lineTo(0, 32); g.lineTo(-28, 16); g.lineTo(-28, -14); g.closePath(); g.stroke(); g.beginPath(); g.arc(0, 1, 7, 0, Math.PI * 2); g.fill(); },
    // brackets
    (g) => { g.beginPath(); g.moveTo(-10, -28); g.lineTo(-26, -28); g.lineTo(-26, 28); g.lineTo(-10, 28); g.moveTo(10, -28); g.lineTo(26, -28); g.lineTo(26, 28); g.lineTo(10, 28); g.stroke(); },
  ];

  for (let i = 0; i < marks.length; i++) {
    const [ox, oy] = at(16 + i);
    x.save();
    x.translate(ox + CELL / 2, oy + CELL / 2);
    x.lineWidth = 5;
    marks[i](x);
    x.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aMeta;    // seed · size · glyph index · tone

uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uBox;
uniform vec2  uGrid;

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

  // billboard in view space, with a slow drifting tilt
  float a = sin(uTime * 0.11 + s * 30.0) * 0.28;
  vec2 q = position.xy * aMeta.y;
  mv.xy += vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));

  float gi = aMeta.z;
  vUv = (uv + vec2(mod(gi, uGrid.x), floor(gi / uGrid.x))) / uGrid;

  // symbols surface and submerge rather than sitting at a fixed opacity
  vFade = smoothstep(0.0, 0.35, 0.5 + 0.5 * sin(uTime * 0.22 + s * 44.0));
  vTone = aMeta.w;
  // Symbols belong down among the structures. Without this they silhouette
  // against open sky in the high wide shots and take the frame over.
  vAlt = 1.0 - smoothstep(42.0, 88.0, p.y);
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
  // Symbols that crowd the lens render enormous and take over the frame,
  // so anything closer than a few metres fades out of the way.
  float near = smoothstep(9.0, 32.0, dist);

  vec3 col = mix(uRim, uGold, step(0.70, vTone)) * 1.5;
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
    const BOX = new THREE.Vector3(190, 105, 190);

    for (let i = 0; i < n; i++) {
      pos[i * 3 + 0] = (rng() - 0.5) * BOX.x;
      pos[i * 3 + 1] = (rng() - 0.5) * BOX.y;
      pos[i * 3 + 2] = (rng() - 0.5) * BOX.z;
      meta[i * 4 + 0] = rng();
      meta[i * 4 + 1] = 0.9 + Math.pow(rng(), 1.8) * 4.0;   // most are small
      meta[i * 4 + 2] = Math.floor(rng() * COLS * ROWS);
      meta[i * 4 + 3] = rng();                              // ~30% read gold
    }

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 4));
    geo.instanceCount = n;
    quad.dispose();

    this.texture = buildAtlas();

    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uOpacity: { value: 0.44 },
      uCamPos: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uGrid: { value: new THREE.Vector2(COLS, ROWS) },
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
