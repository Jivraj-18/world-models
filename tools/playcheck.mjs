// Click the first Play button and wait for the video to really play; report progress or the media error.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.goto(process.argv[2], { waitUntil: 'load' });
await p.click('.model .btn.play');
const res = await p.evaluate(() => new Promise((ok) => {
  const v = document.querySelector('.model .player video');
  const t0 = performance.now();
  const done = (why) => ok({ why, sec: ((performance.now() - t0) / 1000).toFixed(1), time: v.currentTime.toFixed(2), paused: v.paused, w: v.videoWidth, ready: v.readyState, err: v.error && v.error.code });
  v.addEventListener('timeupdate', () => v.currentTime > 0.5 && done('playing'));
  v.addEventListener('error', () => done('error'));
  setTimeout(() => done('timeout'), 30000);
}));
console.log(JSON.stringify(res));
await b.close();
