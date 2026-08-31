import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

const ps = [0.22, 0.36, 0.50, 0.66, 0.90];
console.log('p08   camX  state.appIndex  labelShown        mostActivated  nearestOnScreen');
for (const p of ps) {
  await page.evaluate((pp) => {
    const s = document.querySelector('[data-section="s08"]');
    scrollTo(0, Math.round(s.offsetTop + pp * (s.offsetHeight - innerHeight)));
  }, p);
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const w=window.__W,r=w.rig; r.sample(w.scrollT); r.pos.copy(r.tPos); r.look.copy(r.tLook); r.fov=r.fovT; });
  await new Promise(r => setTimeout(r, 3500));
  const row = await page.evaluate(() => {
    const w = window.__W;
    const label = [...document.querySelectorAll('[data-appindex] li')].findIndex(li => li.classList.contains('is-on'));
    const act = w.landmarks.apps.map(a => +a.u.uActivate.value.toFixed(2));
    const out = { x: 0, y: 0, on: false };
    let best = -1, bestD = 1e9;
    w.landmarks.apps.forEach((a, i) => {
      w.project(a.group.position, out);
      const d = Math.abs(out.x - innerWidth / 2);
      if (out.on && d < bestD) { bestD = d; best = i; }
    });
    return { camX: Math.round(w.camera.position.x), idx: +w.state.appIndex.toFixed(2), label, act, nearest: best };
  });
  console.log(String(p).padEnd(6), String(row.camX).padStart(4), String(row.idx).padStart(14),
    String(row.label).padStart(11), '      ', String(row.act.indexOf(Math.max(...row.act))).padStart(9),
    String(row.nearest).padStart(15), ' act=' + row.act.join(','));
}
await browser.close();
