import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractResume, parseResume, safeUrl, textRows } from '../scripts/resume.mjs';
import { renderPortfolio, replaceBlock, syncResume } from '../scripts/sync-resume.mjs';

const row = (cells, x = 47, urls = []) => ({ cells, x, urls });
const fixture = () => [
  row(['Ezra Song']), row(['e34song@uwaterloo.ca | GitHub | LinkedIn']),
  row(['Education']), row(['University of Waterloo', 'Waterloo, ON']),
  row(['Bachelor of Mathematics', 'Sep 2025 – Apr 2029']),
  row(['Technical Skills']), row(['Languages: TypeScript, C++, C#']),
  row(['Frameworks: React, Flutter']), row(['Tools: Git, Docker']),
  row(['Professional Experience']), row(['Software Engineer Intern']),
  row(['Unmodal Research Inc.', 'Jan 2026 – Sep 2026']),
  row(['• Shipped software with reliable'], 61), row(['release checks.'], 71),
  row(['Web Developer']), row(['DoBetter.love', 'Sep 2025 – Nov 2025']),
  row(['• Built reusable components.'], 61),
  row(['Projects']), row(['Sonolyth', 'Flutter, Dart'], 47, ['https://github.com/ezrasong/sonolyth']),
  row(['• Added native playback.'], 61),
  row(['Hackathons & Awards']), row(['UltraHacks 2026 — University of Toronto', 'Winner']),
];
const urls = ['https://github.com/ezrasong', 'https://linkedin.com/in/e34song'];

test('preserves wrapped bullets, columns, dates, and project links', () => {
  const data = parseResume(fixture(), urls);
  assert.equal(data.experience.length, 2);
  assert.equal(data.experience[0].range, 'Jan 2026 – Sep 2026');
  assert.deepEqual(data.experience[0].bullets, ['Shipped software with reliable release checks.']);
  assert.deepEqual(data.skills[0].items, ['TypeScript', 'C++', 'C#']);
  assert.equal(data.projects[0].url, 'https://github.com/ezrasong/sonolyth');
  assert.equal(data.awards[0].award, 'Winner');
});

test('uses PDF positions to separate a right-aligned date', () => {
  const item = (str, x, width) => ({ str, width, transform: [1, 0, 0, 1, x, 500] });
  const rows = textRows([item('Unmodal Research Inc.', 47, 101), item(' ', 148, 330), item('Jan 2026 – Sep 2026', 478, 91)]);
  assert.deepEqual(rows[0].cells, ['Unmodal Research Inc.', 'Jan 2026 – Sep 2026']);
});

test('rejects missing sections and ambiguous job dates', () => {
  assert.throws(() => parseResume([], urls), /missing education/);
  const rows = fixture();
  rows.find((r) => r.cells[0] === 'Unmodal Research Inc.').cells[1] = 'not a date';
  assert.throws(() => parseResume(rows, urls), /unrecognized role/);
});

test('only accepts HTTPS links without credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'https://user:pass@example.com', undefined]) assert.equal(safeUrl(value), '');
  assert.equal(safeUrl('https://github.com/ezrasong'), urls[0]);
});

test('escapes document text and refuses missing generation markers', async () => {
  const html = await readFile(new URL('../portfolio.html', import.meta.url), 'utf8');
  const data = parseResume(fixture(), urls);
  data.name = '</h1><script>alert(1)</script>';
  data.status = { label: 'recent', text: 'A & B', paragraph: '<img src=x onerror=alert(1)>' };
  data.intro = 'Plain text';
  const output = renderPortfolio(html, data);
  assert.ok(!output.includes('<script>alert(1)</script>'));
  assert.ok(output.includes('&lt;script&gt;'));
  assert.ok(!output.includes('<img src=x'));
  assert.throws(() => replaceBlock('no markers', 'skills', 'new'), /Missing or duplicate/);
  assert.equal(renderPortfolio(output, data), output, 'generation is idempotent');
});

test('extracts the actual uploaded PDF with readable roles, projects, and awards', async () => {
  const bytes = await readFile(new URL('../public/Ezra_Song_Resume.pdf', import.meta.url));
  const data = await extractResume(bytes);
  assert.equal(data.name, 'Ezra Song');
  for (const key of ['education', 'skills', 'experience', 'projects', 'awards']) assert.ok(data[key].length > 0);
  for (const job of data.experience) assert.ok(job.bullets.every((s) => s.length > 10));
});

test('an invalid PDF cannot overwrite the last generated content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ezra-resume-test-'));
  const root = pathToFileURL(directory + '/');
  try {
    await mkdir(new URL('public/', root));
    await mkdir(new URL('src/content/', root), { recursive: true });
    await writeFile(new URL('public/Ezra_Song_Resume.pdf', root), 'not a PDF');
    await writeFile(new URL('portfolio.html', root), 'last good HTML');
    await writeFile(new URL('src/content/resume.json', root), 'last good data');
    await assert.rejects(syncResume(root));
    assert.equal(await readFile(new URL('portfolio.html', root), 'utf8'), 'last good HTML');
    assert.equal(await readFile(new URL('src/content/resume.json', root), 'utf8'), 'last good data');
  } finally {
    assert.equal(directory.startsWith(join(tmpdir(), 'ezra-resume-test-')), true);
    await rm(directory, { recursive: true, force: true });
  }
});
