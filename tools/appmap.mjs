import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

const rows = await page.evaluate(() => {
  const w = window.__W;
  const sec = document.querySelector('[data-section="s08"]');
  const top = sec.offsetTop, travel = sec.offsetHeight - innerHeight;
  const max = document.documentElement.scrollHeight - innerHeight;
  const out = [];
  for (let p = 0.10; p <= 0.98; p += 0.02) {
    const t = (top + p * travel) / max;
    w.rig.sample(t);
    // which application is nearest the camera's forward axis?
    const cam = w.rig.tPos, look = w.rig.tLook;
    const fx = look.x - cam.x, fz = look.z - cam.z;
    const flen = Math.hypot(fx, fz);
    let best = -1, bestAng = 1e9;
    w.landmarks.apps.forEach((a, i) => {
      const dx = a.group.position.x - cam.x, dz = a.group.position.z - cam.z;
      const ang = Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz));
      if (ang < bestAng) { bestAng = ang; best = i; }
    });
    out.push({ p: +p.toFixed(2), camX: Math.round(cam.x), centred: best, deg: +(bestAng * 180 / Math.PI).toFixed(1) });
  }
  return out;
});
console.log('p     camX  centredApp  offAxis°');
for (const r of rows) console.log(String(r.p).padEnd(6), String(r.camX).padStart(5), String(r.centred).padStart(8), String(r.deg).padStart(9));
await browser.close();
