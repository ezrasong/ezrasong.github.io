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

  const poleGeo = new THREE.BoxGeometry(0.16, 3.6, 0.16);
  poleGeo.translate(0, 1.8, 0);
  const armGeo = new THREE.BoxGeometry(0.9, 0.12, 0.12);
  armGeo.translate(0.45, 3.5, 0);
  const pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#3a3f47' }), positions.length);
  const arm = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: '#3a3f47' }), positions.length);
  const headGeo = new THREE.BoxGeometry(0.36, 0.16, 0.24);
  headGeo.translate(0.85, 3.42, 0);
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
    kit.box(0.14, 0.45, 0.5, b.x - Math.cos(ry) * 0.75, 0.22, b.z + Math.sin(ry) * 0.75, '#3a3f47', ry);
    kit.box(0.14, 0.45, 0.5, b.x + Math.cos(ry) * 0.75, 0.22, b.z - Math.sin(ry) * 0.75, '#3a3f47', ry);
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
    const cols = Math.max(1, Math.floor((f.w - 1) / 1.6));
    const start = -((cols - 1) * 1.6) / 2;
    for (let fl = 0; fl < f.floors; fl++) {
      for (let c = 0; c < cols; c++) {
        if (rng() > chance) continue;
        const y = fl * floorH + floorH * 0.55;
        const warm = rng() < 0.75;
        glow.box(
          0.8, 0.9, 0.07,
          f.x + start + c * 1.6,
          y,
          f.z + (f.d / 2 + 0.02) * (rng() < 0.5 ? 1 : -1),
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
