// Load a viewer page and report whether the splat finished loading (window.__ready + status text).
import { chromium } from 'playwright-core';
const [url, waitMs = '90000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.goto(url, { waitUntil: 'load' });
try { await p.waitForFunction(() => window.__ready === true, null, { timeout: +waitMs }); } catch {}
console.log(JSON.stringify({ ready: await p.evaluate(() => !!window.__ready), status: await p.evaluate(() => document.getElementById('status')?.textContent || ''), errors: errs.slice(0, 5) }));
await b.close();
