import { expect, test } from '@playwright/test';

test('ocean presents every display frame at 144 Hz, including low-power mode', async ({ page }) => {
  await page.addInitScript(() => {
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
      if (this.canvas.hasAttribute('data-ocean')) presented = true;
      return (drawImage as any).apply(this, args);
    };
    (window as any).__displayFrames = {
      pending: () => callbacks.size,
      step: () => {
        now += 1000 / 144;
        presented = false;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(now);
        return presented;
      },
    };
  });
  await page.goto('/portfolio.html');
  await expect(page.locator('[data-ocean]')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(() => {
    const frames = (window as any).__displayFrames;
    let presented = 0;
    for (let i = 0; i < 144; i++) if (frames.step()) presented++;
    return presented;
  });
  expect(result).toBe(144);

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
