/**
 * Swimming: the head steers toward a target with limited turn and pitch
 * rates, and the body follows the path the head actually traced, so a turn
 * bends through the whole spine instead of rotating it rigidly. On top of
 * that sits the dorsoventral fluke stroke: a wave that starts near the
 * dorsal fin and grows toward the tail, travelling backward. Strokes come in
 * bouts separated by glides, which is what keeps the motion from looking
 * like a sine wave.
 *
 * Coordinates: x right, y up, z toward the viewer, all in px.
 */

import type { OrcaTemplate } from "./orca-model";

export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Pose {
  /** Station centre positions. */
  cx: Float32Array;
  cy: Float32Array;
  cz: Float32Array;
  /** Station frames: tangent (toward the head), up, lateral. */
  tx: Float32Array; ty: Float32Array; tz: Float32Array;
  ux: Float32Array; uy: Float32Array; uz: Float32Array;
  lx: Float32Array; ly: Float32Array; lz: Float32Array;
  /** Fluke pitch and flipper angle, radians. */
  fluke: number;
  pec: number;
  /** -1..1, how far the flippers spread during a turn. */
  pecSpread: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
const approach = (v: number, to: number, rate: number, dt: number): number =>
  to + (v - to) * Math.exp(-rate * dt);

export class OrcaMotion {
  readonly pose: Pose;
  private readonly tpl: OrcaTemplate;
  private readonly n: number;

  // Head state.
  x = 0;
  y = 0;
  z = 0;
  yaw = 0; // 0 = swimming toward +x, π/2 = toward the viewer
  pitch = 0;
  speed = 0;
  private yawRate = 0;
  private roll = 0;

  // Target and behaviour.
  private tgtX = 0;
  private tgtY = 0;
  private tgtZ = 0;
  private tgtTimer = 0;
  private urgent = 0;
  private hunting = false;
  private feeding = false;
  private avoidFor = 0;
  private avoidX = 0;
  private avoidY = 0;
  private avoidZ = 0;
  zone: Zone = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private idle = 0;
  private rollShow = 0;
  private rollShowT = -1;

  // Stroke.
  private phase = 0;
  private amp = 0;
  private bout = 0;
  private stroking = true;

  // Path the head traced, newest last, with cumulative arc length.
  private readonly trailCap = 2048;
  private readonly hx: Float32Array;
  private readonly hy: Float32Array;
  private readonly hz: Float32Array;
  private readonly hd: Float64Array;
  private head = 0;
  private filled = 0;
  private dist = 0;

  private rand: () => number;
  /** Per-animal rhythm, drawn from the seed. */
  private tempo = 1;
  private pace = 1;
  private boutScale = 1;
  /** Seconds the head has made little progress; triggers a fresh heading. */
  private stall = 0;
  /** Seconds left in which chase steering is ignored (after a give-up). */
  private commit = 0;
  private stallX = 0;
  private stallY = 0;

  constructor(tpl: OrcaTemplate, seed = 7) {
    this.tpl = tpl;
    this.n = tpl.stations.length;
    const f = (): Float32Array => new Float32Array(this.n);
    this.pose = {
      cx: f(), cy: f(), cz: f(),
      tx: f(), ty: f(), tz: f(),
      ux: f(), uy: f(), uz: f(),
      lx: f(), ly: f(), lz: f(),
      fluke: 0, pec: 0, pecSpread: 0,
    };
    this.hx = new Float32Array(this.trailCap);
    this.hy = new Float32Array(this.trailCap);
    this.hz = new Float32Array(this.trailCap);
    this.hd = new Float64Array(this.trailCap);
    let s = seed >>> 0 || 1;
    this.rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    // Warm the generator so nearby seeds diverge, then draw a personality.
    for (let i = 0; i < 8; i++) this.rand();
    this.tempo = 0.82 + this.rand() * 0.36;
    this.pace = 0.88 + this.rand() * 0.26;
    this.boutScale = 0.75 + this.rand() * 0.5;
    this.phase = this.rand() * TAU;
    this.bout = this.rand() * 3;
  }

  /** Place the orca, already swimming, with a straight trail behind it. */
  place(x: number, y: number, yaw: number): void {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.feeding = false;
    this.avoidFor = 0;
    this.speed = this.cruise();
    this.filled = 0;
    this.dist = 0;
    const L = this.tpl.length * 1.4;
    const step = 4;
    for (let d = L; d >= 0; d -= step) {
      this.push(x - Math.cos(yaw) * d, y, -Math.sin(yaw) * d);
    }
    this.pickTarget();
    this.solve();
  }

  /** Steer to a point now. */
  call(x: number, y: number): void {
    this.feeding = false;
    this.hunting = true;
    this.tgtX = x;
    this.tgtY = y;
    this.tgtZ = 0;
    this.tgtTimer = 9;
    this.urgent = 1;
    this.idle = 0;
  }

  /** Dropped food may be outside the cruising zone; follow it until eaten. */
  feed(x: number, y: number): void {
    this.call(x, y);
    this.feeding = true;
    this.avoidFor = 0; // Pod mates yield to the animal taking this meal.
  }

  finishFeeding(): void {
    this.feeding = false;
    this.pickTarget();
  }

  /**
   * Hunt: steer at a moving point. Called every frame while prey is near,
   * so it only nudges urgency up instead of resetting it.
   */
  chase(x: number, y: number): void {
    if (this.commit > 0) return;
    this.feeding = false;
    this.hunting = true;
    this.tgtX = x;
    this.tgtY = y;
    this.tgtZ = 0;
    this.tgtTimer = Math.max(this.tgtTimer, 2);
    this.urgent = Math.max(this.urgent, 0.6);
    this.idle = 0;
  }

  /** Collision steering takes priority over food, hunting, and cruise turns. */
  avoid(x: number, y: number, z: number): void {
    this.avoidX = x;
    this.avoidY = y;
    this.avoidZ = z;
    this.avoidFor = 1.8;
  }

  /** A fast pointer passing close to the head: veer away briefly. */
  startle(px: number, py: number): void {
    const dx = this.x - px;
    const dy = this.y - py;
    if (dx * dx + dy * dy > (this.tpl.length * 0.35) ** 2) return;
    const away = Math.sign(dx || 1);
    this.tgtX = clamp(this.x + away * this.tpl.length * 1.2, this.zone.x0, this.zone.x1);
    this.tgtY = clamp(this.y + Math.sign(dy || 1) * this.tpl.length * 0.25, this.zone.y0, this.zone.y1);
    this.tgtTimer = 4;
    this.urgent = 0.7;
  }

  poke(): void {
    this.idle = 0;
  }

  get headX(): number {
    return this.x;
  }

  private cruise(): number {
    return this.tpl.length * 0.16 * this.pace;
  }

  private pickTarget(): void {
    this.hunting = false;
    const z = this.zone;
    const w = z.x1 - z.x0;
    const h = z.y1 - z.y0;
    // Prefer a point well ahead or well behind, so it crosses the water
    // rather than circling on the spot.
    let tx = z.x0 + this.rand() * w;
    if (Math.abs(tx - this.x) < w * 0.35) tx = this.x < z.x0 + w / 2 ? z.x0 + w * (0.75 + this.rand() * 0.25) : z.x0 + w * this.rand() * 0.25;
    this.tgtX = tx;
    // Vertical change stays modest relative to the horizontal run, so the
    // pitch limit can always reach it.
    const run = Math.abs(tx - this.x);
    const ty = z.y0 + h * (0.15 + this.rand() * 0.7);
    this.tgtY = clamp(ty, this.y - run * 0.45, this.y + run * 0.45);
    this.tgtZ = (this.rand() - 0.5) * this.tpl.length * 0.25;
    this.tgtTimer = 8 + this.rand() * 6;
    this.urgent = 0;
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    const L = this.tpl.length;
    this.idle += dt;
    this.tgtTimer -= dt;
    this.avoidFor = Math.max(0, this.avoidFor - dt);
    const avoiding = this.avoidFor > 0;
    const urgency = avoiding ? 0 : this.urgent;

    // A cruising waypoint can be rounded off; prey and dropped food must
    // be reached within biting distance before selecting another target.
    const arrival = L * (this.hunting ? 0.04 : 0.25);
    const arrived = Math.hypot(this.tgtX - this.x, this.tgtZ - this.z) < arrival
      && Math.abs(this.tgtY - this.y) < (this.hunting ? arrival : L * 0.6);
    if (!this.feeding && (arrived || this.tgtTimer <= 0)) this.pickTarget();
    // Stall guard: if the head has covered less than half a body length in
    // four seconds, it's circling something it can't reach. Pick anew.
    this.stall += dt;
    if (this.stall > 4) {
      if (!this.hunting && Math.hypot(this.x - this.stallX, this.y - this.stallY) < L * 0.5) this.pickTarget();
      this.stall = 0;
      this.stallX = this.x;
      this.stallY = this.y;
    }

    // Keep the whole animal on screen. Look ahead along the heading: if the
    // head will cross the zone edge within a turning distance, turn back
    // now. Waiting until it was already past the edge sent the head off
    // screen before the turn could finish.
    const z = this.zone;
    const look = Math.min(L * 0.45, (z.x1 - z.x0) * 0.3);
    const ax = this.x + Math.cos(this.yaw) * look;
    const ay = this.y + Math.sin(this.pitch) * look;
    if (!this.feeding && (ax < z.x0 || ax > z.x1)) {
      this.tgtX = clamp(ax < z.x0 ? z.x0 + (z.x1 - z.x0) * 0.6 : z.x0 + (z.x1 - z.x0) * 0.4, z.x0, z.x1);
      this.tgtY = clamp(this.tgtY, z.y0, z.y1);
      this.tgtTimer = Math.max(this.tgtTimer, 3);
    }
    if (!this.feeding && (ay < z.y0 || ay > z.y1)) {
      this.tgtY = (z.y0 + z.y1) / 2;
      // Without forward room the pitch limit can't climb back; aim ahead too.
      if (Math.abs(this.tgtX - this.x) < L) this.tgtX = clamp(this.x + Math.cos(this.yaw) * L * 1.5, z.x0, z.x1);
    }

    this.commit = Math.max(0, this.commit - dt);
    // Yaw follows the shortest turn. Forcing a reversal toward the viewer
    // every frame can flip its sign halfway through and trap the animal
    // facing the camera while it swims indefinitely out along z.
    // A target close beside or behind the head sits inside the turning
    // circle: steering at it only orbits it. Swim on and come back around
    // with a fresh heading instead, the way a real orca overshoots and loops.
    const targetDistance = Math.hypot(this.tgtX - this.x, this.tgtZ - this.z);
    const targetAngle = wrap(Math.atan2(this.tgtZ - this.z, this.tgtX - this.x) - this.yaw);
    if (!this.hunting && targetDistance < L * 0.9 && Math.abs(targetAngle) > 1.2 && this.commit <= 0) {
      this.pickTarget();
      this.commit = 2.5;
    }
    // Target selection and boundary avoidance above may have changed the
    // heading. Both yaw and pitch must use that final target this frame.
    const dx = (avoiding ? this.avoidX : this.tgtX) - this.x;
    const dy = (avoiding ? this.avoidY : this.tgtY) - this.y;
    const dz = (avoiding ? this.avoidZ : this.tgtZ) - this.z;
    const flat = Math.hypot(dx, dz);
    let err = wrap(Math.atan2(dz, dx) - this.yaw);
    // A turn rate limited by speed keeps the turning circle at least about
    // half a body length; any tighter and the trailing body coils on itself.
    const maxRate = Math.min(0.9, this.speed / (L * (0.45 - urgency * 0.1)));
    const wantRate = clamp(err * 1.1, -maxRate, maxRate);
    this.yawRate = approach(this.yawRate, wantRate, 2.2, dt);
    this.yaw = wrap(this.yaw + this.yawRate * dt);

    // Pitch: climb or dive gently; level out while turning hard.
    const pitchLimit = this.feeding ? 0.65 : 0.42;
    const wantPitch = clamp(Math.atan2(dy, Math.max(flat, L * (this.feeding ? 0.2 : 0.6))), -pitchLimit, pitchLimit)
      * (this.feeding ? 1 : 1 - Math.min(1, Math.abs(this.yawRate) * 0.9));
    this.pitch = approach(this.pitch, wantPitch, 1.1, dt);

    // Stroke bouts and glides. Thrust tracks stroke amplitude; drag is
    // proportional to speed, so speed settles instead of oscillating evenly.
    this.bout -= dt;
    if (this.bout <= 0) {
      this.stroking = !this.stroking || urgency > 0.3;
      this.bout = (this.stroking ? 3.5 + this.rand() * 3 : 1.6 + this.rand() * 1.8) * this.boutScale;
    }
    const wantAmp = this.stroking ? 0.55 + urgency * 0.45 : 0.07;
    this.amp = approach(this.amp, wantAmp, this.stroking ? 1.6 : 0.9, dt);
    const freq = (0.42 + this.amp * 0.3) * this.tempo;
    this.phase += freq * TAU * dt;
    const pulse = 0.55 + 0.45 * Math.sin(this.phase - 0.6);
    const thrust = this.cruise() * 1.35 * this.amp * pulse * (1 + urgency * 0.9);
    this.speed += (thrust - this.speed * 0.42) * dt;
    if (avoiding && this.speed > this.cruise() * 0.85) this.speed = approach(this.speed, this.cruise() * 0.85, 2, dt);
    this.speed = Math.max(this.speed, this.cruise() * 0.32);
    this.urgent = Math.max(0, this.urgent - dt * 0.12);

    // Idle: after a while with no input, roll over once to show the belly.
    if (this.idle > 14 && this.rollShowT < 0 && Math.abs(this.yawRate) < 0.1) {
      this.rollShowT = 0;
      this.idle = 0;
    }
    if (this.rollShowT >= 0) {
      this.rollShowT += dt;
      const t = this.rollShowT / 5.5;
      this.rollShow = Math.sin(Math.PI * Math.min(1, t)) ** 2 * 1.15;
      if (t >= 1) {
        this.rollShowT = -1;
        this.rollShow = 0;
      }
    }

    // Bank into turns (outside flipper down), plus the slow idle roll.
    const wantRoll = clamp(-this.yawRate * 0.5, -0.35, 0.35) + this.rollShow;
    this.roll = approach(this.roll, wantRoll, 1.8, dt);

    // Advance the head.
    const cp = Math.cos(this.pitch);
    this.x += Math.cos(this.yaw) * cp * this.speed * dt;
    this.z += Math.sin(this.yaw) * cp * this.speed * dt;
    this.y += Math.sin(this.pitch) * this.speed * dt;
    this.push(this.x, this.y, this.z);

    this.solve();
  }

  private push(x: number, y: number, z: number): void {
    // The newest sample floats with the head until it is far enough from the
    // one before it to commit; its arc length is always measured from that
    // committed sample, so slow swimming never desyncs distance and position.
    if (this.filled > 1) {
      const p = (this.head - 1 + this.trailCap) % this.trailCap;
      const q = (this.head - 2 + this.trailCap) % this.trailCap;
      const d = Math.hypot(x - this.hx[q]!, y - this.hy[q]!, z - this.hz[q]!);
      if (d < 2) {
        this.hx[p] = x;
        this.hy[p] = y;
        this.hz[p] = z;
        this.hd[p] = this.hd[q]! + d;
        this.dist = this.hd[p]!;
        return;
      }
    }
    if (this.filled > 0) {
      const p = (this.head - 1 + this.trailCap) % this.trailCap;
      this.dist = this.hd[p]! + Math.hypot(x - this.hx[p]!, y - this.hy[p]!, z - this.hz[p]!);
    }
    this.hx[this.head] = x;
    this.hy[this.head] = y;
    this.hz[this.head] = z;
    this.hd[this.head] = this.dist;
    this.head = (this.head + 1) % this.trailCap;
    this.filled = Math.min(this.filled + 1, this.trailCap);
  }

  /** Lay the stations along the trail, add the stroke wave, build frames. */
  private solve(): void {
    const { pose: p, n, tpl } = this;
    const L = tpl.length;
    const st = tpl.stations;

    // Walk back along the trail by arc length.
    let idx = (this.head - 1 + this.trailCap) % this.trailCap;
    let walked = 0;
    for (let k = 0; k < n; k++) {
      const want = this.dist - st[k]! * L;
      while (walked < this.filled - 2 && this.hd[(idx - 1 + this.trailCap) % this.trailCap]! > want) {
        idx = (idx - 1 + this.trailCap) % this.trailCap;
        walked++;
      }
      const prev = (idx - 1 + this.trailCap) % this.trailCap;
      const d1 = this.hd[idx]!;
      const d0 = this.hd[prev]!;
      const t = d1 > d0 ? clamp((want - d0) / (d1 - d0), 0, 1) : 0;
      p.cx[k] = this.hx[prev]! + (this.hx[idx]! - this.hx[prev]!) * t;
      p.cy[k] = this.hy[prev]! + (this.hy[idx]! - this.hy[prev]!) * t;
      p.cz[k] = this.hz[prev]! + (this.hz[idx]! - this.hz[prev]!) * t;
    }

    this.frames();

    // Stroke wave along each station's up vector: nearly still at the head,
    // largest at the flukes, travelling backward. A small counter-motion at
    // the head keeps it from looking pinned.
    const A = L * 0.05 * this.amp;
    for (let k = 0; k < n; k++) {
      const s = st[k]!;
      const env = smooth(0.32, 1, s) * (0.25 + 0.75 * s) - 0.12 * (1 - smooth(0, 0.25, s));
      const w = A * env * Math.sin(this.phase - s * 4.2);
      p.cx[k] = p.cx[k]! + p.ux[k]! * w;
      p.cy[k] = p.cy[k]! + p.uy[k]! * w;
      p.cz[k] = p.cz[k]! + p.uz[k]! * w;
    }
    this.frames();

    p.fluke = 0.55 * this.amp * Math.cos(this.phase - 4.2 - 0.9);
    p.pec = 0.08 * Math.sin(this.phase + 1.2) * this.amp;
    p.pecSpread = clamp(Math.abs(this.yawRate) * 0.8 + this.urgent * 0.2, 0, 1);
  }

  private frames(): void {
    const { pose: p, n } = this;
    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);
    for (let k = 0; k < n; k++) {
      const a = k === 0 ? 0 : k - 1;
      const b = k === n - 1 ? n - 1 : k + 1;
      let tx = p.cx[a]! - p.cx[b]!;
      let ty = p.cy[a]! - p.cy[b]!;
      let tz = p.cz[a]! - p.cz[b]!;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // Up: world up made perpendicular to the tangent.
      let ux = -ty * tx;
      let uy = 1 - ty * ty;
      let uz = -ty * tz;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;
      // Lateral = tangent x up.
      let lx = ty * uz - tz * uy;
      let ly = tz * ux - tx * uz;
      let lz = tx * uy - ty * ux;
      // Roll about the tangent; the head rolls first, the tail follows.
      const k01 = k / (n - 1);
      const c = 1 + (cr - 1) * (1 - k01 * 0.35);
      const s = sr * (1 - k01 * 0.35);
      const nux = ux * c + lx * s;
      const nuy = uy * c + ly * s;
      const nuz = uz * c + lz * s;
      lx = lx * c - ux * s;
      ly = ly * c - uy * s;
      lz = lz * c - uz * s;
      p.tx[k] = tx; p.ty[k] = ty; p.tz[k] = tz;
      p.ux[k] = nux; p.uy[k] = nuy; p.uz[k] = nuz;
      p.lx[k] = lx; p.ly[k] = ly; p.lz[k] = lz;
    }
  }
}
