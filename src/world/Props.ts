import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { MATERIALS, VoxelKit } from './voxel';
import { addWindSway, celMaterial } from './CelShading';
import type { ColliderSpec } from './VoxelBuilding';

const dummy = new THREE.Object3D();

export interface PropResult {
  object: THREE.Object3D;
  colliders: { x: number; z: number; spec: ColliderSpec }[];
}

/**
 * Stylized low-poly trees in three instanced families, each a tapered
 * trunk plus a canopy of clustered, two-tone icosphere blobs whose upper
 * halves sway in the wind:
 *
 *  - street: round layered canopy (default city tree)
 *  - riverside: taller, slimmer silhouette for the waterfront
 *  - blossom: pink flowering tree, scattered sparingly
 *
 * Family is chosen per position (explicit `kind`, else derived: riverside
 * near the water, a deterministic sprinkle of blossoms elsewhere).
 */
export function createTrees(
  positions: { x: number; z: number; s?: number; kind?: 'street' | 'riverside' | 'blossom' }[]
): PropResult {
  const group = new THREE.Group();

  const families = {
    street: {
      trunk: (k: VoxelKit) => {
        k.cylinder(0.1, 0.19, 1.5, 0, 0.75, 0, P.treeTrunk, 7);
        k.bar(0, 1.1, 0, 0.5, 1.8, 0.25, 0.09, P.treeTrunk);
        k.bar(0, 1.3, 0, -0.45, 1.9, -0.2, 0.08, P.treeTrunk);
      },
      canopy: (k: VoxelKit) => {
        k.blob(0.95, 0, 2.0, 0, P.leaf, 0.85);
        k.blob(0.62, 0.6, 1.7, 0.25, P.leafDark, 0.85);
        k.blob(0.6, -0.55, 1.75, -0.2, P.leafDark, 0.8);
        k.blob(0.58, 0.08, 2.62, -0.05, '#6fae62', 0.85);
      },
    },
    riverside: {
      trunk: (k: VoxelKit) => {
        k.cylinder(0.09, 0.17, 2.3, 0, 1.15, 0, '#7a5a3e', 7);
        k.bar(0, 1.7, 0, 0.4, 2.4, 0.2, 0.08, '#7a5a3e');
      },
      canopy: (k: VoxelKit) => {
        k.blob(0.72, 0, 2.7, 0, P.leafDark, 1.1);
        k.blob(0.55, 0.35, 3.35, 0.12, P.leaf, 1.0);
        k.blob(0.42, -0.3, 2.3, -0.15, P.leaf, 0.9);
      },
    },
    blossom: {
      trunk: (k: VoxelKit) => {
        k.cylinder(0.09, 0.16, 1.3, 0, 0.65, 0, '#6b4a3a', 7);
        k.bar(0, 0.9, 0, 0.45, 1.6, 0.2, 0.08, '#6b4a3a');
        k.bar(0, 1.0, 0, -0.4, 1.7, -0.22, 0.07, '#6b4a3a');
      },
      canopy: (k: VoxelKit) => {
        k.blob(0.85, 0, 1.85, 0, '#e8a7c3', 0.8);
        k.blob(0.55, 0.55, 1.6, 0.22, '#d98bb0', 0.8);
        k.blob(0.52, -0.5, 1.7, -0.18, '#efc0d6', 0.75);
        k.blob(0.5, 0.05, 2.4, -0.05, '#e8a7c3', 0.8);
      },
    },
  } as const;

  // Family assignment: explicit kind wins; otherwise riverside near the
  // water bands, with a deterministic ~14% blossom sprinkle elsewhere.
  const assigned = positions.map((p, i) => {
    if (p.kind) return p.kind;
    if ((p.z > 11 && p.z < 20) || (p.z > 48 && p.z < 54)) return i % 3 === 0 ? 'street' : 'riverside';
    return (i * 53) % 100 > 86 ? 'blossom' : 'street';
  });

  const color = new THREE.Color();
  for (const fam of ['street', 'riverside', 'blossom'] as const) {
    const list = positions.filter((_, i) => assigned[i] === fam);
    if (list.length === 0) continue;
    const def = families[fam];
    const tk = new VoxelKit();
    def.trunk(tk);
    const ck = new VoxelKit();
    def.canopy(ck);
    const trunkGeo = tk.merge();
    const canopyGeo = ck.merge();

    const trunk = new THREE.InstancedMesh(trunkGeo, MATERIALS.lit, list.length);
    const canopyMat = celMaterial({ profile: 'foliage', vertexColors: true });
    addWindSway(canopyMat, 0.06, 1.7, 1.2, 2.8);
    const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, list.length);

    list.forEach((p, i) => {
      const idx = positions.indexOf(p);
      const s = p.s ?? 0.85 + ((idx * 37) % 10) / 22;
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.y = (idx * 2.39996) % Math.PI;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      canopy.setMatrixAt(i, dummy.matrix);
      // Per-tree tint over the vertex-colored two-tone canopy.
      const t = (idx * 53) % 100;
      if (fam === 'blossom') color.setScalar(0.92 + (t / 100) * 0.16);
      else color.set(t > 82 ? '#c4a45a' : '#ffffff').lerp(new THREE.Color('#ffffff'), t > 82 ? 0.35 : 0).multiplyScalar(0.88 + (t / 100) * 0.24);
      canopy.setColorAt(i, color);
    });
    trunk.castShadow = true;
    canopy.castShadow = true;
    canopy.receiveShadow = false;
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    group.add(trunk, canopy);
  }

  return {
    object: group,
    colliders: positions.map((p) => ({
      x: p.x,
      z: p.z,
      spec: { w: 0.5, h: 2.4, d: 0.5, x: 0, y: 1.2, z: 0 },
    })),
  };
}

/** Instanced streetlights with warm glow heads. */
export function createStreetlights(positions: { x: number; z: number; ry?: number }[]): PropResult {
  const group = new THREE.Group();

  // Pole/arm stay legible at night (the old near-black vanished against the
  // sky, leaving the glowing head floating in mid-air), and the arm fully
  // overlaps the head so the fixture reads as one connected object.
  const poleGeo = new THREE.BoxGeometry(0.16, 3.6, 0.16);
  poleGeo.translate(0, 1.8, 0);
  const armGeo = new THREE.BoxGeometry(1.0, 0.12, 0.12);
  armGeo.translate(0.5, 3.5, 0);
  const pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#4d5560' }), positions.length);
  const arm = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: '#4d5560' }), positions.length);
  const headGeo = new THREE.BoxGeometry(0.36, 0.16, 0.24);
  headGeo.translate(0.8, 3.42, 0);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: P.lampGlow }), positions.length);

  positions.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.y = p.ry ?? 0;
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pole.setMatrixAt(i, dummy.matrix);
    arm.setMatrixAt(i, dummy.matrix);
    head.setMatrixAt(i, dummy.matrix);
  });
  pole.castShadow = true;
  group.add(pole, arm, head);

  return {
    object: group,
    colliders: positions.map((p) => ({
      x: p.x,
      z: p.z,
      spec: { w: 0.3, h: 3.6, d: 0.3, x: 0, y: 1.8, z: 0 },
    })),
  };
}

/** Parked voxel cars — a handful, each a few boxes, merged together. */
export function createCars(
  cars: { x: number; z: number; ry: number; color: string }[]
): PropResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  for (const c of cars) {
    const cos = Math.cos(c.ry);
    const sin = Math.sin(c.ry);
    const local = (lx: number, lz: number): [number, number] => [
      c.x + lx * cos + lz * sin,
      c.z - lx * sin + lz * cos,
    ];
    const [bx, bz] = local(0, 0);
    // Chamfered body + cabin so the compact reads modelled, not stacked.
    kit.rbox(2.9, 0.66, 1.4, bx, 0.58, bz, c.color, 0.16, c.ry);
    kit.rbox(1.7, 0.58, 1.24, bx, 1.12, bz, c.color, 0.14, c.ry);
    const [wx1, wz1] = local(0.15, 0);
    glow.box(1.42, 0.36, 1.28, wx1, 1.14, wz1, '#2c3440', c.ry);
    // Wheels tucked into arches, with a hubcap dot.
    for (const [lx, lz] of [
      [-0.95, -0.66],
      [0.95, -0.66],
      [-0.95, 0.66],
      [0.95, 0.66],
    ]) {
      const [wx, wz] = local(lx, lz);
      kit.rbox(0.52, 0.52, 0.24, wx, 0.28, wz, '#22252c', 0.1, c.ry);
      const [hbx, hbz] = local(lx, lz + (lz > 0 ? 0.13 : -0.13));
      kit.box(0.2, 0.2, 0.05, hbx, 0.28, hbz, '#8f959c', c.ry);
    }
    // Bumpers, headlights, taillights, mirrors
    const [fx, fz] = local(1.48, 0);
    kit.box(0.14, 0.22, 1.32, fx, 0.34, fz, '#3a3f47', c.ry);
    const [rx2, rz2] = local(-1.48, 0);
    kit.box(0.14, 0.22, 1.32, rx2, 0.34, rz2, '#3a3f47', c.ry);
    for (const side of [-0.45, 0.45]) {
      const [hx, hz] = local(1.47, side);
      glow.box(0.06, 0.14, 0.26, hx, 0.62, hz, P.windowWarm, c.ry);
      const [tx, tz] = local(-1.47, side);
      glow.box(0.06, 0.12, 0.22, tx, 0.6, tz, '#c4453a', c.ry);
    }
    for (const side of [-0.76, 0.76]) {
      const [mx, mz] = local(0.62, side);
      kit.box(0.1, 0.08, 0.14, mx, 1.02, mz, '#3a3f47', c.ry);
    }
  }
  const group = new THREE.Group();
  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  return {
    object: group,
    colliders: cars.map((c) => ({
      x: c.x,
      z: c.z,
      spec: { w: 3.0, h: 1.6, d: 1.5, x: 0, y: 0.8, z: 0 },
    })),
  };
}

/** Benches + planters merged into one mesh; solid enough to bump into. */
export function createStreetFurniture(
  benches: { x: number; z: number; ry?: number }[],
  planters: { x: number; z: number }[]
): PropResult {
  const kit = new VoxelKit();
  for (const b of benches) {
    const ry = b.ry ?? 0;
    kit.box(1.8, 0.12, 0.55, b.x, 0.45, b.z, P.woodLight, ry);
    kit.box(1.8, 0.5, 0.12, b.x - Math.sin(ry) * 0.25, 0.7, b.z - Math.cos(ry) * 0.25, P.woodLight, ry);
    kit.box(0.16, 0.45, 0.5, b.x - Math.cos(ry) * 0.82, 0.22, b.z + Math.sin(ry) * 0.82, '#3a3f47', ry);
    kit.box(0.16, 0.45, 0.5, b.x + Math.cos(ry) * 0.82, 0.22, b.z - Math.sin(ry) * 0.82, '#3a3f47', ry);
  }
  for (const p of planters) {
    kit.boxOn(1.1, 0.5, 1.1, p.x, 0, p.z, '#6e6862');
    kit.boxOn(0.9, 0.35, 0.9, p.x, 0.5, p.z, P.leafDark);
    kit.boxOn(0.5, 0.3, 0.5, p.x, 0.85, p.z, P.leaf);
  }
  return {
    object: kit.toMesh(MATERIALS.lit),
    colliders: [
      ...benches.map((b) => ({ x: b.x, z: b.z, spec: { w: 1.9, h: 1, d: 0.7, x: 0, y: 0.5, z: 0 } })),
      ...planters.map((p) => ({ x: p.x, z: p.z, spec: { w: 1.2, h: 1, d: 1.2, x: 0, y: 0.5, z: 0 } })),
    ],
  };
}

export interface CityDetailSpec {
  /** Bus shelters: opening faces local +z before rotation. */
  shelters: { x: number; z: number; ry: number }[];
  /** Street-food carts (pojangmacha) with a warm lantern. */
  carts: { x: number; z: number; ry: number }[];
  /** Decorative boats out on the water. */
  boats: { x: number; z: number; ry: number }[];
  /** Low hedge rows (length along x). */
  hedges: { x: number; z: number; len: number }[];
  /** Flowerbeds. */
  beds: { x: number; z: number }[];
  /** Wooden utility poles (hanok alley flavor). */
  poles: { x: number; z: number }[];
  /** Red Korean postboxes. */
  postboxes: { x: number; z: number; ry?: number }[];
}

/**
 * Street-level dressing that keeps the city from feeling flat: shelters,
 * food carts, boats, hedges, flowerbeds, utility poles, postboxes. All of
 * it merges into one lit mesh + one glow mesh (two draw calls).
 */
export function createCityDetails(spec: CityDetailSpec): PropResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const colliders: PropResult['colliders'] = [];

  for (const s of spec.shelters) {
    const cos = Math.cos(s.ry);
    const sin = Math.sin(s.ry);
    const at = (lx: number, lz: number): [number, number] => [
      s.x + lx * cos + lz * sin,
      s.z - lx * sin + lz * cos,
    ];
    for (const px of [-1.4, 1.4]) {
      const [wx, wz] = at(px, 0.55);
      kit.boxOn(0.14, 2.3, 0.14, wx, 0, wz, '#4d5560');
    }
    const [rx, rz] = at(0, 0);
    kit.box(3.3, 0.14, 1.7, rx, 2.32, rz, '#39586e', s.ry);
    const [bx, bz] = at(0, -0.62);
    kit.box(3.3, 1.25, 0.09, bx, 1.28, bz, '#3b4757', s.ry);
    const [sx2, sz2] = at(0, -0.35);
    kit.box(2.2, 0.1, 0.5, sx2, 0.55, sz2, P.woodLight, s.ry);
    glow.box(1.6, 0.07, 0.12, rx, 2.2, rz, P.lampGlow, s.ry);
    colliders.push({ x: s.x, z: s.z, spec: { w: 3.3, h: 2.4, d: 1.5, x: 0, y: 1.2, z: 0 } });
  }

  for (const c of spec.carts) {
    kit.box(2.2, 0.85, 1.4, c.x, 0.85, c.z, '#8a4f36', c.ry);
    kit.box(2.3, 0.1, 1.5, c.x, 1.34, c.z, '#b98a5a', c.ry);
    const cos = Math.cos(c.ry);
    const sin = Math.sin(c.ry);
    for (const [lx, lz] of [
      [-1.0, -0.6], [1.0, -0.6], [-1.0, 0.6], [1.0, 0.6],
    ]) {
      kit.box(0.09, 0.85, 0.09, c.x + lx * cos + lz * sin, 1.85, c.z - lx * sin + lz * cos, '#5c3d2a');
    }
    kit.box(2.7, 0.16, 1.9, c.x, 2.32, c.z, '#d97a2e', c.ry);
    // wheels
    for (const side of [-0.9, 0.9]) {
      kit.box(0.4, 0.4, 0.14, c.x + side * cos, 0.22, c.z - side * sin, '#22252c', c.ry);
    }
    glow.box(0.24, 0.3, 0.24, c.x + 1.25 * cos, 1.95, c.z - 1.25 * sin, P.lampGlow, c.ry);
    colliders.push({ x: c.x, z: c.z, spec: { w: 2.5, h: 2, d: 1.7, x: 0, y: 1, z: 0 } });
  }

  for (const b of spec.boats) {
    kit.box(3.1, 0.5, 1.35, b.x, 0.18, b.z, '#5d7285', b.ry);
    kit.box(2.7, 0.14, 1.1, b.x, 0.5, b.z, '#8fa3b5', b.ry);
    const cos = Math.cos(b.ry);
    const sin = Math.sin(b.ry);
    kit.box(0.95, 0.75, 0.85, b.x - 0.6 * cos, 0.95, b.z + 0.6 * sin, '#d8dde4', b.ry);
    glow.box(0.14, 0.14, 0.14, b.x - 0.6 * cos, 1.45, b.z + 0.6 * sin, '#ffd447', b.ry);
    // decorative only — they sit out on the water
  }

  for (const h of spec.hedges) {
    kit.box(h.len, 0.6, 0.95, h.x, 0.3, h.z, P.leafDark);
    kit.box(h.len - 0.5, 0.26, 0.7, h.x, 0.72, h.z, P.leaf);
    colliders.push({ x: h.x, z: h.z, spec: { w: h.len, h: 1, d: 1, x: 0, y: 0.5, z: 0 } });
  }

  const flowerColors = ['#ff5d8f', '#ffd447', '#ff8a5c', '#e86fce'];
  let fi = 0;
  for (const bed of spec.beds) {
    kit.boxOn(1.7, 0.3, 1.0, bed.x, 0, bed.z, '#6e6862');
    kit.box(1.5, 0.12, 0.8, bed.x, 0.34, bed.z, P.grassDark);
    for (let f = 0; f < 6; f++) {
      const fx = bed.x - 0.6 + (f % 3) * 0.6;
      const fz = bed.z - 0.2 + Math.floor(f / 3) * 0.4;
      kit.box(0.16, 0.22, 0.16, fx, 0.5, fz, flowerColors[fi++ % flowerColors.length]);
    }
    colliders.push({ x: bed.x, z: bed.z, spec: { w: 1.8, h: 0.8, d: 1.1, x: 0, y: 0.4, z: 0 } });
  }

  for (const p of spec.poles) {
    kit.boxOn(0.18, 4.6, 0.18, p.x, 0, p.z, '#6a4a34');
    kit.box(1.5, 0.12, 0.12, p.x, 4.1, p.z, '#5c3d2a');
    for (const side of [-0.55, 0.55]) {
      kit.box(0.09, 0.16, 0.09, p.x + side, 4.24, p.z, '#2c3440');
    }
    colliders.push({ x: p.x, z: p.z, spec: { w: 0.35, h: 4.6, d: 0.35, x: 0, y: 2.3, z: 0 } });
  }

  for (const pb of spec.postboxes) {
    const ry = pb.ry ?? 0;
    kit.box(0.72, 0.55, 0.6, pb.x, 0.85, pb.z, '#c0392b', ry);
    kit.box(0.72, 0.3, 0.6, pb.x, 1.27, pb.z, '#a83224', ry);
    kit.box(0.5, 0.07, 0.06, pb.x + Math.sin(ry) * 0.31, 1.05, pb.z + Math.cos(ry) * 0.31, '#3a2420', ry);
    kit.box(0.2, 0.6, 0.2, pb.x, 0.28, pb.z, '#4d5560', ry);
    colliders.push({ x: pb.x, z: pb.z, spec: { w: 0.8, h: 1.5, d: 0.7, x: 0, y: 0.75, z: 0 } });
  }

  const group = new THREE.Group();
  group.add(kit.toMesh(MATERIALS.lit));
  if (!glow.isEmpty) group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  return { object: group, colliders };
}

/**
 * Raised curb strips along every road edge plus stainless bollards at the
 * junction corners — the 3D lip that makes painted roads read as graded
 * streets. Purely visual (no colliders): the walkable plane stays flat and
 * the poro rolls over the 9cm lip without snagging.
 */
export function createRoadFurniture(
  roads: [number, number, number, number, number?][],
  junctions: { x: number; z: number }[]
): PropResult {
  const kit = new VoxelKit();
  const CURB = '#7e8083';
  const H = 0.09;
  const W = 0.24;
  const EDGE = 88; // past the boundary wall nothing is reachable

  const addRun = (
    horizontal: boolean,
    c: number,
    edge: number,
    a0: number,
    a1: number,
    cuts: number[],
    spanCuts: [number, number][] = []
  ) => {
    a0 = Math.max(a0, -EDGE);
    a1 = Math.min(a1, EDGE);
    // Junction cuts (±4.6 around each) plus arbitrary excluded spans,
    // e.g. where a road crosses flush plaza paving.
    const gaps = cuts
      .filter((t) => t > a0 - 4.6 && t < a1 + 4.6)
      .map((t): [number, number] => [t - 4.6, t + 4.6])
      .concat(spanCuts)
      .sort((m, n) => m[0] - n[0]);
    let cur = a0;
    const segs: [number, number][] = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cur) segs.push([cur, Math.min(g0, a1)]);
      cur = Math.max(cur, g1);
    }
    if (a1 > cur) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 1) continue;
      const mid = (s0 + s1) / 2;
      if (horizontal) kit.box(len, H, W, mid, H / 2, c + edge, CURB);
      else kit.box(W, H, len, c + edge, H / 2, mid, CURB);
    }
  };

  // The Starlight Plaza circle (center z -14, r 12 at x 0): the spine
  // crosses it as flush paving, so curbs stop at the plaza rim.
  const PLAZA: [number, number] = [-26.2, -1.8];

  for (const [x, z, w, d] of roads) {
    const horizontal = w > d;
    if (horizontal) {
      const cuts = junctions.filter((j) => Math.abs(j.z - z) < 0.1).map((j) => j.x);
      for (const side of [-1, 1]) addRun(true, z, side * (d / 2 + 0.12), x - w / 2, x + w / 2, cuts);
    } else {
      const cuts = junctions.filter((j) => Math.abs(j.x - x) < 0.1).map((j) => j.z);
      let z0 = z - d / 2;
      let z1 = z + d / 2;
      // Streets that reach the river hand over to the bridge approaches.
      if (z0 < 10.5 && z1 > 10.5) z1 = 10.5;
      if (z0 > 20 && z0 < 54.2) z0 = 54.2;
      const spans: [number, number][] = Math.abs(x) < 4 && z0 < 0 ? [PLAZA] : [];
      for (const side of [-1, 1]) addRun(false, x, side * (w / 2 + 0.12), z0, z1, cuts, spans);
    }
  }

  // Bollards guarding the zebra corners.
  for (const j of junctions) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = j.x + sx * 3.7;
        const bz = j.z + sz * 3.7;
        kit.cylinder(0.07, 0.08, 0.6, bx, 0.3, bz, '#b9bcc1', 6);
        kit.cylinder(0.075, 0.075, 0.08, bx, 0.52, bz, '#3c4148', 6);
      }
    }
  }

  return { object: kit.toMesh(MATERIALS.lit), colliders: [] };
}

/**
 * Korean intersection signals: a gray corner pole with a mast arm reaching
 * over the roadway, a horizontal three-lamp head, and a pedestrian signal
 * on the pole. Two per junction on diagonal corners.
 */
export function createTrafficSignals(
  junctions: { x: number; z: number; go?: boolean }[]
): PropResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const colliders: PropResult['colliders'] = [];
  const POLE = '#5b6068';
  const HOUSING = '#2e343c';

  for (const [ji, j] of junctions.entries()) {
    const green = j.go ?? ji % 2 === 0;
    for (const corner of [-1, 1]) {
      const px = j.x - corner * 4.3;
      const pz = j.z + corner * 4.3;
      // Pole + mast arm reaching back over the arterial
      kit.cylinder(0.07, 0.1, 4.1, px, 2.05, pz, POLE, 7);
      const armLen = 3.1;
      const az = pz - corner * armLen * 0.5;
      kit.box(0.11, 0.11, armLen, px, 3.95, az, POLE);
      // Head hangs at the arm tip, lamps facing along the road
      const hz = pz - corner * armLen;
      kit.box(1.02, 0.34, 0.22, px, 3.62, hz, HOUSING);
      const lamps: [string, boolean][] = [
        ['#e0574a', !green],
        ['#e0b34e', false],
        ['#57c785', green],
      ];
      for (const [li, [color, lit]] of lamps.entries()) {
        const lx = px - 0.3 + li * 0.3;
        (lit ? glow : kit).box(0.17, 0.17, 0.06, lx, 3.62, hz + (corner > 0 ? -0.13 : 0.13), lit ? color : shade(color, 0.35));
      }
      // Pedestrian signal box on the pole
      kit.box(0.24, 0.5, 0.18, px, 1.45, pz - corner * 0.16, HOUSING);
      (green ? kit : glow).box(0.13, 0.13, 0.05, px, 1.32, pz - corner * 0.26, green ? shade('#e0574a', 0.35) : '#e0574a');
      (green ? glow : kit).box(0.13, 0.13, 0.05, px, 1.56, pz - corner * 0.26, green ? '#57c785' : shade('#57c785', 0.35));
      colliders.push({ x: px, z: pz, spec: { w: 0.3, h: 4, d: 0.3, x: 0, y: 2, z: 0 } });
    }
  }

  const group = new THREE.Group();
  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  return { object: group, colliders };
}

/**
 * A run of concrete utility poles with sagging catenary wires — the
 * signature tangle of Seoul's older streets. Poles are tapered concrete
 * with a crossarm, insulators, and the occasional pole transformer; three
 * wires sag between consecutive poles (two bars each).
 */
export function createUtilityRun(points: { x: number; z: number }[]): PropResult {
  const kit = new VoxelKit();
  const colliders: PropResult['colliders'] = [];
  const CONCRETE = '#9b9a93';
  const WIRE = '#2c2f35';
  const ARM_H = 4.6;

  // Crossarms face perpendicular to the run direction.
  const dirs = points.map((_p, i) => {
    const q = points[Math.min(i + 1, points.length - 1)];
    const r = points[Math.max(i - 1, 0)];
    return Math.atan2(q.x - r.x, q.z - r.z);
  });

  points.forEach((p, i) => {
    kit.cylinder(0.07, 0.12, 5.2, p.x, 2.6, p.z, CONCRETE, 7);
    const ry = dirs[i];
    kit.box(1.5, 0.1, 0.1, p.x, ARM_H, p.z, '#6b665d', ry + Math.PI / 2);
    for (const side of [-0.6, 0.6]) {
      const ix = p.x + Math.cos(ry) * side;
      const iz = p.z - Math.sin(ry) * side;
      kit.box(0.08, 0.14, 0.08, ix, ARM_H + 0.12, iz, '#d8d4c8');
    }
    if (i % 3 === 1) {
      // Pole transformer drum
      const tx = p.x + Math.cos(ry) * 0.35;
      const tz = p.z - Math.sin(ry) * 0.35;
      kit.cylinder(0.26, 0.26, 0.8, tx, 3.7, tz, '#54575e', 8);
      kit.cylinder(0.29, 0.29, 0.06, tx, 4.12, tz, '#43464c', 8);
    }
    colliders.push({ x: p.x, z: p.z, spec: { w: 0.35, h: 5.2, d: 0.35, x: 0, y: 2.6, z: 0 } });
  });

  // Wires between consecutive poles: crossarm ends + a center line, each
  // sagging through a midpoint.
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const [off, y] of [
      [-0.6, ARM_H + 0.18],
      [0.6, ARM_H + 0.18],
      [0, ARM_H - 0.5],
    ] as const) {
      const ax = a.x + Math.cos(dirs[i]) * off;
      const az = a.z - Math.sin(dirs[i]) * off;
      const bx = b.x + Math.cos(dirs[i + 1]) * off;
      const bz = b.z - Math.sin(dirs[i + 1]) * off;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const my = y - 0.45;
      kit.bar(ax, y, az, mx, my, mz, 0.03, WIRE);
      kit.bar(mx, my, mz, bx, y, bz, 0.03, WIRE);
    }
  }

  return { object: kit.toMesh(MATERIALS.lit, false, false), colliders };
}

export interface FillerSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  wall: string;
  window: string;
  windowChance?: number;
}

/** Anchor for a texture-atlas shop sign quad (see SignTexture atlas). */
export interface SignSpot {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Yaw of the sign's outward normal (0 = +z). */
  ry: number;
}

/**
 * Background city mass: non-interactive buildings merged into one lit mesh
 * + one glow mesh so whole districts cost two draw calls. Each block draws
 * from a deterministic bag of variations — chamfered massing, top-floor
 * setbacks, framed window cells, balcony rows, gabled villa roofs, green
 * waterproofed roofs, rooftop rooms (oktap), wall AC units, drain pipes,
 * and full-width Korean sign bands — so streets read authored rather than
 * duplicated, and no facade is ever a flat painted box.
 */
export function createFillerBlocks(
  specs: FillerSpec[]
): PropResult & { occluders: THREE.Mesh[]; signSpots: SignSpot[] } {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const rng = mulberry32(1234);
  const floorH = 2.5;
  const PANE_DARK = '#454e5f';
  const signSpots: SignSpot[] = [];

  for (const f of specs) {
    const h = f.floors * floorH;
    const lowRise = f.floors <= 2;
    const setback = !lowRise && rng() < 0.4;
    const bodyH = setback ? h - floorH : h;
    const frameC = shade(f.wall, 0.72);

    // Massing: recessed ground band + shaft, so even fillers read layered.
    kit.boxOn(f.w - 0.18, floorH, f.d - 0.18, f.x, 0, f.z, shade(f.wall, 0.88));
    kit.rbox(f.w, bodyH - floorH, f.d, f.x, floorH + (bodyH - floorH) / 2, f.z, f.wall, 0.1);
    kit.box(f.w + 0.12, 0.18, f.d + 0.12, f.x, floorH, f.z, shade(f.wall, 0.7));
    if (setback) {
      kit.rboxOn(f.w * 0.68, floorH, f.d * 0.72, f.x - f.w * 0.1, bodyH, f.z, shade(f.wall, 0.92), 0.1);
      kit.box(f.w * 0.72, 0.22, f.d * 0.76, f.x - f.w * 0.1, h + 0.1, f.z, P.roof);
    }
    // Roofline: villa gable for low-rises, parapet + green waterproofing else
    if (lowRise && rng() < 0.6) {
      kit.prism(f.d + 0.7, 1.1 + rng() * 0.5, f.w + 0.6, f.x, bodyH, f.z, rng() < 0.5 ? '#5c6470' : '#7a4a3a', Math.PI / 2);
    } else {
      kit.boxOn(f.w + 0.25, 0.32, f.d + 0.25, f.x, bodyH, f.z, P.roof);
      // The classic Seoul green rooftop paint inside the parapet
      if (rng() < 0.55) kit.box(f.w - 0.7, 0.05, f.d - 0.7, f.x, bodyH + 0.36, f.z, '#3e7d5a');
    }
    // Rooftop room (oktapbang) with its own little roof + door
    if (!lowRise && !setback && rng() < 0.3) {
      const ox = f.x + f.w / 4 - 0.6;
      const oz = f.z - f.d / 4 + 0.4;
      kit.boxOn(2.2, 2.1, 2.0, ox, bodyH + 0.34, oz, shade(f.wall, 1.06));
      kit.box(2.5, 0.14, 2.3, ox, bodyH + 2.5, oz, '#5c6470');
      kit.box(0.7, 1.4, 0.06, ox, bodyH + 1.05, oz + 1.02, '#3a3f47');
    }
    // Rooftop clutter
    if (rng() < 0.45) kit.rboxOn(1.2, 0.9, 1.2, f.x + f.w / 4, bodyH + 0.3, f.z, '#8a9096', 0.08);
    if (rng() < 0.35) {
      kit.cylinder(0.55, 0.55, 0.9, f.x - f.w / 4, bodyH + 0.75, f.z + f.d / 5, '#c8b98f', 8);
    }
    if (rng() < 0.3) {
      kit.boxOn(0.15, 2.2, 0.15, f.x - f.w / 4, bodyH + 0.3, f.z - f.d / 4, '#4d565f');
    }
    // Drain pipe down one corner
    kit.cylinder(0.06, 0.06, bodyH - 0.3, f.x - f.w / 2 - 0.08, (bodyH - 0.3) / 2, f.z - f.d / 2 + 0.4, '#70767d', 5);

    // Ground-floor shop band on some street-facing blocks
    const shopBand = lowRise || rng() < 0.35;
    if (shopBand) {
      glow.box(f.w * 0.7, floorH * 0.5, 0.07, f.x, floorH * 0.38, f.z + f.d / 2 + 0.03, rng() < 0.6 ? P.windowWarm : P.neonCyan);
      // Full-width Korean sign band above the shopfront (text via atlas)
      const bandC = ['#b04b50', '#3f6f5a', '#31517c', '#7a4a3a'][Math.floor(rng() * 4)];
      kit.box(f.w * 0.88, 0.85, 0.16, f.x, floorH * 0.82 + 0.42, f.z + f.d / 2 + 0.1, bandC);
      signSpots.push({
        x: f.x,
        y: floorH * 0.82 + 0.42,
        z: f.z + f.d / 2 + 0.19,
        w: Math.min(f.w * 0.84, 7),
        h: 0.78,
        ry: 0,
      });
      // Protruding vertical sign on one corner for taller buildings
      if (!lowRise && rng() < 0.6) {
        const sx = f.x + f.w / 2 - 0.4;
        kit.box(0.14, 2.6, 0.5, sx, floorH + 2.2, f.z + f.d / 2 + 0.32, '#22262e');
        glow.box(0.1, 2.3, 0.36, sx, floorH + 2.2, f.z + f.d / 2 + 0.34, rng() < 0.5 ? P.neonPink : P.neonYellow);
      }
    }

    const chance = f.windowChance ?? 0.6;
    // Window cells on all four faces: framed cells with a sill, panes dark
    // by day and a lit subset at night — no street looks at a blank wall.
    const cols = Math.max(1, Math.floor((f.w - 1) / 1.6));
    const start = -((cols - 1) * 1.6) / 2;
    const colsD = Math.max(1, Math.floor((f.d - 1) / 1.6));
    const startD = -((colsD - 1) * 1.6) / 2;
    const balconyFloors = !lowRise && f.w >= 9 && rng() < 0.45;
    for (let fl = 0; fl < f.floors; fl++) {
      if (setback && fl >= f.floors - 1) break;
      const y = fl * floorH + floorH * 0.55;
      for (let c = 0; c < cols; c++) {
        const wx = f.x + start + c * 1.6;
        for (const sign of [1, -1]) {
          if (fl === 0 && sign === 1 && shopBand) continue;
          const lit = rng() < chance && rng() < 0.75;
          const zz = f.z + (f.d / 2 + 0.03) * sign;
          kit.box(0.94, 1.09, 0.07, wx, y, zz, frameC);
          if (lit) glow.box(0.8, 0.95, 0.07, wx, y, zz + sign * 0.02, rng() < 0.8 ? f.window : '#5b667a');
          else kit.box(0.8, 0.95, 0.07, wx, y, zz + sign * 0.02, PANE_DARK);
          kit.box(1.0, 0.07, 0.16, wx, y - 0.58, zz + sign * 0.05, shade(f.wall, 0.65));
          // Wall AC unit under an occasional upper window
          if (fl > 0 && rng() < 0.1) {
            kit.box(0.52, 0.36, 0.3, wx + 0.2, y - 0.85, zz + sign * 0.16, '#9aa0a5');
          }
        }
      }
      for (let c = 0; c < colsD; c++) {
        const wz = f.z + startD + c * 1.6;
        const sign = rng() < 0.5 ? 1 : -1;
        const lit = rng() < chance * 0.8 && rng() < 0.75;
        const xx = f.x + (f.w / 2 + 0.03) * sign;
        kit.box(0.07, 1.09, 0.94, xx, y, wz, frameC);
        if (lit) glow.box(0.07, 0.95, 0.8, xx + sign * 0.02, y, wz, rng() < 0.8 ? f.window : '#5b667a');
        else kit.box(0.07, 0.95, 0.8, xx + sign * 0.02, y, wz, PANE_DARK);
        kit.box(0.16, 0.07, 1.0, xx + sign * 0.05, y - 0.58, wz, shade(f.wall, 0.65));
        if (fl > 0 && rng() < 0.08) {
          kit.box(0.3, 0.36, 0.52, xx + sign * 0.16, y - 0.85, wz + 0.2, '#9aa0a5');
        }
      }
      // Balcony rows on the street face of wide apartment slabs
      if (balconyFloors && fl > 0) {
        kit.box(f.w * 0.9, 0.1, 0.5, f.x, y - 0.75, f.z + f.d / 2 + 0.28, shade(f.wall, 0.8));
        kit.box(f.w * 0.9, 0.4, 0.06, f.x, y - 0.5, f.z + f.d / 2 + 0.52, shade(f.wall, 0.7));
      }
    }
  }

  const group = new THREE.Group();
  const litMesh = kit.toMesh(MATERIALS.lit);
  group.add(litMesh);
  if (!glow.isEmpty) group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  return {
    object: group,
    occluders: [litMesh],
    signSpots,
    colliders: specs.map((f) => ({
      x: f.x,
      z: f.z,
      spec: { w: f.w, h: f.floors * floorH, d: f.d, x: 0, y: (f.floors * floorH) / 2, z: 0 },
    })),
  };
}

/** Multiplies a hex color's value by `f` (cheap shade/tint). */
function shade(hex: string, f: number): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
