import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import resume from '../src/content/resume.json' with { type: 'json' };
import * as THREE from 'three';

// The 3D city is heavy under software rendering: one run per width is plenty.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/seoul.html");
  await page.locator(".title-start").waitFor({ state: "visible", timeout: 90_000 });
};

test('seoul: station treads descend below the street and its entrance still opens', async ({ page }) => {
  await ready(page);
  await page.locator('.title-start').click();
  const data = await page.evaluate(() => {
    const v = (window as any).__voxelSeoul;
    const station = v.app.world.scene.getObjectByName('links');
    station.updateMatrixWorld(true);
    const mesh = station.children[0];
    return { positions: Array.from(mesh.geometry.attributes.position.array) as number[], matrix: mesh.matrixWorld.elements as number[] };
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.fromArray(data.matrix);
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < 9; i++) {
    const point = new THREE.Vector3(2.5 - (i + 0.5) * (4.8 / 9), 0.05, 0).applyMatrix4(mesh.matrixWorld);
    const hits = new THREE.Raycaster(point, new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeCloseTo(-0.2 * (i + 1), 2);
  }
  geometry.dispose();
  material.dispose();
  await page.evaluate(() => {
    const v = (window as any).__voxelSeoul;
    const station = v.targets.find((t: any) => t.id === 'links');
    v.teleport(station.entrance.x + station.approach.x * 0.8, station.entrance.z + station.approach.z * 0.8);
  });
  await expect(page.locator('.prompt')).toContainText('Portfolio Station');
  await page.keyboard.press('e');
  await expect(page.locator('#panel-title')).toHaveText('Portfolio Station');
});

test("seoul: title, HUD, directory, panel and map all work and fit", async ({ page }, info) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // GitHub's OpenGraph card endpoint rate-limits repeated test runs.
    if (m.type() === "error" && !/429|opengraph/i.test(m.text())) problems.push(m.text());
  });
  await ready(page);
  const mobile = !!info.project.use.isMobile;

  const axeTitle = await new AxeBuilder({ page }).include("#ui").analyze();
  expect(axeTitle.violations.map((v) => v.id)).toEqual([]);
  if (mobile) await expect(page.locator(".joystick")).toBeHidden();

  const originalMap = await page.locator('.map-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.locator('.lang-opt[data-lang="en"]').click();
  await expect(page.locator('html')).toHaveClass(/lang-en/);
  expect(await page.locator('.map-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(originalMap);

  await page.locator(".title-start").click();
  await expect(page.locator(".hud")).toBeVisible();
  await expect(page.locator('.hud-lang')).toHaveText('en');
  await expect(page.locator('.hud-quality')).not.toContainText(/[가-힣]/);

  const fit = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(".hud-left, .hud-right, .hud-btn, .hud-back, .toast, .prompt")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -0.5 || r.right > innerWidth + 0.5)) out.push(el.className);
    }
    return out;
  });
  expect(fit, "HUD inside the viewport").toEqual([]);

  if (mobile) {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#ui a, #ui button")]
        .map((e) => ({ c: e.className, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
        .map(({ c, r }) => `${c} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small, "touch targets under 44px").toEqual([]);
    await expect(page.locator(".joystick")).toBeVisible();
  }

  // Directory: every destination listed, opens a panel, closes with Escape.
  await page.locator(".hud-menu").click();
  await expect(page.locator(".menu-panel")).toBeVisible();
  await expect(page.locator(".menu-open")).toHaveCount(10);
  const axeMenu = await new AxeBuilder({ page }).include(".menu-panel").analyze();
  expect(axeMenu.violations.map((v) => v.id)).toEqual([]);
  await page.locator(".menu-open").first().click();
  await expect(page.locator("#panel-title")).toHaveText("UW Course Planner");
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel-title")).toBeHidden();

  await page.locator('.hud-menu').click();
  await page.locator('.menu-open').filter({ hasText: 'Experience Tower' }).click();
  const resumePanel = page.locator('.panel-body').filter({ hasText: 'Résumé projects' });
  for (const job of resume.experience) {
    await expect(resumePanel).toContainText(job.role);
    await expect(resumePanel).toContainText(job.range);
  }
  for (const project of resume.projects) await expect(resumePanel).toContainText(project.title);
  for (const award of resume.awards) await expect(resumePanel).toContainText(award.award);
  const axeResume = await new AxeBuilder({ page }).include('#panel-title').include('.panel-body').analyze();
  expect(axeResume.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: `artifacts/screenshots/resume/seoul-${info.project.name}.png` });
  await page.keyboard.press('Escape');

  // Map: opens from the minimap, a marker travels there.
  await page.locator(".minimap").click();
  await expect(page.locator(".map-panel")).toBeVisible();
  const before = await page.evaluate(() => (window as any).__voxelSeoul.player.position.x);
  await page.locator(".map-marker").nth(3).click();
  await expect(page.locator(".map-panel")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as any).__voxelSeoul.player.position.x), { timeout: 10_000 })
    .not.toBe(before);

  expect(problems).toEqual([]);

  await page.reload();
  await page.locator('.title-start').waitFor({ state: 'visible', timeout: 90_000 });
  await expect(page.locator('.lang-opt[data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');
});

test('seoul: quality calibrates once at startup and respects a manual choice', async ({ page }) => {
  await ready(page);
  await page.locator('.title-start').click();
  const calibrated = await page.evaluate(() => {
    const app = (window as any).__voxelSeoul.app;
    // Feed slow frame timings through the real calibration policy.
    for (let i = 0; i < 100; i++) app.monitorPerformance(0.1, true);
    const first = { level: app.quality.current.level, scale: app.renderScale };
    for (let i = 0; i < 100; i++) app.monitorPerformance(0.125, true);
    return { first, later: { level: app.quality.current.level, scale: app.renderScale } };
  });
  expect(calibrated.first.scale).toBeLessThan(1);
  expect(calibrated.later).toEqual(calibrated.first);

  await page.locator('.hud-quality').click();
  const manual = await page.evaluate(() => {
    const app = (window as any).__voxelSeoul.app;
    const first = { level: app.quality.current.level, scale: app.renderScale };
    for (let i = 0; i < 100; i++) app.monitorPerformance(0.125, true);
    return { first, later: { level: app.quality.current.level, scale: app.renderScale } };
  });
  expect(manual.first.scale).toBe(1);
  expect(manual.later).toEqual(manual.first);
});
