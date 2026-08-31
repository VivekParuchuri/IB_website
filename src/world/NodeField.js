import * as THREE from 'three';
import { NOISE, FOG } from './glsl.js';
import { PAL } from './palette.js';
import { LANDMARKS } from './layout.js';

// ═══════════════════════════════════════════════════════════════════════
// THE DECENTRALISED NETWORK
// A swarm with no centre. Nodes reveal outward as the camera pulls back,
// and consensus travels through it as a spherical wave of gold.
// ═══════════════════════════════════════════════════════════════════════

const NODE_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aMeta;      // seed · gold · order (0 inner → 1 outer)

uniform float uTime;
uniform float uCount;      // 0..1 how much of the swarm has been discovered
uniform float uConsensus;  // 0..1 position of the agreement wave

varying vec3  vN;
varying vec3  vW;
varying float vGold;
varying float vWave;
varying float vSeed;

void main(){
  float seed = aMeta.x;
  float rv = 1.0 - smoothstep(uCount - 0.12, uCount + 0.02, aMeta.z);

  float wave = uConsensus > 0.001
    ? exp(-pow((aMeta.z - uConsensus) / 0.085, 2.0))
    : 0.0;

  float s = (0.85 + aMeta.y * 0.8) * rv * (1.0 + wave * 0.75);

  vec3 p = position * s;
  vec3 world = aPos + p;
  world.y += sin(uTime * 0.5 + seed * 44.0) * 1.3 * rv;
  world.x += sin(uTime * 0.31 + seed * 27.0) * 0.9 * rv;

  vN = normalize(position);
  vW = world;
  vGold = aMeta.y;
  vWave = wave * step(0.001, uConsensus);
  vSeed = seed;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const NODE_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uNavy, uRim, uGold, uGoldHi;
varying vec3 vN; varying vec3 vW;
varying float vGold; varying float vWave; varying float vSeed;
${NOISE}
${FOG}
void main(){
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  float fres = pow(1.0 - max(dot(N, toCam / max(dist, 0.001)), 0.0), 2.2);

  float breathe = 0.55 + 0.45 * sin(uTime * 1.3 + vSeed * 51.0);

  vec3 col = uNavy * 0.9;
  col += uRim * fres * 0.9;
  col += uRim * 0.16 * breathe;
  col += uGold * vGold * (0.55 + 0.55 * breathe);
  col += uGoldHi * vWave * (0.9 + fres * 1.6);

  col = applyFog(col, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

const LINK_VERT = /* glsl */ `
attribute float aT;
attribute float aOrder;
attribute float aSeed;

uniform float uCount;
uniform float uConsensus;

varying float vT, vSeed, vRv, vWave;
varying vec3  vW;

void main(){
  vRv = 1.0 - smoothstep(uCount - 0.12, uCount + 0.02, aOrder);
  vWave = uConsensus > 0.001 ? exp(-pow((aOrder - uConsensus) / 0.085, 2.0)) : 0.0;
  vT = aT; vSeed = aSeed; vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const LINK_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uRim, uGold, uGoldHi;
varying float vT, vSeed, vRv, vWave;
varying vec3 vW;
${FOG}
void main(){
  // a packet running the link
  float head = fract(uTime * (0.16 + vSeed * 0.3) + vSeed * 7.0);
  float pk = exp(-pow((vT - head) / 0.13, 2.0));

  vec3 col = uRim * 0.55 + uGold * pk * 0.8 + uGoldHi * vWave * 1.3;
  float a = (0.026 + pk * 0.22 + vWave * 0.5) * vRv;
  a *= fogAlpha(distance(cameraPosition, vW));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

export class NodeField {
  constructor(scene, layout, fogU) {
    const { nodes, links } = layout;

    // ── nodes ──────────────────────────────────────────────────────────
    const oct = new THREE.OctahedronGeometry(1, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', oct.attributes.position);
    if (oct.index) geo.index = oct.index;
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(nodes.pos, 3));
    geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(nodes.meta, 3));
    geo.instanceCount = nodes.count;
    oct.dispose();

    this.uniforms = {
      uTime: fogU.uTime,
      uFogDensity: fogU.uFogDensity,
      uFogColor: fogU.uFogColor,
      uFogFar: fogU.uFogFar,
      uCount: { value: 0 },
      uConsensus: { value: 0 },
      uNavy: { value: PAL.navy.clone() },
      uRim: { value: PAL.rim.clone() },
      uGold: { value: PAL.gold.clone() },
      uGoldHi: { value: PAL.goldHi.clone() },
    };

    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      uniforms: this.uniforms,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    // ── links ──────────────────────────────────────────────────────────
    const n = links.a.length;
    const lp = new Float32Array(n * 6);
    const lt = new Float32Array(n * 2);
    const lo = new Float32Array(n * 2);
    const ls = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      const A = links.a[i], B = links.b[i];
      lp[i * 6 + 0] = nodes.pos[A * 3 + 0];
      lp[i * 6 + 1] = nodes.pos[A * 3 + 1];
      lp[i * 6 + 2] = nodes.pos[A * 3 + 2];
      lp[i * 6 + 3] = nodes.pos[B * 3 + 0];
      lp[i * 6 + 4] = nodes.pos[B * 3 + 1];
      lp[i * 6 + 5] = nodes.pos[B * 3 + 2];
      lt[i * 2 + 0] = 0; lt[i * 2 + 1] = 1;
      const order = Math.max(nodes.meta[A * 3 + 2], nodes.meta[B * 3 + 2]);
      lo[i * 2 + 0] = order; lo[i * 2 + 1] = order;
      const seed = (i * 0.6180339887) % 1;
      ls[i * 2 + 0] = seed; ls[i * 2 + 1] = seed;
    }

    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lgeo.setAttribute('aT', new THREE.BufferAttribute(lt, 1));
    lgeo.setAttribute('aOrder', new THREE.BufferAttribute(lo, 1));
    lgeo.setAttribute('aSeed', new THREE.BufferAttribute(ls, 1));

    this.links = new THREE.LineSegments(lgeo, new THREE.ShaderMaterial({
      vertexShader: LINK_VERT,
      fragmentShader: LINK_FRAG,
      uniforms: {
        uTime: fogU.uTime,
        uFogDensity: fogU.uFogDensity,
        uFogColor: fogU.uFogColor,
        uFogFar: fogU.uFogFar,
        uCount: this.uniforms.uCount,
        uConsensus: this.uniforms.uConsensus,
        uRim: { value: PAL.rim.clone() },
        uGold: { value: PAL.gold.clone() },
        uGoldHi: { value: PAL.goldHi.clone() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.links.frustumCulled = false;
    this.links.renderOrder = 3;
    scene.add(this.links);

    this.center = new THREE.Vector3(LANDMARKS.nodes.x, 44, LANDMARKS.nodes.z);
    this.total = nodes.count;
  }

  dispose() {
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.links.geometry.dispose(); this.links.material.dispose();
  }
}
