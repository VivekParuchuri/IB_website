import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('m', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=390,844'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await page.goto(process.argv[2], { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 8000));

// open the menu
await page.click('[data-menu-toggle]');
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'm/menu-open.png' });
const open = await page.evaluate(() => ({
  bodyClass: document.body.className.includes('menu-open'),
  expanded: document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded'),
  linkVisible: getComputedStyle(document.querySelector('.menu__links a')).opacity,
}));
console.log('opened:', JSON.stringify(open));

// tapping a link should navigate and close
await page.click('.menu__links a[data-target="s08"]');
await new Promise(r => setTimeout(r, 3500));
const after = await page.evaluate(() => ({
  menuOpen: document.body.className.includes('menu-open'),
  scrolled: scrollY > 1000,
  rail: document.querySelector('[data-rail-label]').textContent,
}));
console.log('after tap:', JSON.stringify(after));

// section 03 ledger response on mobile
await page.evaluate(() => {
  const s = document.querySelector('[data-section="s03"]');
  scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * 0.5);
});
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: 'm/s03.png' });
const chain = await page.evaluate(() => {
  const el = document.querySelector('.minichain');
  const r = el.getBoundingClientRect();
  return { display: getComputedStyle(el).display, w: Math.round(r.width), inView: r.bottom <= innerHeight + 4 && r.top > 0 };
});
console.log('minichain:', JSON.stringify(chain));
console.log('ERRORS', [...new Set(errs)].join('\n') || 'none');
await browser.close();
