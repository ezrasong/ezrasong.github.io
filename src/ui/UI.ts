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
          <button type="button" class="btn btn-primary title-start">입장 · Press Start</button>
          <p class="title-hint">WASD / 방향키 move · E enter · M map · R reset</p>
        </div>
      </div>

      <div class="hud hidden">
        <div class="hud-left">
          <span class="hud-name">${PROFILE.name}<small>${PROFILE.title}</small></span>
        </div>
        <div class="hud-right" role="toolbar" aria-label="Settings">
          <button type="button" class="hud-btn hud-sound" aria-pressed="false" title="Sound (muted)">🔇</button>
          <button type="button" class="hud-btn hud-quality" title="Graphics quality"></button>
          <button type="button" class="hud-btn hud-menu" title="City directory (M)">🗺</button>
          <button type="button" class="hud-btn hud-reset" title="Reset position (R)">↺</button>
        </div>
      </div>

      <div class="controls-hint hidden">W A S D — 움직이기 move</div>
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
    this.soundBtn.title = on ? 'Sound (on)' : 'Sound (muted)';
  }

  setQualityLabel(label: string): void {
    this.qualityBtn.textContent = label;
  }

  hideControlsHint(): void {
    this.hint.classList.add('hidden');
  }

  /* ---- prompt & toast ---- */
  showPrompt(target: InteractionTarget): void {
    this.prompt.innerHTML = `<kbd>E</kbd> ${target.koreanTitle} · <strong>${target.title}</strong> 들어가기 enter`;
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
