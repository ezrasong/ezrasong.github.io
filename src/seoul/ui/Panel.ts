import type { InteractionTarget } from '../types';
import { PROFILE } from '../config/profile';
import { trapFocus } from './focusTrap';
import { ICON } from './icons';

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
          <h2 id="panel-title"></h2>
          <p class="panel-kr" lang="ko"></p>
          <button type="button" class="panel-close" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="panel-body"></div>
      </section>`;
    container.appendChild(this.root);

    this.root.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.key === 'Tab') trapFocus(this.root, e);
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
  // mailto: hands off to the mail client — a _blank target just leaves an
  // empty tab behind.
  if (!href.startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.className = primary ? 'btn btn-primary' : 'btn';
  a.innerHTML = `<span></span>${href.startsWith('mailto:') ? ICON.arrow : ICON.external}`;
  (a.firstChild as HTMLElement).textContent = label;
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
  row('year', p.year);
  row('role', p.role);
  row('problem', p.challenge);
  row('result', p.outcome);
  frag.appendChild(meta);

  const tech = el('ul', 'panel-tech');
  for (const t of p.technologies) tech.appendChild(el('li', '', t));
  frag.appendChild(tech);

  // Only real artwork; no stand-in illustrations.
  const real = p.images.filter((img) => img.src);
  if (real.length) {
    const gallery = el('div', 'panel-gallery');
    for (const img of real) {
      const image = document.createElement('img');
      // A rate-limited or offline card shouldn't leave a broken image behind.
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = img.src!;
      image.alt = img.alt;
      image.loading = 'lazy';
      image.width = 1200;
      image.height = 600;
      gallery.appendChild(image);
    }
    frag.appendChild(gallery);
  }

  const actions = el('div', 'panel-actions');
  if (p.liveUrl) actions.appendChild(externalLink(p.liveUrl, 'live site', true));
  if (p.repositoryUrl) actions.appendChild(externalLink(p.repositoryUrl, 'source', !p.liveUrl));
  if (actions.childElementCount) frag.appendChild(actions);

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
      div.appendChild(el('dt', '', 'study'));
      div.appendChild(
        el('dd', '', `${PROFILE.education.school}: ${PROFILE.education.program} (${PROFILE.education.range})`)
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
        const h = el('h3', 'panel-subhead', job.role);
        h.appendChild(el('span', 'panel-at', job.company));
        head.appendChild(h);
        head.appendChild(el('span', 'panel-job-range', job.range));
        article.appendChild(head);
        article.appendChild(el('p', 'panel-para', job.summary));
        frag.appendChild(article);
      }
      break;
    }
    case 'contact': {
      frag.appendChild(el('p', 'panel-para', 'Email is the fastest way to reach me.'));
      const actions = el('div', 'panel-actions panel-actions-column');
      actions.appendChild(externalLink(`mailto:${PROFILE.links.email}`, PROFILE.links.email, true));
      actions.appendChild(externalLink(PROFILE.links.github, 'github.com/ezrasong'));
      actions.appendChild(externalLink(PROFILE.links.linkedin, 'linkedin'));
      actions.appendChild(externalLink(PROFILE.links.resume, 'résumé (pdf)'));
      frag.appendChild(actions);
      break;
    }
    case 'links': {
      const actions = el('div', 'panel-actions panel-actions-column');
      actions.appendChild(externalLink(PROFILE.links.github, 'github.com/ezrasong', true));
      actions.appendChild(externalLink(PROFILE.links.linkedin, 'linkedin'));
      actions.appendChild(externalLink(PROFILE.links.resume, 'résumé (pdf)'));
      frag.appendChild(actions);
      break;
    }
  }
  return frag;
}
