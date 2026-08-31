import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));
console.log('p08   camPos                 nearest mesh in scene (dist, name/size)');
for (const p of [0.36, 0.50, 0.66, 0.90]) {
  await page.evaluate((pp) => {
    const s = document.querySelector('[data-section="s08"]');
    scrollTo(0, Math.round(s.offsetTop + pp * (s.offsetHeight - innerHeight)));
  }, p);
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { const w=window.__W,r=w.rig; r.sample(w.scrollT); r.pos.copy(r.tPos); r.look.copy(r.tLook); r.fov=r.fovT; });
  await new Promise(r => setTimeout(r, 3000));
  const row = await page.evaluate(() => {
    const w = window.__W, THREE = w.THREE;
    const cam = w.camera.position;
    const hits = [];
    w.landmarks.apps.forEach((a, i) => {
      a.group.traverse(o => {
        if (!o.isMesh) return;
        const wp = o.getWorldPosition(new (cam.constructor)());
        hits.push({ app: i, d: +wp.distanceTo(cam).toFixed(1), s: o.scale.toArray().map(n=>+n.toFixed(1)).join('x') });
      });
    });
    hits.sort((x, y) => x.d - y.d);
    return { cam: cam.toArray().map(n => Math.round(n)).join(','), near: hits.slice(0, 3) };
  });
  console.log(String(p).padEnd(6), row.cam.padEnd(22), row.near.map(h => `app${h.app} d=${h.d} (${h.s})`).join('  '));
}
await browser.close();
