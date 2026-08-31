// Dev-only visual smoke test: drives the built site in Chrome, scrolls the
// whole journey, captures frames and reports any console/page errors.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://localhost:4173/';
const OUT = process.argv[3] || 'shots';
const STOPS = process.argv[4]
  ? process.argv[4].split(',').map(Number)
  : [0, 0.07, 0.15, 0.24, 0.33, 0.42, 0.52, 0.61, 0.70, 0.80, 0.90, 1];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1600,900',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') problems.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 7000));   // let the boot + intro finish

const diag = await page.evaluate(() => {
  const c = document.getElementById('scene');
  const gl = c?.getContext('webgl2') || c?.getContext('webgl');
  return {
    bodyClass: document.body.className,
    canvas: c ? `${c.width}x${c.height}` : 'none',
    renderer: gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : 'none',
    scrollHeight: document.documentElement.scrollHeight,
    sections: [...document.querySelectorAll('[data-section]')].map((s) => s.dataset.section),
  };
});
console.log('DIAG', JSON.stringify(diag, null, 1));

for (let i = 0; i < STOPS.length; i++) {
  const t = STOPS[i];
  await page.evaluate((tt) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, Math.round(max * tt));
  }, t);
  await new Promise((r) => setTimeout(r, 1800));
  // Software rendering runs at a few fps, and the rig damps per frame, so
  // snap it to the sampled target instead of waiting dozens of seconds.
  await page.evaluate(() => {
    const w = window.__W; if (!w) return;
    const r = w.rig;
    r.sample(w.scrollT);
    r.pos.copy(r.tPos); r.look.copy(r.tLook);
    r.fov = r.fovT; r.fog = r.fogT; r.bloom = r.bloomT; r.gold = r.goldT;
  });
  await new Promise((r) => setTimeout(r, Number(process.env.SETTLE || 4200)));
  const name = `${OUT}/${String(i).padStart(2, '0')}-t${t.toFixed(2)}.png`;
  await page.screenshot({ path: name });
  console.log('shot', name);
}

console.log('\n--- PROBLEMS (' + problems.length + ') ---');
console.log([...new Set(problems)].slice(0, 40).join('\n') || 'none');

await browser.close();
