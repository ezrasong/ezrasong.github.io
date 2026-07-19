// Multi-viewpoint screenshot sweep for environment auditing.
// Usage: node tests/sweep.mjs <url> <outdir> [time]
// Street shots teleport the poro; aerial shots hijack the follow camera.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'tests/screenshots/sweep';
const TIME = process.argv[4] ? Number(process.argv[4]) : 0.45; // ~11:00 KST

mkdirSync(OUT, { recursive: true });

const STREET = [
  // name, x, z, yaw (yaw π = face north/−z, 0 = south/+z, π/2 = east? forward=(sin,cos))
  ['plaza-spawn', 0, -8, Math.PI],
  ['plaza-south', 0, -18, 0],
  ['namsan-gate', 0, -30, Math.PI],
  ['namsanro-west', -30, -34, -Math.PI / 2],
  ['namsanro-east', 30, -34, Math.PI / 2],
  ['hongdae-street', -46, -13, Math.PI],
  ['hongdae-alley', -30, -8, -Math.PI / 2],
  ['hanok-alley', 40, -45, Math.PI / 2],
  ['hanok-about', 40, -44, Math.PI],
  ['gangbyeon-blvd', -20, 8, Math.PI / 2],
  ['riverside-park', 0, 15, 0],
  ['bridge-north-approach', 0, 16, 0],
  ['bridge-mid', 0, 33, 0],
  ['bridge-south-approach', 0, 48, 0],
  ['yanghwa-approach', -48, 16, 0],
  ['yanghwa-mid', -48, 33, 0],
  ['south-bank-west', -30, 52, -Math.PI / 2],
  ['gangnam-spine', 0, 66, 0],
  ['teheranro', 30, 80, Math.PI / 2],
  ['gangnam-tower', 70, 70, Math.PI / 2],
  ['apartment-rows', -26, 78, Math.PI],
  ['pier', 14, 17, 0],
];

const AERIAL = [
  // name, camX, camY, camZ, lookX, lookY, lookZ
  ['aerial-city-north', 0, 90, -130, 0, 0, 0],
  ['aerial-city-south', 0, 90, 150, 0, 0, 20],
  ['aerial-river-east', 150, 60, 34, 0, 0, 34],
  ['aerial-river-west', -150, 60, 34, 0, 0, 34],
  ['aerial-plaza-close', 24, 26, -40, 0, 2, -14],
  ['aerial-bridge-low', 22, 8, 33, 0, 4, 33],
  ['aerial-under-bridge', 8, 1.5, 26, 0, 3, 34],
  ['aerial-hanok', 44, 20, -66, 40, 0, -46],
  ['aerial-gangnam', 40, 40, 110, 30, 5, 70],
  ['aerial-hongdae', -70, 30, -30, -46, 2, -10],
  ['aerial-perimeter-se', 110, 20, 110, 0, 5, 30],
  ['aerial-perimeter-nw', -115, 25, -80, 0, 5, -20],
  ['aerial-shoreline', -20, 12, 24, 20, 0, 30],
  ['street-eye-perimeter-east', 84, 2, 30, 120, 3, 30],
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-start', { state: 'visible', timeout: 30000 });
await page.click('.title-start');
await page.waitForFunction(() => !!window.__voxelSeoul);
await page.evaluate((t) => {
  const vs = window.__voxelSeoul;
  vs.setTime(t);
  vs.setQuality('high');
}, TIME);
await page.waitForTimeout(1200);

for (const [name, x, z, yaw] of STREET) {
  await page.evaluate(
    ({ x, z, yaw }) => window.__voxelSeoul.teleport(x, z, yaw),
    { x, z, yaw }
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

// Hijack the follow camera for aerial views.
await page.evaluate(() => {
  const vs = window.__voxelSeoul;
  vs.app.followCam.update = () => {};
});
for (const [name, cx, cy, cz, lx, ly, lz] of AERIAL) {
  await page.evaluate(
    ({ cx, cy, cz, lx, ly, lz }) => {
      const cam = window.__voxelSeoul.app.followCam.camera;
      cam.position.set(cx, cy, cz);
      cam.lookAt(lx, ly, lz);
    },
    { cx, cy, cz, lx, ly, lz }
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await browser.close();
console.log('sweep complete →', OUT);
