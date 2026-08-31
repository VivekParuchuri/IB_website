import { clamp, smoothstep, lerp } from '../world/util.js';

// ═══════════════════════════════════════════════════════════════════════
// THE DIRECTOR
// Turns one scroll position into: a camera position in the world, a fade
// envelope per section, and the choreography of every element on screen.
// Nothing here fades a section in and out on its own timer — it is all one
// clock, so the copy and the camera always agree about where you are.
// ═══════════════════════════════════════════════════════════════════════

export class Director {
  constructor(world) {
    this.world = world;
    this.sections = [...document.querySelectorAll('[data-section]')].map((el) => ({
      el,
      key: el.dataset.section,
      label: el.dataset.label || '',
      top: 0, travel: 1, p: -1, inn: -1,
    }));

    this.navLinks = [...document.querySelectorAll('.nav__links a')];
    this.nav = document.getElementById('nav');
    this.railFill = document.querySelector('[data-rail-fill]');
    this.railCur = document.querySelector('[data-rail-current]');
    this.railLabel = document.querySelector('[data-rail-label]');
    document.querySelector('[data-rail-total]').textContent = String(this.sections.length).padStart(2, '0');

    this.flow = [...document.querySelectorAll('[data-flow] li')];
    this.holo = [...document.querySelectorAll('[data-holo] .holo__item')];
    this.concepts = [...document.querySelectorAll('[data-concepts] .concept')];
    this.consensus = [...document.querySelectorAll('[data-consensus] li')];
    this.apps = [...document.querySelectorAll('[data-apps] .app')];
    this.appIndex = [...document.querySelectorAll('[data-appindex] li')];
    this.chainLabels = [...document.querySelectorAll('[data-chainlabels] span')];
    this.nodeCountEl = document.querySelector('[data-nodecount]');
    this.s03 = this.sections.find((s) => s.key === 's03').el;
    this.s04 = this.sections.find((s) => s.key === 's04').el;

    this.counters = [...document.querySelectorAll('[data-count-to]')].map((el) => ({
      el, to: +el.dataset.countTo, at: 0,
    }));

    this.last = { nav: -1, rail: -1, appIdx: -1, nodeCount: -1, cons: -1, tamper: -1 };
    this.proj = { x: 0, y: 0, on: false };
    this.appIndexActive = 0;

    this.appIndex.forEach((li) => {
      li.addEventListener('click', () => this.scrollToApp(+li.dataset.i));
    });

    this.measure();
    this.bindNav();

    let rt;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.measure(), 140);
    }, { passive: true });
  }

  measure() {
    const vh = innerHeight;
    document.documentElement.style.setProperty('--vhpx', vh + 'px');

    // force the new section heights before reading positions back
    void document.body.offsetHeight;

    const rects = {};
    for (let i = 0; i < this.sections.length; i++) {
      const s = this.sections[i];
      s.top = s.el.offsetTop;
      s.travel = Math.max(1, s.el.offsetHeight - vh);
      // A sticky stage is only pinned for `travel` px; before that it spends a
      // whole viewport sliding into place. `k` converts that viewport into the
      // section's own progress units so the crossfade can cover it.
      s.k = vh / s.travel;
      s.isLast = i === this.sections.length - 1;
      rects[s.key] = { top: s.top, travel: s.travel };
    }
    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    this.world.bind(rects, this.maxScroll);
  }

  bindNav() {
    const toggle = document.querySelector('[data-menu-toggle]');
    const closeMenu = () => {
      document.body.classList.remove('menu-open');
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.setAttribute('aria-label', 'Open menu');
    };

    for (const a of document.querySelectorAll('[data-nav-link]')) {
      a.addEventListener('click', (e) => {
        const key = a.dataset.target;
        const s = this.sections.find((x) => x.key === key);
        if (!s) return;
        e.preventDefault();
        closeMenu();
        scrollTo({ top: s.top + s.travel * 0.42, behavior: 'smooth' });
      });
    }

    toggle?.addEventListener('click', () => {
      const open = !document.body.classList.contains('menu-open');
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  }

  scrollToApp(i) {
    const s = this.sections.find((x) => x.key === 's08');
    if (!s) return;
    const AT = [0.22, 0.36, 0.50, 0.66, 0.90];   // measured, not assumed
    scrollTo({ top: s.top + s.travel * (AT[i] ?? 0.5), behavior: 'smooth' });
  }

  // ── one frame of choreography ───────────────────────────────────────
  tick(dt) {
    const y = scrollY || document.documentElement.scrollTop;
    const t = clamp(y / this.maxScroll, 0, 1);
    this.world.setScroll(t);

    const map = {};
    let bestKey = 'hero', best = -1, bestIdx = 0;

    for (let i = 0; i < this.sections.length; i++) {
      const s = this.sections[i];
      // Raw progress drives the envelope: short sections have a large `k`, so
      // their fade-out window extends past any clamp we would want on the map.
      const raw = (y - s.top) / s.travel;
      const p = clamp(raw, -1.6, 2.6);
      map[s.key] = p;

      // Full opacity for the whole time the camera is inside this section's
      // keyframes (p 0..1); the dissolve happens in the handoff viewport on
      // either side. `k` converts that viewport into this section's own units.
      const rise = smoothstep(-0.80 * s.k, -0.20 * s.k, raw);
      const fall = s.isLast ? 0 : smoothstep(1 + 0.10 * s.k, 1 + 0.70 * s.k, raw);
      let inn = rise * (1 - fall);
      if (inn < 0.012) inn = 0;
      if (inn > best) { best = inn; bestKey = s.key; bestIdx = i; }

      if (Math.abs(p - s.p) > 0.0008) {
        s.p = p;
        s.el.style.setProperty('--p', p.toFixed(4));
      }
      if (Math.abs(inn - s.inn) > 0.0015) {
        s.inn = inn;
        s.el.style.setProperty('--in', inn.toFixed(4));
        // hidden stages leave the compositor and the tab order entirely
        s.el.classList.toggle('is-vis', inn > 0.004);
      }
    }

    for (let i = 0; i < this.sections.length; i++) {
      this.sections[i].el.classList.toggle('is-live', i === bestIdx);
    }
    document.body.classList.toggle('at-final', bestKey === 'final');

    this.world.setProgress(map, bestKey);

    // ── chrome ──
    this.nav.classList.toggle('is-stuck', y > 40);
    if (bestIdx !== this.last.nav) {
      this.last.nav = bestIdx;
      const label = this.sections[bestIdx].label;
      this.railCur.textContent = String(bestIdx + 1).padStart(2, '0');
      this.railLabel.textContent = label;
      const navFor = { hero: 'hero', s01: 's01', s02: 's03', s03: 's03', s04: 's03', s05: 's03', s06: 's03', s07: 's03', s08: 's08', live: 'live', final: 'live' };
      const want = navFor[bestKey];
      for (const a of this.navLinks) a.classList.toggle('is-active', a.dataset.target === want);
    }
    const railPct = Math.round(t * 1000) / 10;
    if (railPct !== this.last.rail) { this.last.rail = railPct; this.railFill.style.width = railPct + '%'; }

    // ── 01 · the flow of a transaction ──
    const p01 = map.s01 ?? -1;
    for (let i = 0; i < this.flow.length; i++) {
      const lit = p01 > 0.14 + i * 0.13;
      this.flow[i].classList.toggle('is-lit', lit);
      this.flow[i].style.setProperty('--lit', lit ? 1 : 0);
    }

    // ── 02 · the block's holographic readout ──
    const p02 = map.s02 ?? -1;
    for (let i = 0; i < this.holo.length; i++) {
      const lit = smoothstep(0.12 + i * 0.12, 0.26 + i * 0.12, p02);
      this.holo[i].style.setProperty('--lit', lit.toFixed(3));
    }
    for (const c of this.counters) {
      const target = p02 > 0.2 ? c.to : 0;
      c.at = lerp(c.at, target, 1 - Math.exp(-2.4 * dt));
      const v = Math.round(c.at);
      if (v !== c.shown) { c.shown = v; c.el.textContent = String(v).padStart(3, '0'); }
    }

    // ── 04 · integrity failure ──
    const tam = this.world.state.tamper;
    if (Math.abs(tam - this.last.tamper) > 0.02) {
      this.last.tamper = tam;
      const bad = tam > 0.3;
      this.s04.classList.toggle('is-tampered', bad);
      const chainLit = (map.s04 ?? -1) > 0.05;
      for (let i = 0; i < this.chainLabels.length; i++) {
        const el = this.chainLabels[i];
        el.classList.toggle('is-lit', chainLit && !bad);
        el.classList.toggle('is-bad', bad && i === 2);
        el.classList.toggle('is-dead', bad && i > 2);
      }
    }

    // ── 04 · labels ride the blocks they name ──
    const chainVis = (map.s04 ?? -1) > -0.5 && (map.s04 ?? -1) < 1.6;
    if (chainVis && this.world.landmarks) {
      const blocks = this.world.landmarks.chain;
      for (let i = 0; i < this.chainLabels.length && i < blocks.length; i++) {
        const p = this.world.project(blocks[i].group.position, this.proj);
        const el = this.chainLabels[i];
        el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        el.style.opacity = p.on ? '' : '0';
      }
    }

    // ── 05 · the swarm counts itself ──
    const nc = Math.round(this.world.nodeReveal * 12842);
    if (nc !== this.last.nodeCount) {
      this.last.nodeCount = nc;
      this.nodeCountEl.textContent = nc.toLocaleString('en-US');
    }

    // ── 06 · consensus reached, step by step ──
    const cons = this.world.consensus;
    const step = cons > 0.001 ? Math.min(4, Math.floor(cons * 5.4)) : -1;
    if (step !== this.last.cons) {
      this.last.cons = step;
      for (let i = 0; i < this.consensus.length; i++) {
        this.consensus[i].style.setProperty('--lit', i <= step ? 1 : 0);
      }
    }

    // ── 07 · security concepts surface from the network ──
    const p07 = map.s07 ?? -1;
    for (let i = 0; i < this.concepts.length; i++) {
      const lit = smoothstep(0.10 + i * 0.13, 0.26 + i * 0.13, p07);
      this.concepts[i].style.setProperty('--lit', lit.toFixed(3));
    }

    // ── 08 · one application at a time ──
    const p08 = map.s08 ?? -1;
    const idx = clamp(Math.round(this.world.state.appIndex), 0, this.apps.length - 1);
    if (idx !== this.last.appIdx) {
      this.last.appIdx = idx;
      for (let i = 0; i < this.apps.length; i++) this.apps[i].classList.toggle('is-on', i === idx);
      for (let i = 0; i < this.appIndex.length; i++) this.appIndex[i].classList.toggle('is-on', i === idx);
    }
  }

  setHashChanged(on) { this.s03.classList.toggle('is-changed', on); }
}
