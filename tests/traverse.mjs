// Full traversal route driven with the actual Poro controls: the poro is
// aimed (yaw set in place), then W is held until it reaches each waypoint.
// Reports per-segment progress and flags stuck spots. Two buildings are
// entered and exited along the way.
// Usage: node tests/traverse.mjs <url>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'tests/screenshots/traverse';
mkdirSync(OUT, { recursive: true });

const ROUTE = [
  { name: '1 plaza → gate crossing', to: [0, -30] },
  { name: '2 Namsan-ro east (commercial road)', to: [28, -35.2], via: [[2, -35.2]] },
  { name: '3 alley connector north', to: [32, -44], via: [[32, -36]] },
  { name: '3b hanok alley to About', to: [39.5, -44.3] },
  { name: 'ENTER About Ezra', interact: true },
  { name: '4 residential alley east', to: [62, -44] },
  { name: '5 east street south (hill neighbourhood)', to: [62.5, 4], via: [[64, -36], [62.5, -30]] },
  { name: '6 riverside park', to: [20, 15.4], via: [[66.5, 11], [68, 15.6], [56, 15.4]] },
  { name: '7 to bridge approach', to: [0, 12], via: [[8, 14], [3, 12.5]] },
  { name: '8 cross Hangang bridge', to: [0, 53.6] },
  // Approach from due south so any momentum overshoot slides toward the
  // station (and its collider), staying inside the interaction radius.
  { name: 'ENTER Portfolio Station', interact: true, to: [9, 57.6], via: [[4, 54.5], [9, 53.8]] },
  { name: '9 south bank riverside west', to: [-24, 52.2], via: [[0, 52.2]] },
  { name: '10 back to bridge', to: [0, 52.8] },
  { name: '11 recross bridge north', to: [0, 12] },
  { name: '12 spine home to plaza', to: [0, -8] },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-start', { state: 'visible', timeout: 30000 });
await page.click('.title-start');
await page.waitForFunction(() => !!window.__voxelSeoul);
await page.evaluate(() => {
  window.__voxelSeoul.setTime(0.45);
  window.__voxelSeoul.setQuality('low'); // SwiftShader: keep the sim ticking
});
await page.keyboard.press('r');
await page.waitForTimeout(600);

const pos = () =>
  page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });

async function driveTo(tx, tz, label) {
  let cur = await pos();
  let lastD = Infinity;
  let stall = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const dx = tx - cur.x;
    const dz = tz - cur.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.3) {
      await page.keyboard.up('w');
      return { ok: true };
    }
    const yaw = Math.atan2(dx, dz);
    await page.evaluate(
      ({ x, z, yaw }) => window.__voxelSeoul.teleport(x, z, yaw),
      { x: cur.x, z: cur.z, yaw }
    );
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    cur = await pos();
    const nd = Math.hypot(tx - cur.x, tz - cur.z);
    if (lastD - nd < 0.15) stall++;
    else stall = 0;
    lastD = nd;
    if (stall >= 6) {
      await page.keyboard.up('w');
      return { ok: false, at: cur, d: nd, label };
    }
  }
  await page.keyboard.up('w');
  return { ok: false, at: cur, d: lastD, label, timeout: true };
}

let failures = 0;
for (const step of ROUTE) {
  if (step.via) {
    for (const [vx, vz] of step.via) {
      const r = await driveTo(vx, vz, step.name + ' (via)');
      if (!r.ok) {
        failures++;
        console.log(`STUCK ${step.name} via (${vx},${vz}) at (${r.at.x.toFixed(1)},${r.at.z.toFixed(1)}) d=${r.d.toFixed(1)}`);
      }
    }
  }
  if (step.to) {
    const r = await driveTo(step.to[0], step.to[1], step.name);
    if (r.ok) console.log(`OK    ${step.name}`);
    else {
      failures++;
      console.log(`STUCK ${step.name} at (${r.at.x.toFixed(1)},${r.at.z.toFixed(1)}) d=${r.d.toFixed(1)}${r.timeout ? ' (timeout)' : ''}`);
    }
  }
  if (step.interact) {
    await page.waitForTimeout(1000); // let the poro's slide settle
    let opened = false;
    for (let tries = 0; tries < 3 && !opened; tries++) {
      opened = await page.evaluate(async () => {
        const vs = window.__voxelSeoul;
        vs.pressInteract();
        await new Promise((res) => setTimeout(res, 2000));
        return vs.isPanelOpen();
      });
    }
    if (opened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
      const closed = await page.evaluate(() => !window.__voxelSeoul.isPanelOpen());
      console.log(`OK    ${step.name} — opened & ${closed ? 'closed' : 'FAILED TO CLOSE'}`);
      if (!closed) failures++;
    } else {
      failures++;
      const p = await pos();
      console.log(`FAIL  ${step.name} — no panel (at ${p.x.toFixed(1)},${p.z.toFixed(1)})`);
    }
  }
}

await page.screenshot({ path: `${OUT}/final.png` });
console.log(failures === 0 ? 'TRAVERSAL COMPLETE — all segments OK' : `TRAVERSAL: ${failures} problem(s)`);
if (errors.length) console.log('console errors:', errors.slice(0, 5));
await browser.close();
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
