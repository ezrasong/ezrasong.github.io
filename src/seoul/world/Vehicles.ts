import * as THREE from 'three';
import { MATERIALS, VoxelKit } from './voxel';
import type { PropResult } from './Props';

/**
 * Seoul street traffic, parked. Every vehicle is modelled once in local
 * space (front = +x, ground at y = 0) from side-profile extrusions, then
 * stamped into one lit mesh and one glow mesh for the whole city.
 *
 * Kinds follow what a Seoul street actually holds: mostly white, grey and
 * black sedans and SUVs, orange taxis, the blue trunk bus, and the blue
 * one-tonne Porter truck.
 */
export type VehicleKind = 'sedan' | 'suv' | 'taxi' | 'bus' | 'truck' | 'compact';

export interface VehicleSpec {
  x: number;
  z: number;
  ry: number;
  kind: VehicleKind;
  color?: string;
}

const GLASS = '#26303b';
const TRIM = '#24272c';
const TYRE = '#1b1d21';
const RIM = '#9aa0a6';
const HEAD = '#f3ecd8';
const TAIL = '#c8392f';

/** Footprint per kind: [length, width] for colliders. */
const SIZE: Record<VehicleKind, [number, number]> = {
  sedan: [3.3, 1.45],
  suv: [3.3, 1.5],
  taxi: [3.3, 1.45],
  compact: [2.6, 1.35],
  bus: [8.6, 2.0],
  truck: [3.6, 1.45],
};

function wheels(k: VoxelKit, xs: number[], halfW: number, r: number): void {
  for (const x of xs) {
    for (const s of [-1, 1]) {
      const tyre = new THREE.CylinderGeometry(r, r, 0.24, 12);
      tyre.rotateX(Math.PI / 2);
      tyre.translate(x, r, s * (halfW - 0.1));
      k.add(tyre, TYRE);
      const hub = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.05, 10);
      hub.rotateX(Math.PI / 2);
      hub.translate(x, r, s * (halfW + 0.03));
      k.add(hub, RIM);
    }
  }
}

/** Passenger car: lower body, glass greenhouse, roof skin, pillars. */
function car(k: VoxelKit, g: VoxelKit, body: string, opts: { suv?: boolean; taxi?: boolean }): void {
  const W = opts.suv ? 1.5 : 1.45;
  const H0 = 0.28; // sill height
  const belt = opts.suv ? 0.98 : 0.84;
  const roof = opts.suv ? 1.5 : 1.3;
  const L = 1.65;
  // Lower body: bumper, hood slope, deck.
  const lower: [number, number][] = opts.suv
    ? [[-L, H0], [L, H0], [L + 0.04, 0.62], [L - 0.12, belt - 0.04], [0.75, belt], [-L + 0.05, belt], [-L - 0.03, 0.62]]
    : [[-L, H0], [L, H0], [L + 0.04, 0.58], [L - 0.15, 0.76], [0.65, belt], [-1.15, belt], [-L + 0.02, 0.8], [-L - 0.03, 0.56]];
  k.profile(lower, W, 0, 0, 0, body, 0.06);
  // Greenhouse: windshield rake to roof to rear glass.
  const cabin: [number, number][] = opts.suv
    ? [[0.78, belt - 0.02], [0.2, roof], [-1.45, roof], [-L + 0.06, belt - 0.02]]
    : [[0.66, belt - 0.02], [0.02, roof], [-0.82, roof], [-1.22, belt - 0.02]];
  k.profile(cabin, W - 0.16, 0, 0, 0, GLASS, 0.03);
  // Roof skin + A/B/C pillars in body colour so the glass reads as windows.
  const rx0 = opts.suv ? -1.45 : -0.82;
  const rx1 = opts.suv ? 0.2 : 0.02;
  k.box(rx1 - rx0 + 0.08, 0.06, W - 0.12, (rx0 + rx1) / 2, roof + 0.01, 0, body);
  const bx = opts.suv ? -0.45 : -0.32;
  for (const s of [-1, 1]) k.box(0.1, roof - belt, 0.04, bx, (roof + belt) / 2, s * (W / 2 - 0.07), body);
  // Black sill and bumpers, side mirrors.
  k.box(2.3, 0.1, W + 0.02, -0.1, H0 + 0.02, 0, TRIM);
  k.box(0.1, 0.16, W - 0.1, L + 0.04, H0 + 0.08, 0, TRIM);
  k.box(0.1, 0.16, W - 0.1, -L - 0.03, H0 + 0.08, 0, TRIM);
  for (const s of [-1, 1]) k.box(0.14, 0.09, 0.12, opts.suv ? 0.7 : 0.6, belt + 0.06, s * (W / 2 + 0.04), TRIM);
  // Lights: slim headlights, full-width tail bar (current Korean styling).
  for (const s of [-1, 1]) g.box(0.05, 0.08, 0.34, L + 0.02, 0.62, s * 0.48, HEAD);
  g.box(0.04, 0.06, W - 0.2, -L - 0.03, opts.suv ? 0.78 : 0.7, 0, TAIL);
  // Plate
  k.box(0.03, 0.1, 0.36, L + 0.07, 0.42, 0, '#e8e6df');
  k.box(0.03, 0.1, 0.36, -L - 0.07, 0.5, 0, '#e8e6df');
  if (opts.taxi) {
    // Roof lamp ("서울 택시" cap) and the dark rocker stripe.
    k.box(0.36, 0.2, 0.5, -0.4, roof + 0.14, 0, '#f2efe6');
    g.box(0.3, 0.12, 0.52, -0.4, roof + 0.15, 0, '#ffd56a');
    k.box(2.6, 0.06, W + 0.02, 0, 0.52, 0, '#3b3a38');
  }
  wheels(k, [1.05, -1.08], W / 2 + 0.04, 0.3);
}

/** Kia Ray-style boxy city car, a staple of Seoul alleys. */
function compact(k: VoxelKit, g: VoxelKit, body: string): void {
  const W = 1.35;
  const L = 1.3;
  k.profile([[-L, 0.26], [L, 0.26], [L + 0.03, 0.6], [L - 0.2, 0.8], [-L, 0.82]], W, 0, 0, 0, body, 0.06);
  k.profile([[L - 0.22, 0.79], [L - 0.55, 1.52], [-L + 0.02, 1.52], [-L + 0.02, 0.8]], W - 0.14, 0, 0, 0, GLASS, 0.03);
  k.box(1.9, 0.07, W - 0.1, -0.2, 1.53, 0, body);
  for (const s of [-1, 1]) {
    k.box(0.12, 0.72, 0.04, -0.1, 1.16, s * (W / 2 - 0.06), body);
    k.box(0.12, 0.72, 0.04, -L + 0.08, 1.16, s * (W / 2 - 0.06), body);
  }
  k.box(0.1, 0.16, W - 0.1, L + 0.03, 0.34, 0, TRIM);
  k.box(0.1, 0.16, W - 0.1, -L - 0.02, 0.34, 0, TRIM);
  for (const s of [-1, 1]) g.box(0.05, 0.12, 0.26, L + 0.02, 0.62, s * 0.44, HEAD);
  for (const s of [-1, 1]) g.box(0.04, 0.3, 0.12, -L - 0.03, 0.9, s * 0.56, TAIL);
  wheels(k, [0.82, -0.85], W / 2 + 0.04, 0.27);
}

/** Seoul blue trunk bus (간선버스) with route display and doors. */
function bus(k: VoxelKit, g: VoxelKit): void {
  const L = 4.3;
  const W = 2.0;
  const BLUE = '#2f62b8';
  k.profile([[-L, 0.32], [L, 0.32], [L + 0.05, 2.75], [L - 0.15, 2.95], [-L + 0.1, 2.95], [-L, 2.8]], W, 0, 0, 0, BLUE, 0.08);
  // Window band down both sides and the big windscreen
  for (const s of [-1, 1]) {
    k.box(L * 2 - 1.2, 1.05, 0.04, -0.3, 2.05, s * (W / 2 + 0.005), GLASS);
    for (let i = 0; i < 6; i++) k.box(0.1, 1.05, 0.05, -L + 1.2 + i * 1.3, 2.05, s * (W / 2 + 0.01), BLUE);
  }
  k.box(0.04, 1.5, W - 0.2, L + 0.06, 1.85, 0, GLASS);
  // Lower white skirt (Seoul buses carry a pale band low on the body)
  k.box(L * 2, 0.34, W + 0.02, 0, 0.62, 0, '#dfe3e8');
  // Doors on the kerb side (+z is kerb when parked facing +x in RHT)
  for (const dx of [L - 0.9, -0.6]) k.box(0.9, 2.1, 0.04, dx, 1.4, W / 2 + 0.02, '#1f2a36');
  // Route number and destination display
  g.box(0.04, 0.3, 1.5, L + 0.08, 2.72, 0, '#ffb43c');
  g.box(1.2, 0.22, 0.04, L - 1.4, 2.72, W / 2 + 0.02, '#ffb43c');
  for (const s of [-1, 1]) g.box(0.05, 0.14, 0.3, L + 0.07, 0.75, s * 0.7, HEAD);
  for (const s of [-1, 1]) g.box(0.04, 0.4, 0.18, -L - 0.02, 0.95, s * 0.8, TAIL);
  // Roof AC pod
  k.box(2.2, 0.26, 1.4, -0.8, 3.08, 0, '#c9ced4');
  wheels(k, [L - 1.25, -L + 1.6], W / 2 + 0.02, 0.42);
}

/** Hyundai Porter-style one-tonne truck: cab-over, flatbed with drop sides. */
function truck(k: VoxelKit, g: VoxelKit): void {
  const W = 1.45;
  const CAB = '#3a6db0';
  k.profile([[0.8, 0.3], [1.82, 0.3], [1.86, 0.95], [1.62, 1.72], [0.8, 1.74]], W, 0, 0, 0, CAB, 0.06);
  k.profile([[1.64, 1.0], [1.8, 1.0], [1.62, 1.6], [1.5, 1.6]], W - 0.14, 0, 0, 0, GLASS, 0.02);
  for (const s of [-1, 1]) k.box(0.55, 0.45, 0.04, 1.25, 1.3, s * (W / 2 + 0.005), GLASS);
  k.box(0.1, 0.18, W, 1.86, 0.4, 0, '#d7dade');
  for (const s of [-1, 1]) g.box(0.05, 0.12, 0.3, 1.85, 0.72, s * 0.5, HEAD);
  // Bed: chassis, deck, low aluminium drop sides
  k.box(2.7, 0.18, 0.9, -0.55, 0.42, 0, TRIM);
  k.box(2.65, 0.08, W, -0.55, 0.62, 0, '#8d939a');
  for (const s of [-1, 1]) k.box(2.65, 0.34, 0.05, -0.55, 0.83, s * (W / 2), '#b9bec4');
  k.box(0.05, 0.34, W, -1.86, 0.83, 0, '#b9bec4');
  k.box(0.05, 0.6, W, 0.78, 0.95, 0, '#b9bec4');
  for (const s of [-1, 1]) g.box(0.04, 0.12, 0.2, -1.89, 0.55, s * 0.55, TAIL);
  // A couple of strapped crates in the bed
  k.box(0.8, 0.5, 0.9, -0.3, 0.91, 0.1, '#a78d6b');
  k.box(0.6, 0.4, 0.6, -1.2, 0.86, -0.2, '#c2b49a');
  wheels(k, [1.3, -1.25], W / 2 + 0.04, 0.27);
}

function build(kind: VehicleKind, color: string): [VoxelKit, VoxelKit] {
  const k = new VoxelKit();
  const g = new VoxelKit();
  if (kind === 'bus') bus(k, g);
  else if (kind === 'truck') truck(k, g);
  else if (kind === 'compact') compact(k, g, color);
  else car(k, g, color, { suv: kind === 'suv', taxi: kind === 'taxi' });
  return [k, g];
}

/** Body colours by share of the real Seoul fleet: white, grey, black. */
const CAR_COLORS = ['#ecebe6', '#ecebe6', '#e4e3df', '#a7abb0', '#7e8389', '#2b2d31', '#2b2d31', '#384457', '#8a7f72'];
const TAXI = '#e07b39';

export function createVehicles(specs: VehicleSpec[]): PropResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const m = new THREE.Matrix4();
  specs.forEach((s, i) => {
    const color = s.color ?? (s.kind === 'taxi' ? TAXI : CAR_COLORS[(i * 5) % CAR_COLORS.length]);
    const [k, g] = build(s.kind, color);
    m.makeRotationY(s.ry).setPosition(s.x, 0, s.z);
    kit.absorb(k, m);
    glow.absorb(g, m);
  });
  const group = new THREE.Group();
  group.add(kit.toMesh(MATERIALS.litMetal));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  return {
    object: group,
    colliders: specs.map((s) => {
      const [l, w] = SIZE[s.kind];
      const across = Math.abs(Math.sin(s.ry)) > 0.7;
      return {
        x: s.x,
        z: s.z,
        spec: { w: across ? w : l, h: s.kind === 'bus' ? 3.2 : 1.6, d: across ? l : w, x: 0, y: s.kind === 'bus' ? 1.6 : 0.8, z: 0 },
      };
    }),
  };
}
