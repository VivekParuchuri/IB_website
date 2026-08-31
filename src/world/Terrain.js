import * as THREE from 'three';
import { NOISE, FOG, WRAP, PULSE, CLEARINGS } from './glsl.js';
import { PAL } from './palette.js';
import { BAND } from './layout.js';

// ═══════════════════════════════════════════════════════════════════════
// THE LANDSCAPE
// A single instanced draw call carrying the entire digital terrain.
// Position, rotation and the endless Z-wrap all happen on the GPU, so the
// CPU never touches per-block data after upload.
// ═══════════════════════════════════════════════════════════════════════

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aScale;
attribute vec4 aParams;      // x gold · y seed · z glyph · w rotY

uniform float uTime;
uniform float uReveal;

varying vec3  vN;
varying vec3  vW;
varying vec3  vL;
varying float vGold;
varying float vSeed;
varying float vType;

${WRAP}
${CLEARINGS}

void main(){
  float seed = aParams.y;

  // the landscape rises out of the darkness rather than fading in
  float r = clamp((uReveal - seed * 0.42) / 0.58, 0.0, 1.0);
  r = r * r * (3.0 - 2.0 * r);

  vec3 base = aOffset;
  base.z = wrapZ(base.z);

  float k = clearing(base.xz);

  // Blocks are meant to sweep through the foreground, not black out the
  // frame — anything about to engulf the lens collapses out of the way.
  float near = smoothstep(5.0, 20.0, distance(base.xz, cameraPosition.xz));

  vec3 sc = aScale;
  sc.y *= r * mix(0.06, 1.0, k) * near;
  sc.x *= mix(0.55, 1.0, k) * near;
  sc.z *= mix(0.55, 1.0, k) * near;

  vec3 p = position * sc;
  float c = cos(aParams.w), s = sin(aParams.w);
  vec3 pr = vec3(c * p.x + s * p.z, p.y + sc.y * 0.5, -s * p.x + c * p.z);
  vec3 nr = normalize(vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z));

  // tall structures breathe
  pr.y += sin(uTime * 0.32 + seed * 41.0) * 0.24 * step(7.0, aScale.y);

  vec3 world = base + pr;

  vW = world;
  vN = nr;
  vL = position * 2.0;
  vGold = aParams.x * k;
  vSeed = seed;
  vType = aParams.z;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uGoldBoost;
uniform vec3  uDeep;
uniform vec3  uNavy;
uniform vec3  uSteel;
uniform vec3  uRim;
uniform vec3  uEdge;
uniform vec3  uGold;
uniform vec3  uLightDir;

varying vec3  vN;
varying vec3  vW;
varying vec3  vL;
varying float vGold;
varying float vSeed;
varying float vType;

${NOISE}
${FOG}
${PULSE}

void main(){
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);

  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float top = max(N.y, 0.0);

  // cold metallic body — near-black navy holding just enough light to read
  // Detail is expensive to read at distance and shimmers when it is
  // sub-pixel, so edge and glyph work fades out beyond the near field.
  // A floor on the LOD: enough detail survives at distance to read as a
  // carpet of structures, not enough to shimmer when it goes sub-pixel.
  float lod = mix(0.32, 1.0, 1.0 - smoothstep(70.0, 260.0, dist));

  vec3 col = uDeep;
  col = mix(col, uNavy, ndl * 0.86);
  col = mix(col, uSteel, top * 0.40);
  col += uSteel * 0.20 * pow(max(dot(N, normalize(vec3(-0.35, 0.25, 0.9))), 0.0), 2.5);

  // fresnel rim: the edge light that gives the terrain its depth
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRim * fres * (0.30 + 0.34 * lod);

  // a scattering of structures carry a faint interior blue glow
  float blueLife = step(0.66, vSeed) * (0.5 + 0.5 * sin(uTime * 0.85 + vSeed * 60.0));
  col += uEdge * blueLife * 0.085;

  // box edges read as machined seams
  vec3 a = abs(vL);
  float mx = max(a.x, max(a.y, a.z));
  float mn = min(a.x, min(a.y, a.z));
  float mid = a.x + a.y + a.z - mx - mn;
  float edge = smoothstep(0.78, 0.995, mid);

  float pulse = 0.55 + 0.45 * sin(uTime * 1.5 + vSeed * 34.0);
  float g = clamp(vGold, 0.0, 1.0);
  vec3 edgeCol = mix(uEdge, uGold, clamp(g * 1.7, 0.0, 1.0));
  col += edgeCol * edge * (0.13 * lod + g * 1.7 * pulse) * (0.5 + 0.5 * uGoldBoost);

  // subtle cryptographic glyphs stamped on the upper faces
  if (vType > 0.5 && N.y > 0.5) {
    vec2 gp = vL.xz * 1.7;
    float on = step(0.52, hash12(floor(gp) + vSeed * 17.0));
    vec2 f = fract(gp);
    float bar = step(0.2, f.x) * step(f.x, 0.8) * step(0.36, f.y) * step(f.y, 0.64);
    col += mix(uEdge, uGold, g) * on * bar * (0.055 + g * 0.6) * lod;
  }

  // gold cores: rare, valuable, alive
  // Far gold is boosted rather than LOD'd away — at the wide shots this is
  // what makes the landscape read as thousands of live nodes to the horizon.
  col += uGold * g * (0.16 + 0.13 * pulse) * (1.0 + (1.0 - lod) * 1.5);

  // network shockwave when the chain seals a block
  float rp = networkPulse(vW.xz);
  col += uGold * rp * (0.35 + edge * 2.0);

  col = applyFog(col, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Terrain {
  constructor(scene, layout, quality) {
    const t = layout.terrain;
    const n = t.count;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = box.index;
    geo.setAttribute('position', box.attributes.position);
    geo.setAttribute('normal', box.attributes.normal);
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(t.offset.subarray(0, n * 3), 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(t.scale.subarray(0, n * 3), 3));
    geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(t.params.subarray(0, n * 4), 4));
    geo.instanceCount = n;
    box.dispose();

    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uCamZ: { value: 0 },
      uBand: { value: BAND },
      uGoldBoost: { value: 1 },
      uFogDensity: { value: 0.018 },
      uFogColor: { value: PAL.fog.clone() },
      uFogFar: { value: PAL.fogFar.clone() },
      uPulse: { value: new THREE.Vector4(0, 0, 0, 0) },
      uClear: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uDeep: { value: PAL.deep.clone() },
      uNavy: { value: PAL.navy.clone() },
      uSteel: { value: PAL.steel.clone() },
      uRim: { value: PAL.rim.clone() },
      uEdge: { value: PAL.edge.clone() },
      uGold: { value: PAL.gold.clone() },
      uLightDir: { value: new THREE.Vector3(-0.35, 0.86, 0.36).normalize() },
    };

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        side: quality.tier === 'low' ? THREE.FrontSide : THREE.FrontSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.ground = makeGround(this.uniforms);
    scene.add(this.ground);
  }

  update(camera) {
    this.ground.position.set(camera.position.x, 0, camera.position.z);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
  }
}

// ── the floor the whole world stands on ──
function makeGround(shared) {
  const geo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: shared.uTime,
      uReveal: shared.uReveal,
      uFogDensity: shared.uFogDensity,
      uFogColor: shared.uFogColor,
      uFogFar: shared.uFogFar,
      uPulse: shared.uPulse,
      uGold: shared.uGold,
      uEdge: shared.uEdge,
      uDeep: shared.uDeep,
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime; uniform float uReveal;
      uniform vec3 uGold; uniform vec3 uEdge; uniform vec3 uDeep;
      varying vec3 vW;
      ${NOISE}
      ${FOG}
      ${PULSE}
      float grid(vec2 p, float s, float w){
        vec2 g = abs(fract(p / s - 0.5) - 0.5) * s;
        float l = min(g.x, g.y);
        return 1.0 - smoothstep(0.0, w, l);
      }
      void main(){
        float dist = distance(cameraPosition, vW);
        float fine = grid(vW.xz, 6.0, 0.10);
        float major = grid(vW.xz, 60.0, 0.30);
        vec3 col = uDeep * 0.7;
        col += uEdge * fine * 0.075;
        col += uEdge * major * 0.14;
        col += uGold * major * 0.028;
        col += uGold * networkPulse(vW.xz) * 0.5;
        float a = (0.30 + fine * 0.30 + major * 0.55) * uReveal;
        a *= fogAlpha(dist);
        col = applyFog(col, dist);
        gl_FragColor = vec4(col, a * 0.9);
      }
    `,
  });

  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 0;
  return m;
}
