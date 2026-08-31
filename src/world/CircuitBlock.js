import * as THREE from 'three';
import { NOISE, FOG } from './glsl.js';
import { PAL } from './palette.js';

// ═══════════════════════════════════════════════════════════════════════
// CIRCUIT SURFACE
// The material every landmark structure wears: machined navy metal with
// triplanar gold circuitry flowing across it, a fresnel rim, and a tamper
// state that destabilises the whole surface into red static.
// ═══════════════════════════════════════════════════════════════════════

const VERT = /* glsl */ `
uniform float uTime;
uniform float uTamper;
uniform float uActivate;

varying vec3 vN;
varying vec3 vW;
varying vec3 vL;

${NOISE}

void main(){
  vec3 p = position;

  // tampering tears the structure apart in horizontal slices
  if (uTamper > 0.001) {
    float slice = floor(p.y * 9.0);
    float j = (hash11(slice + floor(uTime * 11.0)) - 0.5);
    p.x += j * uTamper * 0.24;
    p.z += j * uTamper * 0.13;
    p += normal * sin(uTime * 23.0 + slice * 3.0) * uTamper * 0.035;
  }

  vL = p * 2.0;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uActivate;
uniform float uHover;
uniform float uTamper;
uniform float uDensity;
uniform float uSeed;
uniform float uReveal;
uniform vec3  uDeep;
uniform vec3  uNavy;
uniform vec3  uSteel;
uniform vec3  uRim;
uniform vec3  uGold;
uniform vec3  uGoldHi;
uniform vec3  uRed;
uniform vec3  uLightDir;

varying vec3 vN;
varying vec3 vW;
varying vec3 vL;

${NOISE}
${FOG}

float trace(vec2 uv, float seed, float density){
  vec2 g = uv * density;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float r = hash12(id + seed * 13.0);
  float lw = 0.06;
  float line = 0.0;
  if (r < 0.28)      line = smoothstep(lw, 0.0, abs(f.y - 0.5));
  else if (r < 0.56) line = smoothstep(lw, 0.0, abs(f.x - 0.5));
  else if (r < 0.78) {
    float h = smoothstep(lw, 0.0, abs(f.y - 0.5)) * step(0.5, f.x);
    float v = smoothstep(lw, 0.0, abs(f.x - 0.5)) * step(f.y, 0.5);
    line = max(h, v);
  }
  float pad = smoothstep(0.15, 0.10, length(f - 0.5)) * step(0.88, r);
  return max(line, pad);
}

// triplanar so curved landmark objects wear the same circuitry as the blocks
float circuitry(vec3 p, vec3 n, float seed, float density){
  vec3 bw = pow(abs(n), vec3(4.0));
  bw /= max(bw.x + bw.y + bw.z, 0.0001);
  return trace(p.zy, seed, density) * bw.x
       + trace(p.xz, seed + 1.7, density) * bw.y
       + trace(p.xy, seed + 3.4, density) * bw.z;
}

void main(){
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);

  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);

  vec3 col = uDeep;
  col = mix(col, uNavy, ndl * 0.9);
  col = mix(col, uSteel, max(N.y, 0.0) * 0.45);
  col += uSteel * 0.22 * pow(max(dot(N, normalize(vec3(-0.4, 0.3, 0.85))), 0.0), 2.5);

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRim * fres * (0.5 + uActivate * 0.5);

  // machined seams along the silhouette of the form
  vec3 a = abs(vL);
  float mx = max(a.x, max(a.y, a.z));
  float mn = min(a.x, min(a.y, a.z));
  float mid = a.x + a.y + a.z - mx - mn;
  float seam = smoothstep(0.90, 0.999, mid);

  // circuitry, and the light that runs through it
  float c = circuitry(vL * 0.5, N, uSeed, uDensity);
  float flow = 0.30 + 0.70 * pow(0.5 + 0.5 * sin((vL.x + vL.z + vL.y * 0.6) * 1.9 - uTime * 1.7 + uSeed * 9.0), 3.0);
  // A wide, soft sweep. A tight one blooms into a hard white bar when the
  // camera is right up against the surface in section 03.
  float scan = exp(-pow(fract(vL.y * 0.24 - uTime * 0.10 + uSeed) - 0.5, 2.0) / 0.022) * 0.5;

  float live = 0.28 + 0.56 * uActivate + uHover * 0.7;
  vec3 traceCol = mix(uGold, uGoldHi, min(1.0, flow * 0.9 + scan));
  col += traceCol * c * (0.16 + 0.95 * flow + scan * 0.6) * live;
  col += uGoldHi * seam * (0.26 + 0.48 * uActivate + uHover * 0.7);

  // interior light bleeding through the shell
  col += uGold * fres * c * 0.34 * live;

  // ── tamper: the structure loses integrity ──
  if (uTamper > 0.001) {
    float st = step(0.5, hash12(floor(vec2(vL.y * 34.0, floor(uTime * 15.0)))));
    vec3 bad = uRed * (0.4 + c * 1.6 + seam * 1.4 + st * 0.5);
    col = mix(col, bad, uTamper);
    col += uRed * st * uTamper * 0.35;
  }

  col = applyFog(col, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeCircuitMaterial(fogU, opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: fogU.uTime,
      uReveal: fogU.uReveal,
      uFogDensity: fogU.uFogDensity,
      uFogColor: fogU.uFogColor,
      uFogFar: fogU.uFogFar,
      uActivate: { value: opts.activate ?? 0 },
      uHover: { value: 0 },
      uTamper: { value: 0 },
      uDensity: { value: opts.density ?? 7 },
      uSeed: { value: opts.seed ?? 0.37 },
      uDeep: { value: PAL.deep.clone() },
      uNavy: { value: PAL.navy.clone() },
      uSteel: { value: PAL.steel.clone() },
      uRim: { value: PAL.rim.clone() },
      uGold: { value: PAL.gold.clone() },
      uGoldHi: { value: PAL.goldHi.clone() },
      uRed: { value: PAL.red.clone() },
      uLightDir: { value: new THREE.Vector3(-0.35, 0.86, 0.36).normalize() },
    },
  });
}

// ── the glow shell that makes an activated structure feel radioactive ──
const SHELL_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform float uActivate; uniform float uHover; uniform float uTamper;
uniform vec3 uGold; uniform vec3 uRed;
varying vec3 vN; varying vec3 vW;
${FOG}
void main(){
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  float fres = pow(1.0 - max(dot(N, toCam / max(dist,0.001)), 0.0), 2.6);
  float breathe = 0.75 + 0.25 * sin(uTime * 1.1);
  vec3 col = mix(uGold, uRed, uTamper);
  float a = fres * (0.08 + 0.24 * uActivate + 0.28 * uHover) * breathe * fogAlpha(dist);
  gl_FragColor = vec4(col * (1.0 + uHover), a);
}
`;

export function makeShellMaterial(fogU, coreU) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: SHELL_FRAG,
    uniforms: {
      uTime: fogU.uTime,
      uActivate: coreU.uActivate,
      uHover: coreU.uHover,
      uTamper: coreU.uTamper,
      uFogDensity: fogU.uFogDensity,
      uFogColor: fogU.uFogColor,
      uFogFar: fogU.uFogFar,
      uGold: { value: PAL.gold.clone() },
      uRed: { value: PAL.red.clone() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}

// ── a landmark structure: shell + core, ready to be activated or tampered ──
export class Structure {
  constructor(scene, geometry, fogU, opts = {}) {
    this.material = makeCircuitMaterial(fogU, opts);
    this.group = new THREE.Group();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.group.add(this.mesh);

    if (opts.shell !== false) {
      this.shellMat = makeShellMaterial(fogU, this.material.uniforms);
      this.shell = new THREE.Mesh(geometry, this.shellMat);
      this.shell.scale.setScalar(1.075);
      this.shell.renderOrder = 6;
      this.group.add(this.shell);
    }

    if (opts.position) this.group.position.copy(opts.position);
    if (opts.scale) this.group.scale.copy(opts.scale);
    scene.add(this.group);

    this.hoverTarget = 0;
    this.activateTarget = opts.activate ?? 0;
  }

  get u() { return this.material.uniforms; }

  dispose() {
    this.material.dispose();
    this.shellMat?.dispose();
  }
}
