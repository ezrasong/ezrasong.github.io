/**
 * Schools of fish and solitary squid swim in from any edge, scatter
 * from nearby orca bodies, and are removed on a catch. Screen CSS px, y down.
 */

export const PREY_FISH = 0;
export const PREY_SQUID = 1;

export interface Prey {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Smoothed facing angle, independent of a single-frame velocity change. */
  heading: number;
  kind: number;
  /** School id: fish of one school steer together. */
  school: number;
  /** Seconds since offscreen spawn; also drives the swimming animation. */
  age: number;
  life: number;
  /** 0..1, set while fleeing; renderer quickens the tail/arm animation. */
  fear: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class PreyField {
  readonly list: Prey[] = [];
  private w = 0;
  private h = 0;
  private spawnIn = 1;
  private nextSchool = 1;
  /** Cap scales with the screen so phones stay calm. */
  private cap = 18;
  private speedScale = 1;

  resize(w: number, h: number, hunterLength = Math.min(w / 900, h / 600) * 490): void {
    const oldW = this.w, oldH = this.h;
    this.w = w;
    this.h = h;
    // Orcas shrink with the viewport. Prey must slow down with them, or a
    // phone-sized hunter can never catch a fish fleeing at desktop speed.
    this.speedScale = Math.max(0.35, Math.min(1, hunterLength / 490));
    this.cap = Math.round(Math.min(26, Math.max(10, (w * h) / 60000)));
    for (const p of this.list) {
      // Preserve offscreen entry distances when resizing; do not pull a
      // waiting school into view by clamping it to the viewport edge.
      p.x = p.x < 0 ? p.x : p.x > oldW ? w + p.x - oldW : Math.min(p.x, w - 16);
      p.y = p.y < 0 ? p.y : p.y > oldH ? h + p.y - oldH : Math.min(p.y, h - 16);
    }
    if (!this.list.length) { this.spawn(); this.spawn(); }
  }

  /** Start fully outside a random edge, already swimming into the water. */
  private spawn(): void {
    const { w, h } = this;
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? -32 : edge === 1 ? w + 32 : rand(24, w - 24);
    const y = edge === 2 ? -32 : edge === 3 ? h + 32 : rand(24, h - 24);
    const heading = Math.atan2(rand(h * 0.3, h * 0.7) - y, rand(w * 0.3, w * 0.7) - x);
    const squid = Math.random() < 0.24;
    const n = squid ? 1 : Math.floor(rand(3, 6));
    const speed = (squid ? 22 : 34) * this.speedScale;
    const school = this.nextSchool++;
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      this.list.push({
        x: edge === 0 ? x - rand(0, 12) : edge === 1 ? x + rand(0, 12) : Math.max(24, Math.min(w - 24, x + rand(-26, 26))),
        y: edge === 2 ? y - rand(0, 12) : edge === 3 ? y + rand(0, 12) : Math.max(24, Math.min(h - 24, y + rand(-26, 26))),
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        heading,
        kind: squid ? PREY_SQUID : PREY_FISH,
        school,
        age: 0,
        life: rand(24, 40),
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
      this.spawnIn = rand(2, 4);
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
        ax += ((s[0] / n - p.x) * 0.6 + (s[2] / n - p.vx) * 0.9) * (1 - p.fear);
        ay += ((s[1] / n - p.y) * 0.6 + (s[3] / n - p.vy) * 0.9) * (1 - p.fear);
      }
      // Leave room for the multi-cell silhouettes, rather than schooling
      // directly on top of one another. Weaker cohesion still keeps a school
      // together while this short-range force opens gaps between fish.
      const spacing = this.w < 600 ? 24 : 34;
      for (const other of this.list) {
        if (other === p) continue;
        const dx = p.x - other.x, dy = (p.y - other.y) * 1.4;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < spacing) {
          const push = (1 - d / spacing) * 90;
          ax += dx / d * push;
          ay += dy / d * push;
        }
      }
      // Wander
      const t = p.age * 0.7 + p.school;
      ax += Math.cos(t) * 8;
      ay += Math.sin(t * 1.3) * 6;
      // Flee the nearest orca's head
      let near: { x: number; y: number } | undefined;
      let nd = Infinity;
      for (const hd of heads) {
        const q = (p.x - hd.x) ** 2 + (p.y - hd.y) ** 2;
        if (q < nd) {
          nd = q;
          near = hd;
        }
      }
      const dx = near ? p.x - near.x : 0;
      const dy = near ? p.y - near.y : 0;
      const d = Math.hypot(dx, dy) || 1;
      const fear = near ? Math.max(0, 1 - d / scare) : 0;
      p.fear += (fear - p.fear) * Math.min(1, dt * 6);
      ax += (dx / d) * 260 * fear;
      ay += (dy / d) * 260 * fear;
      // Gently turn schools at the edge; hunters can now follow them there.
      const old = p.age > p.life;
      if (!old) {
        const m = 28;
        if (p.x < m) ax += (m - p.x) * 3;
        if (p.x > w - m) ax -= (p.x - (w - m)) * 3;
        if (p.y < m) ay += (m - p.y) * 3;
        if (p.y > h - m) ay -= (p.y - (h - m)) * 3;
      }
      p.vx += ax * dt;
      p.vy += ay * dt;
      // Squid jet in pulses; fish cruise, sprint when scared
      const base = p.kind === PREY_SQUID ? 18 + 30 * Math.max(0, Math.sin(p.age * 2.2)) : 30;
      const max = (base + 65 * p.fear) * this.speedScale;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      if (sp > max) {
        p.vx *= max / sp;
        p.vy *= max / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const angle = Math.atan2(p.vy, p.vx) - p.heading;
      const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
      p.heading += turn * -Math.expm1(-dt * 9);
      if (p.age > p.life + 2 || (old && (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40))) this.list.splice(i, 1);
    }
  }

  /** Nearest prey to (x, y), or null. */
  nearest(x: number, y: number, claimed?: ReadonlySet<Prey>): Prey | null {
    let best: Prey | null = null;
    let bd = Infinity;
    for (const p of this.list) {
      if (claimed?.has(p)) continue;
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
