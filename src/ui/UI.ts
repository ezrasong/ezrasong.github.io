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
            <canvas class="minimap" width="288" height="288" role="button" tabindex="0"
              aria-label="City minimap — click to expand"></canvas>
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
  private static readonly MM = 288;

  /** Pre-scales the painted ground once; per-frame work is two blits. */
  initMinimap(ground: HTMLCanvasElement | null, targets: InteractionTarget[]): void {
    if (!ground) return;
    const MM = UI.MM;
    const base = document.createElement('canvas');
    base.width = MM;
    base.height = MM;
    const b = base.getContext('2d')!;
    b.drawImage(ground, 0, 0, ground.width, ground.height, 0, 0, MM, MM);
    // Mute it so the live markers pop
    b.fillStyle = 'rgba(16,18,26,0.28)';
    b.fillRect(0, 0, MM, MM);
    b.fillStyle = 'rgba(245,234,210,0.75)';
    b.font = '700 16px sans-serif';
    b.textAlign = 'center';
    b.fillText('N', MM / 2, 18);
    this.minimapBase = base;
    this.minimapTargets = targets.map((t) => ({ x: t.entrance.x, z: t.entrance.z, accent: t.accent }));
  }

  /** World x/z ∈ [-104, 104] maps onto the minimap canvas. */
  updateMinimap(x: number, z: number, yaw: number): void {
    if (!this.minimapBase) return;
    const MM = UI.MM;
    const canvas = this.q('.minimap') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const map = (v: number) => ((v + 104) / 208) * MM;
    ctx.clearRect(0, 0, MM, MM);
    ctx.drawImage(this.minimapBase, 0, 0);
    for (const t of this.minimapTargets) {
      ctx.fillStyle = t.accent;
      ctx.strokeStyle = 'rgba(12,14,20,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(map(t.x), map(t.z), 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Player arrow (forward = (sin yaw, cos yaw) in world x/z)
    ctx.save();
    ctx.translate(map(x), map(z));
    ctx.rotate(Math.PI - yaw);
    ctx.fillStyle = '#ffd447';
    ctx.strokeStyle = 'rgba(12,14,20,0.9)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -8.7);
    ctx.lineTo(6.4, 6.7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.4, 6.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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
