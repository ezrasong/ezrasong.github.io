import type { DistrictInfo, InteractionTarget } from '../types';
import { trapFocus } from './focusTrap';

/**
 * The expanded city map: opened by clicking the HUD minimap. Shows the
 * whole painted city with district names, a live player arrow, and one
 * clickable marker per destination — clicking a marker travels there.
 */
export class MapOverlay {
  readonly root: HTMLElement;
  private lastFocused: Element | null = null;
  private playerEl: HTMLElement;

  constructor(
    container: HTMLElement,
    ground: HTMLCanvasElement | null,
    targets: InteractionTarget[],
    districts: DistrictInfo[],
    actions: {
      onTravel: (t: InteractionTarget) => void;
      onClose: () => void;
    }
  ) {
    this.root = document.createElement('div');
    this.root.className = 'panel-backdrop hidden';

    const section = document.createElement('section');
    section.className = 'panel map-panel';
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-modal', 'true');
    section.setAttribute('aria-label', 'City map');
    section.tabIndex = -1;
    section.innerHTML = `
      <header class="panel-header">
        <div>
          <p class="panel-kr" aria-hidden="true">서울 지도</p>
          <h2>City Map</h2>
        </div>
        <button type="button" class="panel-close" aria-label="Close map">✕</button>
      </header>
      <div class="panel-body">
        <div class="map-frame">
          <canvas class="map-canvas" width="760" height="760" aria-hidden="true"></canvas>
          <div class="map-markers"></div>
          <div class="map-player" aria-hidden="true"></div>
        </div>
      </div>
      <footer class="panel-footer"><span class="panel-hint">표시를 누르면 이동 · click a marker to travel · ESC — 닫기 close</span></footer>`;
    this.root.appendChild(section);
    container.appendChild(this.root);

    // --- Base map: the painted ground, brightened, with district names
    const canvas = section.querySelector('.map-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    if (ground) {
      ctx.drawImage(ground, 0, 0, ground.width, ground.height, 0, 0, 760, 760);
      ctx.fillStyle = 'rgba(16,18,26,0.18)';
      ctx.fillRect(0, 0, 760, 760);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const d of districts) {
        const cx = (((d.bounds.minX + d.bounds.maxX) / 2 + 104) / 208) * 760;
        const cz = (((d.bounds.minZ + d.bounds.maxZ) / 2 + 104) / 208) * 760;
        ctx.fillStyle = 'rgba(12,14,20,0.55)';
        ctx.font = '700 21px "IBM Plex Sans KR", sans-serif';
        ctx.fillText(d.koreanName, cx + 1, cz - 7 + 1);
        ctx.fillStyle = 'rgba(245,234,210,0.92)';
        ctx.fillText(d.koreanName, cx, cz - 7);
        ctx.fillStyle = 'rgba(245,234,210,0.6)';
        ctx.font = '600 10px "IBM Plex Sans KR", sans-serif';
        ctx.fillText(d.name.toUpperCase(), cx, cz + 10);
      }
      ctx.fillStyle = 'rgba(245,234,210,0.8)';
      ctx.font = '700 15px sans-serif';
      ctx.fillText('N', 380, 16);
    }

    // --- Destination markers (real buttons: clickable + tabbable)
    const markers = section.querySelector('.map-markers') as HTMLElement;
    for (const t of targets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-marker';
      btn.style.setProperty('--accent', t.accent);
      btn.style.left = `${((t.entrance.x + 104) / 208) * 100}%`;
      btn.style.top = `${((t.entrance.z + 104) / 208) * 100}%`;
      btn.setAttribute('aria-label', `Travel to ${t.title}`);
      btn.innerHTML = `<span class="dot"></span><span class="mlabel">${t.koreanTitle} · ${t.title}</span>`;
      btn.addEventListener('click', () => actions.onTravel(t));
      markers.appendChild(btn);
    }

    this.playerEl = section.querySelector('.map-player') as HTMLElement;

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

  open(px: number, pz: number, yaw: number): void {
    this.lastFocused = document.activeElement;
    this.playerEl.style.left = `${((px + 104) / 208) * 100}%`;
    this.playerEl.style.top = `${((pz + 104) / 208) * 100}%`;
    this.playerEl.style.setProperty('--rot', `${Math.PI - yaw}rad`);
    this.root.classList.remove('hidden');
    (this.root.querySelector('.panel') as HTMLElement).focus();
  }

  close(): void {
    this.root.classList.add('hidden');
    if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus();
  }
}
