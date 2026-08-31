import { hasWebGL } from './world/Quality.js';
import { World } from './world/World.js';
import { Director } from './ui/director.js';
import { HashLab } from './ui/hashing.js';
import { LiveNetwork } from './ui/live.js';
import { Boot, Cursor, QualityToggle } from './ui/chrome.js';

// ═══════════════════════════════════════════════════════════════════════
// CHAINSCAPE
// ═══════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('scene');

async function main() {
  const boot = new Boot();
  await boot.step('ALLOCATING LEDGER SPACE', 0.12);

  // ── no WebGL: hand off to the CSS landscape, keep every word readable ──
  if (!hasWebGL()) {
    document.body.classList.add('no-webgl');
    await boot.step('GRAPHICS UNAVAILABLE · STATIC MODE', 0.9);
    await boot.finish();
    startFallback();
    return;
  }

  // The wordmark atlas is rasterised to a canvas at construction time, so the
  // face has to be resolved first or it silently falls back to a system font.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 46px Syncopate'),
        document.fonts.load('400 40px Syncopate'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* proceed with the fallback stack */ }

  await boot.step('GENERATING LANDSCAPE', 0.34);

  let world;
  try {
    world = new World(canvas, {
      onHover: (info) => cursor.setHover(info),
    });
  } catch (err) {
    console.error('[chainscape] world failed to initialise', err);
    document.body.classList.add('no-webgl');
    await boot.finish();
    startFallback();
    return;
  }

  await boot.step('COMPILING SHADERS', 0.62);
  try { world.renderer.compile(world.scene, world.camera); } catch { /* non-fatal */ }

  await boot.step('SYNCHRONISING NODES', 0.86);

  const director = new Director(world);
  const hashLab = new HashLab(world, director);
  const live = new LiveNetwork(world);
  const cursor = new Cursor();
  new QualityToggle(world);

  // One clock drives everything: the camera, the copy and the simulation.
  world.onFrame = (dt) => {
    director.tick(dt);
    hashLab.tick(dt);
    live.tick(dt);
    cursor.tick(dt);
  };

  if (import.meta.env.DEV || location.search.includes('debug')) window.__W = world;

  world.start();
  await boot.finish();

  // re-measure once webfonts have settled the layout
  document.fonts?.ready?.then(() => setTimeout(() => director.measure(), 60));
}

// ── fallback: no 3D, but the story still works ──
function startFallback() {
  const sections = [...document.querySelectorAll('[data-section]')];
  const fill = document.querySelector('[data-rail-fill]');
  const cur = document.querySelector('[data-rail-current]');
  const label = document.querySelector('[data-rail-label]');
  const nav = document.getElementById('nav');

  document.documentElement.style.setProperty('--vhpx', innerHeight + 'px');

  // Same crossfade envelope the Director uses, so the fallback tells the
  // story in the same rhythm — and the same visibility classes, without
  // which the fixed overlay stages never become visible at all.
  const ss = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const paint = () => {
    const y = scrollY, vh = innerHeight;
    let bestI = 0, best = -1;
    sections.forEach((el, i) => {
      const top = el.offsetTop;
      const travel = Math.max(1, el.offsetHeight - vh);
      const k = vh / travel;
      const raw = (y - top) / travel;
      const rise = ss(-0.80 * k, -0.20 * k, raw);
      const fall = i === sections.length - 1 ? 0 : ss(1 + 0.10 * k, 1 + 0.70 * k, raw);
      let inn = rise * (1 - fall);
      if (inn < 0.012) inn = 0;
      el.style.setProperty('--p', Math.max(-1.5, Math.min(2.5, raw)).toFixed(3));
      el.style.setProperty('--in', inn.toFixed(3));
      el.classList.toggle('is-vis', inn > 0.004);
      if (inn > best) { best = inn; bestI = i; }
    });
    sections.forEach((el, i) => el.classList.toggle('is-live', i === bestI));
    fill.style.width = ((y / Math.max(1, document.documentElement.scrollHeight - vh)) * 100).toFixed(1) + '%';
    cur.textContent = String(bestI + 1).padStart(2, '0');
    label.textContent = sections[bestI].dataset.label || '';
    nav.classList.toggle('is-stuck', y > 40);
    document.body.classList.toggle('at-final', bestI === sections.length - 1);
  };

  // lit states so the copy still reads as a designed page
  document.querySelectorAll('[data-flow] li, [data-consensus] li').forEach((el) => el.style.setProperty('--lit', 1));
  document.querySelectorAll('[data-flow] li').forEach((el) => el.classList.add('is-lit'));
  document.querySelectorAll('.holo__item, .concept').forEach((el) => el.style.setProperty('--lit', 1));
  document.querySelectorAll('.app, .appindex li').forEach((el, i) => { if (i % 5 === 0) el.classList.add('is-on'); });

  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', () => {
    document.documentElement.style.setProperty('--vhpx', innerHeight + 'px');
    paint();
  }, { passive: true });
  paint();

  // the hashing lab and the live monitor do not need WebGL
  const stub = {
    setTamper() {}, pulse() {}, state: { tamper: 0 },
    fps: 60, tierName: 'static', nodeReveal: 1, consensus: 0,
  };
  const dirStub = { setHashChanged: (on) => document.querySelector('[data-section="s03"]').classList.toggle('is-changed', on) };
  const lab = new HashLab(stub, dirStub);
  const net = new LiveNetwork(stub);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    lab.tick(dt);
    net.tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.querySelector('[data-nodecount]').textContent = '12,842';
}

main();
