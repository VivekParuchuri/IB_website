import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => console.log('[' + m.type() + ']', m.text()));
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

await page.evaluate(() => {
  const w = window.__W;
  window.__ev = [];
  w.canvas.addEventListener('webglcontextlost', () => window.__ev.push('LOST'));
  w.canvas.addEventListener('webglcontextrestored', () => window.__ev.push('RESTORED'));
  console.log('noAdapt=' + w.noAdapt + ' search=' + location.search + ' startTier=' + w.tierName);
});

console.log('--- setTier(high) ---');
const immediate = await page.evaluate(() => {
  const w = window.__W;
  try { w.setTier('high'); } catch (e) { return 'THREW: ' + e.message; }
  return { tierName: w.tierName, blocks: w.quality.blocks, lost: w.renderer.getContext().isContextLost() };
});
console.log('immediately after:', JSON.stringify(immediate));

await new Promise(r => setTimeout(r, 8000));
const later = await page.evaluate(() => {
  const w = window.__W;
  return { tierName: w.tierName, blocks: w.quality.blocks, degraded: w.degraded, fps: +w.fps.toFixed(1),
           lost: w.renderer.getContext().isContextLost(), ev: window.__ev,
           geometries: w.renderer.info.memory.geometries };
});
console.log('8s later:', JSON.stringify(later));
await browser.close();
