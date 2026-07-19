// Mini-check of the Portfolio Station approach used by traverse.mjs:
// spawn at the south bridge landing, drive the same waypoints, interact.
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-start', { state: 'visible', timeout: 30000 });
await page.click('.title-start');
await page.waitForFunction(() => !!window.__voxelSeoul);
await page.evaluate(() => {
  window.__voxelSeoul.setTime(0.45);
  window.__voxelSeoul.setQuality('low');
  window.__voxelSeoul.teleport(0, 53.6, 0);
});
await page.waitForTimeout(600);

const pos = () =>
  page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });

async function driveTo(tx, tz) {
  let cur = await pos();
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const dx = tx - cur.x;
    const dz = tz - cur.z;
    if (Math.hypot(dx, dz) < 1.3) {
      await page.keyboard.up('w');
      return true;
    }
    const yaw = Math.atan2(dx, dz);
    await page.evaluate(
      ({ x, z, yaw }) => window.__voxelSeoul.teleport(x, z, yaw),
      { x: cur.x, z: cur.z, yaw }
    );
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    cur = await pos();
  }
  await page.keyboard.up('w');
  return false;
}

for (const [x, z] of [[4, 54.5], [9, 53.8], [9, 57.6]]) {
  const ok = await driveTo(x, z);
  console.log(ok ? 'reached' : 'STUCK', x, z);
}
await page.waitForTimeout(1000);
let opened = false;
for (let tries = 0; tries < 3 && !opened; tries++) {
  opened = await page.evaluate(async () => {
    const vs = window.__voxelSeoul;
    vs.pressInteract();
    await new Promise((res) => setTimeout(res, 2000));
    return vs.isPanelOpen();
  });
}
const p = await pos();
console.log(opened ? 'PANEL OPENED' : 'PANEL FAILED', `at (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
await browser.close();
process.exit(opened ? 0 : 1);
