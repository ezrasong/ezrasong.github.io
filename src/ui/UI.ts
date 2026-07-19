import type { InteractionTarget } from '../types';
import { PROFILE } from '../config/profile';

/**
 * Everything DOM that isn't the panel or menu: loading screen, title card,
 * HUD buttons, interaction prompt, district toast, and the fallback message
 * for machines without WebGL.
 */
export class UI {
  readonly root: HTMLElement;
  private loadingBar: HTMLElement;
  private loadingScreen: HTMLElement;
  private titleScreen: HTMLElement;
  private prompt: HTMLElement;
  private toast: HTMLElement;
  private hint: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private qualityBtn: HTMLButtonElement;
  private toastTimer = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    this.root.innerHTML = `
      <div class="loading-screen" role="status" aria-live="polite">
        <p class="loading-kr">서울 굽는 중…</p>
        <p class="loading-en">baking a tiny seoul</p>
        <div class="loading-track"><div class="loading-bar"></div></div>
      </div>

      <div class="title-screen hidden">
        <div class="title-card">
          <p class="title-kr">${PROFILE.koreanName} · 복셀 서울</p>
          <h1>${PROFILE.name}</h1>
          <p class="title-sub">${PROFILE.title}</p>
          <button type="button" class="btn btn-primary title-start">Press Start · 입장</button>
          <div class="title-howto">
            <p class="howto-title">How to play · 조작법</p>
            <p class="title-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>SHIFT</kbd> sprint · <kbd>SPACE</kbd> jump</p>
            <p class="title-hint"><kbd>E</kbd> enter buildings · <kbd>M</kbd> city directory · <kbd>R</kbd> back to plaza</p>
            <p class="title-hint">Drag to look around. Walk across the Han River bridges to explore Gangnam.</p>
          </div>
        </div>
      </div>

      <div class="hud hidden">
        <div class="hud-left">
          <span class="hud-name">${PROFILE.name}<small>${PROFILE.title}</small></span>
          <div class="minimap-wrap">
            <canvas class="minimap" width="320" height="320" role="button" tabindex="0"
              aria-label="City minimap — scroll to zoom, click to expand"></canvas>
            <span class="minimap-expand" aria-hidden="true">⤢</span>
          </div>
          <span class="hud-weather" aria-live="polite"></span>
        </div>
        <div class="hud-right" role="toolbar" aria-label="Settings">
          <button type="button" class="hud-btn hud-sound" aria-pressed="false" aria-label="Sound (muted)" title="Sound (muted)">🔇</button>
          <button type="button" class="hud-btn hud-quality" title="Graphics quality"></button>
          <button type="button" class="hud-btn hud-menu" aria-label="City directory (M)" title="City directory (M)">🗺<span class="hud-btn-label">지도 MAP</span></button>
          <button type="button" class="hud-btn hud-reset" aria-label="Reset position (R)" title="Reset position (R)">↺</button>
        </div>
      </div>

      <div class="controls-hint hidden">WASD walk · SHIFT sprint · SPACE jump · E enter</div>
      <div class="prompt hidden" aria-live="polite"></div>
      <div class="toast hidden" aria-live="polite"></div>

      <div class="fallback hidden" role="alert">
        <h2>3D를 불러올 수 없어요</h2>
        <p>This device can't run the WebGL city, but every project is still
        readable through the directory below.</p>
        <button type="button" class="btn btn-primary fallback-menu">Open directory</button>
      </div>`;
    container.appendChild(this.root);

    this.loadingScreen = this.q('.loading-screen');
    this.loadingBar = this.q('.loading-bar');
    this.titleScreen = this.q('.title-screen');
    this.prompt = this.q('.prompt');
    this.toast = this.q('.toast');
    this.hint = this.q('.controls-hint');
    this.soundBtn = this.q('.hud-sound') as HTMLButtonElement;
    this.qualityBtn = this.q('.hud-quality') as HTMLButtonElement;
  }

  private q(sel: string): HTMLElement {
    return this.root.querySelector(sel) as HTMLElement;
  }

  /* ---- loading ---- */
  setProgress(ratio: number): void {
    this.loadingBar.style.transform = `scaleX(${Math.min(1, ratio)})`;
  }

  showTitle(onStart: () => void): void {
    this.loadingScreen.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    const btn = this.q('.title-start') as HTMLButtonElement;
    btn.focus();
    const start = () => {
      this.titleScreen.classList.add('hidden');
      this.q('.hud').classList.remove('hidden');
      this.hint.classList.remove('hidden');
      onStart();
    };
    btn.addEventListener('click', start, { once: true });
  }

  showLoadError(message: string): void {
    this.loadingScreen.innerHTML = `<p class="loading-kr">문제가 생겼어요</p><p class="loading-en">${message}</p>`;
  }

  showFallback(onOpenMenu: () => void): void {
    this.loadingScreen.classList.add('hidden');
    const fb = this.q('.fallback');
    fb.classList.remove('hidden');
    (fb.querySelector('.fallback-menu') as HTMLButtonElement).addEventListener('click', onOpenMenu);
  }

  /* ---- HUD wiring ---- */
  bindButtons(handlers: {
    onSound: () => void;
    onQuality: () => void;
    onMenu: () => void;
    onReset: () => void;
  }): void {
    this.soundBtn.addEventListener('click', handlers.onSound);
    this.qualityBtn.addEventListener('click', handlers.onQuality);
    this.q('.hud-menu').addEventListener('click', handlers.onMenu);
    this.q('.hud-reset').addEventListener('click', handlers.onReset);
  }

  setSoundState(on: boolean): void {
    this.soundBtn.textContent = on ? '🔊' : '🔇';
    this.soundBtn.setAttribute('aria-pressed', String(on));
    const label = on ? 'Sound (on)' : 'Sound (muted)';
    this.soundBtn.title = label;
    this.soundBtn.setAttribute('aria-label', label);
  }

  setQualityLabel(label: string): void {
    this.qualityBtn.textContent = label;
    this.qualityBtn.setAttribute('aria-label', `Graphics quality: ${label}`);
  }

  hideControlsHint(): void {
    this.hint.classList.add('hidden');
  }

  /* ---- prompt & toast ---- */
  /* ---- Minimap + weather ---- */
  private minimapBase: HTMLCanvasElement | null = null;
  private minimapTargets: { x: number; z: number; accent: string }[] = [];

  /** Backing resolution of the minimap canvas (CSS scales it down). */
  private static readonly MM = 320;
  /** Minimap zoom: world-units-across = 208 / zoom. Scroll wheel adjusts. */
  private minimapZoom = 2.0;

  /** Pre-scales the painted ground once; per-frame work is one clipped blit. */
  initMinimap(ground: HTMLCanvasElement | null, targets: InteractionTarget[]): void {
    if (!ground) return;
    // Mid-res copy: sharp up to max zoom without blitting the full 3120².
    const base = document.createElement('canvas');
    base.width = 1280;
    base.height = 1280;
    const b = base.getContext('2d')!;
    b.drawImage(ground, 0, 0, ground.width, ground.height, 0, 0, 1280, 1280);
    b.fillStyle = 'rgba(16,18,26,0.24)'; // mute so the live markers pop
    b.fillRect(0, 0, 1280, 1280);
    this.minimapBase = base;
    this.minimapTargets = targets.map((t) => ({ x: t.entrance.x, z: t.entrance.z, accent: t.accent }));

    // Scroll on the minimap to zoom it (independent of the camera zoom).
    const el = this.q('.minimap') as HTMLCanvasElement;
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.minimapZoom = Math.min(5, Math.max(1.1, this.minimapZoom * Math.exp(-e.deltaY * 0.0014)));
      },
      { passive: false }
    );
  }

  /**
   * Player-centered rotating minimap: the map turns with the camera so
   * "up" is always where you're looking, like a car navi. `camYaw` drives
   * the rotation; the center arrow shows the player's own heading.
   */
  updateMinimap(x: number, z: number, playerYaw: number, camYaw: number): void {
    if (!this.minimapBase) return;
    const MM = UI.MM;
    const canvas = this.q('.minimap') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const k = (MM / 208) * this.minimapZoom; // screen px per world unit
    const rot = camYaw - Math.PI; // camera-forward maps to screen-up
    const c = MM / 2;
    const R = c - 2;

    ctx.clearRect(0, 0, MM, MM);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12141d';
    ctx.fillRect(0, 0, MM, MM);
    // Ground: one blit of the pre-scaled base, rotated about the player.
    ctx.translate(c, c);
    ctx.rotate(rot);
    const scale = 208 * k; // full world size in screen px at this zoom
    ctx.drawImage(this.minimapBase, (-104 - x) * k, (-104 - z) * k, scale, scale);
    ctx.restore();

    // Pins: camera-rotated, clipped to the disc, decluttered — a pin that
    // would overlap an earlier one is skipped instead of stacking.
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const placed: [number, number][] = [];
    for (const t of this.minimapTargets) {
      const dx = (t.x - x) * k;
      const dz = (t.z - z) * k;
      const sx = c + dx * cosR - dz * sinR;
      const sy = c + dx * sinR + dz * cosR;
      const dr = Math.hypot(sx - c, sy - c);
      if (dr > R - 9) continue;
      if (placed.some(([px, py]) => Math.hypot(px - sx, py - sy) < 11)) continue;
      placed.push([sx, sy]);
      ctx.fillStyle = t.accent;
      ctx.strokeStyle = 'rgba(12,14,20,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Player arrow at the center; camera-relative so it only tilts when
    // the view and the poro's heading disagree (drag-look, turns).
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI - playerYaw + rot);
    ctx.fillStyle = '#ffd447';
    ctx.strokeStyle = 'rgba(12,14,20,0.9)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.6, 6.9);
    ctx.lineTo(0, 3.6);
    ctx.lineTo(-6.6, 6.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North compass riding the rim.
    const nx = c + Math.sin(rot) * (R - 13);
    const ny = c - Math.cos(rot) * (R - 13);
    ctx.fillStyle = 'rgba(24,26,36,0.8)';
    ctx.beginPath();
    ctx.arc(nx, ny, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0e6d0';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);
  }

  setWeather(label: string): void {
    (this.q('.hud-weather') as HTMLElement).textContent = label;
  }

  /** Click (or Enter/Space) on the minimap expands it to the full map. */
  bindMinimap(onExpand: () => void): void {
    const el = this.q('.minimap') as HTMLElement;
    el.addEventListener('click', onExpand);
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onExpand();
      }
    });
  }

  showPrompt(target: InteractionTarget): void {
    this.prompt.innerHTML = `<kbd>E</kbd> Enter <strong>${target.title}</strong> · ${target.koreanTitle}`;
    this.prompt.style.setProperty('--accent', target.accent);
    this.prompt.classList.remove('hidden');
  }

  hidePrompt(): void {
    this.prompt.classList.add('hidden');
  }

  showToast(kr: string, en: string): void {
    this.toast.innerHTML = `<span class="toast-kr">${kr}</span><span class="toast-en">${en}</span>`;
    this.toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.add('hidden'), 2600);
  }
}
