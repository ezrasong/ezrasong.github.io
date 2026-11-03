import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from 'node:crypto';
import resume from '../src/content/resume.json' with { type: 'json' };

const PAGES = ["/", "/portfolio.html"];

test('portfolio: résumé facts and PDF download match the shared source', async ({ page, request }) => {
  await page.goto('/portfolio.html');
  const experience = page.locator('#experience');
  for (const job of resume.experience) {
    await expect(experience).toContainText(job.role);
    await expect(experience).toContainText(job.company);
    await expect(experience).toContainText(job.range);
  }
  for (const project of resume.projects) await expect(experience).toContainText(project.title);
  for (const award of resume.awards) await expect(experience).toContainText(award.award);
  for (const group of resume.skills) for (const item of group.items) await expect(page.locator('.stack')).toContainText(item);
  const pdf = await request.get('/Ezra_Song_Resume.pdf');
  expect(pdf.ok()).toBe(true);
  expect(createHash('sha256').update(await pdf.body()).digest('hex')).toBe(resume.sourceSha256);
  const metadata = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
  expect(metadata.worksFor).toBeUndefined();
});

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
  });
  return problems;
}

for (const path of PAGES) {
  test.describe(path, () => {
    test("loads cleanly, no overflow, no axe violations", async ({ page }, info) => {
      const problems = watch(page);
      await page.goto(path);
      await expect(page.locator("[data-ocean]")).toHaveAttribute("data-ready", "true");

      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      });
      expect(overflow, "horizontal overflow").toBeLessThanOrEqual(0);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

      if (info.project.use.isMobile) {
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("a, button")]
            .filter((e) => !e.classList.contains("skip"))
            .map((e) => ({ t: e.textContent?.trim().slice(0, 24), h: e.getBoundingClientRect().height }))
            .filter((e) => e.h > 0 && e.h < 44),
        );
        expect(small, "touch targets under 44px").toEqual([]);
      }

      expect(problems).toEqual([]);
    });

    test("ocean canvas is decorative and never takes input", async ({ page }) => {
      await page.goto(path);
      const canvas = page.locator("[data-ocean]");
      await expect(canvas).toHaveAttribute("aria-hidden", "true");
      expect(await canvas.evaluate((c) => getComputedStyle(c).pointerEvents)).toBe("none");
    });

    test("orca swims, and holds still under reduced motion", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("[data-ocean]")).toHaveAttribute("data-ready", "true");
      const x0 = await page.evaluate(() => (window as any).__ocean.motion.x);
      await page.waitForTimeout(1500);
      const x1 = await page.evaluate(() => (window as any).__ocean.motion.x);
      expect(Math.abs(x1 - x0)).toBeGreaterThan(5);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.locator("[data-ocean]")).toHaveAttribute("data-ready", "true");
      const a = await page.evaluate(() => (window as any).__ocean.motion.x);
      await page.waitForTimeout(800);
      const b = await page.evaluate(() => (window as any).__ocean.motion.x);
      expect(b).toBe(a);
    });
  });
}

test("chooser: keys 1 and 2 open each experience", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/portfolio\.html$/);
  await page.goto("/");
  await page.keyboard.press("2");
  await expect(page).toHaveURL(/seoul\.html$/);
});

test("portfolio: nav jumps to each section and marks it current", async ({ page }) => {
  await page.goto("/portfolio.html");
  for (const id of ["work", "experience", "about", "contact"]) {
    await page.locator(`.nav a[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    // Either the section reaches the top, or the page has run out of scroll.
    await expect
      .poll(() =>
        page.locator(`#${id}`).evaluate((e) => {
          const atEnd = window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
          return e.getBoundingClientRect().top < 120 || atEnd;
        }),
      )
      .toBe(true);
    await expect(page.locator(`.nav a[href="#${id}"]`)).toHaveAttribute("aria-current", "true");
  }
});

test("portfolio: every local link resolves", async ({ page, request }) => {
  await page.goto("/portfolio.html");
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
  const local = [...new Set(hrefs.filter((h) => h.startsWith("http://127.0.0.1")).map((h) => h.split("#")[0]!))];
  for (const h of local) expect((await request.get(h)).status(), h).toBe(200);
});

test("feeding: a tap on open water drops food the orca goes after", async ({ page }, info) => {
  await page.goto("/portfolio.html");
  await expect(page.locator("[data-ocean]")).toHaveAttribute("data-ready", "true");
  const w = info.project.use.viewport!.width;
  const target = { x: w - 40, y: 160 };
  await page.locator('#name').click();
  expect(await page.evaluate(() => (window as any).__ocean.food().length)).toBe(0);
  const before = await page.evaluate(() => (window as any).__ocean.motion.x);
  await page.mouse.click(target.x, target.y);
  await expect.poll(() => page.evaluate(() => (window as any).__ocean.food().length)).toBe(3);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => (window as any).__ocean.motion.x);
  expect(after).toBeGreaterThan(before - 20);
});
