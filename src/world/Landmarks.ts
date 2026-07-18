import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { MATERIALS, VoxelKit } from './voxel';
import { makeSign } from './SignTexture';
import type { ColliderSpec } from './VoxelBuilding';

export interface LandmarkResult {
  object: THREE.Object3D;
  colliders: { x: number; z: number; ry?: number; spec: ColliderSpec }[];
  occluders?: THREE.Mesh[];
}

/**
 * The starting-plaza landmark: a Gwanghwamun-inspired gate the player can
 * walk through, carrying the portfolio's name board.
 */
export function createGate(x: number, z: number): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();

  const spanW = 10;
  const pierW = 2.2;
  const pierH = 4.2;
  const pierD = 3.4;

  // Stone piers with a walkable arch between them
  for (const side of [-1, 1]) {
    kit.boxOn(pierW, pierH, pierD, side * (spanW / 2 - pierW / 2), 0, 0, '#9a938a');
    kit.boxOn(pierW + 0.4, 0.4, pierD + 0.4, side * (spanW / 2 - pierW / 2), pierH, 0, '#87817a');
  }
  // Upper hall: red columns + white wall band
  kit.boxOn(spanW + 1, 0.7, pierD + 0.6, 0, pierH + 0.4, 0, '#8f3b2e');
  for (let i = 0; i <= 4; i++) {
    kit.boxOn(0.5, 1.9, 0.5, -spanW / 2 + 0.8 + i * ((spanW - 1.6) / 4), pierH + 1.1, 0, '#a34435');
  }
  kit.boxOn(spanW, 0.5, pierD * 0.7, 0, pierH + 3.0, 0, P.hanokWall);
  // Double dark-tile roof with lifted eaves
  for (const [ry, rw, rd] of [
    [pierH + 3.5, spanW + 3, pierD + 2.6],
    [pierH + 3.86, spanW + 1.6, pierD + 1.4],
    [pierH + 4.7, spanW - 0.4, pierD + 0.4],
    [pierH + 5.06, spanW - 1.8, pierD - 0.8],
  ] as const) {
    kit.boxOn(rw, 0.36, rd, 0, ry, 0, P.hanokRoof);
  }
  // Warm lanterns inside the arch
  glow.box(0.35, 0.5, 0.35, -spanW / 2 + pierW + 0.4, 2.8, 0, P.lampGlow);
  glow.box(0.35, 0.5, 0.35, spanW / 2 - pierW - 0.4, 2.8, 0, P.lampGlow);

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  // Name boards on both faces
  for (const side of [1, -1]) {
    const sign = makeSign({
      text: 'EZRA SONG',
      subtext: '송에즈라 · FRONTEND ENGINEER & CREATIVE DEVELOPER',
      bg: '#1d222e',
      fg: '#ffd447',
      border: '#8f3b2e',
      width: 7.5,
      height: 1.7,
      glow: true,
    });
    sign.position.set(0, pierH + 1.6, side * (pierD / 2 + 0.45));
    if (side === -1) sign.rotation.y = Math.PI;
    group.add(sign);
  }

  group.position.set(x, 0, z);
  const bodyMesh = group.children[0] as THREE.Mesh;
  return {
    object: group,
    colliders: [
      { x: x - (spanW / 2 - pierW / 2), z, spec: { w: pierW, h: pierH, d: pierD, x: 0, y: pierH / 2, z: 0 } },
      { x: x + (spanW / 2 - pierW / 2), z, spec: { w: pierW, h: pierH, d: pierD, x: 0, y: pierH / 2, z: 0 } },
    ],
    occluders: [bodyMesh],
  };
}

/** Namsan: a stepped green hill with an N-Seoul-Tower silhouette on top. */
export function createNamsan(x: number, z: number): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();

  // Stepped hill
  const steps: [number, number][] = [
    [16, 2.2],
    [13, 2.0],
    [10, 2.0],
    [7, 1.8],
    [4.5, 1.6],
  ];
  let y = 0;
  for (const [r, h] of steps) {
    kit.cylinder(r * 0.82, r, h, 0, y + h / 2, 0, y < 4 ? P.grassDark : '#456f44', 10);
    y += h;
  }
  // Scattered forest cubes on the slopes
  const rng = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 5 + rng() * 9;
    const hh = hillHeightAt(rr, steps);
    kit.boxOn(1.1, 1.2, 1.1, Math.cos(a) * rr, hh - 0.4, Math.sin(a) * rr, rng() < 0.7 ? P.leafDark : P.leaf);
  }
  // Tower: shaft, observation pod, spire
  const baseY = y;
  kit.cylinder(0.9, 1.3, 3, 0, baseY + 1.5, 0, '#b9bdc4', 10);
  kit.cylinder(0.55, 0.55, 9, 0, baseY + 7.5, 0, '#cfd3d9', 10);
  kit.cylinder(2.0, 1.6, 1.8, 0, baseY + 12.4, 0, '#e4e7eb', 12);
  glow.cylinder(2.05, 2.05, 0.5, 0, baseY + 12.3, 0, P.windowWarm, 12);
  kit.cylinder(0.14, 0.3, 4.4, 0, baseY + 15.4, 0, '#9aa0a8', 8);
  glow.box(0.3, 0.3, 0.3, 0, baseY + 17.7, 0, '#ff5d5d');

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  group.position.set(x, 0, z);

  const bodyMesh = group.children[0] as THREE.Mesh;
  return {
    object: group,
    // One fat cylinder-ish box keeps the player off the hill.
    colliders: [{ x, z, spec: { w: 30, h: 12, d: 26, x: 0, y: 6, z: 0 } }],
    occluders: [bodyMesh],
  };
}

function hillHeightAt(r: number, steps: [number, number][]): number {
  let y = 0;
  for (const [radius, h] of steps) {
    if (r < radius) y += h;
  }
  return y;
}

/** The Han River: two slowly drifting water planes south of the city. */
export function createRiver(): { object: THREE.Object3D; update: (t: number) => void } {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 26),
    new THREE.MeshLambertMaterial({ color: P.waterDeep })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0.02, 50);
  base.receiveShadow = true;
  group.add(base);

  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 26, 40, 8),
    new THREE.MeshBasicMaterial({ color: P.water, transparent: true, opacity: 0.45 })
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(0, 0.09, 50);
  group.add(shimmer);

  const pos = shimmer.geometry.attributes.position;
  const original = pos.array.slice() as Float32Array;

  return {
    object: group,
    update: (t: number) => {
      for (let i = 0; i < pos.count; i++) {
        const ox = original[i * 3];
        const oy = original[i * 3 + 1];
        pos.setZ(i, Math.sin(ox * 0.25 + t * 0.9) * 0.12 + Math.cos(oy * 0.5 + t * 0.6) * 0.08);
      }
      pos.needsUpdate = true;
    },
  };
}

/** Wooden viewing pier reaching out over the river at the end of the spine road. */
export function createPier(x: number): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();

  const startZ = 36.5;
  const endZ = 48;
  const width = 4.2;
  const len = endZ - startZ;
  const cz = (startZ + endZ) / 2;

  kit.box(width, 0.35, len, x, 0.28, cz, P.hanokWood);
  // Plank lines
  for (let i = 0; i < 7; i++) {
    kit.box(width, 0.06, 0.12, x, 0.48, startZ + 1 + i * 1.6, '#6a4630');
  }
  // Railings
  for (const side of [-1, 1]) {
    kit.box(0.16, 0.9, len, x + (side * width) / 2, 0.9, cz, P.hanokWood);
  }
  kit.box(width, 0.9, 0.16, x, 0.9, endZ, P.hanokWood);
  // End lanterns
  for (const side of [-1, 1]) {
    kit.boxOn(0.18, 1.6, 0.18, x + side * (width / 2 - 0.3), 0.45, endZ - 0.5, '#3a3f47');
    glow.boxOn(0.34, 0.3, 0.34, x + side * (width / 2 - 0.3), 2.05, endZ - 0.5, P.lampGlow);
  }

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  return {
    object: group,
    colliders: [
      { x: x - width / 2, z: cz, spec: { w: 0.3, h: 1.6, d: len, x: 0, y: 0.8, z: 0 } },
      { x: x + width / 2, z: cz, spec: { w: 0.3, h: 1.6, d: len, x: 0, y: 0.8, z: 0 } },
      { x, z: endZ, spec: { w: width, h: 1.6, d: 0.3, x: 0, y: 0.8, z: 0 } },
    ],
  };
}

/** A small arched pedestrian bridge over the riverside path. */
export function createFootbridge(x: number, z: number): LandmarkResult {
  const kit = new VoxelKit();
  const group = new THREE.Group();
  const len = 10;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const y = Math.sin(t * Math.PI) * 1.1;
    kit.box(1.6, 0.25, len / segs + 0.15, x, 0.4 + y, z - len / 2 + (i + 0.5) * (len / segs), P.woodLight);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = Math.sin(t * Math.PI) * 1.1;
      kit.box(0.12, 0.7, 0.12, x + side * 0.8, 0.75 + y, z - len / 2 + i * (len / segs), '#6a4630');
    }
  }
  group.add(kit.toMesh(MATERIALS.lit));
  // Decorative only — sits in the park off the walkable route.
  return { object: group, colliders: [{ x, z, spec: { w: 2, h: 2, d: len, x: 0, y: 1, z: 0 } }] };
}

/** Plaza signpost with district arms. */
export function createSignpost(x: number, z: number): LandmarkResult {
  const group = new THREE.Group();
  const kit = new VoxelKit();
  kit.boxOn(0.22, 3.4, 0.22, 0, 0, 0, P.hanokWood);
  kit.boxOn(0.5, 0.12, 0.5, 0, 0, 0, '#87817a');
  group.add(kit.toMesh(MATERIALS.lit));

  const arms: { text: string; ry: number; y: number }[] = [
    { text: '홍대 HONGDAE →', ry: Math.PI / 2, y: 2.9 },
    { text: '강남 GANGNAM →', ry: -Math.PI / 2, y: 2.5 },
    { text: '한강 RIVER →', ry: 0, y: 2.1 },
    { text: '남산 NAMSAN →', ry: Math.PI, y: 1.7 },
  ];
  for (const a of arms) {
    const sign = makeSign({
      text: a.text,
      bg: '#243247',
      fg: '#ffe9c9',
      width: 2.6,
      height: 0.44,
      glow: true,
    });
    sign.position.set(Math.sin(a.ry + Math.PI / 2) * 1.1, a.y, Math.cos(a.ry + Math.PI / 2) * 1.1);
    sign.rotation.y = a.ry + Math.PI / 2;
    group.add(sign);
  }
  group.position.set(x, 0, z);
  return {
    object: group,
    colliders: [{ x, z, spec: { w: 0.4, h: 3.4, d: 0.4, x: 0, y: 1.7, z: 0 } }],
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
