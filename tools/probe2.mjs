import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, Number(process.env.WAIT || 8000)));
const out = await page.evaluate(() => {
  const w = window.__W;
  if (!w) return 'no window.__W';
  const c = w.camera;
  const hero = w.landmarks.hero;
  const hp = hero.group.position;
  const v = hp.clone().project(c);
  return {
    cam: c.position.toArray().map(n => +n.toFixed(1)),
    fov: +c.fov.toFixed(1),
    fog: +w.fogU.uFogDensity.value.toFixed(5),
    reveal: +w.fogU.uReveal.value.toFixed(3),
    exposure: w.renderer.toneMappingExposure,
    heroPos: hp.toArray(),
    heroScale: hero.group.scale.toArray(),
    heroVisible: hero.mesh.visible,
    heroNDC: [ +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3) ],
    heroActivate: +hero.u.uActivate.value.toFixed(2),
    sceneChildren: w.scene.children.length,
    scrollT: w.scrollT,
    intro: +w.intro.toFixed(2),
    drawCalls: w.renderer.info.render.calls,
    triangles: w.renderer.info.render.triangles,
    bloom: w.post.enabled ? +w.post.bloom.strength.toFixed(2) : 'off',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
