import * as THREE from 'three';
import { TIERS, autoTier } from './Quality.js';
import { buildLayout, BAND, LANDMARKS } from './layout.js';
import { PAL } from './palette.js';
import { Terrain } from './Terrain.js';
import { GoldPaths } from './GoldPaths.js';
import { Dust } from './Dust.js';
import { Glyphs } from './Glyphs.js';
import { NodeField } from './NodeField.js';
import { Landmarks } from './Landmarks.js';
import { CameraRig } from './CameraRig.js';
import { Post } from './Post.js';
import { clamp, lerp, smoothstep, damp, easeInOut } from './util.js';

// ═══════════════════════════════════════════════════════════════════════
// THE WORLD
// One scene, one camera, one continuous environment. Scroll moves the
// camera through it; the sections only decide what lights up along the way.
// ═══════════════════════════════════════════════════════════════════════

export class World {
  constructor(canvas, { onHover, onReady } = {}) {
    this.canvas = canvas;
    this.onHover = onHover || (() => {});
    this.onReady = onReady || (() => {});

    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const forced = new URLSearchParams(location.search).get('tier');
    this.tierName = TIERS[forced] ? forced : autoTier();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(PAL.void, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.34;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2200);
    this.rig = new CameraRig(this.camera);

    this.clock = new THREE.Clock();
    this.time = 0;
    this.scrollT = 0;
    this.progress = {};
    this.active = 'hero';

    this.mouse = { x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0, moved: false };
    this.intro = 0;
    this.introDone = false;

    this.pulseAge = 0;
    this.pulseStrength = 0;
    this.pulseOrigin = new THREE.Vector2();

    this.consensus = 0;
    this.consensusPhase = 0;
    this.nodeReveal = 0;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hovered = null;
    this.hoverClock = 0;

    this.fps = 60;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.degraded = 0;
    this.bad = 0;
    this.noAdapt = new URLSearchParams(location.search).has('noadapt');

    this.state = {
      heroA: 1, ledgerA: 0, anatomyA: 0, chainA: 0,
      tamper: 0, appIndex: 0, appsA: 0,
    };
    this.manualTamper = 0;

    this.build(this.tierName);
    this.resize();

    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize, { passive: true });
    addEventListener('orientationchange', this._onResize, { passive: true });

    this._onPointer = (e) => {
      const w = innerWidth, h = innerHeight;
      this.mouse.tx = (e.clientX / w) * 2 - 1;
      this.mouse.ty = (e.clientY / h) * 2 - 1;
      this.mouse.px = e.clientX;
      this.mouse.py = e.clientY;
      this.mouse.moved = true;
    };
    addEventListener('pointermove', this._onPointer, { passive: true });

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.stop(); });
    canvas.addEventListener('webglcontextrestored', () => { this.build(this.tierName); this.resize(); this.start(); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.stop();
      else { this.clock.start(); }
    });
  }

  // ── build / rebuild the entire environment for a quality tier ────────
  build(tierName) {
    this.teardown();
    const q = TIERS[tierName] || TIERS.medium;
    this.quality = q;
    this.tierName = q.tier;

    this.layout = buildLayout(q);

    this.terrain = new Terrain(this.scene, this.layout, q);
    this.fogU = this.terrain.uniforms;

    this.paths = new GoldPaths(this.scene, this.layout, q);
    this.dust = new Dust(this.scene, q, this.layout.rng);
    this.glyphs = new Glyphs(this.scene, q, this.layout.rng);
    this.nodes = new NodeField(this.scene, this.layout, this.fogU);
    this.landmarks = new Landmarks(this.scene, this.fogU, q, this.layout.rng);

    // share one fog/time state across every system so the world reads as one place
    for (const set of [this.paths.uniforms, this.paths.packetUniforms, this.dust.uniforms, this.glyphs.uniforms]) {
      set.uTime = this.fogU.uTime;
      set.uReveal = this.fogU.uReveal;
      set.uFogDensity = this.fogU.uFogDensity;
      set.uFogColor = this.fogU.uFogColor;
      set.uFogFar = this.fogU.uFogFar;
    }
    this.paths.ribbons.material.uniforms = this.paths.uniforms;
    this.paths.packets.material.uniforms = this.paths.packetUniforms;
    this.dust.points.material.uniforms = this.dust.uniforms;
    this.glyphs.mesh.material.uniforms = this.glyphs.uniforms;
    this.paths.uniforms.uCamZ = this.fogU.uCamZ;
    this.paths.uniforms.uBand = this.fogU.uBand;
    this.paths.packetUniforms.uCamZ = this.fogU.uCamZ;
    this.paths.packetUniforms.uBand = this.fogU.uBand;

    // static plazas around each landmark so the hero structures have air
    const cl = this.fogU.uClear.value;
    const L = [LANDMARKS.hero, LANDMARKS.ledger, LANDMARKS.anatomy, LANDMARKS.chain, LANDMARKS.nodes, LANDMARKS.apps];
    for (let i = 0; i < 6; i++) cl[i].set(L[i].x, L[i].z, L[i].r, 1);

    this.post = new Post(this.renderer, this.scene, this.camera, q);
  }

  teardown() {
    for (const s of [this.terrain, this.paths, this.dust, this.glyphs, this.nodes, this.landmarks, this.post]) s?.dispose?.();
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }

  setTier(name) {
    if (!TIERS[name] || name === this.tierName) return;
    const t = this.scrollT;
    this.build(name);
    this.resize();
    if (this.sectionRects) this.bind(this.sectionRects, this.maxScroll);
    this.setScroll(t);
  }

  // ── layout binding ──────────────────────────────────────────────────
  bind(sectionRects, maxScroll) {
    if (!sectionRects) return;
    this.sectionRects = sectionRects;
    this.maxScroll = maxScroll;
    this.rig.bind(sectionRects, maxScroll);
  }

  setScroll(t) { this.scrollT = clamp(t, 0, 1); }

  // Project a world point to viewport pixels so HTML labels can be pinned to
  // structures in the scene instead of floating on their own grid.
  project(v3, out) {
    this._pv = this._pv || new THREE.Vector3();
    this._pv.copy(v3).project(this.camera);
    out.x = (this._pv.x * 0.5 + 0.5) * innerWidth;
    out.y = (-this._pv.y * 0.5 + 0.5) * innerHeight;
    out.on = this._pv.z < 1 && Math.abs(this._pv.x) < 1.25;
    return out;
  }
  setProgress(map, active) { this.progress = map; this.active = active; }

  pulse(strength = 1) {
    const c = this.camera.position;
    this.pulseOrigin.set(c.x + (Math.random() - 0.5) * 90, c.z + (Math.random() - 0.5) * 90);
    this.pulseAge = 0;
    this.pulseStrength = strength;
  }

  setTamper(v) { this.manualTamper = v; }

  // ── the frame ───────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    // the page updates first, so the camera always samples the scroll
    // position that the copy on screen is already reacting to
    this.onFrame?.(dt);

    // ── boot: the landscape surfaces out of pure darkness ──
    // Timed against the wall clock, not accumulated frame deltas: dt is
    // clamped for animation stability, so a slow first few seconds would
    // otherwise leave the world stuck in its dark boot state indefinitely.
    if (this.intro < 1) {
      if (this.introStart === undefined) this.introStart = performance.now();
      this.intro = Math.min(1, (performance.now() - this.introStart) / 3600);
      if (this.intro >= 1 && !this.introDone) { this.introDone = true; this.onReady(); }
    }
    const ie = easeInOut(this.intro);

    this.mouse.x = damp(this.mouse.x, this.mouse.tx, 2.6, dt);
    this.mouse.y = damp(this.mouse.y, this.mouse.ty, 2.6, dt);

    // ── camera ──
    this.rig.extra.set(0, lerp(8, 0, ie), lerp(54, 0, ie));
    this.rig.update(dt, this.scrollT, this.mouse, this.time, this.reduced);

    // ── shared world uniforms ──
    const U = this.fogU;
    U.uTime.value = this.time;
    U.uCamZ.value = this.camera.position.z;
    U.uReveal.value = smoothstep(0.06, 0.92, this.intro);
    U.uFogDensity.value = this.rig.fog * lerp(2.15, 1, ie);
    U.uGoldBoost.value = this.rig.gold;

    if (this.pulseStrength > 0) {
      this.pulseAge += dt;
      this.pulseStrength = Math.max(0, 1 - this.pulseAge / 3.0);
    }
    U.uPulse.value.set(this.pulseOrigin.x, this.pulseOrigin.y, this.pulseAge, this.pulseStrength);

    if (this.reduced) {
      this.paths.uniforms.uFlow.value = Math.min(this.paths.uniforms.uFlow.value, 0.45);
      this.dust.uniforms.uOpacity.value *= 0.7;
    }

    this.terrain.update(this.camera);
    this.dust.update(this.camera);
    this.glyphs.update(this.camera);
    // the final pull-back should feel like more of the network, not less
    this.dust.uniforms.uOpacity.value = 1 + smoothstep(0.86, 1.0, this.scrollT) * 0.5;

    // cipher marks crowd in around the hashing and security passages
    const p = this.progress;
    const nearG = (k) => {
      const v = p[k];
      if (v === undefined || v < -0.4 || v > 1.4) return 0;
      return smoothstep(-0.35, 0.15, v) * (1 - smoothstep(0.85, 1.35, v));
    };
    // dense where the story is about cryptography, sparse in the wide shots
    // where the landscape itself is the subject
    const wide = smoothstep(0.74, 0.98, this.scrollT);
    this.glyphs.uniforms.uOpacity.value = damp(
      this.glyphs.uniforms.uOpacity.value,
      (0.46 + 0.85 * Math.max(nearG('s02'), nearG('s03'), nearG('s07'))) * (1 - 0.62 * wide),
      2, dt
    );

    this.updateStory(dt);
    this.landmarks.update(dt, this.time, this.state);

    if (this.post.enabled) {
      this.post.bloom.strength = this.rig.bloom * lerp(0.45, 1, ie);
      this.post.grade.uniforms.uTime.value = this.time;
      this.post.grade.uniforms.uFade.value = lerp(0.92, 0, ie);
      this.post.grade.uniforms.uAberration.value = lerp(2.4, 1, ie);
    }

    this.hoverClock += dt;
    if (this.mouse.moved && this.hoverClock > 0.08) {
      this.hoverClock = 0;
      this.mouse.moved = false;
      this.pickHover();
    }

    this.post.render(dt);

    // ── adaptive: protect the frame rate before quality ──
    const now = performance.now();
    this.fpsFrames++;
    if (this.fpsMark === undefined) this.fpsMark = now;
    if (now - this.fpsMark >= 1000) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsMark);
      this.fpsMark = now; this.fpsFrames = 0;
      if (this.introDone) this.adapt();
    }
  }

  // Protect the frame rate before quality, and require two consecutive bad
  // seconds so a single hitch (tab refocus, GC pause) never costs the look.
  adapt() {
    if (this.noAdapt) return;
    if (this.fps > 34) { this.bad = 0; return; }
    if (++this.bad < 2) return;
    this.bad = 0;

    if (this.degraded === 0) {
      this.degraded = 1;
      this.dpr = Math.max(0.7, this.dpr * 0.78);
      this.resize(true);
    } else if (this.degraded === 1 && this.post.enabled && this.post.bloom.enabled) {
      this.degraded = 2;
      this.post.bloom.enabled = false;
    } else if (this.tierName !== 'low') {
      this.degraded = 0;
      this.setTier(this.tierName === 'high' ? 'medium' : 'low');
    }
  }

  // ── what lights up, where ───────────────────────────────────────────
  updateStory(dt) {
    const p = this.progress;
    const g = (k) => (p[k] === undefined ? 0 : p[k]);
    const near = (k) => {
      const v = p[k];
      if (v === undefined || v < -0.35 || v > 1.35) return 0;
      return smoothstep(-0.3, 0.12, v) * (1 - smoothstep(0.9, 1.3, v));
    };
    const S = this.state;

    S.heroA = 1;
    S.ledgerA = Math.max(near('s01'), near('s02') * 0.3);
    S.anatomyA = Math.max(near('s02'), near('s03'));
    S.chainA = Math.max(near('s04'), near('s03') * 0.35);

    // the tamper demonstration: automatic on scroll, overridable by the lab
    const auto = smoothstep(0.42, 0.62, g('s04')) * (1 - smoothstep(0.9, 1.05, g('s04')));
    S.tamper = Math.max(auto * near('s04'), this.manualTamper * Math.max(near('s03'), near('s04')));

    // the swarm grows as the camera pulls back
    const reveal = Math.max(
      smoothstep(0.02, 0.85, g('s05')),
      near('s06') > 0 ? 1 : 0,
      near('s07') > 0 ? 1 : 0,
      g('s08') > -0.2 && g('s08') < 1.2 ? 0.9 : 0
    );
    this.nodeReveal = damp(this.nodeReveal, reveal, 2.2, dt);
    this.nodes.uniforms.uCount.value = this.nodeReveal;

    // consensus sweeps the swarm in a repeating wave during section 06
    const consensusActive = Math.max(near('s06'), near('s07') * 0.35);
    if (consensusActive > 0.02) {
      this.consensusPhase = (this.consensusPhase + dt / 4.0) % 1;
      const w = this.consensusPhase / 0.74;
      this.consensus = w < 1 ? w : 0;
    } else {
      this.consensus = damp(this.consensus, 0, 4, dt);
    }
    this.nodes.uniforms.uConsensus.value = this.consensus * (consensusActive > 0.02 ? 1 : 0);

    // applications
    S.appsA = near('s08');
    S.appIndex = clamp(g('s08'), 0, 1) * 4;

    // the live section drives the data harder through every pathway
    const live = near('live');
    this.paths.uniforms.uFlow.value = damp(
      this.paths.uniforms.uFlow.value,
      1 + live * 1.5 + near('s06') * 0.5,
      2, dt
    );
  }

  // ── hover ───────────────────────────────────────────────────────────
  pickHover() {
    this.ndc.set(this.mouse.tx, -this.mouse.ty);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const meshes = this.landmarks.hoverables.map((h) => h.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);

    const hit = hits[0];
    const entry = hit ? this.landmarks.hoverables.find((h) => h.mesh === hit.object) : null;

    if (entry !== this.hovered) {
      if (this.hovered) this.hovered.s.hoverTarget = 0;
      this.hovered = entry;
      if (entry) entry.s.hoverTarget = 1;
      this.onHover(entry ? { label: entry.label, x: this.mouse.px, y: this.mouse.py } : null);
    } else if (entry) {
      this.onHover({ label: entry.label, x: this.mouse.px, y: this.mouse.py });
    }

    const a = this.dust.uniforms.uAttract.value;
    if (hit) a.set(hit.point.x, hit.point.y, hit.point.z, 1);
    else a.w = damp(a.w, 0, 6, 0.1);
  }

  // ── sizing ──────────────────────────────────────────────────────────
  resize(keepDpr = false) {
    const w = innerWidth, h = innerHeight;
    if (!keepDpr) this.dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.dpr);
    this.dust.uniforms.uPR.value = this.dpr;
    this.paths.packetUniforms.uPR.value = this.dpr;
  }
}
