import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 9000));

// park at the hero, then sweep the pointer across the genesis block
await page.evaluate(() => {
  const w = window.__W; const r = w.rig;
  r.sample(w.scrollT); r.pos.copy(r.tPos); r.look.copy(r.tLook);
  r.fov = r.fovT; r.fog = r.fogT;
});
await new Promise(r => setTimeout(r, 4000));

const target = await page.evaluate(() => {
  const w = window.__W;
  const out = { x: 0, y: 0, on: false };
  w.project(w.landmarks.hero.group.position, out);
  return out;
});
console.log('hero on screen at', target);
for (const dx of [-40, -10, 0, 10, 40]) {
  await page.mouse.move(target.x + dx, target.y);
  await new Promise(r => setTimeout(r, 700));
}
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(() => {
  const w = window.__W;
  return {
    hoveredLabel: w.hovered ? w.hovered.label : null,
    heroHoverUniform: +w.landmarks.hero.u.uHover.value.toFixed(3),
    dustAttract: w.dust.uniforms.uAttract.value.toArray().map(n => +n.toFixed(1)),
    labelText: document.querySelector('.hoverlabel')?.textContent,
    labelOn: document.querySelector('.hoverlabel')?.classList.contains('is-on'),
    cursorHot: document.body.classList.contains('cursor-hot'),
  };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: 'shots-hover.png' });
console.log('ERRORS', errs.join('\n') || 'none');
await browser.close();
