import { mulberry32 } from './util.js';

// ═══════════════════════════════════════════════════════════════════════
// THE WORLD PLAN
//
// One deterministic layout drives every system: the gold circuit paths are
// generated first, the occupied cells are recorded, and the block landscape
// is then grown *around* them. That is what makes the pathways read as clean
// channels cut through a dense technological city rather than lines floating
// on top of it.
// ═══════════════════════════════════════════════════════════════════════

export const BAND = 1000;         // world repeats every 1000u along Z
export const CELL = 6;            // corridor grid resolution
export const CORRIDOR = 168;      // half-width of the dense build zone
export const FIELD = 700;         // half-width of the sparse outer field

// Fixed landmarks the camera visits. Terrain is flattened around each.
export const LANDMARKS = {
  hero:    { x: 0,    z: 20,    r: 46 },
  ledger:  { x: 0,    z: -130,  r: 52 },
  anatomy: { x: 0,    z: -272,  r: 74 },
  chain:   { x: 0,    z: -420,  r: 78 },
  nodes:   { x: 0,    z: -640,  r: 150 },
  apps:    { x: 0,    z: -900,  r: 180 },
};

const key = (cx, cz) => cx + ',' + cz;

// ── gold circuit pathways ────────────────────────────────────────────────
// Manhattan walks on the corridor grid: circuit traces, not organic curves.
function buildPaths(rng) {
  const paths = [];
  const occupied = new Set();

  const mark = (cx, cz, pad) => {
    for (let dx = -pad; dx <= pad; dx++)
      for (let dz = -pad; dz <= pad; dz++) occupied.add(key(cx + dx, cz + dz));
  };

  const GROUND_PATHS = 34;
  const SKY_PATHS = 7;

  for (let p = 0; p < GROUND_PATHS + SKY_PATHS; p++) {
    const sky = p >= GROUND_PATHS;
    const level = sky ? 17 + rng() * 12 : 0.42;
    const width = sky ? 0.62 : 0.46;

    let cx = Math.round((rng() * 2 - 1) * (CORRIDOR / CELL) * 0.9);
    let cz = Math.round((rng() * 2 - 1) * (BAND / CELL) * 0.5);

    const pts = [[cx, cz]];
    const legs = 5 + Math.floor(rng() * 8);
    let axis = rng() < 0.5;

    for (let l = 0; l < legs; l++) {
      const run = 3 + Math.floor(rng() * 13);
      const dir = rng() < 0.5 ? 1 : -1;
      for (let s = 0; s < run; s++) {
        if (axis) cx += dir; else cz += dir;
        // keep ground traces inside the dense corridor
        cx = Math.max(-Math.floor(CORRIDOR / CELL), Math.min(Math.floor(CORRIDOR / CELL), cx));
        cz = Math.max(-Math.floor(BAND / CELL / 2) + 1, Math.min(Math.floor(BAND / CELL / 2) - 1, cz));
        pts.push([cx, cz]);
      }
      axis = !axis;
    }

    // dedupe consecutive duplicates produced by clamping
    const clean = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = clean[clean.length - 1];
      if (pts[i][0] !== a[0] || pts[i][1] !== a[1]) clean.push(pts[i]);
    }
    if (clean.length < 4) continue;

    if (!sky) for (const [x, z] of clean) mark(x, z, 1);

    // collapse the grid walk into straight segments, then to world space
    const world = clean.map(([x, z]) => [x * CELL, level, z * CELL]);
    paths.push({ pts: world, sky, width, level });
  }

  return { paths, occupied };
}

// ── the block landscape ─────────────────────────────────────────────────
function buildTerrain(rng, occupied, count) {
  const corridorShare = 0.68;
  const nCorridor = Math.floor(count * corridorShare);
  const nField = count - nCorridor;

  const offset = new Float32Array(count * 3);
  const scale = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);   // gold, seed, type, rotY

  let i = 0;
  const push = (x, z, dense) => {
    const seed = rng();
    const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
    const onPath = dense && occupied.has(key(cx, cz));

    // ridge/plateau field: gives the terrain readable landforms instead of noise
    const ridge =
      Math.sin(x * 0.0125) * Math.cos(z * 0.0093) * 0.5 +
      Math.sin((x + z) * 0.0271) * 0.28 +
      Math.sin(z * 0.0061 + x * 0.0038) * 0.32;

    let h = 1.4 + Math.pow(rng(), 2.1) * 9.5 + Math.max(0, ridge) * 7.0;
    if (rng() < 0.035) h += 6 + rng() * 20;                // towers
    if (onPath) h = 0.28 + rng() * 0.5;                    // path channel: flat
    if (!dense) h *= 0.72;

    const w = onPath ? CELL * 0.9 : 1.7 + rng() * (dense ? 3.4 : 5.4);
    const d = onPath ? CELL * 0.9 : w * (0.62 + rng() * 0.85);

    offset[i * 3 + 0] = x;
    offset[i * 3 + 1] = 0;
    offset[i * 3 + 2] = z;
    scale[i * 3 + 0] = w;
    scale[i * 3 + 1] = h;
    scale[i * 3 + 2] = d;

    // gold is RARE: ~2.2% of blocks carry a live gold signature
    const goldRoll = rng();
    const gold = onPath ? 0 : goldRoll < 0.022 ? 0.55 + rng() * 0.45 : goldRoll < 0.055 ? rng() * 0.14 : 0;

    params[i * 4 + 0] = gold;
    params[i * 4 + 1] = seed;
    params[i * 4 + 2] = rng() < 0.34 ? 1 : 0;              // carries a surface glyph
    params[i * 4 + 3] = rng() < 0.88 ? 0 : (rng() - 0.5) * 0.9;
    i++;
  };

  // dense corridor: jittered grid, so it reads as engineered, not scattered
  const cols = Math.ceil(Math.sqrt(nCorridor * ((CORRIDOR * 2) / BAND)));
  const rows = Math.ceil(nCorridor / cols);
  const sx = (CORRIDOR * 2) / cols, sz = BAND / rows;
  for (let r = 0; r < rows && i < nCorridor; r++) {
    for (let c = 0; c < cols && i < nCorridor; c++) {
      const x = -CORRIDOR + (c + 0.5) * sx + (rng() - 0.5) * sx * 0.55;
      const z = -BAND / 2 + (r + 0.5) * sz + (rng() - 0.5) * sz * 0.55;
      push(x, z, true);
    }
  }

  // outer field: density falls away from the travel corridor
  for (let n = 0; n < nField; n++) {
    const side = rng() < 0.5 ? -1 : 1;
    const t = Math.pow(rng(), 1.75);
    const x = side * (CORRIDOR + t * (FIELD - CORRIDOR));
    const z = (rng() - 0.5) * BAND;
    push(x, z, false);
  }

  return { offset, scale, params, count: i };
}

// ── nodes: the decentralised swarm ──────────────────────────────────────
function buildNodes(rng, count) {
  const L = LANDMARKS.nodes;
  const pos = new Float32Array(count * 3);
  const meta = new Float32Array(count * 3); // seed, gold, order(0..1)

  for (let i = 0; i < count; i++) {
    // shell-biased ellipsoid: a swarm with structure, no centre of gravity
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.42);
    const s = Math.sqrt(1 - u * u);
    pos[i * 3 + 0] = L.x + s * Math.cos(th) * rr * 190;
    pos[i * 3 + 1] = L.z * 0 + 44 + u * rr * 62;
    pos[i * 3 + 2] = L.z + s * Math.sin(th) * rr * 235;
    meta[i * 3 + 0] = rng();
    meta[i * 3 + 1] = rng() < 0.09 ? 0.6 + rng() * 0.4 : 0;
    meta[i * 3 + 2] = rr;  // inner nodes reveal first as the camera pulls back
  }
  return { pos, meta, count };
}

// links between neighbouring nodes — the mesh that has no centre
function buildLinks(rng, nodes, maxLinks) {
  const { pos, count } = nodes;
  const a = [], b = [];
  const tries = maxLinks * 7;
  for (let t = 0; t < tries && a.length < maxLinks; t++) {
    const i = Math.floor(rng() * count);
    const j = Math.floor(rng() * count);
    if (i === j) continue;
    const dx = pos[i * 3] - pos[j * 3];
    const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
    const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 62 * 62 || d2 < 9) continue;
    a.push(i); b.push(j);
  }
  return { a, b };
}

export function buildLayout(quality) {
  const rng = mulberry32(0x0BADC0DE);
  const { paths, occupied } = buildPaths(rng);
  const terrain = buildTerrain(rng, occupied, quality.blocks);
  const nodes = buildNodes(rng, quality.nodes);
  const links = buildLinks(rng, nodes, quality.links);
  return { paths, terrain, nodes, links, rng };
}
