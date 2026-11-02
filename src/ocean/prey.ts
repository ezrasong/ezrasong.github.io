/**
 * Prey for the orca: small schools of fish and the odd squid that drift in
 * from the edges, mill about, and scatter when the orca comes close. The
 * orca hunts whichever is nearest once it gets hungry, and a catch removes
 * it. Everything is in screen CSS px (y down), drawn as glyphs by the
 * renderer's overlay pass.
 */

export const PREY_FISH = 0;
export const PREY_SQUID = 1;

export interface Prey {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number;
  /** School id: fish of one school steer together. */
  school: number;
  /** Seconds since spawn; prey fades in and wanders off when old. */
  age: number;
  life: number;
  /** 0..1, set while fleeing; renderer shows a faster glyph. */
  fear: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class PreyField {
  readonly list: Prey[] = [];
  private w = 0;
  private h = 0;
  private spawnIn = 2;
  private nextSchool = 1;
  /** Cap scales with the screen so phones stay calm. */
  private cap = 18;
  private speedScale = 1;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    // Orcas shrink with the viewport. Prey must slow down with them, or a
    // phone-sized hunter can never catch a fish fleeing at desktop speed.
    this.speedScale = Math.max(0.35, Math.min(1, w / 900, h / 600));
    this.cap = Math.round(Math.min(26, Math.max(10, (w * h) / 60000)));
    for (const p of this.list) {
      p.x = Math.min(Math.max(p.x, -20), w + 20);
      p.y = Math.min(Math.max(p.y, -20), h + 20);
    }
  }

  /** Spawn a school (or a squid) just outside a random edge, heading in. */
  private spawn(): void {
    const { w, h } = this;
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? -16 : edge === 1 ? w + 16 : rand(w * 0.1, w * 0.9);
    const y = edge === 2 ? -16 : edge === 3 ? h + 16 : rand(h * 0.12, h * 0.88);
    const tx = rand(w * 0.2, w * 0.8);
    const ty = rand(h * 0.2, h * 0.8);
    const d = Math.hypot(tx - x, ty - y) || 1;
    const squid = Math.random() < 0.18;
    const n = squid ? 1 : Math.floor(rand(4, 9));
    const speed = (squid ? 22 : 34) * this.speedScale;
    const school = this.nextSchool++;
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      this.list.push({
        x: x + rand(-18, 18),
        y: y + rand(-12, 12),
        vx: ((tx - x) / d) * speed,
        vy: ((ty - y) / d) * speed,
        kind: squid ? PREY_SQUID : PREY_FISH,
        school,
        age: 0,
        life: rand(26, 44),
        fear: 0,
      });
    }
  }

  /**
   * Advance: schooling (fish match their school's heading and stay near its
   * centre), a gentle wander, fleeing from the orca's head, and leaving the
   * screen when old. Returns nothing; catches are handled by `eatNear`.
   */
  update(dt: number, heads: ReadonlyArray<{ x: number; y: number }>, scare: number): void {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.list.length < this.cap - 3) {
      this.spawn();
      this.spawnIn = rand(5, 11);
    }
    // School centres and mean headings
    const sx = new Map<number, [number, number, number, number, number]>();
    for (const p of this.list) {
      const a = sx.get(p.school) ?? [0, 0, 0, 0, 0];
      a[0] += p.x;
      a[1] += p.y;
      a[2] += p.vx;
      a[3] += p.vy;
      a[4]++;
      sx.set(p.school, a);
    }
    const { w, h } = this;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      const s = sx.get(p.school)!;
      const n = s[4];
      let ax = 0;
      let ay = 0;
      if (n > 1) {
        ax += (s[0] / n - p.x) * 0.6 + (s[2] / n - p.vx) * 0.9;
        ay += (s[1] / n - p.y) * 0.6 + (s[3] / n - p.vy) * 0.9;
      }
      // Wander
      const t = p.age * 0.7 + p.school;
      ax += Math.cos(t) * 8;
      ay += Math.sin(t * 1.3) * 6;
      // Flee the nearest orca's head
      let near = heads[0]!;
      let nd = Infinity;
      for (const hd of heads) {
        const q = (p.x - hd.x) ** 2 + (p.y - hd.y) ** 2;
        if (q < nd) {
          nd = q;
          near = hd;
        }
      }
      const dx = p.x - near.x;
      const dy = p.y - near.y;
      const d = Math.hypot(dx, dy) || 1;
      const fear = Math.max(0, 1 - d / scare);
      p.fear += (fear - p.fear) * Math.min(1, dt * 6);
      ax += (dx / d) * 260 * fear;
      ay += (dy / d) * 260 * fear;
      // Keep schools in open water until old, then let them swim off.
      // A weak edge force lets fleeing fish collect beyond the orca's
      // turning room, where they are visible but permanently unreachable.
      const old = p.age > p.life;
      if (!old) {
        const m = Math.min(w * 0.25, h * 0.2, scare * 0.75);
        if (p.x < m) ax += (m - p.x) * 12;
        if (p.x > w - m) ax -= (p.x - (w - m)) * 12;
        if (p.y < m) ay += (m - p.y) * 12;
        if (p.y > h - m) ay -= (p.y - (h - m)) * 12;
      }
      p.vx += ax * dt;
      p.vy += ay * dt;
      // Squid jet in pulses; fish cruise, sprint when scared
      const base = p.kind === PREY_SQUID ? 18 + 30 * Math.max(0, Math.sin(p.age * 2.2)) : 30;
      const max = (base + 45 * p.fear) * this.speedScale;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      if (sp > max) {
        p.vx *= max / sp;
        p.vy *= max / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (old && (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40)) this.list.splice(i, 1);
    }
  }

  /** Nearest prey to (x, y), or null. */
  nearest(x: number, y: number): Prey | null {
    let best: Prey | null = null;
    let bd = Infinity;
    for (const p of this.list) {
      if (p.x < 0 || p.x > this.w || p.y < 0 || p.y > this.h) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Remove every prey within `r` of (x, y). Returns how many were eaten. */
  eatNear(x: number, y: number, r: number): number {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) {
        this.list.splice(i, 1);
        n++;
      }
    }
    return n;
  }
}
