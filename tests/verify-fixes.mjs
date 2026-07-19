// Final verification: every travel destination, Namsan route, camera drags.
// Usage: node tests/verify-fixes.mjs [url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173';
const DIR = 'tests/screenshots/verify';
mkdirSync(DIR, { recursive: true });

let failed = false;
const check = (name, ok, detail = '') => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-start', { state: 'visible', timeout: 30000 });
await page.click('.title-start');
await page.waitForFunction(() => !!window.__voxelSeoul);
await page.waitForTimeout(300);

const state = () =>
  page.evaluate(() => {
    const vs = window.__voxelSeoul;
    const cam = vs.app.followCam.camera;
    const dir = cam.getWorldDirection(new (cam.position.constructor)());
    const p = vs.player.body.position;
    return {
      p: { x: p.x, y: p.y, z: p.z },
      cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      pitchDeg: (Math.asin(-dir.y) * 180) / Math.PI,
      camDist: Math.hypot(cam.position.x - p.x, cam.position.z - p.z),
      camInside: vs.app.physics.isInsideStatic(cam.position, 0.02),
      prompt: !document.querySelector('.prompt').classList.contains('hidden'),
      frozen: vs.player.frozen,
    };
  });

const titles = await page.evaluate(() =>
  window.__voxelSeoul.targets.map((t) => ({ title: t.title, ex: t.entrance.x, ez: t.entrance.z }))
);
check('10 travel destinations exist', titles.length === 10, `${titles.length}`);

for (const { title, ex, ez } of titles) {
  // travel via the directory UI
  await page.keyboard.press('m');
  await page.waitForTimeout(250);
  await page.evaluate((title) => {
    const rows = Array.from(document.querySelectorAll('.menu-list li'));
    const row = rows.find((r) => r.textContent.includes(title));
    row.querySelectorAll('button')[1].click();
  }, title);
  await page.waitForTimeout(120);

  // camera must have snapped instantly: close to player, not inside geometry
  const s0 = await state();
  const ringDist = Math.hypot(s0.p.x - ex, s0.p.z - ez);
  check(`${title}: lands on the ring`, ringDist > 0.6 && ringDist < 1.4, `d=${ringDist.toFixed(2)}`);
  check(
    `${title}: camera snapped behind player`,
    s0.camDist < 9 && !s0.camInside,
    `camDist=${s0.camDist.toFixed(2)} inside=${s0.camInside}`
  );
  check(`${title}: E prompt live`, s0.prompt && !s0.frozen);

  // E opens the panel, Escape closes it
  await page.evaluate(() => window.__voxelSeoul.pressInteract());
  let opened = false;
  try {
    await page.waitForFunction(() => window.__voxelSeoul.isPanelOpen(), { timeout: 5000 });
    opened = true;
  } catch { /* stays false */ }
  check(`${title}: E opens panel`, opened);
  await page.keyboard.press('Escape');
  try {
    await page.waitForFunction(() => !window.__voxelSeoul.isPanelOpen(), { timeout: 4000 });
    await page.waitForFunction(() => !window.__voxelSeoul.player.frozen, { timeout: 4000 });
  } catch { check(`${title}: panel closes`, false); }

  // walk 2s in each direction; character must never end up trapped
  const dirs = ['w', 'a', 's', 'd'];
  const moved = [];
  for (const key of dirs) {
    const before = await state();
    await page.keyboard.down(key);
    await page.waitForTimeout(2000);
    await page.keyboard.up(key);
    await page.waitForTimeout(150);
    const after = await state();
    moved.push(Math.hypot(after.p.x - before.p.x, after.p.z - before.p.z));
  }
  // The controller has no strafe (A/D steer, S turns around), so any single
  // scripted key can legitimately end pressing a wall. Trapped means: no key
  // gets you anywhere. Attempt escape: W, then S if W was blocked.
  let escape = 0;
  for (const key of ['w', 's']) {
    const before = await state();
    await page.keyboard.down(key);
    await page.waitForTimeout(1500);
    await page.keyboard.up(key);
    await page.waitForTimeout(150);
    const after = await state();
    escape = Math.max(escape, Math.hypot(after.p.x - before.p.x, after.p.z - before.p.z));
    if (escape > 1.5) break;
  }
  const end = await state();
  const endInside = await page.evaluate(() =>
    window.__voxelSeoul.app.physics.isInsideStatic(window.__voxelSeoul.player.body.position)
  );
  check(
    `${title}: never trapped (WASD walk + escape)`,
    escape > 1.5 && !endInside && end.p.y > -0.5,
    `moved=[${moved.map((m) => m.toFixed(1)).join(',')}] escape=${escape.toFixed(1)} inside=${endInside}`
  );
  const shot = title.replace(/\s/g, '-').toLowerCase();
  await page.screenshot({ path: `${DIR}/travel-${shot}.png` });
}

// --- Gate → Namsan route: player must stay on the surface, never sink
await page.evaluate(() => window.__voxelSeoul.teleport(0, -6, Math.PI));
await page.waitForTimeout(250);
await page.keyboard.down('w');
let minY = 1;
let maxZ = 0;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(400);
  const s = await state();
  minY = Math.min(minY, s.p.y);
  maxZ = Math.min(maxZ, s.p.z);
}
await page.keyboard.up('w');
check('gate→Namsan: stays on surface', minY > 0.4, `minY=${minY.toFixed(2)}`);
check('gate→Namsan: blocked at hill base (z≥-29.7)', maxZ >= -29.7, `z=${maxZ.toFixed(2)}`);
await page.screenshot({ path: `${DIR}/namsan-route.png` });

// --- Full horizontal drags at three locations: pitch must stay in clamp
for (const [name, x, z] of [['plaza', 0, 6], ['hongdae', -30, 0], ['hanok', 40, -31.5]]) {
  await page.evaluate(({ x, z }) => window.__voxelSeoul.teleport(x, z, Math.PI), { x, z });
  await page.waitForTimeout(300);
  let minPitch = 90;
  let maxPitch = -90;
  for (let pass = 0; pass < 3; pass++) {
    await page.mouse.move(1100, 400);
    await page.mouse.down();
    for (let i = 0; i <= 24; i++) {
      await page.mouse.move(1100 - i * 38, 400, { steps: 1 });
      await page.waitForTimeout(12);
      const s = await state();
      minPitch = Math.min(minPitch, s.pitchDeg);
      maxPitch = Math.max(maxPitch, s.pitchDeg);
    }
    await page.mouse.up();
  }
  check(
    `horizontal drag @${name}: pitch stays clamped`,
    minPitch > -12 && maxPitch < 62,
    `pitch ${minPitch.toFixed(1)}°..${maxPitch.toFixed(1)}°`
  );
}

// --- Safety net: force the body inside a collider, expect auto-respawn
await page.evaluate(() => {
  window.__voxelSeoul.player.body.position.set(36, 1.2, -36); // inside the hanok
});
await page.waitForTimeout(1800);
const rescued = await page.evaluate(() => {
  const vs = window.__voxelSeoul;
  return !vs.app.physics.isInsideStatic(vs.player.body.position);
});
check('safety net: wedged player auto-respawns within ~1.5s', rescued);

check('no page errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
await browser.close();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
