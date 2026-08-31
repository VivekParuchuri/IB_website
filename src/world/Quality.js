// ═══════════════════════════════════════════════════════════════════════
// QUALITY TIERS
// The full world is heavy on purpose. These tiers keep it honest on
// hardware that cannot carry it, and the no-WebGL path hands off to the
// CSS landscape instead of showing a black rectangle.
// ═══════════════════════════════════════════════════════════════════════

export const TIERS = {
  high: {
    tier: 'high',
    blocks: 15000, dust: 14000, nodes: 2400, links: 4200, glyphs: 120,
    packetMul: 1, post: true, msaa: true, bloomScale: 0.5, maxDpr: 1.75,
  },
  medium: {
    tier: 'medium',
    blocks: 8500, dust: 7000, nodes: 1500, links: 2400, glyphs: 80,
    packetMul: 0.7, post: true, msaa: false, bloomScale: 0.4, maxDpr: 1.35,
  },
  low: {
    tier: 'low',
    blocks: 3800, dust: 2600, nodes: 700, links: 1000, glyphs: 40,
    packetMul: 0.4, post: false, msaa: false, bloomScale: 0.35, maxDpr: 1.0,
  },
};

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function autoTier() {
  const nav = navigator;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 620;
  const saveData = nav.connection?.saveData;

  if (saveData) return 'low';
  if (coarse && small) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  if (coarse) return 'medium';
  return 'high';
}
