// Quick visual check: screenshot right after start with no input,
// so the camera sits directly behind the poro (we should see its back).
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tests/screenshots/orientation.png';

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
// optional teleport + tiny forward press for a "runing" pose
if (process.argv[4] === 'run') {
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.screenshot({ path: out });
  await page.keyboard.up('w');
} else {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
}
await browser.close();
console.log('saved', out);
