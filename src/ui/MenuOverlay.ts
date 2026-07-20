import type { InteractionTarget } from '../types';
import { trapFocus } from './focusTrap';

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
        <div>
          <p class="panel-kr" aria-hidden="true">안내도</p>
          <h2>City Directory</h2>
        </div>
        <button type="button" class="panel-close" aria-label="Close directory">✕</button>
      </header>
      <div class="panel-body">
        <p class="panel-para menu-note">
          걷기 싫을 때 · prefer not to walk? Open anything from here.
        </p>
        <h3 class="panel-subhead">프로젝트 · Projects</h3>
        <ul class="menu-list" data-group="projects"></ul>
        <h3 class="panel-subhead">둘러보기 · Around town</h3>
        <ul class="menu-list" data-group="places"></ul>
      </div>
      <footer class="panel-footer"><span class="panel-hint">ESC · 닫기 close</span></footer>`;
    this.root.appendChild(section);
    container.appendChild(this.root);

    const fill = (group: string, list: InteractionTarget[]) => {
      const ul = section.querySelector(`[data-group="${group}"]`) as HTMLElement;
      for (const t of list) {
        const li = document.createElement('li');
        li.style.setProperty('--accent', t.accent);
        const label = document.createElement('span');
        label.className = 'menu-label';
        label.innerHTML = `<span class="menu-kr">${t.koreanTitle}</span>${t.title}`;
        li.appendChild(label);
        const buttons = document.createElement('span');
        buttons.className = 'menu-buttons';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn btn-small';
        open.textContent = '열기 Open';
        open.addEventListener('click', () => actions.onOpen(t));
        buttons.appendChild(open);
        if (this.travelEnabled) {
          const travel = document.createElement('button');
          travel.type = 'button';
          travel.className = 'btn btn-small';
          travel.textContent = '이동 Travel';
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
