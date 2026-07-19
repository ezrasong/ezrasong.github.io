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
  // Scattered forest canopies on the slopes
  const rng = mulberry32(99);
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 5 + rng() * 9.5;
    const hh = hillHeightAt(rr, steps);
    const r = 0.65 + rng() * 0.55;
    kit.blob(r, Math.cos(a) * rr, hh + r * 0.4, Math.sin(a) * rr, rng() < 0.7 ? P.leafDark : P.leaf, 0.85);
    if (rng() < 0.4) {
      kit.blob(r * 0.6, Math.cos(a) * rr + r * 0.5, hh + r * 0.8, Math.sin(a) * rr + (rng() - 0.5) * r, '#3f6b3e', 0.8);
    }
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
    // Blocking is intentional (the hill is scenery, not walkable); the
    // cylinder collider is added by World so it matches the base radius.
    colliders: [],
    occluders: [bodyMesh],
  };
}

/** Radius of the hill's lowest step — the collider must match it exactly. */
export const NAMSAN_BASE_RADIUS = 16;

function hillHeightAt(r: number, steps: [number, number][]): number {
  let y = 0;
  for (const [radius, h] of steps) {
    if (r < radius) y += h;
  }
  return y;
}

/**
 * The Han River: a flat-shaded, vertex-displaced water surface. Three
 * overlapping wave trains travel downstream (east) and give the low-poly
 * facets moving specular glints; a foam line breathes along the bank.
 * flatShading derives normals in the shader, so per-frame CPU work is just
 * the height writes (~1.1k vertices).
 */
export function createRiver(): { object: THREE.Object3D; update: (t: number) => void } {
  const group = new THREE.Group();

  // Water spans the full map width; the river cuts the city in two,
  // z ∈ [20, 48], just like the real Han.
  const geo = new THREE.PlaneGeometry(212, 28, 84, 14);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    geo,
    new THREE.MeshPhongMaterial({
      color: '#4d84a8',
      emissive: '#12293a',
      flatShading: true,
      shininess: 45,
      specular: '#9fc8de',
    })
  );
  water.position.set(0, 0.06, 34);
  water.receiveShadow = true;
  group.add(water);

  const pos = geo.attributes.position;
  const baseX = new Float32Array(pos.count);
  const baseZ = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    baseX[i] = pos.getX(i);
    baseZ[i] = pos.getZ(i);
  }

  // Foam lines where the water meets both banks
  const foamGeo = new THREE.PlaneGeometry(206, 0.55);
  const foamMatN = new THREE.MeshBasicMaterial({ color: '#dcebf2', transparent: true, opacity: 0.5 });
  const foamMatS = foamMatN.clone();
  const foamN = new THREE.Mesh(foamGeo, foamMatN);
  foamN.rotation.x = -Math.PI / 2;
  foamN.position.set(0, 0.16, 20.55);
  const foamS = new THREE.Mesh(foamGeo, foamMatS);
  foamS.rotation.x = -Math.PI / 2;
  foamS.position.set(0, 0.16, 47.45);
  group.add(foamN, foamS);

  return {
    object: group,
    update: (t: number) => {
      for (let i = 0; i < pos.count; i++) {
        const x = baseX[i];
        const z = baseZ[i];
        // Peak amplitude ≈ 0.20 + the 0.06 water level keeps every wave
        // below the bridge decks (tops at 0.29).
        const h =
          Math.sin(x * 0.16 - t * 1.15) * 0.1 +
          Math.sin(x * 0.31 + z * 0.24 - t * 0.72) * 0.064 +
          Math.sin(z * 0.55 + t * 1.5 + x * 0.05) * 0.036;
        // Waves calm down near both banks so the foam lines stay believable.
        const shoreFade = Math.min(1, Math.max(0.12, (13.4 - Math.abs(z)) * 0.35));
        pos.setY(i, h * shoreFade);
      }
      pos.needsUpdate = true;
      foamMatN.opacity = 0.38 + Math.sin(t * 1.3) * 0.12;
      foamMatS.opacity = 0.38 + Math.sin(t * 1.3 + 1.7) * 0.12;
      foamN.position.z = 20.55 + Math.sin(t * 0.65) * 0.1;
      foamS.position.z = 47.45 - Math.sin(t * 0.65 + 0.9) * 0.1;
    },
  };
}

/**
 * A drivable Han River road bridge. Two coherent structural styles:
 *
 *  - 'arch': twin steel tied-arches with vertical hangers and cross-braced
 *    crowns, painted the pale blue of the real 한강대교 (Hangang Bridge) —
 *    the main crossing's silhouette is lifted straight from it
 *  - 'girder': a modern concrete girder bridge on tapered twin-column
 *    piers with cap beams (the quieter Yanghwa crossing)
 *
 * Both keep the same walkable layout: deck top 29cm reached over true
 * wedge ramps, chamfered deck fascia, sidewalks, railings, lamps, expansion
 * joints, and piers that reach the riverbed.
 */
export function createBridge(
  x: number,
  width: number,
  name?: string,
  z0 = 15,
  z1 = 49.5,
  style: 'arch' | 'girder' = 'girder'
): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;

  const STEEL = '#4a6e84';
  const STEEL_DARK = '#39586e';
  const CONCRETE = '#8b9099';
  const CONCRETE_DARK = '#6e747d';

  // Deck (top 0.29, above the tallest wave) + true wedge approach ramps
  // that finish on the banks — never on top of a road junction. Surface
  // colors match the painted roads so bridge and street read as one network.
  kit.box(width, 0.34, len, x, 0.12, cz, P.asphalt);
  // Chamfered fascia girders along both deck edges, hanging below the slab.
  for (const side of [-1, 1]) {
    kit.rbox(0.5, 0.62, len, x + side * (width / 2 - 0.05), -0.2, cz, CONCRETE_DARK, 0.12);
  }
  // Wedge ramps: a continuous slope from the bank up to the deck, so the
  // approach never reads as stacked slabs.
  kit.wedge(4.2, 0.29, width, x, 0, z0 - 2.05, P.asphalt, -Math.PI / 2);
  kit.wedge(4.2, 0.29, width, x, 0, z1 + 2.05, P.asphalt, Math.PI / 2);
  // Expansion joints across the deck
  for (const jz of [z0 + 0.4, cz, z1 - 0.4]) {
    kit.box(width - 1.6, 0.02, 0.14, x, 0.3, jz, '#3d434c');
  }
  // Sidewalk strips along both edges
  for (const side of [-1, 1]) {
    kit.box(1.0, 0.42, len, x + side * (width / 2 - 0.5), 0.14, cz, P.sidewalk);
  }
  // Center lane dashes + edge lines
  for (let z = z0 + 2; z < z1 - 1; z += 4) {
    kit.box(0.24, 0.04, 1.4, x, 0.31, z, P.laneMark);
  }
  for (const side of [-1, 1]) {
    kit.box(0.12, 0.03, len - 2, x + side * (width / 2 - 1.15), 0.31, cz, '#9aa0a8');
  }
  // Railings: posts, twin rails, and a mid mesh band
  for (const side of [-1, 1]) {
    const rx = x + side * (width / 2 - 0.12);
    for (let z = z0; z <= z1; z += 2.5) {
      kit.box(0.12, 1.05, 0.12, rx, 0.85, z, STEEL_DARK);
    }
    kit.box(0.09, 0.12, len, rx, 1.42, cz, STEEL);
    kit.box(0.06, 0.07, len, rx, 1.05, cz, STEEL);
    kit.box(0.06, 0.07, len, rx, 0.68, cz, STEEL);
  }
  // Lamps every 10m, alternating sides
  let lampSide = 1;
  for (let z = z0 + 5; z < z1; z += 10) {
    const lx = x + lampSide * (width / 2 - 0.12);
    kit.cylinder(0.05, 0.07, 1.6, lx, 2.15, z, '#4d5560', 6);
    kit.box(0.34, 0.1, 0.16, lx - lampSide * 0.12, 2.98, z, '#4d5560');
    glow.box(0.26, 0.12, 0.2, lx - lampSide * 0.2, 2.9, z, P.lampGlow);
    lampSide *= -1;
  }

  // Arches live in their own mesh so the follow camera can treat them as
  // view blockers without the thin hangers hijacking the occlusion ray.
  const pylonKit = new VoxelKit();
  if (style === 'arch') {
    // --- Twin steel tied-arches (Hangang Bridge pale blue), one per span.
    const ARCH = '#7fa9bc';
    const ARCH_DARK = '#6b96aa';
    const supports = [z0 + 1.2, cz, z1 - 1.2];
    const RIB_X = width / 2 - 0.35;
    const ribPoint = (za: number, zb: number, t: number): [number, number] => [
      za + t * (zb - za),
      0.32 + Math.sin(t * Math.PI) * 5.8,
    ];
    for (let spanI = 0; spanI < 2; spanI++) {
      const za = supports[spanI];
      const zb = supports[spanI + 1];
      const SEGS = 9;
      for (const side of [-1, 1]) {
        const rx = x + side * RIB_X;
        // Rib: chained bar segments approximating the arc
        for (let i = 0; i < SEGS; i++) {
          const [pz0, py0] = ribPoint(za, zb, i / SEGS);
          const [pz1, py1] = ribPoint(za, zb, (i + 1) / SEGS);
          pylonKit.bar(rx, py0, pz0, rx, py1, pz1, 0.42, side < 0 ? ARCH : ARCH_DARK);
        }
        // Vertical hangers from rib to deck edge
        for (let i = 1; i < 8; i++) {
          const [hz, hy] = ribPoint(za, zb, i / 8);
          kit.bar(rx, hy - 0.15, hz, rx, 0.32, hz, 0.07, '#dfe4ea');
        }
        // Tie beam along the deck edge between bearings
        pylonKit.box(0.34, 0.3, zb - za, rx, 0.42, (za + zb) / 2, ARCH_DARK);
      }
      // Cross-braces between the two ribs near the crown
      for (const t of [0.32, 0.5, 0.68]) {
        const [bz, by] = ribPoint(za, zb, t);
        pylonKit.box(RIB_X * 2, 0.22, 0.22, x, by, bz, ARCH_DARK);
      }
      const [crownZ, crownY] = ribPoint(za, zb, 0.5);
      glow.box(0.2, 0.2, 0.2, x, crownY + 0.24, crownZ, '#ff5d5d');
    }
    // Concrete piers under the three bearing lines, reaching the riverbed.
    for (const pz of supports) {
      kit.rbox(width - 1.6, 2.3, 1.7, x, -0.95, pz, CONCRETE_DARK, 0.16);
      kit.box(width - 1.0, 0.34, 2.1, x, -1.95, pz, '#5f656e');
      kit.box(width - 2.2, 0.35, 1.9, x, 0.06, pz, CONCRETE);
    }
  } else {
    // --- Girder piers: twin tapered columns + cap beam, reaching the bed.
    for (let z = z0 + 7; z < z1 - 4; z += 10) {
      for (const side of [-1, 1]) {
        kit.cylinder(0.5, 0.72, 2.4, x + side * (width / 2 - 1.3), -0.9, z, CONCRETE_DARK, 10);
      }
      kit.rbox(width - 0.8, 0.5, 1.5, x, 0.0, z, CONCRETE, 0.14);
      // Waterline footing
      kit.box(width - 0.6, 0.3, 1.8, x, -1.35, z, '#5f656e');
    }
  }

  group.add(kit.toMesh(MATERIALS.lit));
  const occluders: THREE.Mesh[] = [];
  if (!pylonKit.isEmpty) {
    const pylons = pylonKit.toMesh(MATERIALS.lit);
    group.add(pylons);
    occluders.push(pylons);
  }
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  // Name plaques over the sidewalk at both entries, like the real Han
  // bridges — kept between railing posts (posts sit at 5m marks from z0)
  // so nothing clips through the lettering.
  if (name) {
    const backGeo = new THREE.BoxGeometry(2.72, 0.6, 0.07);
    const backMat = new THREE.MeshLambertMaterial({ color: '#2c3644' });
    const signX = x + (width / 2 - 1.45);
    for (const [pz, ry] of [
      [z0 + 2.5, Math.PI],
      [z1 - 2.5, 0],
    ] as const) {
      // Backing board first, so the plaque reads as a solid object from
      // behind instead of a floating mirrored sticker.
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(signX, 1.3, pz + (ry === 0 ? -0.05 : 0.05));
      group.add(back);
      const sign = makeSign({
        text: name,
        bg: '#243247',
        fg: '#ffe9c9',
        width: 2.6,
        height: 0.5,
        glow: true,
      });
      sign.position.set(signX, 1.3, pz);
      sign.rotation.y = ry;
      group.add(sign);
    }
  }

  return {
    object: group,
    occluders,
    colliders: [
      // Walkable deck + graded ramp steps (the visual ramp is a smooth
      // wedge; the collider staircase stays under its surface)
      { x, z: cz, spec: { w: width, h: 0.58, d: len, x: 0, y: 0, z: 0 } },
      { x, z: z0 - 1.975, spec: { w: width, h: 0.2, d: 1.45, x: 0, y: 0, z: 0 } },
      { x, z: z0 - 0.6, spec: { w: width, h: 0.4, d: 1.3, x: 0, y: 0, z: 0 } },
      { x, z: z1 + 1.975, spec: { w: width, h: 0.2, d: 1.45, x: 0, y: 0, z: 0 } },
      { x, z: z1 + 0.6, spec: { w: width, h: 0.4, d: 1.3, x: 0, y: 0, z: 0 } },
      // Side railings keep the player out of the water
      { x: x - (width / 2 - 0.12), z: cz, spec: { w: 0.3, h: 2.6, d: len, x: 0, y: 1.15, z: 0 } },
      { x: x + (width / 2 - 0.12), z: cz, spec: { w: 0.3, h: 2.6, d: len, x: 0, y: 1.15, z: 0 } },
      // Arch rib bearings so the poro can't roll through the steel
      ...(style === 'arch'
        ? [z0 + 1.2, (z0 + z1) / 2, z1 - 1.2].flatMap((pz) => [
            { x: x - (width / 2 - 0.35), z: pz, spec: { w: 0.7, h: 1.6, d: 1.4, x: 0, y: 0.8, z: 0 } },
            { x: x + (width / 2 - 0.35), z: pz, spec: { w: 0.7, h: 1.6, d: 1.4, x: 0, y: 0.8, z: 0 } },
          ])
        : []),
    ],
  };
}

/**
 * Green Korean expressway direction gantry spanning an east-west arterial
 * near the map edge: the road visually continues toward real Seoul
 * destinations instead of dead-ending in grass. `facing` is the x-direction
 * approaching drivers come FROM (the sign faces them).
 */
export function createGantry(x: number, z: number, text: string, facing: 1 | -1): LandmarkResult {
  const kit = new VoxelKit();
  const group = new THREE.Group();
  const H = 5.2;
  for (const side of [-1, 1]) {
    kit.cylinder(0.12, 0.16, H, x, H / 2, z + side * 4.6, '#5b6068', 8);
  }
  kit.box(0.22, 0.34, 9.2, x, H - 0.17, z, '#5b6068');
  // Board core so the sign is solid from behind
  kit.box(0.14, 1.7, 6.4, x + facing * 0.05, H - 1.1, z, '#1e3b2e');
  group.add(kit.toMesh(MATERIALS.lit));

  const sign = makeSign({
    text,
    bg: '#2d6b46',
    fg: '#ffffff',
    border: '#ffffff',
    width: 6.4,
    height: 1.7,
    glow: true,
  });
  sign.position.set(x + facing * 0.14, H - 1.1, z);
  sign.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(sign);

  return {
    object: group,
    colliders: [
      { x, z: z - 4.6, spec: { w: 0.4, h: H, d: 0.4, x: 0, y: H / 2, z: 0 } },
      { x, z: z + 4.6, spec: { w: 0.4, h: H, d: 0.4, x: 0, y: H / 2, z: 0 } },
    ],
  };
}

/**
 * Bukhansan-style mountain backdrop: big flat-shaded cones past the city's
 * north edge so the horizon never reads as an empty table edge.
 */
export function createMountains(): LandmarkResult {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#3d6b40', flatShading: true });
  const matFar = new THREE.MeshLambertMaterial({ color: '#35583a', flatShading: true });
  // Farthest ridge sits in the fog and reads as atmosphere, not geometry.
  const matHaze = new THREE.MeshLambertMaterial({ color: '#42597a', flatShading: true });
  const peaks: { x: number; z: number; r: number; h: number; tier?: 1 | 2 }[] = [
    { x: -42, z: -97, r: 24, h: 18 },
    { x: 0, z: -102, r: 30, h: 23 },
    { x: 46, z: -96, r: 22, h: 15 },
    { x: 84, z: -94, r: 16, h: 11, tier: 1 },
    { x: -84, z: -95, r: 17, h: 12, tier: 1 },
    { x: -16, z: -104, r: 22, h: 26, tier: 1 },
    { x: 26, z: -104, r: 24, h: 20, tier: 1 },
    // Hazy horizon ridge behind everything (and off both back corners)
    { x: -70, z: -128, r: 40, h: 30, tier: 2 },
    { x: -8, z: -136, r: 48, h: 36, tier: 2 },
    { x: 58, z: -128, r: 42, h: 28, tier: 2 },
    { x: 118, z: -110, r: 34, h: 22, tier: 2 },
    { x: -122, z: -108, r: 36, h: 24, tier: 2 },
    // Distant hills east and west so the side horizons roll too
    { x: -150, z: -40, r: 34, h: 18, tier: 2 },
    { x: 152, z: -30, r: 36, h: 20, tier: 2 },
    { x: 158, z: 70, r: 32, h: 16, tier: 2 },
    { x: -155, z: 80, r: 34, h: 17, tier: 2 },
  ];
  for (const p of peaks) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(p.r, p.h, 7),
      p.tier === 2 ? matHaze : p.tier === 1 ? matFar : mat
    );
    cone.position.set(p.x, p.h / 2 - 0.3, p.z);
    cone.rotation.y = (p.x * 13.7) % Math.PI;
    group.add(cone);
  }
  return { object: group, colliders: [] };
}

/**
 * Dense tree belts just past the playable perimeter (west, east, south),
 * filling the gap between the streets and the backdrop building rows so
 * the map edge reads as parkland thinning into the city, not empty lawn.
 * One merged mesh; entirely decorative (behind the boundary walls).
 */
export function createForestBelts(): LandmarkResult {
  const kit = new VoxelKit();
  const rng = mulberry32(431);
  const cluster = (x: number, z: number, scale: number) => {
    const r = (0.9 + rng() * 0.9) * scale;
    kit.cylinder(0.09 * scale, 0.16 * scale, 1.3 * scale, x, 0.6 * scale, z, '#6d4c33', 5);
    kit.blob(r, x, 1.5 * scale + r * 0.4, z, rng() < 0.6 ? P.leafDark : P.leaf, 0.85);
    if (rng() < 0.5) {
      kit.blob(r * 0.62, x + r * 0.6, 1.3 * scale + r * 0.5, z + (rng() - 0.5) * r, '#4a7a45', 0.8);
    }
  };
  // West and east belts (skip the river band where the water runs out and
  // the four arterial corridors that now continue past the boundary)
  const roadBands = [-34, 8, 56, 80];
  for (const sx of [-1, 1]) {
    for (let z = -82; z < 94; z += 4.5) {
      if (z > 16 && z < 52) continue;
      if (roadBands.some((r) => Math.abs(z - r) < 5.5)) continue;
      const jitterX = sx * (91.5 + rng() * 5);
      cluster(jitterX, z + (rng() - 0.5) * 3, 0.9 + rng() * 0.7);
      if (rng() < 0.5) cluster(sx * (97 + rng() * 5), z + (rng() - 0.5) * 3, 1.0 + rng() * 0.8);
    }
  }
  // South belt behind the last Gangnam row, between the backdrop towers
  for (let x = -84; x < 86; x += 5) {
    if (rng() < 0.35) continue;
    cluster(x + (rng() - 0.5) * 3, 106 + rng() * 5, 1.0 + rng() * 0.9);
  }
  const mesh = kit.toMesh(MATERIALS.foliage, false, false);
  return { object: mesh, colliders: [] };
}

/**
 * Wooden viewing pier reaching from the north bank out over the river.
 * The deck is genuinely walkable: a low slab (top ≈ 0.22) entered over a
 * half-height step slab, with railings on both sides and across the end.
 */
export function createPier(x: number): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();

  const startZ = 20;
  const endZ = 30;
  const width = 4.2;
  const len = endZ - startZ;
  const cz = (startZ + endZ) / 2;

  // Entry step on the bank, then the deck slab (top 0.3, above the waves)
  kit.box(width - 1, 0.15, 1.6, x, 0.075, startZ - 0.7, '#6a4630');
  kit.box(width, 0.36, len, x, 0.12, cz, P.hanokWood);
  // Plank lines
  for (let i = 0; i < 6; i++) {
    kit.box(width, 0.05, 0.12, x, 0.32, startZ + 1 + i * 1.6, '#6a4630');
  }
  // Posts into the water
  for (const z of [startZ + 2, cz, endZ - 0.6]) {
    for (const side of [-1, 1]) {
      kit.box(0.26, 1.4, 0.26, x + side * (width / 2 - 0.25), -0.5, z, '#5c3d2a');
    }
  }
  // Railings
  for (const side of [-1, 1]) {
    kit.box(0.16, 0.9, len, x + (side * width) / 2, 0.75, cz, P.hanokWood);
  }
  kit.box(width, 0.9, 0.16, x, 0.75, endZ, P.hanokWood);
  // End lanterns
  for (const side of [-1, 1]) {
    kit.boxOn(0.18, 1.5, 0.18, x + side * (width / 2 - 0.3), 0.25, endZ - 0.5, '#3a3f47');
    glow.boxOn(0.34, 0.3, 0.34, x + side * (width / 2 - 0.3), 1.75, endZ - 0.5, P.lampGlow);
  }

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  return {
    object: group,
    colliders: [
      // Walkable step + deck (tops at 0.15 / 0.30)
      { x, z: startZ - 0.7, spec: { w: width - 1, h: 0.3, d: 1.6, x: 0, y: 0, z: 0 } },
      { x, z: cz, spec: { w: width, h: 0.6, d: len, x: 0, y: 0, z: 0 } },
      // Railings
      { x: x - width / 2, z: cz, spec: { w: 0.3, h: 1.6, d: len, x: 0, y: 0.8, z: 0 } },
      { x: x + width / 2, z: cz, spec: { w: 0.3, h: 1.6, d: len, x: 0, y: 0.8, z: 0 } },
      { x, z: endZ, spec: { w: width, h: 1.6, d: 0.3, x: 0, y: 0.8, z: 0 } },
    ],
  };
}

/** A small arched pedestrian bridge over the riverside jogging path. */
export function createFootbridge(x: number, z: number): LandmarkResult {
  const kit = new VoxelKit();
  const group = new THREE.Group();
  const len = 10;
  const segs = 13;
  const arcH = 0.75;
  const stepD = len / segs;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const y = Math.sin(t * Math.PI) * arcH;
    kit.box(1.7, 0.18, stepD + 0.06, x, 0.18 + y, z - len / 2 + (i + 0.5) * stepD, P.woodLight);
  }
  // Handrails: posts + a continuous top beam following the arc
  for (const side of [-1, 1]) {
    for (let i = 0; i <= segs; i += 2) {
      const t = i / segs;
      const y = Math.sin(t * Math.PI) * arcH;
      kit.box(0.1, 0.62, 0.1, x + side * 0.82, 0.55 + y, z - len / 2 + i * stepD, '#6a4630');
    }
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs;
      const y = Math.sin(t * Math.PI) * arcH;
      kit.box(0.09, 0.09, stepD + 0.12, x + side * 0.82, 0.92 + y, z - len / 2 + (i + 0.5) * stepD, '#7a5238');
    }
  }
  group.add(kit.toMesh(MATERIALS.lit));
  // Decorative only — sits in the park off the walkable route.
  return { object: group, colliders: [{ x, z, spec: { w: 2, h: 1.8, d: len, x: 0, y: 0.9, z: 0 } }] };
}

/**
 * Plaza signpost. Each arm is a solid board whose inner edge sits inside the
 * pole and whose long axis points at its destination, with readable (and
 * arrow-corrected) sign faces on both sides.
 */
export function createSignpost(x: number, z: number): LandmarkResult {
  const group = new THREE.Group();
  const kit = new VoxelKit();
  kit.boxOn(0.22, 3.4, 0.22, 0, 0, 0, P.hanokWood);
  kit.boxOn(0.5, 0.12, 0.5, 0, 0, 0, '#87817a');

  // Arm heading `a`: board long axis maps to (cos a, 0, -sin a).
  // Opposite directions share a height so the boards never overlap visually.
  const arms: { text: string; a: number; y: number }[] = [
    { text: '한옥골목 HANOK →', a: 0, y: 2.85 }, // east
    { text: '홍대 HONGDAE →', a: Math.PI, y: 2.85 }, // west
    { text: '한강 · 강남 RIVER →', a: -Math.PI / 2, y: 2.25 }, // south, across the bridge
    { text: '남산 NAMSAN →', a: Math.PI / 2, y: 2.25 }, // north
  ];
  const W = 2.4;
  const H = 0.46;
  const flipArrow = (t: string) =>
    t.endsWith('→') ? `← ${t.slice(0, -1).trim()}` : t;

  for (const arm of arms) {
    const dirX = Math.cos(arm.a);
    const dirZ = -Math.sin(arm.a);
    const cx = dirX * (W / 2 - 0.08);
    const cz = dirZ * (W / 2 - 0.08);
    // Board core (gives the sign thickness and roots it in the pole)
    kit.box(W, H, 0.14, cx, arm.y, cz, '#1a2536', arm.a);
    for (const side of [1, -1] as const) {
      const sign = makeSign({
        text: side === 1 ? arm.text : flipArrow(arm.text),
        bg: '#243247',
        fg: '#ffe9c9',
        width: W,
        height: H,
        glow: true,
      });
      const nx = Math.sin(arm.a) * 0.09 * side;
      const nz = Math.cos(arm.a) * 0.09 * side;
      sign.position.set(cx + nx, arm.y, cz + nz);
      sign.rotation.y = arm.a + (side === 1 ? 0 : Math.PI);
      group.add(sign);
    }
  }

  group.add(kit.toMesh(MATERIALS.lit));
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
