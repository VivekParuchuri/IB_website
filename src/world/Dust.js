import * as THREE from 'three';
import { FOG } from './glsl.js';
import { PAL } from './palette.js';
import { LANDMARKS } from './layout.js';

// ═══════════════════════════════════════════════════════════════════════
// LIVE DATA PARTICLES
// Two populations in one draw call: a drifting field that endlessly wraps
// around the viewer, and orbiters that gather around landmark structures.
// A hovered object becomes an attractor and pulls the field toward it.
// ═══════════════════════════════════════════════════════════════════════

const VERT = /* glsl */ `
attribute vec3  aBase;
attribute vec3  aAnchor;
attribute vec3  aMeta;    // seed · size · tone
attribute float aMode;    // 0 drift · 1 orbit

uniform float uTime;
uniform float uPR;
uniform vec3  uCamPos;
uniform vec3  uBox;
uniform vec4  uAttract;   // xyz target · w strength

varying float vTone;
varying float vBoost;
varying vec3  vW;

void main(){
  float s = aMeta.x;
  vec3 p;

  if (aMode > 0.5) {
    float sp  = 0.055 + s * 0.13;
    float ang = uTime * sp + s * 62.8;
    float rad = 7.0 + s * 30.0;
    p = aAnchor + vec3(cos(ang) * rad,
                       sin(uTime * 0.19 + s * 30.0) * 8.0 + s * 12.0,
                       sin(ang) * rad);
  } else {
    p = aBase + vec3(sin(uTime * 0.13 + s * 61.0),
                     sin(uTime * 0.085 + s * 37.0),
                     cos(uTime * 0.11 + s * 23.0)) * (2.5 + s * 8.0);
    vec3 rel = p - uCamPos;
    rel = mod(rel + uBox * 0.5, uBox) - uBox * 0.5;
    p = uCamPos + rel;
  }

  vec3 toA = uAttract.xyz - p;
  float d = length(toA);
  float pull = uAttract.w * exp(-pow(d / 44.0, 2.0));
  p += toA * pull * 0.4;

  vTone  = aMeta.z;
  vBoost = pull;
  vW = p;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = aMeta.y * uPR * (190.0 / max(-mv.z, 1.0)) * (1.0 + pull * 1.6);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uReveal;
uniform float uOpacity;
uniform vec3  uGold;
uniform vec3  uRim;
varying float vTone;
varying float vBoost;
varying vec3  vW;
${FOG}
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  if (d2 > 0.25) discard;
  float f = exp(-d2 * 9.0);
  float gold = step(0.86, vTone);
  vec3 col = mix(uRim, uGold, gold) * (0.55 + 1.1 * f + vBoost);
  float a = f * (0.22 + gold * 0.42 + vBoost * 0.7) * uOpacity * uReveal;
  a *= fogAlpha(distance(cameraPosition, vW));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

export class Dust {
  constructor(scene, quality, rng) {
    const n = quality.dust;
    const base = new Float32Array(n * 3);
    const anchor = new Float32Array(n * 3);
    const meta = new Float32Array(n * 3);
    const mode = new Float32Array(n);

    const anchors = Object.values(LANDMARKS);
    const BOX = new THREE.Vector3(560, 220, 560);

    for (let i = 0; i < n; i++) {
      const orbiter = rng() < 0.17;
      mode[i] = orbiter ? 1 : 0;

      base[i * 3 + 0] = (rng() - 0.5) * BOX.x;
      base[i * 3 + 1] = (rng() - 0.5) * BOX.y;
      base[i * 3 + 2] = (rng() - 0.5) * BOX.z;

      const a = anchors[Math.floor(rng() * anchors.length)];
      anchor[i * 3 + 0] = a.x + (rng() - 0.5) * 26;
      anchor[i * 3 + 1] = 8 + rng() * 34;
      anchor[i * 3 + 2] = a.z + (rng() - 0.5) * 26;

      meta[i * 3 + 0] = rng();
      meta[i * 3 + 1] = 1.0 + Math.pow(rng(), 2.4) * 4.4;
      meta[i * 3 + 2] = rng();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
    geo.setAttribute('aAnchor', new THREE.Float32BufferAttribute(anchor, 3));
    geo.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3));
    geo.setAttribute('aMode', new THREE.Float32BufferAttribute(mode, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uPR: { value: 1 },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uCamPos: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uAttract: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFogDensity: { value: 0.018 },
      uFogColor: { value: PAL.fog.clone() },
      uFogFar: { value: PAL.fogFar.clone() },
      uGold: { value: PAL.goldHi.clone() },
      uRim: { value: PAL.rim.clone() },
    };

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  update(camera) {
    this.uniforms.uCamPos.value.copy(camera.position);
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
