/**
 * Unified input: keyboard (WASD/arrows/E/Space/Escape/R) plus a virtual
 * joystick and action button on touch devices. Exposes analog axes so both
 * input styles drive the same player code.
 */
export class Input {
  /** -1..1: forward is positive. */
  throttle = 0;
  /** -1..1: left is positive (matches counter-clockwise yaw). */
  steer = 0;
  enabled = true;

  private keys = new Set<string>();
  private interactCbs: (() => void)[] = [];
  private escapeCbs: (() => void)[] = [];
  private resetCbs: (() => void)[] = [];
  private anyKeyCbs: (() => void)[] = [];

  // touch joystick state
  private joyActive = false;
  private joyVec = { x: 0, y: 0 };
  readonly isTouch: boolean;

  constructor() {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Keep the page from scrolling while playing.
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
        (e.code === 'KeyE' && this.enabled)
      ) {
        e.preventDefault();
      }

      if (!e.repeat) {
        for (const cb of this.anyKeyCbs) cb();
        if (e.code === 'Escape') for (const cb of this.escapeCbs) cb();
        if ((e.code === 'KeyE' || e.code === 'Space') && this.enabled) {
          for (const cb of this.interactCbs) cb();
        }
        if (e.code === 'KeyR' && this.enabled) for (const cb of this.resetCbs) cb();
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
  }

  /** Called each frame; folds keys + joystick into analog axes. */
  update(): void {
    if (!this.enabled) {
      this.throttle = 0;
      this.steer = 0;
      return;
    }
    let t = 0;
    let s = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) t += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) t -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s -= 1;

    if (this.joyActive) {
      t += -this.joyVec.y;
      s += -this.joyVec.x;
    }
    this.throttle = Math.max(-1, Math.min(1, t));
    this.steer = Math.max(-1, Math.min(1, s));
  }

  onInteract(cb: () => void): void {
    this.interactCbs.push(cb);
  }
  onEscape(cb: () => void): void {
    this.escapeCbs.push(cb);
  }
  onReset(cb: () => void): void {
    this.resetCbs.push(cb);
  }
  onAnyKey(cb: () => void): void {
    this.anyKeyCbs.push(cb);
  }

  triggerInteract(): void {
    if (this.enabled) for (const cb of this.interactCbs) cb();
  }

  /**
   * Builds DOM touch controls (joystick + action button) inside `root`.
   * Only called when isTouch is true.
   */
  attachTouchControls(root: HTMLElement): void {
    const joy = document.createElement('div');
    joy.className = 'joystick';
    joy.innerHTML = '<div class="joystick-knob"></div>';
    const knob = joy.querySelector('.joystick-knob') as HTMLElement;
    root.appendChild(joy);

    const btn = document.createElement('button');
    btn.className = 'touch-action';
    btn.type = 'button';
    btn.textContent = 'E';
    btn.setAttribute('aria-label', 'Interact');
    root.appendChild(btn);
    btn.addEventListener('click', () => this.triggerInteract());

    const RADIUS = 44;
    let pointerId: number | null = null;
    let cx = 0;
    let cy = 0;

    const move = (x: number, y: number) => {
      let dx = x - cx;
      let dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joyVec.x = dx / RADIUS;
      this.joyVec.y = dy / RADIUS;
    };

    joy.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      const rect = joy.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      this.joyActive = true;
      joy.setPointerCapture(e.pointerId);
      move(e.clientX, e.clientY);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      this.joyActive = false;
      this.joyVec.x = 0;
      this.joyVec.y = 0;
      knob.style.transform = 'translate(0, 0)';
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
  }
}
