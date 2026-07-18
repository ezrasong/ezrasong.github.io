/**
 * Browser smoke test of the full interaction loop using the locally
 * installed Chrome via playwright-core (no browser download needed).
 *
 * Verifies: loading completes, movement works without page scroll, camera
 * and physics run, every project + place entrance opens and closes its
 * panel, reset works, and there are no console errors.
 *
 * Usage: node tests/smoke.mjs [url]  (default http://localhost:5173)
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173';
const SHOT_DIR = 'tests/screenshots';
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const consoleErrors = [];
let failed = false;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const executablePaths = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
];
let executablePath;
for (const p of executablePaths) {
  try {
    const { accessSync } = await import('node:fs');
    accessSync(p);
    executablePath = p;
    break;
  } catch {
    /* try next */
  }
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // 1. Loading completes and the title card appears
  await page.waitForSelector('.title-start', { state: 'visible', timeout: 30000 });
  check('loading screen completes → title card shown', true);
  await page.screenshot({ path: `${SHOT_DIR}/01-title.png` });

  // 2. Start the experience
  await page.click('.title-start');
  await page.waitForFunction(() => !!window.__voxelSeoul, { timeout: 10000 });
  await page.waitForTimeout(600);
  check('game handle exposed after start', true);

  // 3. WASD movement moves the player, arrows too, page does not scroll
  const posBefore = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  const posAfterW = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  const movedW = Math.hypot(posAfterW.x - posBefore.x, posAfterW.z - posBefore.z);
  check('W moves the poro', movedW > 1.5, `moved ${movedW.toFixed(2)} units`);

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');
  const posAfterArrows = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  const movedArrows = Math.hypot(posAfterArrows.x - posAfterW.x, posAfterArrows.z - posAfterW.z);
  check('arrow keys steer and move', movedArrows > 0.8, `moved ${movedArrows.toFixed(2)} units`);

  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  check('page does not scroll during gameplay', scroll.x === 0 && scroll.y === 0);
  await page.screenshot({ path: `${SHOT_DIR}/02-gameplay.png` });

  // 4. Collision: drive into the gate pier and confirm we don't pass through
  await page.evaluate(() => window.__voxelSeoul.teleport(-3.3, -8));
  await page.waitForTimeout(200);
  await page.keyboard.down('s'); // spawn yaw faces +z... drive backwards toward gate
  await page.waitForTimeout(1500);
  await page.keyboard.up('s');
  const gatePos = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  check('collision keeps poro out of solid geometry', gatePos.z > -16.5, `z=${gatePos.z.toFixed(2)}`);

  // 5. Reset control
  await page.evaluate(() => window.__voxelSeoul.teleport(30, 15));
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  const resetPos = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  const nearSpawn = Math.hypot(resetPos.x - 0, resetPos.z - 6) < 2;
  check('R resets to the plaza spawn', nearSpawn, `at (${resetPos.x.toFixed(1)}, ${resetPos.z.toFixed(1)})`);

  // 6. Prompt appears only near an entrance
  const promptFar = await page.evaluate(
    () => !document.querySelector('.prompt').classList.contains('hidden')
  );
  check('no prompt when away from entrances', !promptFar);

  // 7. Enter and close every target (5 projects + 5 places)
  const targets = await page.evaluate(() =>
    window.__voxelSeoul.targets.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      x: t.entrance.x + t.approach.x * 1.2,
      z: t.entrance.z + t.approach.z * 1.2,
    }))
  );
  check('at least 5 project targets exist', targets.filter((t) => t.kind === 'project').length >= 5);

  let firstPanelShot = false;
  for (const t of targets) {
    await page.evaluate(
      ({ x, z }) => window.__voxelSeoul.teleport(x, z),
      { x: t.x, z: t.z }
    );
    await page.waitForTimeout(450);
    const promptShown = await page.evaluate(
      () => !document.querySelector('.prompt').classList.contains('hidden')
    );
    await page.evaluate(() => window.__voxelSeoul.pressInteract());
    let opened = false;
    try {
      await page.waitForFunction(() => window.__voxelSeoul.isPanelOpen(), { timeout: 5000 });
      opened = true;
    } catch {
      opened = false;
    }
    if (opened && !firstPanelShot) {
      await page.screenshot({ path: `${SHOT_DIR}/03-panel-${t.id}.png` });
      firstPanelShot = true;
    }
    const panelTitle = opened
      ? await page.evaluate(() => document.querySelector('#panel-title')?.textContent ?? '')
      : '';
    await page.keyboard.press('Escape');
    let closed = false;
    try {
      await page.waitForFunction(() => !window.__voxelSeoul.isPanelOpen(), { timeout: 4000 });
      // wait for the camera glide back to release controls
      await page.waitForFunction(() => !window.__voxelSeoul.player.frozen, { timeout: 4000 });
      closed = true;
    } catch {
      closed = false;
    }
    check(
      `${t.kind} "${t.title}": prompt+enter+close`,
      promptShown && opened && closed && panelTitle === t.title,
      `prompt=${promptShown} opened=${opened} title="${panelTitle}" closed=${closed}`
    );
  }

  // 8. Controls resume after closing: move again
  const p1 = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w');
  const p2 = await page.evaluate(() => {
    const p = window.__voxelSeoul.player.position;
    return { x: p.x, z: p.z };
  });
  check('controls resume after closing a panel', Math.hypot(p2.x - p1.x, p2.z - p1.z) > 0.5);

  // 9. External links are safe
  const unsafeLinks = await page.evaluate(() => {
    document.querySelector('.hud-menu')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Array.from(document.querySelectorAll('a[target="_blank"]')).filter(
      (a) => !(a.rel.includes('noopener') && a.rel.includes('noreferrer'))
    ).length;
  });
  check('external links use rel="noopener noreferrer"', unsafeLinks === 0);
  await page.screenshot({ path: `${SHOT_DIR}/04-menu.png` });
  await page.keyboard.press('Escape');

  // 10. Resize does not crash and canvas follows
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(400);
  const canvasSize = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.clientWidth, h: c.clientHeight };
  });
  check('canvas resizes with viewport', canvasSize.w === 700 && canvasSize.h === 900, JSON.stringify(canvasSize));
  await page.setViewportSize({ width: 1280, height: 800 });

  // 11. Console errors
  const realErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('WebGL warning')
  );
  check('no console errors during the flow', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
