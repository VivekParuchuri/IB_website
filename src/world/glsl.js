// ═══════════════════════════════════════════════════════════════════════
// Shared GLSL. Every system in the world pulls from the same helpers so
// fog, wrapping and the gold "network pulse" behave identically everywhere.
// ═══════════════════════════════════════════════════════════════════════

export const NOISE = /* glsl */ `
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3  hash31(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
`;

// Exponential-squared fog with a very slightly warmer far band — reads as
// depth haze rather than a flat wash.
export const FOG = /* glsl */ `
uniform float uFogDensity;
uniform vec3  uFogColor;
uniform vec3  uFogFar;
vec3 applyFog(vec3 col, float dist){
  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  f = clamp(f, 0.0, 1.0);
  vec3 fc = mix(uFogColor, uFogFar, smoothstep(0.10, 0.98, f) * 0.78);
  return mix(col, fc, f);
}
float fogAlpha(float dist){
  return clamp(exp(-pow(dist * uFogDensity, 2.0)), 0.0, 1.0);
}
`;

// Camera-relative Z wrapping. The landscape is a band that endlessly
// re-tiles around the viewer, which is what makes the world feel infinite
// without paying for infinite geometry.
export const WRAP = /* glsl */ `
uniform float uCamZ;
uniform float uBand;
float wrapZ(float z){
  float rel = z - uCamZ;
  rel = mod(rel + uBand * 0.5, uBand) - uBand * 0.5;
  return uCamZ + rel;
}
`;

// A gold shockwave that ripples out through the landscape whenever the
// simulated network seals a new block.
export const PULSE = /* glsl */ `
uniform vec4 uPulse;   // xz = origin, z = age (s), w = strength
float networkPulse(vec2 xz){
  if (uPulse.w <= 0.001) return 0.0;
  float d = distance(xz, uPulse.xy);
  float r = uPulse.z * 132.0;
  float ring = exp(-pow((d - r) / 26.0, 2.0));
  return ring * uPulse.w;
}
`;

// Up to six "clearings" flatten the landscape around landmark structures so
// each hero object sits in its own plaza instead of being swallowed by terrain.
export const CLEARINGS = /* glsl */ `
uniform vec4 uClear[6];   // xy = xz centre, z = radius, w = strength
float clearing(vec2 xz){
  float k = 1.0;
  for (int i = 0; i < 6; i++){
    if (uClear[i].w < 0.001) continue;
    float d = distance(xz, uClear[i].xy);
    k *= mix(1.0, smoothstep(uClear[i].z * 0.42, uClear[i].z, d), uClear[i].w);
  }
  return k;
}
`;

export const TONE = /* glsl */ `
vec3 filmic(vec3 x){
  // gentle shoulder so gold highlights bloom instead of clipping to white
  return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
}
`;
