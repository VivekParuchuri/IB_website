import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ═══════════════════════════════════════════════════════════════════════
// THE LOOK
// Bloom is what turns emissive gold into something that feels lit rather
// than coloured. The grade pass then adds the lens: aberration, vignette,
// grain and a navy-shadow / warm-highlight split.
// ═══════════════════════════════════════════════════════════════════════

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 1 },
    uGrain: { value: 1 },
    uVignette: { value: 1 },
    uFade: { value: 0 },      // 0 = normal, 1 = black (boot / blackout)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uGrain, uVignette, uFade;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // radial chromatic aberration — strongest at the frame edge
      float k = 0.0016 * uAberration * (0.25 + r2 * 3.2);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - c * k).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + c * k).b;

      // shadows toward deep navy, highlights toward warm gold
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.86, 0.94, 1.14), smoothstep(0.42, 0.0, lum) * 0.55);
      col = mix(col, col * vec3(1.07, 1.01, 0.90), smoothstep(0.55, 1.3, lum) * 0.45);

      // a touch more separation in the midtones
      col = (col - 0.5) * 1.045 + 0.5;

      // vignette
      float vig = 1.0 - smoothstep(0.24, 0.85, r2 * 1.35);
      col *= mix(1.0, vig, 0.72 * uVignette);

      // film grain, finer in the highlights
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * (0.018 + 0.016 * (1.0 - lum)) * uGrain;

      col = max(col, 0.0) * (1.0 - uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.enabled = quality.post;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    if (!this.enabled) {
      this.grade = { uniforms: GradeShader.uniforms };
      return;
    }

    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa ? 2 : 0,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x * quality.bloomScale, size.y * quality.bloomScale),
      1.0, 0.70, 0.58
    );
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.composer.addPass(new OutputPass());
  }

  setSize(w, h, dpr) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w * 0.5, h * 0.5);
  }

  render(dt) {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  dispose() { this.composer?.dispose?.(); }
}
