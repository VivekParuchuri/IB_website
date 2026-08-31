import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('[error] ' + m.text()); });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

const report = [];
for (const tier of ['medium', 'low', 'high', 'low']) {
  await page.evaluate(t => window.__W.setTier(t), tier);
  await new Promise(r => setTimeout(r, 5000));
  report.push(await page.evaluate(() => {
    const w = window.__W;
    const m = w.renderer.info.memory;
    return { tier: w.tierName, geometries: m.geometries, textures: m.textures, sceneChildren: w.scene.children.length };
  }));
}
// also scroll after swapping, to prove the rebind held
await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)));
await new Promise(r => setTimeout(r, 4000));
report.push(await page.evaluate(() => ({ after: 'scroll', camZ: +window.__W.camera.position.z.toFixed(0), scrollT: +window.__W.scrollT.toFixed(2) })));
console.log(JSON.stringify(report, null, 1));
console.log('ERRORS', [...new Set(errs)].join('\n') || 'none');
await browser.close();
