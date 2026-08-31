import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:4173/';
const T = Number(process.argv[3] ?? 0.8);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6500));
await page.evaluate((t) => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * t)), T);
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(() => {
  const vh = innerHeight, y = scrollY;
  const secs = [...document.querySelectorAll('[data-section]')].map((el) => ({
    k: el.dataset.section,
    top: el.offsetTop,
    h: el.offsetHeight,
    travel: el.offsetHeight - innerHeight,
    p: +getComputedStyle(el).getPropertyValue('--p'),
    inn: +getComputedStyle(el).getPropertyValue('--in'),
  }));
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return 'MISSING';
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { cls: e.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: cs.opacity, disp: cs.display, vis: cs.visibility };
  };
  return {
    y, vh, max: document.documentElement.scrollHeight - vh,
    secs,
    appsPanel: box('.panel--apps'),
    appOn: box('.app.is-on'),
    appsWrap: box('[data-apps]'),
    onCount: document.querySelectorAll('.app.is-on').length,
    rail: document.querySelector('[data-rail-current]').textContent + ' ' + document.querySelector('[data-rail-label]').textContent,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
