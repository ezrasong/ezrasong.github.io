import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const headings = new Map([
  ['education', 'education'], ['technical skills', 'skills'], ['skills', 'skills'],
  ['professional experience', 'experience'], ['work experience', 'experience'],
  ['projects', 'projects'], ['hackathons & awards', 'awards'], ['awards', 'awards'],
]);
const dateRange = /^(?:[A-Za-z]+\s+)?(?:19|20)\d{2}\s*[-–—]\s*(?:(?:[A-Za-z]+\s+)?(?:19|20)\d{2}|present|current)$/i;
const bullet = /^[•●▪‣]\s*/;
const clean = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const fail = (message) => { throw new Error(`Résumé extraction: ${message}. Keep the text-based, single-column résumé layout; the previous deployment has not been changed.`); };

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

/** Preserve widely separated columns (company/date, project/stack). */
export function textRows(items, annotations = []) {
  const rows = [];
  const sorted = items.filter((item) => 'str' in item && item.str.trim())
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  for (const item of sorted) {
    const y = item.transform[5];
    let row = rows.at(-1);
    if (!row || Math.abs(row.y - y) > 2) {
      row = { y, x: item.transform[4], items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows.map((row) => {
    const cells = [];
    let end = -Infinity;
    for (const item of row.items.sort((a, b) => a.transform[4] - b.transform[4])) {
      const gap = item.transform[4] - end;
      if (gap > 16) cells.push(item.str);
      else cells[cells.length - 1] += (gap > 1 ? ' ' : '') + item.str;
      end = item.transform[4] + item.width;
    }
    const urls = annotations.filter((a) => a.subtype === 'Link' && a.rect[1] <= row.y && a.rect[3] >= row.y)
      .map((a) => safeUrl(a.url)).filter(Boolean);
    return { x: row.x, cells: cells.map(clean), urls };
  });
}

function readBullets(rows, start) {
  const result = [];
  let i = start;
  const indent = rows[start]?.x;
  for (; i < rows.length; i++) {
    const row = rows[i];
    if (row.cells.length !== 1) break;
    const text = row.cells[0];
    if (bullet.test(text)) result.push(text.replace(bullet, ''));
    else if (result.length && row.x >= indent - 2) result[result.length - 1] += ` ${text}`;
    else break;
  }
  if (!result.length || result.some((s) => !s.trim())) fail('a role or project has no readable bullet points');
  return { bullets: result, next: i };
}

/** Parse facts only. Document text is never treated as code or instructions. */
export function parseResume(rows, urls) {
  const sections = {};
  const header = [];
  let section;
  for (const row of rows) {
    const key = row.cells.length === 1 && headings.get(row.cells[0].toLowerCase());
    if (key) {
      if (sections[key]) fail(`duplicate ${key} section`);
      section = sections[key] = [];
    } else (section ?? header).push(row);
  }
  for (const key of ['education', 'skills', 'experience', 'projects', 'awards']) {
    if (!sections[key]?.length) fail(`missing ${key} section`);
  }
  const name = header[0]?.cells.join(' ');
  const email = header.flatMap((r) => r.cells).join(' ').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const github = urls.find((s) => new URL(s).hostname === 'github.com');
  const linkedin = urls.find((s) => /^(www\.)?linkedin\.com$/.test(new URL(s).hostname));
  if (!name || !email || !github || !linkedin) fail('name, email, GitHub, or LinkedIn link is missing');

  const education = [];
  for (let i = 0; i < sections.education.length; i += 2) {
    const school = sections.education[i];
    const program = sections.education[i + 1];
    if (school.cells.length > 2 || program?.cells.length !== 2 || !dateRange.test(program.cells[1])) fail('unrecognized education rows');
    education.push({ school: school.cells[0], location: school.cells[1] ?? '', program: program.cells[0], range: program.cells[1] });
  }
  const skills = [];
  for (const row of sections.skills) {
    const text = row.cells.join(' ');
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (match) skills.push({ title: match[1], items: match[2].split(',').map(clean) });
    else if (skills.length) skills.at(-1).items.push(...text.split(',').map(clean));
    else fail('unrecognized skills row');
  }
  const experience = [];
  for (let i = 0; i < sections.experience.length;) {
    const role = sections.experience[i];
    const company = sections.experience[i + 1];
    if (role.cells.length !== 1 || company?.cells.length !== 2 || !dateRange.test(company.cells[1])) fail('unrecognized role/company/date rows');
    const body = readBullets(sections.experience, i + 2);
    experience.push({ role: role.cells[0], company: company.cells[0], range: company.cells[1], bullets: body.bullets });
    i = body.next;
  }
  const projects = [];
  for (let i = 0; i < sections.projects.length;) {
    const row = sections.projects[i];
    if (row.cells.length !== 2) fail('unrecognized project title/technology row');
    const body = readBullets(sections.projects, i + 1);
    projects.push({ title: row.cells[0], technologies: row.cells[1].split(',').map(clean), url: row.urls[0] ?? '', bullets: body.bullets });
    i = body.next;
  }
  const awards = sections.awards.map((row) => {
    if (row.cells.length !== 2) fail('unrecognized award/result row');
    return { event: row.cells[0], award: row.cells[1] };
  });
  return { name, links: { email, github, linkedin, resume: 'Ezra_Song_Resume.pdf' }, education, skills, experience, projects, awards };
}

export async function extractResume(bytes) {
  if (bytes.length > 5_000_000) fail('PDF is larger than 5 MB');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages > 5) fail('PDF has more than five pages');
    const rows = [];
    const urls = [];
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const annotations = await page.getAnnotations();
      rows.push(...textRows(content.items, annotations));
      urls.push(...annotations.map((a) => safeUrl(a.url)).filter(Boolean));
    }
    return parseResume(rows, urls);
  } finally { await task.destroy(); }
}
