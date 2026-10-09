// Headless screenshot of a page: node shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright-core';
const [url, out, wait = '6000', w = '1600', h = '1000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, timeout: 180000 });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await browser.close();
