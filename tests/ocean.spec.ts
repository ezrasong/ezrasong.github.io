import { expect, test, type Page } from '@playwright/test';

async function displayClock(page: Page, hz = 144): Promise<void> {
  await page.addInitScript((hz) => {
    let seed = 12345;
    Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    let now = 1000;
    let nextId = 0;
    let presented = false;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    };
    window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      if (this.canvas.hasAttribute('data-ocean')) {
        presented = true;
        (window as any).__currentOceanFrame = args[0];
      }
      return (drawImage as any).apply(this, args);
    };
    (window as any).__displayFrames = {
      pending: () => callbacks.size,
      step: () => {
        now += 1000 / hz;
        presented = false;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(now);
        return presented;
      },
    };
  }, hz);
}

test('ocean presents every display frame at 144 Hz, including low-power mode', async ({ page }) => {
  await displayClock(page);
  await page.goto('/portfolio.html');
  await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(() => {
    const frames = (window as any).__displayFrames;
    const m = (window as any).__ocean.motion;
    let presented = 0, advanced = 0;
    for (let i = 0; i < 144; i++) {
      const before = [m.x, m.y, m.z];
      if (frames.step()) presented++;
      if (Math.hypot(m.x - before[0], m.y - before[1], m.z - before[2]) > 0) advanced++;
    }
    const output = document.querySelector<HTMLCanvasElement>('[data-ocean]')!;
    const source = (window as any).__currentOceanFrame as HTMLCanvasElement;
    const a = output.getContext('2d')!.getImageData(0, 0, output.width, output.height).data;
    const b = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
    return { presented, advanced, exactFrame: a.every((v, i) => v === b[i]) };
  });
  expect(result).toEqual({ presented: 144, advanced: 144, exactFrame: true });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // MediaQueryList dispatches its change event after the CDP command returns.
  await expect.poll(() => page.evaluate(() => (window as any).__displayFrames.pending())).toBe(0);
  const stopped = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-ocean]')!;
    const before = canvas.toDataURL();
    let presented = 0;
    for (let i = 0; i < 144; i++) if ((window as any).__displayFrames.step()) presented++;
    return { presented, unchanged: before === canvas.toDataURL() };
  });
  expect(stopped).toEqual({ presented: 0, unchanged: true });
});

test('live pod pursues and catches prey while schools visibly flee', async ({ page }) => {
  test.setTimeout(60_000);
  await displayClock(page, 60);
  await page.goto('/portfolio.html');
  await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(() => {
    const o = (window as any).__ocean, clock = (window as any).__displayFrames;
    o.visit(); clock.step(); o.visit(); clock.step();
    let chasing = 0, fleeing = 0;
    for (let frame = 0; frame < 30 * 60; frame++) {
      clock.step();
      if (o.hunters().some(Boolean)) chasing++;
      if (o.prey().some((p: any) => p.fear > 0.45 && Math.hypot(p.vx, p.vy) > 20)) fleeing++;
    }
    return { catches: o.catches, chasing, fleeing };
  });
  expect(result.catches).toBeGreaterThanOrEqual(3);
  expect(result.chasing).toBeGreaterThan(600);
  expect(result.fleeing).toBeGreaterThan(300);
});

for (const path of ['/', '/portfolio.html']) {
  test(`feeding: edge, reversal and diving meals are actually eaten on ${path}`, async ({ page }) => {
    test.setTimeout(60_000);
    await displayClock(page, 60);
    await page.goto(path);
    await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
    const result = await page.evaluate(() => {
      const o = (window as any).__ocean, clock = (window as any).__displayFrames;
      const w = innerWidth, h = innerHeight;
      const results = [];
      for (const [x, y, yaw, startY = 0.5] of [[0.05, 0.2, 0], [0.95, 0.2, Math.PI], [0.5, 0.9, Math.PI / 2], [0.5, 0.1, 0], [0.5, 0.95, Math.PI / 2, 0.08]]) {
        o.pose(w * 0.5, h * startY, yaw);
        o.start();
        o.feed(w * x, h * y);
        let missedBites = 0, frames = 0;
        const bite = o.length * 0.11;
        while (o.food().length && frames++ < 60 * 60) {
          const before = o.food();
          clock.step();
          if (o.food().length < before.length && !before.some((f: any) => o.heads().some(([hx, hy]: number[]) => Math.hypot(f.x - hx, f.y - hy) < bite))) missedBites++;
        }
        results.push({ x, y, remaining: o.food().length, missedBites, seconds: frames / 60 });
      }
      return results;
    });
    for (const meal of result) {
      expect(meal.remaining, JSON.stringify(meal)).toBe(0);
      expect(meal.missedBites, JSON.stringify(meal)).toBe(0);
    }
  });
}

test('feeding: a nearby visitor takes food and repeated taps keep a bounded queue', async ({ page }) => {
  await displayClock(page, 60);
  await page.goto('/portfolio.html');
  await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(() => {
    const o = (window as any).__ocean, clock = (window as any).__displayFrames;
    o.visit(); clock.step();
    const [x, y] = o.heads()[1];
    o.feed(Math.max(8, Math.min(innerWidth - 8, x)), y);
    for (let i = 0; i < 4 && o.feeder < 0; i++) clock.step();
    const visitor = o.feeder;
    let frames = 0;
    while (o.food().length && frames++ < 60 * 60) clock.step();
    const remaining = o.food().length;
    for (let i = 0; i < 30; i++) o.feed(innerWidth * 0.5, innerHeight * 0.5);
    return { visitor, remaining, queued: o.food().length };
  });
  expect(result.visitor).toBe(1);
  expect(result.remaining).toBe(0);
  expect(result.queued).toBeLessThanOrEqual(9);
});

test('feeding: a fresh tap redirects the orca ahead of older food', async ({ page }) => {
  await displayClock(page, 60);
  await page.goto('/portfolio.html');
  await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(() => {
    const o = (window as any).__ocean, clock = (window as any).__displayFrames;
    const targets: number[][] = [];
    const feed = o.motion.feed.bind(o.motion);
    o.motion.feed = (x: number, y: number) => { targets.push([x, y]); feed(x, y); };
    o.feed(innerWidth * 0.85, innerHeight * 0.2);
    for (let i = 0; i < 5; i++) clock.step();
    const first = targets.at(-1)!;
    o.feed(innerWidth * 0.15, innerHeight * 0.8);
    for (let i = 0; i < 5; i++) clock.step();
    const last = targets.at(-1)!;
    return { firstX: first[0] / innerWidth, lastX: last[0] / innerWidth, lastY: last[1] / innerHeight };
  });
  expect(result.firstX).toBeGreaterThan(0.8);
  expect(result.lastX).toBeLessThan(0.22);
  expect(result.lastY).toBeLessThan(0.3);
});
