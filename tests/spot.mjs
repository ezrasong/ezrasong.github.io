// Quick spot-check: a handful of named viewpoints in one browser session.
// Usage: node tests/spot.mjs <url> <outdir> <time> then triples of
//   street name x z yaw   OR   air name cx cy cz lx ly lz
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2];
const OUT = process.argv[3];
const TIME = Number(process.argv[4]);
const rest = process.argv.slice(5);

mkdirSync(OUT, { recursive: true });

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
  window.__voxelSeoul.setTime(t);
  window.__voxelSeoul.setQuality('high');
}, TIME);
await page.waitForTimeout(1000);

let i = 0;
let freecam = false;
while (i < rest.length) {
  const kind = rest[i];
  if (kind === 'street') {
    const [name, x, z, yaw] = rest.slice(i + 1, i + 5);
    await page.evaluate(
      ({ x, z, yaw }) => window.__voxelSeoul.teleport(Number(x), Number(z), Number(yaw)),
      { x, z, yaw }
    );
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
    i += 5;
  } else if (kind === 'air') {
    const [name, cx, cy, cz, lx, ly, lz] = rest.slice(i + 1, i + 8);
    if (!freecam) {
      await page.evaluate(() => {
        window.__voxelSeoul.app.followCam.update = () => {};
      });
      freecam = true;
    }
    await page.evaluate(
      ({ cx, cy, cz, lx, ly, lz }) => {
        const cam = window.__voxelSeoul.app.followCam.camera;
        cam.position.set(Number(cx), Number(cy), Number(cz));
        cam.lookAt(Number(lx), Number(ly), Number(lz));
      },
      { cx, cy, cz, lx, ly, lz }
    );
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
    i += 8;
  } else {
    throw new Error(`bad kind ${kind} at ${i}`);
  }
}
await browser.close();
