import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('h', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

// park in front of the DIGITAL IDENTITY credential
await page.evaluate(() => {
  const s = document.querySelector('[data-section="s08"]');
  scrollTo(0, Math.round(s.offsetTop + 0.50 * (s.offsetHeight - innerHeight)));
});
await new Promise(r => setTimeout(r, 1400));
await page.evaluate(() => { const w=window.__W,r=w.rig; r.sample(w.scrollT); r.pos.copy(r.tPos); r.look.copy(r.tLook); r.fov=r.fovT; });
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: 'h/before-hover.png' });

const t = await page.evaluate(() => {
  const w = window.__W, out = { x: 0, y: 0, on: false };
  w.project(w.landmarks.apps[2].group.position, out);
  return out;
});
await page.mouse.move(t.x, t.y);
await new Promise(r => setTimeout(r, 600));
await page.mouse.move(t.x + 4, t.y + 2);
await new Promise(r => setTimeout(r, 6000));
await page.screenshot({ path: 'h/hovering.png' });
console.log(JSON.stringify(await page.evaluate(() => {
  const w = window.__W;
  return { label: w.hovered?.label, attractW: +w.dust.uniforms.uAttract.value.w.toFixed(2),
           hoverU: +w.landmarks.apps[2].u.uHover.value.toFixed(2) };
})));
console.log('ERRORS', errs.join('\n') || 'none');
await browser.close();
