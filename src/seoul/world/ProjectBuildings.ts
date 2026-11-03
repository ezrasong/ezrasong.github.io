import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { VoxelKit, shade } from './voxel';
import { makeSign } from './SignTexture';
import type { BuildingSpec, ColliderSpec } from './VoxelBuilding';

/**
 * The project buildings, one architecture per type, all modelled on what
 * stands on that kind of Seoul street:
 *
 *  - creative-studio: Hongdae red-brick 빌라 with a café on the ground floor,
 *    an exterior steel stair, yellow gas pipes and a rooftop 옥탑방
 *  - arcade: Hongdae 오락실 in a dark shophouse with stacked signage and
 *    인형뽑기 claw machines out on the pavement
 *  - glass-store: Gangnam flagship store, a glass box in a white frame
 *  - tech-lab: Teheran-ro mid-rise office, stone podium, ribbon glazing,
 *    rooftop equipment screen
 *  - server-facility: metal-clad data hall with louvres and chillers
 *  - office-tower: curtain-wall tower on a stone podium, helipad on top
 *  - workshop: Euljiro machine shop with roller shutters and a tin roof
 *
 * Local frame: footprint x ∈ [-w/2, w/2], z ∈ [-d/2, d/2], ground at 0,
 * door centred on the +x face. Colliders, door position and sign mount are
 * fixed by the caller, so every type keeps the same interaction contract.
 */

export const FLOOR_H = 2.6;

type Face = '+x' | '-x' | '+z' | '-z';

export interface Body {
  kit: VoxelKit;
  glow: VoxelKit;
  glass: VoxelKit;
  /** Extra textured meshes (secondary signs). */
  extras: THREE.Object3D[];
  /** Name sign: centre height and width, and whether it needs a backing board. */
  signY: number;
  signW: number;
  mount: boolean;
  /** Colliders beyond the main footprint box (stairs, claw machines). */
  colliders: ColliderSpec[];
}

const FRAME = '#2c313a';
const REVEAL = '#1d2127';
const PANE = '#454e5f';

class Ctx {
  readonly kit = new VoxelKit();
  readonly glow = new VoxelKit();
  readonly glass = new VoxelKit();
  readonly extras: THREE.Object3D[] = [];
  readonly colliders: ColliderSpec[] = [];
  readonly h: number;
  constructor(
    readonly w: number,
    readonly d: number,
    readonly floors: number,
    readonly rng: () => number,
    readonly litChance: number,
    readonly litColor: string
  ) {
    this.h = floors * FLOOR_H;
  }

  len(f: Face): number {
    return f === '+x' || f === '-x' ? this.d : this.w;
  }

  /**
   * A box in face space: u runs left to right as seen from outside, v is
   * height, n is distance out from the wall plane.
   */
  fb(k: VoxelKit, f: Face, du: number, dv: number, dn: number, u: number, v: number, n: number, color: string): void {
    const { w, d } = this;
    if (f === '+x') k.box(dn, dv, du, w / 2 + n, v, -u, color);
    else if (f === '-x') k.box(dn, dv, du, -w / 2 - n, v, u, color);
    else if (f === '+z') k.box(du, dv, dn, u, v, d / 2 + n, color);
    else k.box(du, dv, dn, -u, v, -d / 2 - n, color);
  }

  /** Framed window set into the wall: reveal, pane, mullion, sill. */
  window(
    f: Face,
    u: number,
    v: number,
    ww: number,
    wh: number,
    o: { frame?: string; sill?: string; mullion?: boolean; grille?: boolean; lit?: boolean } = {}
  ): void {
    const frame = o.frame ?? FRAME;
    const lit = o.lit ?? (this.rng() < this.litChance && this.rng() < 0.8);
    this.fb(this.kit, f, ww + 0.1, wh + 0.1, 0.05, u, v, 0.02, frame);
    this.fb(this.kit, f, ww - 0.02, wh - 0.02, 0.04, u, v, 0.03, REVEAL);
    this.fb(lit ? this.glow : this.kit, f, ww - 0.1, wh - 0.1, 0.02, u, v, 0.05, lit ? this.litColor : shade(PANE, 0.85 + this.rng() * 0.3));
    if (o.mullion ?? ww > 0.8) this.fb(this.kit, f, 0.05, wh - 0.06, 0.03, u, v, 0.065, frame);
    if (o.sill) this.fb(this.kit, f, ww + 0.24, 0.08, 0.16, u, v - wh / 2 - 0.06, 0.08, o.sill);
    if (o.grille) {
      // 방범창: the steel security bars on low windows
      for (let i = 0; i <= 4; i++) this.fb(this.kit, f, 0.03, wh, 0.03, u - ww / 2 + (i * ww) / 4, v, 0.1, '#3a3d42');
      this.fb(this.kit, f, ww + 0.06, 0.03, 0.03, u, v + wh / 2 - 0.05, 0.1, '#3a3d42');
    }
  }

  /** A row of windows centred on a face, skipping any position `skip` rejects. */
  row(f: Face, v: number, pitch: number, ww: number, wh: number, o: Parameters<Ctx['window']>[5] = {}, skip?: (u: number) => boolean): void {
    const cols = Math.max(1, Math.floor((this.len(f) - 1.0) / pitch));
    const u0 = -((cols - 1) * pitch) / 2;
    for (let c = 0; c < cols; c++) {
      const u = u0 + c * pitch;
      if (skip?.(u)) continue;
      this.window(f, u, v, ww, wh, o);
    }
  }

  /** Hollow parapet ring with a cap and a roof membrane inside it. */
  parapet(y: number, ht: number, color: string, roof: string, inset = 0): void {
    const { kit } = this;
    const w = this.w - inset * 2;
    const d = this.d - inset * 2;
    const t = 0.22;
    kit.box(w - 0.1, 0.08, d - 0.1, 0, y + 0.04, 0, roof);
    for (const s of [-1, 1]) {
      kit.boxOn(w + 0.1, ht, t, 0, y, s * (d / 2 - t / 2 + 0.05), color);
      kit.boxOn(t, ht, d + 0.1, s * (w / 2 - t / 2 + 0.05), y, 0, color);
    }
    // Four real coping strips leave the roof membrane recessed. Painting
    // another box on a solid lid hid the bottoms of rooftop assemblies.
    for (const s of [-1, 1]) {
      kit.box(w + 0.2, 0.06, 0.32, 0, y + ht + 0.03, s * (d / 2 - 0.06), shade(color, 1.12));
      kit.box(0.32, 0.06, d + 0.2, s * (w / 2 - 0.06), y + ht + 0.03, 0, shade(color, 1.12));
    }
  }

  /** Floor slab edges showing as thin bands across every face. */
  slabs(color: string, from = 1, to = this.floors): void {
    for (let f = from; f < to; f++) this.kit.box(this.w + 0.1, 0.14, this.d + 0.1, 0, f * FLOOR_H, 0, color);
  }

  /** The door on +x: opening, frame, leaves, step and a small lamp. */
  door(style: 'glass' | 'wood' | 'steel', accent: string): void {
    const { kit, glow } = this;
    const f: Face = '+x';
    this.fb(kit, f, 1.55, 2.25, 0.05, 0, 1.12, 0.0, '#191c21');
    const frame = style === 'wood' ? '#5a3f2c' : style === 'steel' ? '#5d636a' : '#3a3f46';
    this.fb(kit, f, 0.12, 2.3, 0.12, -0.8, 1.15, 0.04, frame);
    this.fb(kit, f, 0.12, 2.3, 0.12, 0.8, 1.15, 0.04, frame);
    this.fb(kit, f, 1.72, 0.14, 0.12, 0, 2.3, 0.04, frame);
    if (style === 'glass') {
      for (const s of [-1, 1]) {
        this.fb(glow, f, 0.66, 2.0, 0.02, s * 0.36, 1.08, 0.03, '#c9dbe4');
        this.fb(kit, f, 0.04, 0.5, 0.05, s * 0.06, 1.1, 0.06, '#b8bec4');
      }
    } else if (style === 'wood') {
      for (const s of [-1, 1]) {
        this.fb(kit, f, 0.68, 2.08, 0.04, s * 0.36, 1.08, 0.03, '#6b4a33');
        this.fb(glow, f, 0.42, 0.9, 0.02, s * 0.36, 1.45, 0.055, P.windowWarm);
      }
    } else {
      this.fb(kit, f, 1.4, 2.08, 0.04, 0, 1.08, 0.03, '#6f767e');
      for (let i = 1; i < 5; i++) this.fb(kit, f, 1.38, 0.03, 0.02, 0, 0.2 + i * 0.4, 0.055, '#5b6168');
    }
    kit.boxOn(1.1, 0.12, 2.0, this.w / 2 + 0.55, 0, 0, '#a19b90');
    this.fb(glow, f, 0.36, 0.08, 0.14, 0, 2.48, 0.07, accent);
  }

  /** Split-system AC condenser hung under a window, with its cage. */
  condenser(f: Face, u: number, v: number): void {
    this.fb(this.kit, f, 0.7, 0.5, 0.32, u, v, 0.2, '#d7d9d6');
    this.fb(this.kit, f, 0.36, 0.36, 0.02, u - 0.08, v, 0.37, '#5f6468');
    this.fb(this.kit, f, 0.8, 0.04, 0.45, u, v - 0.28, 0.24, '#3a3d42');
  }
}

/* ------------------------------------------------------------------ */

function studio(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, w, d, h, floors } = c;
  const BRICK = '#8d5844';
  const TRIM = '#c4baa9';
  kit.boxOn(w, h, d, 0, 0, 0, BRICK);
  kit.boxOn(w + 0.04, 0.45, d + 0.04, 0, 0, 0, '#8a857c'); // granite base course
  c.slabs(TRIM);
  c.parapet(h, 0.5, BRICK, '#3e7d5a'); // green urethane roof
  const signW = Math.min(d * 0.7, 5.6);

  // Ground floor café front in timber
  const sf = d - 1.4;
  c.fb(kit, '+x', sf, 2.2, 0.04, 0, 1.2, 0.0, REVEAL);
  const bays = 6;
  for (let i = 0; i < bays; i++) {
    const u = -sf / 2 + ((i + 0.5) * sf) / bays;
    if (Math.abs(u) < 1.0) continue;
    c.fb(glow, '+x', sf / bays - 0.12, 1.75, 0.02, u, 1.25, 0.03, P.windowWarm);
  }
  for (let i = 0; i <= bays; i++) c.fb(kit, '+x', 0.1, 2.2, 0.1, -sf / 2 + (i * sf) / bays, 1.2, 0.06, '#5a3f2c');
  c.fb(kit, '+x', sf + 0.2, 0.14, 0.12, 0, 2.33, 0.06, '#5a3f2c');
  c.fb(kit, '+x', sf, 0.3, 0.1, 0, 0.17, 0.05, '#4b3527');
  // Canvas awning in the accent colour, rolled out over the café
  kit.profile([[0, 0], [1.15, -0.42], [1.15, -0.62], [1.08, -0.62], [1.08, -0.47], [0, -0.08]], sf * 0.92, w / 2, 2.72, 0, spec.accent);

  // Upper floors: paired windows (the 빌라 rhythm) on the street face
  for (let f = 1; f < floors; f++) {
    const v = f * FLOOR_H + 1.35;
    // Paired windows sharing one sill, two to a bay
    const bays = Math.max(1, Math.floor((d - 1) / 2.2));
    for (let b = 0; b < bays; b++) {
      const u = -((bays - 1) * 2.2) / 2 + b * 2.2;
      if (f === 1 && Math.abs(u) < signW / 2 + 0.5) continue;
      for (const s of [-0.4, 0.4]) c.window('+x', u + s, v, 0.62, 1.2, { mullion: false });
      c.fb(kit, '+x', 1.75, 0.08, 0.16, u, v - 0.66, 0.08, TRIM);
    }
  }
  // Side street face: windows with grilles low down, condensers, gas pipe
  for (let f = 0; f < floors; f++) {
    const v = f * FLOOR_H + 1.35;
    c.row('+z', v, 2.3, 1.1, 1.15, { sill: TRIM, grille: f === 0 });
    if (f > 0) c.condenser('+z', -w / 2 + 2.2 + f * 1.3, f * FLOOR_H + 0.35);
  }
  // Yellow gas line along the wall with risers to each floor, a Seoul tell
  c.fb(kit, '+z', w - 0.6, 0.07, 0.07, 0, 2.2, 0.12, '#d9b23a');
  c.fb(kit, '+z', 0.07, h - 2, 0.07, w / 2 - 0.5, 1.6 + (h - 2) / 2, 0.12, '#d9b23a');
  for (let f = 0; f < floors; f++) c.fb(kit, '+z', 0.16, 0.09, 0.24, w / 2 - 0.5, 2.2 + f * FLOOR_H, 0.035, '#777d80');
  for (const s of [-1, 0, 1]) c.fb(kit, '+z', 0.12, 0.12, 0.24, s * (w / 2 - 0.7), 2.2, 0.035, '#777d80');
  c.fb(kit, '+z', 0.4, 0.48, 0.26, w / 2 - 0.6, 1.6, 0.035, '#777d80');
  c.fb(kit, '+z', 0.3, 0.4, 0.18, w / 2 - 0.6, 1.6, 0.14, '#9aa0a5'); // meter box
  // Back
  for (let f = 1; f < floors; f++) c.row('-x', f * FLOOR_H + 1.35, 2.4, 0.9, 1.0, { sill: TRIM });

  // Exterior steel stair up the -z wall to the upper-floor doors
  const zS = -d / 2 - 0.55;
  const STEEL = '#4a5058';
  const L = 3.6;
  const flights: [number, number][] = [[w / 2 - 0.8, 0]];
  if (floors >= 3) flights.push([w / 2 - 0.8 - L - 1.2, FLOOR_H]);
  for (const [x0, y0] of flights) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      kit.box(L / n + 0.03, 0.06, 0.95, x0 - (i + 0.5) * (L / n), y0 + ((i + 1) * FLOOR_H) / n - 0.03, zS, '#6a7078');
    }
    for (const s of [-0.5, 0.5]) kit.bar(x0, y0, zS + s, x0 - L, y0 + FLOOR_H, zS + s, 0.08, STEEL);
    kit.bar(x0, y0 + 0.95, zS - 0.5, x0 - L, y0 + FLOOR_H + 0.95, zS - 0.5, 0.05, STEEL);
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      kit.bar(x0 - t * L, y0 + t * FLOOR_H, zS - 0.5, x0 - t * L, y0 + t * FLOOR_H + 0.95, zS - 0.5, 0.04, STEEL);
    }
    // Landing at the top of the flight, on posts, with a door into the wall
    const xl = x0 - L - 0.6;
    const yl = y0 + FLOOR_H;
    kit.box(1.25, 0.1, 1.05, xl, yl - 0.05, zS, '#6a7078');
    kit.boxOn(0.07, yl, 0.07, xl - 0.55, 0, zS - 0.45, STEEL);
    kit.boxOn(0.07, yl, 0.07, xl + 0.55, 0, zS - 0.45, STEEL);
    kit.box(1.25, 0.05, 0.05, xl, yl + 0.95, zS - 0.5, STEEL);
    c.fb(kit, '-z', 0.85, 2.0, 0.05, -xl, yl + 1.0, 0.02, '#5d636a');
    c.fb(glow, '-z', 0.2, 0.1, 0.08, -xl, yl + 2.15, 0.05, P.lampGlow);
  }
  c.colliders.push({ w: w - 0.4, h, d: 1.2, x: 0, y: h / 2, z: -d / 2 - 0.6 });

  // Rooftop: 옥탑방 with its own slab, a fibreglass water tank, laundry line
  const ox = -w / 4;
  const oz = d / 5;
  kit.boxOn(3.4, 2.2, 2.8, ox, h, oz, '#d8d0c0');
  kit.box(3.8, 0.12, 3.2, ox, h + 2.26, oz, '#5b6470');
  c.kit.box(0.8, 1.7, 0.05, ox + 0.6, h + 0.9, oz + 1.42, '#5d636a');
  glow.box(0.9, 0.7, 0.03, ox - 0.7, h + 1.4, oz + 1.42, P.windowWarm);
  kit.cylinder(0.6, 0.6, 1.1, w / 4, h + 0.65, -d / 4, '#3f7fb8', 12);
  kit.cylinder(0.62, 0.55, 0.16, w / 4, h + 1.28, -d / 4, '#356c9c', 12);
  for (const s of [-1, 1]) kit.boxOn(0.05, 1.5, 0.05, w / 4 + s * 1.2, h, d / 4, '#6a7078');
  kit.box(2.4, 0.02, 0.02, w / 4, h + 1.45, d / 4, '#3a3d42');
  for (const [k, col] of [[0, '#e8e2d6'], [1, '#7aa0c4'], [2, '#d98b7a']] as const) {
    kit.box(0.35, 0.45, 0.02, w / 4 - 0.7 + k * 0.6, h + 1.2, d / 4, col);
  }
  return { signW, signY: FLOOR_H + 0.95, mount: true };
}

/* ------------------------------------------------------------------ */

function arcade(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, w, d, h } = c;
  const WALL = '#3d3942';
  kit.boxOn(w, h, d, 0, 0, 0, WALL);
  c.slabs('#2b282f');
  c.parapet(h, 0.6, WALL, '#55595f');
  const signW = Math.min(d * 0.75, 5.8);

  // Ground floor: full glazing lit from inside, neon tube frame round it
  const sf = d - 0.8;
  c.fb(kit, '+x', sf + 0.16, 2.35, 0.06, 0, 1.2, 0.0, '#15161b');
  for (const s of [-1, 1]) c.fb(glow, '+x', sf / 2 - 1.0, 1.95, 0.02, s * (sf / 4 + 0.5), 1.2, 0.04, '#d58cff');
  c.fb(glow, '+x', sf + 0.3, 0.06, 0.06, 0, 2.42, 0.08, spec.accent);
  for (const s of [-1, 1]) c.fb(glow, '+x', 0.06, 2.4, 0.06, s * (sf / 2 + 0.12), 1.2, 0.08, P.neonCyan);
  // 2F: the name sign sits here; LED tube outlines the whole facade
  for (const s of [-1, 1]) c.fb(glow, '+x', 0.06, h - 2.7, 0.06, s * (d / 2 - 0.12), (h + 2.7) / 2, 0.06, P.neonPink);
  c.fb(glow, '+x', d - 0.2, 0.06, 0.06, 0, h - 0.15, 0.06, P.neonYellow);
  // Stacked secondary signs: a vertical 인형뽑기 board on the corner and a
  // small box sign under it, as Korean shopfronts pile them up
  const vert = makeSign({ text: '인형', subtext: 'CLAW', bg: '#1c1530', fg: '#ffd447', border: P.neonPink, width: 0.8, height: 1.6, glow: true });
  vert.position.set(w / 2 + 0.55, FLOOR_H + 1.2, -(d / 2 - 0.45));
  vert.rotation.y = Math.PI / 2;
  c.extras.push(vert);
  kit.box(0.14, 1.7, 0.9, w / 2 + 0.47, FLOOR_H + 1.2, -(d / 2 - 0.45), '#16131c');
  kit.box(0.5, 0.08, 0.08, w / 2 + 0.25, FLOOR_H + 2.0, -(d / 2 - 0.45), '#3a3d42');
  // Claw machines out on the pavement either side of the door
  for (const s of [-1, 1]) {
    const z = s * (d / 2 - 1.05);
    const x = w / 2 + 0.55;
    const col = s < 0 ? '#e0457a' : '#3fb6c9';
    kit.boxOn(0.9, 0.85, 0.9, x, 0, z, col);
    kit.boxOn(0.94, 0.08, 0.94, x, 0.85, z, '#e8e8ea');
    kit.boxOn(0.82, 0.85, 0.82, x, 0.93, z, '#2b2533');
    for (const [px, pz, pc] of [[-0.15, -0.1, '#f4c542'], [0.12, 0.15, '#7fd3ff'], [0.1, -0.2, '#ff8fb1'], [-0.18, 0.2, '#b6f0a0']] as const) {
      kit.blob(0.13, x + px, 1.05, z + pz, pc, 0.9, 1);
    }
    for (const a of [-1, 1]) {
      kit.boxOn(0.04, 0.85, 0.04, x + a * 0.44, 0.93, z + 0.44, '#e8e8ea');
      kit.boxOn(0.04, 0.85, 0.04, x + a * 0.44, 0.93, z - 0.44, '#e8e8ea');
    }
    glow.box(0.7, 0.04, 0.7, x, 1.74, z, '#fff2d6');
    kit.boxOn(0.94, 0.3, 0.94, x, 1.78, z, col);
    glow.box(0.02, 0.18, 0.7, x + 0.48, 1.93, z, P.neonYellow);
    kit.boxOn(0.06, 0.3, 0.06, x + 0.2, 0.85, z + 0.2, '#3a3d42'); // claw rod
    c.colliders.push({ w: 1.0, h: 2.1, d: 1.0, x, y: 1.05, z });
  }
  // Checkered entry tiles
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      kit.box(0.8, 0.04, 0.8, w / 2 + 0.6 + j * 0.8, 0.02, -1.2 + i * 0.8, (i + j) % 2 === 0 ? '#efe7d8' : '#2e2837');
    }
  }
  // Sides: few windows (arcades want dark rooms), blacked out with posters
  c.row('+z', FLOOR_H + 1.3, 2.6, 1.0, 1.0, { lit: false, sill: '#2b282f' });
  c.row('-z', FLOOR_H + 1.3, 3.2, 1.0, 1.0, { lit: false });
  // Rooftop billboard on a steel frame, lit, facing the street
  const bx = -w / 2 + 2;
  for (const s of [-1, 1]) kit.boxOn(0.12, 2.4, 0.12, bx, h, s * 2, '#4a5058');
  kit.bar(bx, h + 0.2, -2, bx, h + 1.6, 2, 0.06, '#4a5058');
  kit.box(0.2, 1.6, 4.6, bx, h + 2.6, 0, '#20232a');
  // Printed vinyl face: lit by day like paint, not glass
  kit.box(0.02, 1.4, 4.4, bx + 0.11, h + 2.6, 0, '#e2588f');
  kit.box(0.025, 0.45, 3.2, bx + 0.12, h + 2.75, 0, '#ffe6f0');
  kit.box(0.025, 0.2, 2.2, bx + 0.12, h + 2.25, 0, '#2a1a3a');
  for (let i = 0; i < 4; i++) {
    const z = -1.6 + i * 1.07;
    kit.bar(bx + 0.08, h + 3.3, z, bx + 0.4, h + 3.45, z, 0.05, '#4a5058');
    glow.box(0.18, 0.06, 0.1, bx + 0.4, h + 3.45, z, P.lampGlow);
  }
  return { signW, signY: FLOOR_H + 1.1, mount: true };
}

/* ------------------------------------------------------------------ */

function glassStore(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, glass, w, d, h } = c;
  const WHITE = '#ebe8e1';
  const GLASS = '#5b7384';
  kit.boxOn(w + 0.2, 0.25, d + 0.2, 0, 0, 0, '#9d998f'); // stone plinth
  glass.boxOn(w - 0.5, h - 0.3, d - 0.5, 0, 0.25, 0, GLASS);
  // White frame: corner piers, a deep roof band, the floor line
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.boxOn(0.55, h + 0.5, 0.55, sx * (w / 2 - 0.27), 0, sz * (d / 2 - 0.27), WHITE);
  kit.boxOn(w + 0.1, 0.9, d + 0.1, 0, h - 0.4, 0, WHITE);
  kit.box(w - 0.3, 0.06, d - 0.3, 0, h + 0.53, 0, '#7d8288');
  kit.box(w, 0.16, d, 0, FLOOR_H, 0, WHITE);
  // Vertical fins every 1.5 m on the three public faces
  for (const f of ['+x', '+z', '-z'] as Face[]) {
    const L = c.len(f) - 1.1;
    const n = Math.round(L / 1.5);
    for (let i = 1; i < n; i++) {
      const u = -L / 2 + (i * L) / n;
      if (f === '+x' && Math.abs(u) < 1.1) continue;
      c.fb(kit, f, 0.08, h - 0.6, 0.3, u, 0.25 + (h - 0.6) / 2, -0.1, WHITE);
    }
  }
  // Lit display bays behind the ground-floor glass
  for (const f of ['+x', '+z', '-z'] as Face[]) {
    const L = c.len(f) - 1.4;
    for (let i = 0; i < 4; i++) {
      const u = -L / 2 + ((i + 0.5) * L) / 4;
      if (f === '+x' && Math.abs(u) < 1.2) continue;
      c.fb(glow, f, L / 4 - 0.3, 1.9, 0.02, u, 1.25, -0.2, '#f4ead8');
    }
  }
  c.door('glass', spec.accent);
  // Cantilevered entrance canopy with a thin steel edge
  kit.box(1.8, 0.14, 3.4, w / 2 + 0.85, 2.48, 0, WHITE);
  kit.box(0.06, 0.18, 3.44, w / 2 + 1.76, 2.48, 0, '#9aa0a6');
  glow.box(1.2, 0.02, 2.6, w / 2 + 0.85, 2.4, 0, P.lampGlow);
  // Planters with clipped box trees either side of the entrance
  for (const s of [-1, 1]) {
    const z = s * (d / 2 - 0.7);
    kit.boxOn(1.0, 0.5, 1.0, w / 2 + 0.7, 0, z, '#8f8b84');
    kit.blob(0.48, w / 2 + 0.7, 0.95, z, '#4f7a42', 1, 1);
    c.colliders.push({ w: 1.0, h: 1.4, d: 1.0, x: w / 2 + 0.7, y: 0.7, z });
  }
  return { signW: Math.min(d * 0.6, 4.6), signY: FLOOR_H + 1.15, mount: true };
}

/* ------------------------------------------------------------------ */

function techLab(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, glass, w, d, h, floors } = c;
  const STONE = '#8f8b85';
  const PANEL = '#c5c2bb';
  const ALU = '#9ba2a9';
  const GLASS = '#4f6676';
  kit.boxOn(w, FLOOR_H, d, 0, 0, 0, STONE);
  kit.boxOn(w - 0.2, h - FLOOR_H, d - 0.2, 0, FLOOR_H, 0, PANEL);
  kit.box(w + 0.1, 0.24, d + 0.1, 0, FLOOR_H, 0, '#7d7a74');
  c.parapet(h, 0.7, PANEL, '#5d6168', 0.1);
  const signW = Math.min(d * 0.7, 5.8);
  // Ribbon glazing on every upper floor, aluminium mullions every 1.2 m
  for (let f = 1; f < floors; f++) {
    const v = f * FLOOR_H + 1.3;
    for (const face of ['+x', '-x', '+z', '-z'] as Face[]) {
      const L = c.len(face) - 1.2;
      if (face === '+x' && f === 1) {
        // Leave the sign's band clear on the first office floor
        for (const s of [-1, 1]) {
          const a = signW / 2 + 0.3;
          const len = L / 2 - a;
          if (len > 0.5) c.fb(glass, face, len, 1.45, 0.04, s * (a + len / 2), v, -0.08, GLASS);
        }
      } else {
        c.fb(glass, face, L, 1.45, 0.04, 0, v, -0.08, GLASS);
      }
      const n = Math.round(L / 1.2);
      for (let i = 0; i <= n; i++) c.fb(kit, face, 0.06, 1.5, 0.08, -L / 2 + (i * L) / n, v, -0.06, ALU);
      // A few office lights on at random
      for (let i = 0; i < n; i++) {
        if (c.rng() > c.litChance * 0.5) continue;
        if (face === '+x' && f === 1) continue;
        c.fb(glow, face, L / n - 0.12, 1.35, 0.01, -L / 2 + ((i + 0.5) * L) / n, v, -0.05, P.windowCool);
      }
    }
  }
  // Glass lobby along the ground floor, stone piers between
  const lob = d - 1.6;
  c.fb(kit, '+x', lob, 2.3, 0.04, 0, 1.2, 0.0, REVEAL);
  for (const s of [-1, 1]) c.fb(glow, '+x', lob / 2 - 1.1, 2.0, 0.02, s * (lob / 4 + 0.55), 1.2, 0.03, '#cfe0ea');
  for (const u of [-lob / 2, -1.0, 1.0, lob / 2]) c.fb(kit, '+x', 0.3, 2.4, 0.12, u, 1.2, 0.04, STONE);
  c.door('glass', spec.accent);
  kit.box(1.7, 0.14, 3.8, w / 2 + 0.85, 2.75, 0, '#3a3f45');
  for (const s of [-1, 1]) kit.bar(w / 2 + 1.6, 2.8, s * 1.7, w / 2, 3.9, s * 1.7, 0.04, '#6a7078');
  // Rooftop equipment hidden behind a louvred screen, plus a mast
  const sx = w * 0.6;
  const sz = d * 0.55;
  for (let i = 0; i <= 16; i++) {
    const t = -sx / 2 + (i * sx) / 16;
    kit.boxOn(0.06, 1.6, 0.18, t, h, sz / 2, ALU);
    kit.boxOn(0.06, 1.6, 0.18, t, h, -sz / 2, ALU);
  }
  for (let i = 0; i <= 10; i++) {
    const t = -sz / 2 + (i * sz) / 10;
    kit.boxOn(0.18, 1.6, 0.06, sx / 2, h, t, ALU);
    kit.boxOn(0.18, 1.6, 0.06, -sx / 2, h, t, ALU);
  }
  kit.boxOn(sx - 0.6, 1.1, sz - 0.6, 0, h, 0, '#8a9096');
  kit.cylinder(0.05, 0.08, 3.4, -w / 2 + 1, h + 1.7, -d / 2 + 1, '#4d565f', 6);
  glow.box(0.16, 0.16, 0.16, -w / 2 + 1, h + 3.45, -d / 2 + 1, '#ff5d5d');
  // Accent line along the street-side parapet only
  c.fb(kit, '+x', d - 0.4, 0.12, 0.28, 0, h + 0.62, -0.02, '#6a7078');
  c.fb(glow, '+x', d - 0.4, 0.06, 0.04, 0, h + 0.62, 0.06, spec.accent);
  return { signW, signY: FLOOR_H + 1.15, mount: true };
}

/* ------------------------------------------------------------------ */

function serverHall(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, w, d, h } = c;
  const CLAD = '#8c9298';
  const RIB = '#7a8086';
  kit.boxOn(w, h, d, 0, 0, 0, CLAD);
  kit.boxOn(w + 0.06, 0.6, d + 0.06, 0, 0, 0, '#6a6f74'); // concrete upstand
  c.parapet(h, 0.4, RIB, '#5a6066');
  // Insulated metal panels: vertical ribs every 0.5 m and two reveals
  for (const f of ['+x', '-x', '+z', '-z'] as Face[]) {
    const L = c.len(f);
    for (let u = -L / 2 + 0.25; u < L / 2; u += 0.5) {
      if (f === '+x' && Math.abs(u) < 1.0) continue;
      c.fb(kit, f, 0.05, h - 0.7, 0.04, u, 0.6 + (h - 0.7) / 2, 0.02, RIB);
    }
    for (const v of [h * 0.42, h * 0.78]) c.fb(kit, f, L, 0.04, 0.05, 0, v, 0.03, '#6c7278');
  }
  // Louvre banks on the side walls
  for (const f of ['+z', '-z'] as Face[]) {
    for (const u of [-w / 4, w / 4]) {
      c.fb(kit, f, 1.8, 1.4, 0.08, u, 2.0, 0.06, '#5a6066');
      for (let i = 0; i < 7; i++) c.fb(kit, f, 1.7, 0.05, 0.12, u, 1.4 + i * 0.2, 0.1, '#7f858b');
    }
  }
  // Slot window band high on the front
  c.fb(c.kit, '+x', d - 2.6, 0.5, 0.04, 0, h - 0.9, 0.04, REVEAL);
  c.fb(c.glow, '+x', d - 2.8, 0.36, 0.02, 0, h - 0.9, 0.06, '#9fd9b0');
  c.door('steel', spec.accent);
  // Status LEDs and a card reader by the door
  for (let i = 0; i < 4; i++) c.fb(glow, '+x', 0.08, 0.08, 0.04, -1.25, 1.2 + i * 0.16, 0.06, i % 2 ? P.neonGreen : '#3f8f46');
  c.fb(kit, '+x', 0.18, 0.26, 0.06, 1.15, 1.25, 0.04, '#25282d');
  // Roll-shutter loading bay on the side
  c.fb(kit, '+z', 2.6, 2.6, 0.08, -w / 4, 1.3, 0.05, '#9aa0a6');
  for (let i = 0; i < 12; i++) c.fb(kit, '+z', 2.5, 0.03, 0.03, -w / 4, 0.12 + i * 0.21, 0.1, '#80868c');
  c.fb(kit, '+z', 2.9, 0.3, 0.32, -w / 4, 2.75, 0.16, '#6a7078');
  // Roof: chillers with fan discs, cable tray, exhaust stacks
  for (const zz of [-d / 4, d / 4]) {
    kit.boxOn(2.4, 1.0, 1.4, -w / 6, h, zz, '#b9bec3');
    for (const fx of [-0.6, 0.6]) {
      kit.cylinder(0.42, 0.42, 0.08, -w / 6 + fx, h + 1.05, zz, '#4a4f55', 12);
      kit.cylinder(0.06, 0.06, 0.1, -w / 6 + fx, h + 1.08, zz, '#2d3035', 6);
    }
  }
  kit.box(0.4, 0.12, d - 1.2, w / 2 - 0.8, h + 0.7, 0, '#6a7078');
  for (const zz of [-(d / 2 - 0.8), d / 2 - 0.8]) kit.boxOn(0.1, 0.64, 0.1, w / 2 - 0.8, h, zz, '#6a7078');
  for (const zz of [-1.5, 1.5]) kit.cylinder(0.18, 0.18, 1.6, w / 4, h + 0.8, zz, '#9aa0a6', 8);
  return { signW: Math.min(d * 0.7, 5.2), signY: FLOOR_H + 0.75, mount: true };
}

/* ------------------------------------------------------------------ */

function officeTower(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, glass, w, d, h, floors } = c;
  const STONE = '#9a958c';
  const FIN = '#aab1b8';
  const GLASS = '#4a6272';
  const podiumTop = FLOOR_H + 1.2;
  kit.boxOn(w, podiumTop, d, 0, 0, 0, STONE);
  kit.box(w + 0.12, 0.2, d + 0.12, 0, podiumTop, 0, '#85807a');
  // Tower: curtain-wall glass with aluminium fins and a transom per floor
  const tw = w - 0.8;
  const td = d - 0.8;
  const th = h - podiumTop - 0.6;
  glass.boxOn(tw, th, td, 0, podiumTop, 0, GLASS);
  for (const [len, isX] of [[tw, true], [td, false]] as const) {
    const n = Math.round(len / 1.1);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n;
      for (const s of [-1, 1]) {
        if (isX) kit.boxOn(0.07, th, 0.2, t, podiumTop, s * (td / 2 + 0.1), FIN);
        else kit.boxOn(0.2, th, 0.07, s * (tw / 2 + 0.1), podiumTop, t, FIN);
      }
    }
  }
  for (let f = 1; f < floors - 1; f++) {
    const y = podiumTop + (f * th) / (floors - 1);
    kit.box(tw + 0.12, 0.08, td + 0.12, 0, y, 0, FIN);
    // Office floors with lights on, behind the glass
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        if (c.rng() > c.litChance * 0.5) continue;
        glow.box(tw / 4 - 0.3, th / (floors - 1) - 0.4, 0.01, -tw / 2 + ((i + 0.5) * tw) / 4, y + th / (floors - 1) / 2, s * (td / 2 + 0.02), P.windowCool);
      }
    }
  }
  // Crown: lit band and a mechanical penthouse, helipad on top
  const top = podiumTop + th;
  kit.boxOn(tw + 0.2, 0.6, td + 0.2, 0, top, 0, '#7f868d');
  glow.box(tw + 0.24, 0.1, td + 0.24, 0, top + 0.45, 0, '#d9eaf2');
  kit.cylinder(3.0, 3.0, 0.05, 0, top + 0.63, 0, '#4f6a58', 24);
  kit.cylinder(2.75, 2.75, 0.055, 0, top + 0.64, 0, '#e6e2d6', 24);
  kit.cylinder(2.55, 2.55, 0.06, 0, top + 0.645, 0, '#4f6a58', 24);
  kit.box(0.25, 0.02, 1.8, -0.6, top + 0.68, 0, '#e6e2d6');
  kit.box(0.25, 0.02, 1.8, 0.6, top + 0.68, 0, '#e6e2d6');
  kit.box(1.0, 0.02, 0.25, 0, top + 0.68, 0, '#e6e2d6');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (tw / 2 - 0.2), z = sz * (td / 2 - 0.2);
    kit.boxOn(0.08, 0.14, 0.08, x, top + 0.58, z, '#59616a');
    glow.box(0.14, 0.14, 0.14, x, top + 0.75, z, '#ff5d5d');
  }
  // Podium: tall glass lobby between stone piers on the street face
  const lob = d - 1.4;
  c.fb(kit, '+x', lob, 2.4, 0.04, 0, 1.25, 0.0, REVEAL);
  for (const s of [-1, 1]) c.fb(glow, '+x', lob / 2 - 1.2, 2.1, 0.02, s * (lob / 4 + 0.6), 1.25, 0.03, '#d4e3ec');
  for (const u of [-lob / 2, -1.05, 1.05, lob / 2]) c.fb(kit, '+x', 0.4, 2.5, 0.16, u, 1.25, 0.05, STONE);
  for (const f of ['+z', '-z', '-x'] as Face[]) c.row(f, 1.4, 2.2, 1.4, 1.6, { frame: '#5d6168', mullion: true });
  c.door('glass', spec.accent);
  // Deep entrance canopy, the Gangnam tower signature
  kit.box(2.6, 0.16, 5.0, w / 2 + 1.25, 2.5, 0, '#d9d6cf');
  kit.box(0.08, 0.22, 5.04, w / 2 + 2.55, 2.5, 0, '#8d939a');
  glow.box(2.0, 0.02, 4.2, w / 2 + 1.25, 2.41, 0, P.lampGlow);
  for (const s2 of [-1, 1]) kit.bar(w / 2 + 2.4, 2.55, s2 * 2.3, w / 2, 3.6, s2 * 2.3, 0.05, '#8d939a');
  return { signW: Math.min(d * 0.6, 5.6), signY: 3.2, mount: true };
}

/* ------------------------------------------------------------------ */

function workshop(c: Ctx, spec: BuildingSpec): Partial<Body> {
  const { kit, glow, w, d, h } = c;
  const BLOCK = '#9b958a';
  const PLASTER = '#c9bca4';
  kit.boxOn(w, FLOOR_H, d, 0, 0, 0, BLOCK);
  kit.boxOn(w, h - FLOOR_H, d, 0, FLOOR_H, 0, PLASTER);
  kit.box(w + 0.1, 0.16, d + 0.1, 0, FLOOR_H, 0, '#7f7a72');
  // Low-pitched corrugated metal roof, ridge along x
  kit.prism(d + 0.9, 1.1, w + 0.8, 0, h, 0, '#4f7593', Math.PI / 2);
  for (let i = 0; i <= Math.round(w / 0.5); i++) {
    const x = -w / 2 - 0.4 + (i * (w + 0.8)) / Math.round(w / 0.5);
    for (const s of [-1, 1]) kit.bar(x, h + 0.02, s * (d / 2 + 0.45), x, h + 1.12, 0, 0.05, '#41637d');
  }
  kit.box(w + 0.9, 0.12, 0.2, 0, h + 1.12, 0, '#3b5a72');
  // Two roller-shutter bays, one half open onto the dark shop floor
  for (const s of [-1, 1]) {
    const u = s * (d / 2 - 1.6);
    c.fb(kit, '+x', 2.3, 2.3, 0.04, u, 1.15, 0.0, '#15171b');
    const open = s > 0 ? 1.05 : 0;
    const sh = 2.3 - open;
    c.fb(kit, '+x', 2.2, sh, 0.05, u, open + sh / 2, 0.03, '#a3a8ad');
    for (let i = 0; i < Math.floor(sh / 0.18); i++) c.fb(kit, '+x', 2.18, 0.025, 0.02, u, open + 0.1 + i * 0.18, 0.06, '#868c92');
    c.fb(kit, '+x', 2.5, 0.32, 0.3, u, 2.42, 0.12, '#7c8288');
    if (open > 0) {
      c.fb(glow, '+x', 1.9, 0.7, 0.02, u, 0.5, 0.02, P.windowWarm);
      kit.boxOn(1.6, 0.85, 0.6, w / 2 - 0.4, 0, -u, '#5c5148'); // workbench inside the bay
    }
  }
  c.door('steel', spec.accent);
  // Corrugated tin awning over the whole front
  kit.profile([[0, 0], [1.2, -0.3], [1.2, -0.38], [0, -0.08]], d - 0.2, w / 2, 2.82, 0, '#8a949b');
  for (const s of [-1, 1]) kit.bar(w / 2 + 1.15, 2.45, s * (d / 2 - 0.3), w / 2, 2.0, s * (d / 2 - 0.3), 0.04, '#5d636a');
  // Upper floor: small windows with grilles, an exterior drain, a condenser
  c.row('+x', FLOOR_H + 1.25, 2.2, 0.9, 0.9, { grille: true, sill: '#8f8475' }, (u) => Math.abs(u) < 2.9);
  c.row('+z', FLOOR_H + 1.25, 2.2, 0.9, 0.9, { grille: true });
  c.row('-z', FLOOR_H + 1.25, 2.6, 0.9, 0.9, { grille: true });
  c.condenser('+z', 1.2, FLOOR_H + 0.35);
  // Stock out on the side: a rack of steel pipe and LPG cylinders
  const rz = d / 2 + 0.5;
  for (const x of [-2.4, -0.4]) kit.boxOn(0.08, 1.2, 0.5, x, 0, rz, '#4a4f55');
  for (let i = 0; i < 9; i++) kit.cylinderX(0.06, 2.6, -1.4, 0.55 + Math.floor(i / 3) * 0.17, rz - 0.15 + (i % 3) * 0.15, '#9aa1a8', 6);
  for (const x of [1.2, 1.6]) {
    kit.cylinder(0.17, 0.17, 0.9, x, 0.45, rz, '#c9ccc9', 10);
    kit.cylinder(0.08, 0.1, 0.12, x, 0.96, rz, '#4a4f55', 8);
  }
  c.colliders.push({ w: 4.4, h: 1.4, d: 0.8, x: -0.6, y: 0.7, z: rz });
  return { signW: Math.min(d * 0.65, 4.8), signY: FLOOR_H + 0.95, mount: true };
}

/* ------------------------------------------------------------------ */

export function buildBody(spec: BuildingSpec, rng: () => number): Body {
  const lit: Record<string, [number, string]> = {
    'creative-studio': [0.6, P.windowWarm],
    arcade: [0.3, '#d58cff'],
    'glass-store': [0.7, P.windowWarm],
    'tech-lab': [0.7, P.windowCool],
    'server-facility': [0.2, '#9fd9b0'],
    'office-tower': [0.7, P.windowCool],
    workshop: [0.5, P.windowWarm],
  };
  const [chance, color] = lit[spec.type] ?? [0.6, P.windowWarm];
  const c = new Ctx(spec.width, spec.depth, spec.floors, rng, chance, color);
  let r: Partial<Body>;
  switch (spec.type) {
    case 'arcade':
      r = arcade(c, spec);
      c.door('glass', spec.accent);
      break;
    case 'glass-store':
      r = glassStore(c, spec);
      break;
    case 'tech-lab':
      r = techLab(c, spec);
      break;
    case 'server-facility':
      r = serverHall(c, spec);
      break;
    case 'office-tower':
      r = officeTower(c, spec);
      break;
    case 'workshop':
      r = workshop(c, spec);
      break;
    default:
      r = studio(c, spec);
      c.door('wood', spec.accent);
  }
  return {
    kit: c.kit,
    glow: c.glow,
    glass: c.glass,
    extras: c.extras,
    colliders: c.colliders,
    signY: r.signY ?? FLOOR_H + 0.9,
    signW: r.signW ?? Math.min(spec.depth * 0.8, 6),
    mount: r.mount ?? true,
  };
}
