import { bilingual, getLang, setLang } from './lang';
import type { InteractionTarget } from '../types';
import { PROFILE } from '../config/profile';
import { ICON } from './icons';

/** Touch devices get on-screen controls instead of key hints. */
const TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;


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
    this.root.classList.toggle('is-touch', TOUCH);

    const controls = TOUCH
      ? `<div><dt>move</dt><dd>drag the pad, bottom left</dd></div>
         <div><dt>enter</dt><dd>tap <b>E</b> at a door</dd></div>
         <div><dt>look</dt><dd>drag anywhere else</dd></div>
         <div><dt>shortcut</dt><dd>the directory opens anything</dd></div>`
      : `<div><dt>move</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, <kbd>shift</kbd> to run, <kbd>space</kbd> to jump</dd></div>
         <div><dt>enter</dt><dd><kbd>E</kbd> at a door</dd></div>
         <div><dt>look</dt><dd>drag, scroll to zoom</dd></div>
         <div><dt>shortcut</dt><dd><kbd>M</kbd> directory, <kbd>R</kbd> back to the plaza</dd></div>`;

    this.root.innerHTML = `
      <div class="loading-screen" role="status" aria-live="polite">
        <p class="loading-label"><span lang="ko">서울을 짓는 중</span> building seoul</p>
        <div class="loading-track"><div class="loading-bar"></div></div>
      </div>

      <div class="title-screen hidden">
        <div class="title-card">
          <h1></h1>
          <p class="title-sub"><span lang="ko">미니 서울</span> A small Seoul, built in code. Every building opens a piece of my work.</p>
          <dl class="title-controls">${controls}</dl>
          <div class="title-lang" role="group" aria-label="Interface language">
            <span class="title-lang-label">language</span>
            <button type="button" class="lang-opt" data-lang="ko" aria-pressed="false"><span lang="ko">한국어</span> + english</button>
            <button type="button" class="lang-opt" data-lang="en" aria-pressed="false">english only</button>
          </div>
          <div class="title-actions">
            <button type="button" class="btn btn-primary title-start">enter the city ${ICON.arrow}</button>
            <a class="btn" href="./portfolio.html">read the portfolio instead</a>
          </div>
        </div>
      </div>

      <div class="hud hidden">
        <div class="hud-left">
          <a class="hud-back" href="./">${ICON.back}<span></span></a>
          <div class="minimap-wrap">
            <canvas class="minimap" width="320" height="320" role="button" tabindex="0"
              aria-label="City minimap. Click to open the full map; scroll to zoom."></canvas>
            <span class="minimap-expand" aria-hidden="true">${ICON.expand}</span>
          </div>
          <span class="hud-weather" aria-live="polite"></span>
        </div>
        <div class="hud-right" role="toolbar" aria-label="Settings">
          <button type="button" class="hud-btn hud-sound" aria-pressed="false" aria-label="Sound off" title="Sound off">${ICON.soundOff}</button>
          <button type="button" class="hud-btn hud-quality" title="Graphics quality"></button>
          <button type="button" class="hud-btn hud-lang" title="Interface language"></button>
          <button type="button" class="hud-btn hud-reset" aria-label="Back to the plaza (R)" title="Back to the plaza (R)">${ICON.home}</button>
          <button type="button" class="hud-btn hud-menu" aria-label="Directory (M)" title="Directory (M)">${ICON.directory}<span>directory</span></button>
        </div>
      </div>

      <p class="controls-hint hidden">${TOUCH ? 'drag the pad to walk' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk'}</p>
      <div class="prompt hidden" aria-live="polite"></div>
      <div class="toast hidden" aria-live="polite"></div>

      <div class="fallback hidden" role="alert">
        <h2>This device can't draw the 3D city.</h2>
        <p>Every project is still here, in the directory.</p>
        <div class="title-actions">
          <button type="button" class="btn btn-primary fallback-menu">open the directory</button>
          <a class="btn" href="./portfolio.html">read the portfolio</a>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.loadingScreen = this.q('.loading-screen');
    this.loadingBar = this.q('.loading-bar');
    this.titleScreen = this.q('.title-screen');
    this.prompt = this.q('.prompt');
    this.toast = this.q('.toast');
    this.q('.title-card h1').textContent = PROFILE.name;
    this.q('.hud-back').setAttribute('aria-label', `${PROFILE.name}, back to the start`);
    this.q('.hud-back span').textContent = PROFILE.name.toLowerCase();
    this.hint = this.q('.controls-hint');
    this.soundBtn = this.q('.hud-sound') as HTMLButtonElement;
    this.qualityBtn = this.q('.hud-quality') as HTMLButtonElement;
    this.wireLang();
  }

  private qualityLabel = '';
  private weatherLabel = '';

  /** Language buttons on the title card and in the HUD. */
  private wireLang(): void {
    const sync = () => {
      const l = getLang();
      for (const b of this.root.querySelectorAll<HTMLButtonElement>('.lang-opt')) {
        b.setAttribute('aria-pressed', String(b.dataset.lang === l));
      }
      const hud = this.q('.hud-lang') as HTMLButtonElement;
      hud.textContent = l === 'en' ? 'en' : '한/en';
      hud.setAttribute('aria-label', l === 'en' ? 'Language: English. Click for Korean and English.' : 'Language: Korean and English. Click for English only.');
      if (this.qualityLabel) this.setQualityLabel(this.qualityLabel);
      this.setWeather(this.weatherLabel);
    };
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.lang-opt')) {
      b.addEventListener('click', () => {
        setLang(b.dataset.lang === 'en' ? 'en' : 'ko');
        sync();
      });
    }
    this.q('.hud-lang').addEventListener('click', () => {
      setLang(getLang() === 'en' ? 'ko' : 'en');
      sync();
    });
    sync();
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
    this.loadingScreen.innerHTML = `<p class="loading-label">${message}</p><p class="loading-label"><a href="./portfolio.html">read the portfolio instead</a></p>`;
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
    this.soundBtn.innerHTML = on ? ICON.soundOn : ICON.soundOff;
    this.soundBtn.setAttribute('aria-pressed', String(on));
    const label = on ? 'Sound on' : 'Sound off';
    this.soundBtn.title = label;
    this.soundBtn.setAttribute('aria-label', label);
  }

  setQualityLabel(label: string): void {
    this.qualityLabel = label;
    this.qualityBtn.textContent = bilingual(label);
    this.qualityBtn.setAttribute('aria-label', `Graphics quality: ${label}. Click to change.`);
  }

  hideControlsHint(): void {
    this.hint.classList.add('hidden');
  }

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
    // Mid-res copy: sharp up to max zoom without blitting the full ground.
    const base = document.createElement('canvas');
    base.width = 1280;
    base.height = 1280;
    const b = base.getContext('2d')!;
    // Desaturate and darken so the map reads as a map, not a second scene.
    b.filter = 'grayscale(0.55) brightness(0.62) contrast(1.08)';
    b.drawImage(ground, 0, 0, ground.width, ground.height, 0, 0, 1280, 1280);
    b.filter = 'none';
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
    ctx.fillStyle = '#171615';
    ctx.fillRect(0, 0, MM, MM);
    ctx.translate(c, c);
    ctx.rotate(rot);
    const scale = 208 * k;
    ctx.drawImage(this.minimapBase, (-104 - x) * k, (-104 - z) * k, scale, scale);
    ctx.restore();

    // Destinations as small squares, decluttered: a pin that would overlap
    // an earlier one is skipped instead of stacking.
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const placed: [number, number][] = [];
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#171615';
    for (const t of this.minimapTargets) {
      const dx = (t.x - x) * k;
      const dz = (t.z - z) * k;
      const sx = c + dx * cosR - dz * sinR;
      const sy = c + dx * sinR + dz * cosR;
      if (Math.hypot(sx - c, sy - c) > R - 10) continue;
      if (placed.some(([px, py]) => Math.hypot(px - sx, py - sy) < 12)) continue;
      placed.push([sx, sy]);
      ctx.fillStyle = t.accent;
      ctx.strokeRect(sx - 5, sy - 5, 10, 10);
      ctx.fillRect(sx - 5, sy - 5, 10, 10);
    }

    // Player arrow at the center; camera-relative so it only tilts when
    // the view and the poro's heading disagree (drag-look, turns).
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI - playerYaw + rot);
    ctx.fillStyle = '#e9e5dc';
    ctx.strokeStyle = '#171615';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    // North marker riding the rim.
    const nx = c + Math.sin(rot) * (R - 16);
    const ny = c - Math.cos(rot) * (R - 16);
    ctx.fillStyle = '#e9e5dc';
    ctx.font = '600 20px "Geist Mono Variable", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 1);
  }

  setWeather(label: string): void {
    this.weatherLabel = label;
    (this.q('.hud-weather') as HTMLElement).textContent = label ? bilingual(label) : '';
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

  /* ---- prompt & toast ---- */
  showPrompt(target: InteractionTarget): void {
    const how = TOUCH ? 'tap <b>E</b> to enter' : '<kbd>E</kbd> to enter';
    this.prompt.innerHTML = `<span class="prompt-dot"></span><strong></strong><span class="prompt-kr" lang="ko"></span><span class="prompt-how">${how}</span>`;
    this.prompt.querySelector('strong')!.textContent = target.title;
    this.prompt.querySelector('.prompt-kr')!.textContent = target.koreanTitle;
    this.prompt.style.setProperty('--accent', target.accent);
    this.prompt.classList.remove('hidden');
  }

  hidePrompt(): void {
    this.prompt.classList.add('hidden');
  }

  showToast(kr: string, en: string): void {
    this.toast.innerHTML = `<span class="toast-kr" lang="ko"></span><span class="toast-en"></span>`;
    this.toast.querySelector('.toast-kr')!.textContent = kr;
    this.toast.querySelector('.toast-en')!.textContent = en;
    // Restart the entrance even when a toast replaces one still showing.
    this.toast.classList.add('hidden');
    void this.toast.offsetWidth;
    this.toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.add('hidden'), 2600);
  }
}
