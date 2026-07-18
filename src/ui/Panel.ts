import type { InteractionTarget } from '../types';
import { PROFILE } from '../config/profile';

/**
 * The project/place presentation panel: a DOM dialog styled like a Seoul
 * storefront sign. Fully keyboard accessible; focus is trapped while open
 * and returned to the previously focused element on close.
 */
export class Panel {
  readonly root: HTMLElement;
  private onCloseCb: () => void;
  private lastFocused: Element | null = null;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, onClose: () => void) {
    this.onCloseCb = onClose;
    this.root = document.createElement('div');
    this.root.className = 'panel-backdrop hidden';
    this.root.innerHTML = `
      <section class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">
        <header class="panel-header">
          <div>
            <p class="panel-kr" aria-hidden="true"></p>
            <h2 id="panel-title"></h2>
          </div>
          <button type="button" class="panel-close" aria-label="Close panel">✕</button>
        </header>
        <div class="panel-body"></div>
        <footer class="panel-footer">
          <span class="panel-hint">ESC — 닫기 close</span>
        </footer>
      </section>`;
    container.appendChild(this.root);

    this.root.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.key === 'Tab') this.trapFocus(e);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(target: InteractionTarget): void {
    this.lastFocused = document.activeElement;
    const panel = this.root.querySelector('.panel') as HTMLElement;
    panel.style.setProperty('--accent', target.accent);
    (this.root.querySelector('.panel-kr') as HTMLElement).textContent = target.koreanTitle;
    (this.root.querySelector('#panel-title') as HTMLElement).textContent = target.title;

    const body = this.root.querySelector('.panel-body') as HTMLElement;
    body.innerHTML = '';
    if (target.kind === 'project' && target.project) {
      body.appendChild(renderProject(target));
    } else if (target.place) {
      body.appendChild(renderPlace(target));
    }

    this.root.classList.remove('hidden');
    panel.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus();
    this.onCloseCb();
  }

  private trapFocus(e: KeyboardEvent): void {
    const focusables = this.root.querySelectorAll<HTMLElement>(
      'button, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/* ------------------------------------------------------------------ */

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function externalLink(href: string, label: string, primary = false): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = primary ? 'btn btn-primary' : 'btn';
  a.textContent = label;
  return a;
}

function renderProject(target: InteractionTarget): DocumentFragment {
  const p = target.project!;
  const frag = document.createDocumentFragment();

  frag.appendChild(el('p', 'panel-lede', p.longDescription));

  const meta = el('dl', 'panel-meta');
  const row = (label: string, value: string) => {
    const div = el('div', 'panel-meta-row');
    div.appendChild(el('dt', '', label));
    div.appendChild(el('dd', '', value));
    meta.appendChild(div);
  };
  row('역할 Role', p.role);
  row('연도 Year', p.year);
  row('과제 Challenge', p.challenge);
  row('결과 Outcome', p.outcome);
  frag.appendChild(meta);

  const tech = el('ul', 'panel-tech');
  for (const t of p.technologies) tech.appendChild(el('li', '', t));
  frag.appendChild(tech);

  const gallery = el('div', 'panel-gallery');
  p.images.forEach((img, i) => {
    const image = document.createElement('img');
    image.src = placeholderImage(p.title, target.accent, i);
    image.alt = img.alt;
    image.loading = 'lazy';
    image.width = 640;
    image.height = 360;
    gallery.appendChild(image);
  });
  frag.appendChild(gallery);

  const actions = el('div', 'panel-actions');
  if (p.liveUrl) actions.appendChild(externalLink(p.liveUrl, '라이브 · Live site', true));
  if (p.repositoryUrl) actions.appendChild(externalLink(p.repositoryUrl, '소스 · Source'));
  frag.appendChild(actions);

  return frag;
}

function renderPlace(target: InteractionTarget): DocumentFragment {
  const place = target.place!;
  const frag = document.createDocumentFragment();
  frag.appendChild(el('p', 'panel-lede', place.tagline));

  switch (place.kind) {
    case 'about': {
      for (const para of PROFILE.about.paragraphs) frag.appendChild(el('p', 'panel-para', para));
      const edu = el('dl', 'panel-meta');
      const div = el('div', 'panel-meta-row');
      div.appendChild(el('dt', '', '학력 Education'));
      div.appendChild(
        el('dd', '', `${PROFILE.education.school} — ${PROFILE.education.program} (${PROFILE.education.range})`)
      );
      edu.appendChild(div);
      frag.appendChild(edu);
      break;
    }
    case 'skills': {
      for (const group of PROFILE.skills.groups) {
        frag.appendChild(el('h3', 'panel-subhead', group.title));
        const ul = el('ul', 'panel-tech');
        for (const item of group.items) ul.appendChild(el('li', '', item));
        frag.appendChild(ul);
      }
      break;
    }
    case 'experience': {
      for (const job of PROFILE.experience) {
        const article = el('article', 'panel-job');
        const head = el('div', 'panel-job-head');
        head.appendChild(el('h3', 'panel-subhead', `${job.role} · ${job.company}`));
        head.appendChild(el('span', 'panel-job-range', job.range));
        article.appendChild(head);
        article.appendChild(el('p', 'panel-para', job.summary));
        frag.appendChild(article);
      }
      break;
    }
    case 'contact': {
      frag.appendChild(el('p', 'panel-para', '가장 빠른 연결은 이메일입니다 — email is the fastest line.'));
      const actions = el('div', 'panel-actions panel-actions-column');
      actions.appendChild(externalLink(`mailto:${PROFILE.links.email}`, `✉ ${PROFILE.links.email}`, true));
      actions.appendChild(externalLink(PROFILE.links.linkedin, 'in · LinkedIn'));
      frag.appendChild(actions);
      break;
    }
    case 'links': {
      frag.appendChild(el('p', 'panel-para', '이번 열차의 행선지 — departures from this station:'));
      const actions = el('div', 'panel-actions panel-actions-column');
      actions.appendChild(externalLink(PROFILE.links.github, '🐙 GitHub — github.com/ezrasong', true));
      actions.appendChild(externalLink(PROFILE.links.linkedin, 'in · LinkedIn'));
      const resume = document.createElement('a');
      resume.href = PROFILE.links.resume;
      resume.className = 'btn';
      resume.textContent = '📄 이력서 · Résumé (PDF)';
      resume.setAttribute('download', '');
      actions.appendChild(resume);
      frag.appendChild(actions);
      break;
    }
  }
  return frag;
}

/* ------------------------------------------------------------------ */

const imageCache = new Map<string, string>();

/** Honest placeholder art: a voxel skyline card in the project's accent. */
function placeholderImage(title: string, accent: string, variant: number): string {
  const key = `${title}-${variant}`;
  const cached = imageCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1d1f2a';
  ctx.fillRect(0, 0, 640, 360);
  // voxel skyline
  let x = 0;
  let seed = title.length * 7 + variant * 13;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (x < 640) {
    const w = 40 + rand() * 60;
    const h = 60 + rand() * 160;
    ctx.fillStyle = rand() < 0.5 ? '#2a2d3d' : '#343850';
    ctx.fillRect(x, 360 - h, w - 6, h);
    ctx.fillStyle = accent;
    for (let wy = 360 - h + 12; wy < 340; wy += 24) {
      for (let wx = x + 8; wx < x + w - 18; wx += 20) {
        if (rand() < 0.4) ctx.globalAlpha = 0.9;
        else ctx.globalAlpha = 0.15;
        ctx.fillRect(wx, wy, 8, 10);
      }
    }
    ctx.globalAlpha = 1;
    x += w;
  }
  ctx.fillStyle = accent;
  ctx.font = '700 28px "Silkscreen", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PLACEHOLDER', 320, 60);
  ctx.fillStyle = '#f5ead2';
  ctx.font = '500 22px "IBM Plex Sans KR", sans-serif';
  ctx.fillText(`${title} — screenshot ${variant + 1}`, 320, 96);

  const url = canvas.toDataURL('image/png');
  imageCache.set(key, url);
  return url;
}
