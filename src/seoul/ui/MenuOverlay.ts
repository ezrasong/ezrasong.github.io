import type { InteractionTarget } from '../types';
import { trapFocus } from './focusTrap';
import { ICON } from './icons';

/**
 * The conventional navigation fallback: a keyboard-first list of every
 * project and place. "Open" shows the same panel content without traversal;
 * "Travel" teleports the poro to that entrance.
 */
export class MenuOverlay {
  readonly root: HTMLElement;
  private lastFocused: Element | null = null;

  constructor(
    container: HTMLElement,
    targets: InteractionTarget[],
    actions: {
      onOpen: (t: InteractionTarget) => void;
      onTravel: (t: InteractionTarget) => void;
      onClose: () => void;
    },
    private travelEnabled: boolean
  ) {
    this.root = document.createElement('div');
    this.root.className = 'panel-backdrop hidden';

    const projects = targets.filter((t) => t.kind === 'project');
    const places = targets.filter((t) => t.kind === 'place');

    const section = document.createElement('section');
    section.className = 'panel menu-panel';
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-modal', 'true');
    section.setAttribute('aria-label', 'City map and project directory');
    section.tabIndex = -1;
    section.innerHTML = `
      <header class="panel-header">
        <h2>Directory</h2>
        <p class="panel-kr" lang="ko">안내도</p>
        <button type="button" class="panel-close" aria-label="Close directory">${ICON.close}</button>
      </header>
      <div class="panel-body">
        <h3 class="menu-head">projects</h3>
        <ul class="menu-list" data-group="projects"></ul>
        <h3 class="menu-head">around town</h3>
        <ul class="menu-list" data-group="places"></ul>
      </div>`;
    this.root.appendChild(section);
    container.appendChild(this.root);

    const fill = (group: string, list: InteractionTarget[]) => {
      const ul = section.querySelector(`[data-group="${group}"]`) as HTMLElement;
      for (const t of list) {
        const li = document.createElement('li');
        li.style.setProperty('--accent', t.accent);
        // The row itself opens the panel; "go" walks you there instead.
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'menu-open';
        open.innerHTML = `<span class="menu-swatch"></span><span class="menu-title"></span><span class="menu-kr" lang="ko"></span>`;
        (open.querySelector('.menu-title') as HTMLElement).textContent = t.title;
        (open.querySelector('.menu-kr') as HTMLElement).textContent = t.koreanTitle;
        open.addEventListener('click', () => actions.onOpen(t));
        li.appendChild(open);
        const buttons = document.createElement('span');
        buttons.className = 'menu-buttons';
        if (this.travelEnabled) {
          const travel = document.createElement('button');
          travel.type = 'button';
          travel.className = 'menu-go';
          travel.setAttribute('aria-label', `Go to ${t.title}`);
          travel.innerHTML = `go ${ICON.arrow}`;
          travel.addEventListener('click', () => actions.onTravel(t));
          buttons.appendChild(travel);
        }
        li.appendChild(buttons);
        ul.appendChild(li);
      }
    };
    fill('projects', projects);
    fill('places', places);

    section.querySelector('.panel-close')!.addEventListener('click', () => {
      this.close();
      actions.onClose();
    });
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) {
        this.close();
        actions.onClose();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.key === 'Tab') trapFocus(this.root, e);
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(): void {
    this.lastFocused = document.activeElement;
    this.root.classList.remove('hidden');
    (this.root.querySelector('.panel') as HTMLElement).focus();
  }

  close(): void {
    this.root.classList.add('hidden');
    if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus();
  }
}
