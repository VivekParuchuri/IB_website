import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const OUT = process.argv[3] || 'shots-mobile';
const W = Number(process.argv[4] || 390), H = Number(process.argv[5] || 844);
const NOGL = process.argv.includes('--nogl');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader',`--window-size=${W},${H}`] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
const problems = [];
page.on('pageerror', e => problems.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') problems.push('[error] ' + m.text()); });
if (NOGL) {
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) {
      if (t === 'webgl' || t === 'webgl2' || t === 'experimental-webgl') return null;
      return orig.call(this, t, ...a);
    };
  });
}
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, NOGL ? 4000 : 9000));
const stops = [0, 0.16, 0.32, 0.5, 0.72, 0.87, 1];
for (let i = 0; i < stops.length; i++) {
  await page.evaluate(t => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * t)), stops[i]);
  await new Promise(r => setTimeout(r, NOGL ? 900 : 3600));
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2,'0')}.png` });
}
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth, winW: innerWidth,
  body: document.body.className,
}));
console.log(JSON.stringify(overflow));
console.log('PROBLEMS', [...new Set(problems)].slice(0,20).join('\n') || 'none');
await browser.close();
