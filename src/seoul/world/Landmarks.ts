import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { MATERIALS, VoxelKit } from './voxel';
import { makeSign } from './SignTexture';
import { createRange, rangeHeight } from './Hills';
import { hanokRoof, roofRidges, type RoofOptions } from './Hanok';
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

  // Granite piers in dressed courses, with a walkable passage between.
  for (const side of [-1, 1]) {
    const px = side * (spanW / 2 - pierW / 2);
    kit.boxOn(pierW, pierH, pierD, px, 0, 0, '#a59e92');
    for (let c = 1; c < 6; c++) kit.box(pierW + 0.04, 0.05, pierD + 0.04, px, (c * pierH) / 6, 0, '#8e887d');
    kit.boxOn(pierW + 0.3, 0.3, pierD + 0.3, px, pierH, 0, '#948d82');
  }
  // Pavilion: red-lacquered posts on a stone deck, green-painted beams
  // (dancheong reduced to its two dominant colours) and a lattice band.
  const deckY = pierH + 0.3;
  kit.boxOn(spanW + 0.6, 0.35, pierD + 0.4, 0, pierH + 0.3, 0, '#8e887d');
  const postH = 2.0;
  for (let i = 0; i <= 4; i++) {
    const px = -spanW / 2 + 0.6 + i * ((spanW - 1.2) / 4);
    for (const pz of [-pierD / 2 + 0.2, pierD / 2 - 0.2]) {
      kit.cylinder(0.17, 0.19, postH, px, deckY + 0.35 + postH / 2, pz, '#9b3a2c', 10);
    }
  }
  const beamY = deckY + 0.35 + postH;
  kit.box(spanW + 0.2, 0.32, pierD + 0.2, 0, beamY - 0.16, 0, '#3f6b5a');
  kit.box(spanW + 0.4, 0.16, pierD + 0.4, 0, beamY + 0.08, 0, '#2f5547');
  kit.boxOn(spanW - 1, 1.0, pierD - 0.8, 0, deckY + 0.35, 0, '#d9cfb8');
  for (let i = 0; i < 14; i++) {
    kit.box(0.05, 0.9, 0.06, -spanW / 2 + 1 + i * ((spanW - 2) / 13), deckY + 0.85, pierD / 2 - 0.39, '#7a3227');
  }
  // Two-tier curved roof: a skirt roof over the passage, the main hip-and-
  // gable roof on top (the Gwanghwamun silhouette at diorama scale).
  const skirt = hanokRoof({ len: spanW + 3.2, depth: pierD + 3.0, rise: 1.4, lift: 0.5, tMax: 0.5, pitch: 0.36 });
  skirt.translate(0, pierH - 0.05, 0);
  kit.add(skirt);
  const main: RoofOptions = { len: spanW + 2.4, depth: pierD + 2.6, rise: 2.3, lift: 0.6, gableAt: 0.58, pitch: 0.36 };
  const mainGeo = hanokRoof(main);
  mainGeo.translate(0, beamY + 0.12, 0);
  kit.add(mainGeo);
  roofRidges(kit, main, 0, beamY + 0.12, 0);
  // Warm lanterns inside the arch
  glow.box(0.35, 0.5, 0.35, -spanW / 2 + pierW + 0.4, 2.8, 0, P.lampGlow);
  glow.box(0.35, 0.5, 0.35, spanW / 2 - pierW - 0.4, 2.8, 0, P.lampGlow);

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  // Name boards on both faces
  for (const side of [1, -1]) {
    const sign = makeSign({
      text: 'EZRA SONG',
      subtext: '송에즈라 · SOFTWARE ENGINEER',
      bg: '#2a2a2c',
      fg: '#e8c675',
      border: '#3f6b5a',
      width: 5.6,
      height: 1.0,
      glow: true,
    });
    // Hung on the outer face of the front posts so no post crosses it.
    sign.position.set(0, deckY + 0.95, side * (pierD / 2 + 0.06));
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

/**
 * Namsan: a rounded forested hill (no terraces; the real one is a soft
 * wooded dome) with clustered tree crowns over its slopes, the summit
 * plaza, and N Seoul Tower: tapered concrete shaft, the drum-shaped
 * observation deck, and the antenna mast.
 */
export function createNamsan(x: number, z: number): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const R = NAMSAN_BASE_RADIUS;
  const H = 13;

  // Dome terrain with a gentle noisy surface
  const hillOpts = { x: 0, z: 0, hx: R + 0.6, hz: R + 0.6, height: H * 0.7, rock: 0, seed: 4.2, res: 40 };
  const summit = rangeHeight(hillOpts, 0, 0);
  // Grade a small summit terrace into the hillside before placing the
  // plaza. Share this surface with the forest and foundation placement.
  const ground = (px: number, pz: number) => {
    const blend = THREE.MathUtils.smoothstep(Math.hypot(px, pz), 4.5, 10.5);
    return THREE.MathUtils.lerp(summit, rangeHeight(hillOpts, px, pz), blend);
  };
  const hill = createRange(hillOpts);
  const vertices = hill.attributes.position;
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, ground(vertices.getX(i), vertices.getZ(i)));
  hill.computeVertexNormals();
  kit.add(hill);
  // Sink crowns into the surface: a clump floating above a hollow in the
  // noise read as a stray ball hanging in the air.
  // Forest cover: tree clumps following the dome surface
  const rng = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const ang = rng() * Math.PI * 2;
    const rr = 4.8 + Math.sqrt(rng()) * (R - 5.8);
    const tx = Math.cos(ang) * rr;
    const tz = Math.sin(ang) * rr;
    const r = 0.7 + rng() * 0.6;
    const hh = Math.min(ground(tx, tz), ground(tx + r * 0.7, tz), ground(tx - r * 0.7, tz), ground(tx, tz + r * 0.7), ground(tx, tz - r * 0.7));
    const tone = rng();
    kit.blob(r, tx, hh + r * 0.25, tz, tone < 0.5 ? '#3f6a3d' : tone < 0.8 ? '#4a7745' : '#56824c', 0.75, 1);
  }
  // Summit plaza and the tower
  const top = ground(0, 0) - 0.1;
  // The foundation embeds 0.6 m into the graded terrace and supports the
  // plaza 0.3 m above it, with no exposed gap on the downhill side.
  const foundationBase = summit - 0.6;
  const plazaTop = summit + 0.3;
  kit.cylinder(3.0, 3.4, plazaTop - foundationBase, 0, (plazaTop + foundationBase) / 2, 0, '#a8a397', 32);
  kit.cylinder(1.3, 1.7, 2.4, 0, top + 1.6, 0, '#c4c6c8', 12);
  kit.cylinder(0.55, 0.85, 9, 0, top + 7.3, 0, '#e2e3e1', 12);
  // Observation deck: stacked drums, the lower one glazed
  kit.cylinder(1.9, 1.5, 0.7, 0, top + 11.9, 0, '#d9dbdc', 16);
  glow.cylinder(2.0, 2.0, 0.55, 0, top + 12.5, 0, '#cfe3ef', 16);
  kit.cylinder(2.1, 2.0, 0.5, 0, top + 13.0, 0, '#e8e9e8', 16);
  kit.cylinder(1.4, 1.9, 0.6, 0, top + 13.55, 0, '#cfd2d4', 16);
  // Antenna mast with its red and white bands
  for (let i = 0; i < 5; i++) {
    kit.cylinder(0.24 - i * 0.03, 0.27 - i * 0.03, 0.9, 0, top + 14.3 + i * 0.9, 0, i % 2 ? '#e8e9e8' : '#c4483a', 8);
  }
  glow.box(0.22, 0.22, 0.22, 0, top + 18.9, 0, '#ff5d5d');

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

/** Radius of Namsan's footprint; the collider must match it. */
export const NAMSAN_BASE_RADIUS = 16;

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
  z1 = 49,
  style: 'arch' | 'girder' = 'girder'
): LandmarkResult {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  // The north/south crosswalks end at 13.5 and start at 50.5.
  // Keep both the visible slopes and their colliders between them.
  const rampLength = 1.4;

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
  kit.wedge(rampLength, 0.29, width, x, 0, z0 - rampLength / 2 + 0.025, P.asphalt, -Math.PI / 2);
  kit.wedge(rampLength, 0.29, width, x, 0, z1 + rampLength / 2 - 0.025, P.asphalt, Math.PI / 2);
  // Expansion joints across the deck
  for (const jz of [z0 + 0.4, cz, z1 - 0.4]) {
    kit.box(width - 1.6, 0.02, 0.14, x, 0.3, jz, '#3d434c');
  }
  // Sidewalk strips along both edges
  for (const side of [-1, 1]) {
    kit.box(1.0, 0.42, len, x + side * (width / 2 - 0.5), 0.14, cz, P.sidewalk);
  }
  // Markings match the street scheme: solid yellow center line separating
  // directions, white edge lines outside the lanes.
  kit.box(0.14, 0.04, len - 1.2, x, 0.31, cz, '#d9a93c');
  for (const side of [-1, 1]) {
    kit.box(0.12, 0.03, len - 2, x + side * (width / 2 - 1.15), 0.31, cz, '#dcdad2');
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
      ...[-1, 1].flatMap((side) => [
        { x, z: (side < 0 ? z0 : z1) + side * rampLength * 0.75, spec: { w: width, h: 0.2, d: rampLength / 2, x: 0, y: 0, z: 0 } },
        { x, z: (side < 0 ? z0 : z1) + side * rampLength * 0.25, spec: { w: width, h: 0.4, d: rampLength / 2, x: 0, y: 0, z: 0 } },
      ]),
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
 * The mountain bowl around the city: Bukhansan's granite ridges to the
 * north (rock showing through the forest on the crests), lower forested
 * ranges east and west, and a hazy far ridge in the fog. Real terrain
 * meshes, not cones.
 */
export function createMountains(): LandmarkResult {
  const group = new THREE.Group();
  const near = new VoxelKit();
  const far = new VoxelKit();
  // Bukhansan: rocky, the tallest, behind Namsan
  near.add(createRange({ x: -8, z: -112, hx: 70, hz: 24, height: 30, rock: 0.8, seed: 1.3, res: 56 }));
  near.add(createRange({ x: 62, z: -104, hx: 40, hz: 18, height: 18, rock: 0.55, seed: 2.7 }));
  near.add(createRange({ x: -78, z: -102, hx: 38, hz: 18, height: 17, rock: 0.5, seed: 3.9 }));
  // East and west flanks
  near.add(createRange({ x: 148, z: -30, hx: 30, hz: 60, height: 20, rock: 0.3, seed: 5.1 }));
  near.add(createRange({ x: -150, z: -20, hx: 30, hz: 60, height: 19, rock: 0.3, seed: 6.4 }));
  near.add(createRange({ x: 150, z: 80, hx: 30, hz: 45, height: 15, rock: 0.2, seed: 7.2 }));
  near.add(createRange({ x: -152, z: 85, hx: 30, hz: 45, height: 14, rock: 0.2, seed: 8.6 }));
  // Far haze ridge
  far.add(createRange({ x: 0, z: -150, hx: 170, hz: 22, height: 40, rock: 0.7, seed: 9.9, res: 60, forest: '#4f6782', forestDark: '#4a6079', granite: '#7d8ba0' }));
  group.add(near.toMesh(MATERIALS.lit, false, true));
  const haze = far.toMesh(MATERIALS.lit, false, false);
  group.add(haze);
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

  // Arm heading `a`: board long axis maps to (cos a, 0, -sin a). Every arm
  // gets its own height and every board's inner edge sits clear of the
  // pole, so no two boards can ever interpenetrate.
  const arms: { text: string; a: number; y: number }[] = [
    { text: '한옥골목 HANOK →', a: 0, y: 3.0 }, // east
    { text: '홍대 HONGDAE →', a: Math.PI, y: 2.55 }, // west
    { text: '한강 · 강남 RIVER →', a: -Math.PI / 2, y: 2.1 }, // south, across the bridge
    { text: '남산 NAMSAN →', a: Math.PI / 2, y: 1.65 }, // north
  ];
  const W = 2.4;
  const H = 0.46;
  const flipArrow = (t: string) =>
    t.endsWith('→') ? `← ${t.slice(0, -1).trim()}` : t;

  for (const arm of arms) {
    const dirX = Math.cos(arm.a);
    const dirZ = -Math.sin(arm.a);
    const cx = dirX * (W / 2 + 0.16);
    const cz = dirZ * (W / 2 + 0.16);
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
