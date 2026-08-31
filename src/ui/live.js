// ═══════════════════════════════════════════════════════════════════════
// LIVE NETWORK
// Simulated, and labelled as such in the footer — but it behaves like a
// real chain: transactions accumulate, blocks seal on an irregular cadence,
// and every sealed block fires a gold shockwave through the 3D world.
// ═══════════════════════════════════════════════════════════════════════

const hex = (n) => Array.from({ length: n }, () => '0123456789ABCDEF'[(Math.random() * 16) | 0]).join('');
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class LiveNetwork {
  constructor(world) {
    this.world = world;

    this.nodesEl = document.querySelector('[data-stat="nodes"]');
    this.txEl = document.querySelector('[data-stat="tx"]');
    this.blockEl = document.querySelector('[data-stat="block"]');
    this.navBlockEl = document.querySelector('[data-live-block]');
    this.barsEl = document.querySelector('[data-bars]');
    this.listEl = document.querySelector('[data-ticker-list]');
    this.clockEl = document.querySelector('[data-clock]');
    this.fpsEl = document.querySelector('[data-fps]');

    this.nodes = 12842;
    this.tx = 2481920;
    this.block = 10245;

    this.BARS = 30;
    this.bars = [];
    for (let i = 0; i < this.BARS; i++) {
      const b = document.createElement('i');
      this.barsEl.appendChild(b);
      this.bars.push({ el: b, v: 0.1 + Math.random() * 0.3, t: Math.random() });
    }

    this.nextBlock = 4 + Math.random() * 4;
    this.nextTick = 0.9;
    this.nextBar = 0;
    this.nextClock = 0;
    this.nextFps = 1;
    this.acc = 0;

    for (let i = 0; i < 6; i++) this.addRow(this.makeTx(), false);
    this.paint();
  }

  makeTx() {
    return {
      k: '0x' + hex(8),
      v: (Math.random() * 24 + 0.1).toFixed(2),
      s: Math.random() < 0.72 ? 'CONFIRMED' : 'PENDING',
    };
  }

  addRow(entry, animate = true) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${entry.k}</b><u>${entry.v} ETH</u><span>${entry.s}</span>`;
    if (!animate) li.style.animation = 'none';
    this.listEl.prepend(li);
    while (this.listEl.children.length > 8) this.listEl.lastElementChild.remove();
  }

  paint() {
    this.nodesEl.textContent = fmt(this.nodes);
    this.txEl.textContent = fmt(this.tx);
    const b = '#' + fmt(this.block);
    this.blockEl.textContent = b;
    this.navBlockEl.textContent = b;
  }

  flash(el) {
    el.classList.remove('is-tick');
    void el.offsetWidth;
    el.classList.add('is-tick');
  }

  tick(dt) {
    this.acc += dt;

    // transactions never stop arriving
    this.tx += (9 + Math.random() * 26) * dt;
    this.nodes += (Math.random() - 0.5) * 14 * dt;
    this.nodes = Math.max(12600, Math.min(13080, this.nodes));

    this.nextTick -= dt;
    if (this.nextTick <= 0) {
      this.nextTick = 0.55 + Math.random() * 0.9;
      this.paint();
      this.addRow(this.makeTx());
    }

    // a block seals, and the whole landscape feels it
    this.nextBlock -= dt;
    if (this.nextBlock <= 0) {
      this.nextBlock = 5 + Math.random() * 5;
      this.block++;
      this.paint();
      this.flash(this.blockEl);
      this.addRow({ k: 'BLOCK #' + fmt(this.block), v: (120 + Math.random() * 260).toFixed(0) + ' TX', s: 'SEALED' });
      this.world.pulse(1);
    }

    // network activity spectrum
    this.nextBar -= dt;
    if (this.nextBar <= 0) {
      this.nextBar = 0.09;
      for (let i = 0; i < this.BARS; i++) {
        const bar = this.bars[i];
        bar.t += 0.12 + i * 0.004;
        const target = 0.14 + (Math.sin(bar.t) * 0.5 + 0.5) * 0.55 + Math.random() * 0.3;
        bar.v += (target - bar.v) * 0.4;
        bar.el.style.height = (bar.v * 100).toFixed(1) + '%';
        bar.el.classList.toggle('hot', bar.v > 0.62);
      }
    }

    this.nextClock -= dt;
    if (this.nextClock <= 0) {
      this.nextClock = 1;
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      this.clockEl.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
    }

    this.nextFps -= dt;
    if (this.nextFps <= 0) {
      this.nextFps = 1;
      this.fpsEl.textContent = `${Math.round(this.world.fps)} FPS · ${this.world.tierName.toUpperCase()}`;
    }
  }
}
