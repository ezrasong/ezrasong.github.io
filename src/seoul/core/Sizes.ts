/** Viewport size tracking with resize callbacks. */
export class Sizes {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio, 2);
  private callbacks: ((s: Sizes) => void)[] = [];

  constructor() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.pixelRatio = Math.min(window.devicePixelRatio, 2);
      for (const cb of this.callbacks) cb(this);
    });
  }

  onResize(cb: (s: Sizes) => void): void {
    this.callbacks.push(cb);
  }

  get aspect(): number {
    return this.width / this.height;
  }
}
