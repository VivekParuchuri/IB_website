import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('ab', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));
// isolate the glyph layer so we can see exactly what it draws
await page.evaluate(() => {
  const w = window.__W;
  const hide = [w.terrain.mesh, w.terrain.ground, w.paths.ribbons, w.paths.packets, w.dust.points, w.nodes.mesh, w.nodes.links];
  const f = w.frame.bind(w);
  w.frame = function () { f(); for (const o of hide) o.visible = false; w.landmarks.group && (w.landmarks.group.visible = false); w.scene.traverse(o => { if (o.isMesh && o !== w.glyphs.mesh && !hide.includes(o)) o.visible = false; }); };
  document.querySelectorAll('.stage, .nav, .rail, .quality').forEach(e => e.style.display = 'none');
});
await new Promise(r => setTimeout(r, 6000));
await page.screenshot({ path: 'ab/glyphs-only.png' });
console.log('captured');
await browser.close();
