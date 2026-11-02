import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { extractResume } from './resume.mjs';

const defaultRoot = new URL('../', import.meta.url);
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escapeHtml;
const year = (range) => range.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '';
const paragraphs = (items) => items.map((s) => `<p class="row__desc">${e(s)}</p>`).join('\n');
const row = (when, title, body, meta = '', heading = 'h3') => `<li class="row">
  <span class="row__year">${e(when)}</span><div class="row__main">
  <${heading} class="row__title">${title}</${heading}>${body}
  ${meta ? `<p class="row__meta">${meta}</p>` : ''}</div></li>`;
const projectTitle = (p) => p.url ? `<a href="${e(p.url)}" target="_blank" rel="noopener noreferrer">${e(p.title)}<span class="go" aria-hidden="true">↗</span></a>` : e(p.title);
const structuredData = (resume) => `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Person', name: resume.name, jobTitle: 'Software Engineer',
  url: 'https://ezrasong.github.io/', email: `mailto:${resume.links.email}`,
  alumniOf: resume.education.map((edu) => ({ '@type': 'CollegeOrUniversity', name: edu.school })),
  sameAs: [resume.links.github, resume.links.linkedin],
}).replace(/</g, '\\u003c')}</script>`;

export function replaceBlock(html, key, value) {
  const start = `<!-- resume:${key}:start -->`;
  const end = `<!-- resume:${key}:end -->`;
  if (html.split(start).length !== 2 || html.split(end).length !== 2 || html.indexOf(end) < html.indexOf(start)) {
    throw new Error(`Missing or duplicate résumé block: ${key}`);
  }
  return html.slice(0, html.indexOf(start) + start.length) + `\n${value}\n` + html.slice(html.indexOf(end));
}

export function renderPortfolio(html, resume) {
  const jobs = resume.experience.map((job) => row(year(job.range), `${e(job.role)} <span class="at">${e(job.company)}</span>`, paragraphs(job.bullets), `<span>${e(job.range)}</span>`));
  const education = resume.education.map((edu) => row(year(edu.range), `${e(edu.program)} <span class="at">${e(edu.school)}</span>`, '', `<span>${e(edu.range)}</span>`));
  const years = resume.experience.flatMap((job) => job.range.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const range = `${Math.min(...years.map(Number))} to ${resume.status.label === 'now' ? 'present' : Math.max(...years.map(Number))}`;
  const projects = resume.projects.map((p) => row('—', projectTitle(p), paragraphs(p.bullets), `<span>${e(p.technologies.join(', '))}</span>`, 'h4'));
  const awards = resume.awards.map((a) => row(year(a.event), e(a.event), `<p class="row__desc">${e(a.award)}</p>`, '', 'h4'));
  const links = `<li><a href="${e(resume.links.github)}" target="_blank" rel="noopener noreferrer">github</a></li>
<li><a href="${e(resume.links.linkedin)}" target="_blank" rel="noopener noreferrer">linkedin</a></li>
<li><a href="mailto:${e(resume.links.email)}">email</a></li>
<li><a href="${e(resume.links.resume)}" target="_blank" rel="noopener noreferrer">résumé</a></li>`;
  const blocks = {
    name: e(resume.name),
    intro: e(resume.intro),
    facts: `<div><dt>${e(resume.status.label)}</dt><dd>${e(resume.status.text)}</dd></div>
<div><dt>study</dt><dd>${e(resume.education[0].program)}, ${e(resume.education[0].school)}</dd></div>
<div><dt>based</dt><dd>Waterloo / Toronto, CA</dd></div>`,
    'intro-links': links,
    'contact-links': links,
    'contact-email': `<a class="contact__mail" href="mailto:${e(resume.links.email)}">${e(resume.links.email)}</a>`,
    experience: `<header class="block__head"><h2 id="exp-h">experience</h2><span class="dim">${e(range)}</span></header>
<ol class="rows rows--tight">${jobs.join('\n')}${education.join('\n')}</ol>
<header class="block__head"><h3>résumé projects</h3></header>
<ul class="rows rows--tight">${projects.join('\n')}</ul>
<header class="block__head"><h3>hackathons &amp; awards</h3></header>
<ul class="rows rows--tight">${awards.join('\n')}</ul>`,
    'about-status': `<p>${e(resume.status.paragraph)}</p>`,
    skills: resume.skills.map((group) => `<div><dt>${e(group.title.toLowerCase())}</dt><dd>${e(group.items.join(', '))}</dd></div>`).join('\n'),
    'structured-data': structuredData(resume),
  };
  // The featured bot also appears in the résumé. Keep its existing work
  // entry in sync by repository URL; other featured work stays curated.
  const bot = resume.projects.find((p) => p.url.toLowerCase() === 'https://github.com/ezrasong/discord-bot');
  blocks['featured-bot'] = bot
    ? row('—', projectTitle(bot), paragraphs(bot.bullets), `<span>${e(bot.technologies.join(', '))}</span>`)
    : row('2024', 'Discord Bot', '<p class="row__desc">A Discord bot for server automation.</p>');
  for (const [key, value] of Object.entries(blocks)) html = replaceBlock(html, key, value);
  return html;
}

export function renderSeoul(html, resume) {
  const list = (items) => `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
  const summary = `<section class="sr-only" aria-label="Portfolio summary">
<h1>${e(resume.name)}, Software Engineer</h1><p>${e(resume.intro)}</p><p>${e(resume.status.paragraph)}</p>
<h2>Education</h2>${list(resume.education.map((s) => `${s.program}, ${s.school} (${s.range})`))}
<h2>Skills</h2>${list(resume.skills.map((s) => `${s.title}: ${s.items.join(', ')}`))}
<h2>Experience</h2>${resume.experience.map((job) => `<h3>${e(job.role)}, ${e(job.company)} (${e(job.range)})</h3>${list(job.bullets)}`).join('')}
<h2>Résumé projects</h2>${resume.projects.map((p) => `<h3>${projectTitle(p)}</h3>${list(p.bullets)}<p>${e(p.technologies.join(', '))}</p>`).join('')}
<h2>Hackathons &amp; awards</h2>${list(resume.awards.map((a) => `${a.event}: ${a.award}`))}
<h2>Contact</h2><p><a href="mailto:${e(resume.links.email)}">${e(resume.links.email)}</a> · <a href="${e(resume.links.resume)}">Résumé (PDF)</a></p>
</section>`;
  return replaceBlock(replaceBlock(html, 'summary', summary), 'structured-data', structuredData(resume));
}

async function writeChanged(url, value) {
  if (await readFile(url, 'utf8').catch(() => '') === value) return;
  await mkdir(new URL('.', url), { recursive: true });
  const temp = new URL(`${url.href}.${process.pid}.tmp`);
  await writeFile(temp, value);
  await rename(temp, url);
}

export async function syncResume(root = defaultRoot) {
  const bytes = await readFile(new URL('public/Ezra_Song_Resume.pdf', root));
  const resume = await extractResume(bytes);
  const latest = resume.experience[0];
  const ongoing = /(?:present|current)$/i.test(latest.range);
  resume.status = {
    label: ongoing ? 'now' : 'recent',
    text: `${latest.role}, ${latest.company}`,
    paragraph: `My ${ongoing ? 'current' : 'most recent'} role ${ongoing ? 'is' : 'was'} ${latest.role} at ${latest.company} (${latest.range}). ${latest.bullets[0]}`,
  };
  resume.intro = `Software engineer and student at ${resume.education[0].school}. I build software across web, mobile, and backend systems, and I care about how each one feels under the fingers.`;
  resume.sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const htmlUrl = new URL('portfolio.html', root);
  const seoulUrl = new URL('seoul.html', root);
  // Finish extraction, validation, and rendering before changing either file.
  const html = renderPortfolio(await readFile(htmlUrl, 'utf8'), resume);
  const seoul = renderSeoul(await readFile(seoulUrl, 'utf8'), resume);
  await writeChanged(new URL('src/content/resume.json', root), JSON.stringify(resume, null, 2) + '\n');
  await writeChanged(htmlUrl, html);
  await writeChanged(seoulUrl, seoul);
  console.log(`Résumé synced: ${resume.experience.length} roles, ${resume.projects.length} projects, ${resume.awards.length} awards. Both experiences use the same PDF data.`);
  return resume;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  syncResume().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
