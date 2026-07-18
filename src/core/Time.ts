/** Central clock. Delta is clamped so tab-switches never explode physics. */
export class Time {
  elapsed = 0;
  delta = 1 / 60;
  private last = performance.now();
  private callbacks: ((time: Time) => void)[] = [];
  private rafId = 0;
  running = false;

  onTick(cb: (time: Time) => void): void {
    this.callbacks.push(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      const now = performance.now();
      this.delta = Math.min((now - this.last) / 1000, 1 / 20);
      this.last = now;
      this.elapsed += this.delta;
      for (const cb of this.callbacks) cb(this);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
