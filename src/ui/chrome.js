import { damp } from '../world/util.js';

// ═══════════════════════════════════════════════════════════════════════
// CHROME — boot sequence, cursor, hover labels, quality control
// ═══════════════════════════════════════════════════════════════════════

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Boot {
  constructor() {
    this.el = document.getElementById('boot');
    this.bar = this.el.querySelector('.boot__bar i');
    this.status = this.el.querySelector('[data-boot-status]');
    document.body.classList.add('is-booting');
  }

  async step(label, to) {
    this.status.textContent = `${label} · ${String(Math.round(to * 100)).padStart(2, '0')}%`;
    this.bar.style.width = to * 100 + '%';
    await raf(); await raf();
  }

  async finish() {
    await this.step('NETWORK ONLINE', 1);
    await wait(340);
    this.el.classList.add('is-done');
    document.body.classList.remove('is-booting');
    document.body.classList.add('world-ready');
    setTimeout(() => this.el.remove(), 1400);
  }
}

export class Cursor {
  constructor() {
    this.el = document.querySelector('[data-cursor]');
    this.dot = this.el.querySelector('.cursor__dot');
    this.ring = this.el.querySelector('.cursor__ring');

    this.label = document.createElement('div');
    this.label.className = 'hoverlabel';
    this.label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.label);

    this.x = innerWidth / 2; this.y = innerHeight / 2;
    this.rx = this.x; this.ry = this.y;
    this.on = false;

    if (matchMedia('(pointer: fine)').matches) {
      document.body.classList.add('has-cursor');
      addEventListener('pointermove', (e) => {
        this.x = e.clientX; this.y = e.clientY;
        if (!this.on) { this.rx = this.x; this.ry = this.y; this.on = true; }
      }, { passive: true });

      const hot = 'a, button, input, .appindex li, [data-set]';
      addEventListener('pointerover', (e) => {
        document.body.classList.toggle('cursor-hot', !!e.target.closest?.(hot));
      }, { passive: true });
    }
  }

  setHover(info) {
    if (info) {
      this.label.textContent = info.label;
      this.label.classList.add('is-on');
      document.body.classList.add('cursor-hot');
    } else {
      this.label.classList.remove('is-on');
      document.body.classList.remove('cursor-hot');
    }
  }

  tick(dt) {
    this.rx = damp(this.rx, this.x, 14, dt);
    this.ry = damp(this.ry, this.y, 14, dt);
    this.dot.style.transform = `translate(${this.x}px, ${this.y}px) translate(-50%,-50%)`;
    this.ring.style.transform = `translate(${this.rx}px, ${this.ry}px) translate(-50%,-50%)`;
    this.label.style.transform = `translate(${this.rx + 22}px, ${this.ry - 8}px)`;
  }
}

export class QualityToggle {
  constructor(world) {
    this.world = world;
    this.el = document.querySelector('[data-quality]');
    this.label = document.querySelector('[data-quality-label]');
    this.order = ['high', 'medium', 'low'];
    this.sync();
    this.el.addEventListener('click', () => {
      const i = this.order.indexOf(this.world.tierName);
      const next = this.order[(i + 1) % this.order.length];
      this.el.disabled = true;
      this.label.textContent = '…';
      // let the label paint before the (blocking) world rebuild
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.world.setTier(next);
        this.world.degraded = 0;
        this.sync();
        this.el.disabled = false;
      }));
    });
  }

  sync() { this.label.textContent = this.world.tierName.toUpperCase(); }
}
