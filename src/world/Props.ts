import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { MATERIALS, VoxelKit } from './voxel';
import type { ColliderSpec } from './VoxelBuilding';

const dummy = new THREE.Object3D();

export interface PropResult {
  object: THREE.Object3D;
  colliders: { x: number; z: number; spec: ColliderSpec }[];
}

/** Chunky instanced trees: trunk + two stacked leaf cubes. */
export function createTrees(positions: { x: number; z: number; s?: number }[]): PropResult {
  const group = new THREE.Group();

  const trunkGeo = new THREE.BoxGeometry(0.34, 1.2, 0.34);
  trunkGeo.translate(0, 0.6, 0);
  const trunk = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ color: P.treeTrunk }),
    positions.length
  );

  const leafGeo = new THREE.BoxGeometry(1.5, 1.3, 1.5);
  leafGeo.translate(0, 1.75, 0);
  const leafTopGeo = new THREE.BoxGeometry(0.95, 0.8, 0.95);
  leafTopGeo.translate(0, 2.7, 0);
  const leafMat = new THREE.MeshLambertMaterial({ color: P.leaf });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
  const leavesTop = new THREE.InstancedMesh(leafTopGeo, leafMat, positions.length);

  const color = new THREE.Color();
  positions.forEach((p, i) => {
    const s = p.s ?? 0.85 + ((i * 37) % 10) / 22;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.y = (i * 2.39996) % Math.PI;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    leaves.setMatrixAt(i, dummy.matrix);
    leavesTop.setMatrixAt(i, dummy.matrix);
    // vary foliage between green and early-autumn
    const t = (i * 53) % 100;
    color.set(t > 82 ? P.leafAutumn : t > 40 ? P.leaf : P.leafDark);
    leaves.setColorAt(i, color);
    leavesTop.setColorAt(i, color);
  });
  for (const m of [trunk, leaves, leavesTop]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
  }
  group.add(trunk, leaves, leavesTop);

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
    kit.box(2.9, 0.7, 1.4, bx, 0.55, bz, c.color, c.ry);
    kit.box(1.7, 0.6, 1.25, bx, 1.15, bz, c.color, c.ry);
    const [wx1, wz1] = local(0.15, 0);
    glow.box(1.5, 0.4, 1.3, wx1, 1.18, wz1, '#2c3440', c.ry);
    for (const [lx, lz] of [
      [-0.95, -0.72],
      [0.95, -0.72],
      [-0.95, 0.72],
      [0.95, 0.72],
    ]) {
      const [wx, wz] = local(lx, lz);
      kit.box(0.5, 0.5, 0.2, wx, 0.28, wz, '#22252c', c.ry);
    }
    const [hx, hz] = local(1.5, 0);
    glow.box(0.1, 0.16, 1.0, hx, 0.6, hz, P.windowWarm, c.ry);
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

/**
 * Background city mass: simple non-interactive buildings merged into one lit
 * mesh + one glow mesh so whole districts cost two draw calls.
 */
export function createFillerBlocks(specs: FillerSpec[]): PropResult & { occluders: THREE.Mesh[] } {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const rng = mulberry32(1234);
  const floorH = 2.5;

  for (const f of specs) {
    const h = f.floors * floorH;
    kit.boxOn(f.w, h, f.d, f.x, 0, f.z, f.wall);
    kit.boxOn(f.w + 0.25, 0.3, f.d + 0.25, f.x, h, f.z, P.roof);
    if (rng() < 0.4) kit.boxOn(1.2, 0.9, 1.2, f.x + f.w / 4, h + 0.3, f.z, '#8a9096');
    if (rng() < 0.3) {
      kit.boxOn(0.15, 2.2, 0.15, f.x - f.w / 4, h + 0.3, f.z - f.d / 4, '#4d565f');
    }
    const chance = f.windowChance ?? 0.6;
    // Windows on all four faces so no street ever looks at a blank wall.
    const cols = Math.max(1, Math.floor((f.w - 1) / 1.6));
    const start = -((cols - 1) * 1.6) / 2;
    const colsD = Math.max(1, Math.floor((f.d - 1) / 1.6));
    const startD = -((colsD - 1) * 1.6) / 2;
    for (let fl = 0; fl < f.floors; fl++) {
      const y = fl * floorH + floorH * 0.55;
      for (let c = 0; c < cols; c++) {
        if (rng() > chance) continue;
        const warm = rng() < 0.75;
        glow.box(
          0.8, 0.9, 0.07,
          f.x + start + c * 1.6,
          y,
          f.z + (f.d / 2 + 0.02) * (rng() < 0.5 ? 1 : -1),
          warm ? P.windowWarm : '#5b667a'
        );
      }
      for (let c = 0; c < colsD; c++) {
        if (rng() > chance * 0.8) continue;
        const warm = rng() < 0.75;
        glow.box(
          0.07, 0.9, 0.8,
          f.x + (f.w / 2 + 0.02) * (rng() < 0.5 ? 1 : -1),
          y,
          f.z + startD + c * 1.6,
          warm ? P.windowWarm : '#5b667a'
        );
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
    colliders: specs.map((f) => ({
      x: f.x,
      z: f.z,
      spec: { w: f.w, h: f.floors * floorH, d: f.d, x: 0, y: (f.floors * floorH) / 2, z: 0 },
    })),
  };
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
