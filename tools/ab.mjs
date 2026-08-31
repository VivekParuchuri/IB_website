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
const T = Number(process.argv[3] || 0.18);
await page.evaluate(t => scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * t)), T);
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => { const w=window.__W,r=w.rig; r.sample(w.scrollT); r.pos.copy(r.tPos); r.look.copy(r.tLook); r.fov=r.fovT; r.fog=r.fogT; r.bloom=r.bloomT; r.gold=r.goldT; });
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: `ab/on-t${T}.png` });
// freeze the glyph layer off and re-shoot the identical frame
await page.evaluate(() => { const w=window.__W; w.glyphs.mesh.visible=false; w.__lockGlyph=true;
  const f=w.frame.bind(w); w.frame=function(){ f(); w.glyphs.mesh.visible=false; }; });
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: `ab/off-t${T}.png` });
const stat = await page.evaluate(() => ({ glyphOpacity: +window.__W.glyphs.uniforms.uOpacity.value.toFixed(2) }));
console.log(JSON.stringify(stat));
await browser.close();
