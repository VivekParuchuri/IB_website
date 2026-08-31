import { sha256Hex } from './sha256.js';

// ═══════════════════════════════════════════════════════════════════════
// THE HASHING LAB
// Real SHA-256 over a real transaction string. Change one digit of the
// amount and the entire digest changes — the demo highlights exactly which
// characters moved, then shows the chain downstream refusing to validate.
// ═══════════════════════════════════════════════════════════════════════

const BASE = '2.5';
const HEXCHARS = '0123456789abcdef';

const txString = (amount) => `ALICE>BOB|${amount}ETH|BLOCK#10245|1731628800`;

function chainOf(amount) {
  let prev = '0'.repeat(64);
  const out = [];
  for (let i = 0; i < 5; i++) {
    const payload = i === 2 ? `TX:ALICE>BOB:${amount}ETH` : `TX:BATCH-${i + 1}`;
    prev = sha256Hex(prev + payload + ':' + i);
    out.push(prev);
  }
  return out;
}

export class HashLab {
  constructor(world, director) {
    this.world = world;
    this.director = director;

    this.input = document.querySelector('[data-amount]');
    this.hashEl = document.querySelector('[data-hash]');
    this.stateEl = document.querySelector('[data-hash-state]');
    this.verdictEl = document.querySelector('[data-verdict]');
    this.chips = [...document.querySelectorAll('[data-set]')];
    this.mbs = [...document.querySelectorAll('.mb')];
    this.mbHashes = this.mbs.map((m) => m.querySelector('[data-mbh]'));

    this.target = '';
    this.shown = '';
    this.diff = new Array(64).fill(false);
    this.reveal = 64;
    this.scrambleT = 0;

    this.baseChain = chainOf(BASE);

    for (const c of this.chips) {
      c.addEventListener('click', () => {
        this.input.value = c.dataset.set;
        this.apply(true);
      });
    }

    this.input.addEventListener('input', () => this.apply(true));
    this.input.addEventListener('focus', () => this.input.select());

    this.apply(false);
  }

  get amount() {
    const raw = (this.input.value || '').trim();
    return raw === '' ? '0' : raw;
  }

  apply(animate) {
    const amount = this.amount;
    const next = sha256Hex(txString(amount));

    this.diff = next.split('').map((ch, i) => ch !== (this.target[i] || ch));
    this.target = next;

    if (animate) {
      this.reveal = 0;
      this.scrambleT = 0;
    } else {
      this.reveal = 64;
      this.shown = next;
      this.paint();
    }

    const changed = amount !== BASE;
    this.director.setHashChanged(changed);
    this.world.setTamper(changed ? 1 : 0);
    this.stateEl.textContent = changed ? 'RECOMPUTED' : 'SEALED';

    for (const c of this.chips) c.classList.toggle('is-on', c.dataset.set === amount);

    // the ledger's answer
    const chain = chainOf(amount);
    for (let i = 0; i < 5; i++) {
      const broken = chain[i] !== this.baseChain[i];
      this.mbHashes[i].textContent = chain[i].slice(0, 6).toUpperCase();
      this.mbs[i].classList.toggle('is-bad', broken && i === 2);
      this.mbs[i].classList.toggle('is-broken', broken && i > 2);
    }
    const invalid = chain[2] !== this.baseChain[2];
    this.verdictEl.textContent = invalid ? 'CHAIN INVALID · 3 BLOCKS ORPHANED' : 'CHAIN VALID';
    this.verdictEl.classList.toggle('is-bad', invalid);

    if (animate) this.world.pulse(invalid ? 0.7 : 1);
  }

  tick(dt) {
    if (this.reveal >= 64) return;
    this.scrambleT += dt;
    const next = Math.min(64, Math.floor((this.scrambleT / 0.62) * 64));
    if (next === this.reveal && this.scrambleT % 0.05 > 0.033) return;
    this.reveal = next;

    let s = '';
    for (let i = 0; i < 64; i++) {
      s += i < this.reveal ? this.target[i] : HEXCHARS[(Math.random() * 16) | 0];
    }
    this.shown = s;
    this.paint();
  }

  paint() {
    // characters that changed are lifted out in white — the avalanche, visible
    let html = '';
    let run = '', runDiff = false;
    for (let i = 0; i < 64; i++) {
      const d = this.diff[i] && i < this.reveal;
      if (d !== runDiff && run) {
        html += runDiff ? `<b>${run}</b>` : run;
        run = '';
      }
      runDiff = d;
      run += this.shown[i] || '0';
    }
    html += runDiff ? `<b>${run}</b>` : run;
    this.hashEl.innerHTML = html.toUpperCase();
  }
}
