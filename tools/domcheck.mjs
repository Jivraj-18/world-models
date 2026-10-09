// Load a page and report element counts and errors (no screenshot): node domcheck.mjs <url>
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(process.argv[2], { waitUntil: 'load' });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => ({
  videos: document.querySelectorAll('video[src]').length,
  fastTables: document.querySelectorAll('#fast table').length, fullTables: document.querySelectorAll('#full table').length,
  fastTotal: [...document.querySelectorAll('#fast tfoot td')].map((t) => t.textContent).filter(Boolean).join(' | '),
  fullTotal: [...document.querySelectorAll('#full tfoot td')].map((t) => t.textContent).filter(Boolean).join(' | '),
  compare: [...document.querySelectorAll('#cmp-rows tr')].map((r) => r.textContent).slice(2, 4),
  caption: document.getElementById('caption-zoom')?.textContent.slice(0, 40),
}))), 'errors:', errs);
await b.close();
