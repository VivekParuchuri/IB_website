import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('shots-intro', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
for (const at of [400, 1500, 2600, 3700, 5000, 7000]) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  await page.screenshot({ path: `shots-intro/${String(at).padStart(5,'0')}ms.png` });
  console.log('captured', at + 'ms');
}
await browser.close();
