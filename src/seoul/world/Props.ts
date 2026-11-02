import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { MATERIALS, VoxelKit, shade } from './voxel';
import { addWindSway, celMaterial } from './CelShading';
import type { ColliderSpec } from './VoxelBuilding';
import { ROADS } from './GroundPainter';

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

  // Seoul's real street-tree mix: ginkgo lines the arterials (narrow,
  // upright, layered tiers), zelkova shades parks and squares (short trunk,
  // vase of limbs, broad crown), pine stands on Namsan and in the hanok
  // quarter, and cherry blooms along the river. Crowns are built from
  // several small low-poly clumps on visible limbs, never one ball on a stick.
  const families = {
    street: {
      // Ginkgo (은행나무)
      trunk: (k: VoxelKit) => {
        k.cylinder(0.08, 0.15, 3.0, 0, 1.5, 0, '#5e4a3a', 6);
        for (const [y, a, l] of [[1.4, 0.4, 0.55], [1.9, 2.5, 0.5], [2.4, 4.4, 0.45], [2.8, 1.3, 0.35]] as const) {
          k.bar(0, y, 0, Math.cos(a) * l, y + 0.45, Math.sin(a) * l, 0.06, '#5e4a3a');
        }
      },
      canopy: (k: VoxelKit) => {
        const tiers: [number, number, number][] = [[1.65, 0.62, 0.9], [2.25, 0.56, 0.8], [2.85, 0.46, 0.7], [3.35, 0.32, 0.6]];
        tiers.forEach(([y, r, sq], i) => {
          for (let j = 0; j < 3; j++) {
            const ang = j * 2.1 + i * 0.9;
            k.blob(r * 0.72, Math.cos(ang) * r * 0.45, y, Math.sin(ang) * r * 0.45, j === 0 ? '#6e9a4c' : '#5f8a43', sq, 1);
          }
        });
        k.blob(0.22, 0, 3.7, 0, '#7aa555', 1.1, 1);
      },
    },
    riverside: {
      // Zelkova (느티나무)
      trunk: (k: VoxelKit) => {
        k.cylinder(0.14, 0.24, 1.3, 0, 0.65, 0, '#6a5444', 7);
        for (const a of [0.3, 1.9, 3.4, 4.9]) {
          k.bar(0, 1.15, 0, Math.cos(a) * 0.95, 2.3, Math.sin(a) * 0.95, 0.09, '#6a5444');
        }
      },
      canopy: (k: VoxelKit) => {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rr = i % 2 ? 1.05 : 0.85;
          k.blob(0.62, Math.cos(a) * rr, 2.45 + (i % 3) * 0.12, Math.sin(a) * rr, i % 2 ? '#4f7a3f' : '#5a8746', 0.62, 1);
        }
        k.blob(0.8, 0, 2.85, 0, '#628f4b', 0.55, 1);
      },
    },
    blossom: {
      // Cherry (벚나무): low spreading limbs, pale crown
      trunk: (k: VoxelKit) => {
        k.cylinder(0.09, 0.16, 1.1, 0, 0.55, 0, '#5a3f34', 7);
        k.bar(0, 0.9, 0, 0.7, 1.5, 0.3, 0.07, '#5a3f34');
        k.bar(0, 1.0, 0, -0.6, 1.6, -0.35, 0.07, '#5a3f34');
        k.bar(0, 1.05, 0, 0.1, 1.75, -0.7, 0.06, '#5a3f34');
      },
      canopy: (k: VoxelKit) => {
        for (const [x, y, z, r, c] of [
          [0.7, 1.7, 0.3, 0.55, '#f0c9d6'], [-0.6, 1.8, -0.35, 0.55, '#e9b8c9'], [0.1, 1.95, -0.7, 0.5, '#f4d6df'],
          [0, 2.15, 0.05, 0.6, '#efc3d2'], [-0.2, 1.75, 0.55, 0.45, '#e4aec2'],
        ] as const) k.blob(r, x, y, z, c, 0.7, 1);
      },
    },
  } as const;

  // Family assignment: explicit kind wins; zelkova (riverside family) in
  // the river parks, with a deterministic ~14% cherry sprinkle elsewhere.
  const assigned = positions.map((p, i) => {
    if (p.kind) return p.kind;
    if ((p.z > 11 && p.z < 20) || (p.z > 48 && p.z < 54)) return i % 4 === 0 ? 'blossom' : 'riverside';
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
      const s = p.s ?? 0.95 + ((idx * 37) % 10) / 25;
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
    canopy.receiveShadow = true;
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

/**
 * Seoul road lighting: a tapered grey octagonal pole on a base collar, a
 * slim upswept arm, and a flat LED head over the road, with a district
 * banner on brackets halfway up. One model, instanced (two draw calls).
 */
export function createStreetlights(positions: { x: number; z: number; ry?: number }[]): PropResult {
  const group = new THREE.Group();
  const POLE = '#7d838a';
  const k = new VoxelKit();
  k.cylinder(0.16, 0.18, 0.5, 0, 0.25, 0, '#6a7077', 8);
  k.cylinder(0.065, 0.11, 5.6, 0, 3.0, 0, POLE, 8);
  // Arm: a short rise, then a long gently climbing reach
  k.bar(0, 5.6, 0, 0.35, 5.95, 0, 0.08, POLE);
  k.bar(0.35, 5.95, 0, 1.75, 6.15, 0, 0.07, POLE);
  k.box(0.85, 0.1, 0.3, 1.85, 6.12, 0, '#4a5058');
  // Banner brackets and a district banner
  k.box(0.6, 0.04, 0.04, 0.3, 4.4, 0, POLE);
  k.box(0.6, 0.04, 0.04, 0.3, 3.3, 0, POLE);
  k.box(0.5, 1.05, 0.02, 0.33, 3.85, 0, '#2f6fb0');
  k.box(0.5, 0.2, 0.025, 0.33, 4.15, 0, '#f2efe6');
  const pole = new THREE.InstancedMesh(k.merge(), MATERIALS.litMetal, positions.length);
  const headGeo = new THREE.BoxGeometry(0.72, 0.03, 0.22);
  headGeo.translate(1.85, 6.06, 0);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: '#f4f0e2' }), positions.length);
  positions.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.y = p.ry ?? 0;
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pole.setMatrixAt(i, dummy.matrix);
    head.setMatrixAt(i, dummy.matrix);
  });
  pole.castShadow = true;
  pole.receiveShadow = true;
  group.add(pole, head);

  return {
    object: group,
    colliders: positions.map((p) => ({
      x: p.x,
      z: p.z,
      spec: { w: 0.35, h: 4, d: 0.35, x: 0, y: 2, z: 0 },
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

  // Seoul bus shelter: steel frame, a glass roof, a glass back with the
  // route map panel, the arrival display (BIS) under the roof, and a
  // bench. Opening faces local +z.
  for (const sh of spec.shelters) {
    const cos = Math.cos(sh.ry);
    const sin = Math.sin(sh.ry);
    const at = (lx: number, lz: number): [number, number] => [sh.x + lx * cos + lz * sin, sh.z - lx * sin + lz * cos];
    const STEEL = '#4f565e';
    for (const px of [-1.7, 0, 1.7]) {
      const [wx, wz] = at(px, -0.55);
      kit.boxOn(0.1, 2.5, 0.1, wx, 0, wz, STEEL);
    }
    const [rx, rz] = at(0, 0.05);
    kit.box(3.8, 0.08, 1.6, rx, 2.52, rz, '#8aa3b2', sh.ry);
    const [fx, fz] = at(0, 0.82);
    kit.box(3.8, 0.18, 0.06, fx, 2.46, fz, STEEL, sh.ry);
    const [bx, bz] = at(-0.4, -0.56);
    kit.box(2.4, 1.7, 0.03, bx, 1.3, bz, '#7f97a6', sh.ry);
    kit.box(2.4, 0.05, 0.05, bx, 1.0, bz, '#4f565e', sh.ry);
    // Route map panel with the coloured route lines
    const [mx, mz] = at(1.05, -0.55);
    kit.box(1.1, 1.75, 0.06, mx, 1.3, mz, '#e9ebec', sh.ry);
    const [m2x, m2z] = at(1.05, -0.51);
    kit.box(0.95, 0.12, 0.02, m2x, 1.95, m2z, '#2f62b8', sh.ry);
    const routes = ['#2f62b8', '#3aa64a', '#d9472b', '#2f62b8', '#f2a900'];
    routes.forEach((rc, i) => {
      const [lx, lz] = at(0.7 + i * 0.17, -0.51);
      kit.box(0.04, 1.2, 0.02, lx, 1.2, lz, rc, sh.ry);
    });
    // Arrival display hanging under the roof edge
    const [dx, dz] = at(-0.5, 0.25);
    kit.box(1.0, 0.3, 0.1, dx, 2.22, dz, '#1d2026', sh.ry);
    const [d2x, d2z] = at(-0.5, 0.31);
    glow.box(0.9, 0.2, 0.02, d2x, 2.22, d2z, '#ff9b3a', sh.ry);
    const [sx2, sz2] = at(-0.4, -0.25);
    kit.box(2.2, 0.08, 0.42, sx2, 0.5, sz2, '#b88a5c', sh.ry);
    for (const bxo of [-1.2, 0.4]) {
      const [lx, lz] = at(bxo, -0.25);
      kit.box(0.06, 0.48, 0.38, lx, 0.25, lz, STEEL, sh.ry);
    }
    glow.box(3.2, 0.03, 0.12, rx, 2.45, rz, P.lampGlow, sh.ry);
    colliders.push({ x: sh.x, z: sh.z, spec: { w: 3.8, h: 2.6, d: 1.5, x: 0, y: 1.3, z: 0 } });
  }

  // Pojangmacha: an orange tarp tent on a pipe frame over a steel counter
  // cart, a hanging bulb, plastic stools and a menu board.
  for (const ct of spec.carts) {
    const cos = Math.cos(ct.ry);
    const sin = Math.sin(ct.ry);
    const at = (lx: number, lz: number): [number, number] => [ct.x + lx * cos + lz * sin, ct.z - lx * sin + lz * cos];
    const TARP = '#e0702c';
    kit.box(1.9, 0.8, 0.9, ct.x, 0.55, ct.z, '#a9aeb3', ct.ry);
    kit.box(2.0, 0.07, 1.0, ct.x, 0.98, ct.z, '#9b7650', ct.ry);
    for (const side of [-0.6, 0.6]) {
      const [wx, wz] = at(side, 0.47);
      kit.cylinder(0.17, 0.17, 0.08, wx, 0.17, wz, '#22252c', 10);
    }
    // Food trays on the counter: tteokbokki red, fish-cake broth, skewers
    const [t1x, t1z] = at(-0.45, 0);
    kit.box(0.6, 0.08, 0.5, t1x, 1.06, t1z, '#c63a2a', ct.ry);
    const [t2x, t2z] = at(0.35, 0);
    kit.box(0.6, 0.08, 0.5, t2x, 1.06, t2z, '#d9c08a', ct.ry);
    for (let i = 0; i < 4; i++) {
      const [sx3, sz3] = at(0.15 + i * 0.13, -0.1);
      kit.box(0.02, 0.32, 0.02, sx3, 1.24, sz3, '#c9a77a');
    }
    for (const [lx, lz] of [[-1.3, -1.0], [1.3, -1.0], [-1.3, 1.6], [1.3, 1.6]]) {
      const [px, pz] = at(lx, lz);
      kit.boxOn(0.05, 2.2, 0.05, px, 0, pz, '#6a7078');
    }
    const [rx, rz] = at(0, 0.3);
    kit.prism(2.9, 0.5, 2.9, rx, 2.2, rz, TARP, ct.ry + Math.PI / 2);
    for (const side of [-1, 1]) {
      const [wx, wz] = at(side * 1.32, 0.3);
      kit.box(0.03, 1.1, 2.6, wx, 1.65, wz, shade(TARP, 0.9), ct.ry);
    }
    const [bwx, bwz] = at(0, -1.02);
    kit.box(2.6, 1.6, 0.03, bwx, 1.4, bwz, shade(TARP, 0.85), ct.ry);
    // Clear plastic flap rolled up over the front, red menu board inside
    const [flx, flz] = at(0, 1.62);
    kit.cylinderX(0.08, 2.6, flx, 2.12, flz, '#cfd6d8', 8, ct.ry);
    const [mbx, mbz] = at(0.9, -0.98);
    kit.box(0.6, 0.45, 0.02, mbx, 1.7, mbz, '#b8322a', ct.ry);
    glow.box(0.16, 0.2, 0.16, rx, 2.02, rz, '#ffd38a', ct.ry);
    for (const [lx, lz] of [[-0.7, 1.0], [0, 1.15], [0.7, 1.0]]) {
      const [sx4, sz4] = at(lx, lz);
      kit.cylinder(0.17, 0.2, 0.42, sx4, 0.21, sz4, '#2f6fb0', 8);
    }
    colliders.push({ x: ct.x, z: ct.z, spec: { w: 2.8, h: 2.4, d: 2.8, x: 0, y: 1.2, z: 0 } });
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
  group.add(kit.toMesh(MATERIALS.litMetal));
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
  /** Full glass curtain wall in this tint (Yeouido and Teheran-ro towers). */
  glass?: string;
  /** Street side; omitted = whichever face is closest to a road. */
  face?: Face;
}

type Face = 'n' | 's' | 'e' | 'w';

/** Yaw that turns local +z (the modelled street face) toward `face`. */
function faceYaw(face: Face): number {
  return face === 's' ? 0 : face === 'n' ? Math.PI : face === 'e' ? Math.PI / 2 : -Math.PI / 2;
}

/** The face of a footprint that sits closest to a road edge. */
function nearestStreetFace(f: { x: number; z: number; w: number; d: number }): Face {
  let best: Face = 's';
  let bestD = Infinity;
  for (const [x, z, w, d] of ROADS) {
    const overlapX = Math.min(f.x + f.w / 2, x + w / 2) - Math.max(f.x - f.w / 2, x - w / 2);
    const overlapZ = Math.min(f.z + f.d / 2, z + d / 2) - Math.max(f.z - f.d / 2, z - d / 2);
    const cand: [Face, number, number][] = [
      ['s', z - d / 2 - (f.z + f.d / 2), overlapX],
      ['n', f.z - f.d / 2 - (z + d / 2), overlapX],
      ['e', x - w / 2 - (f.x + f.w / 2), overlapZ],
      ['w', f.x - f.w / 2 - (x + w / 2), overlapZ],
    ];
    for (const [face, gap, overlap] of cand) {
      if (gap >= -0.5 && overlap > 1 && gap < bestD) {
        bestD = gap;
        best = face;
      }
    }
  }
  return best;
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
  /** Tall narrow sign: uses the vertical-text atlas rows. */
  vertical?: boolean;
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
  const cityKit = new VoxelKit();
  const cityGlow = new VoxelKit();
  const cityGlass = new VoxelKit();
  const rng = mulberry32(1234);
  const floorH = 2.5;
  const PANE_DARK = '#454e5f';
  const signSpots: SignSpot[] = [];

  for (const spec of specs) {
    // Each block is modelled in local space with its street face on +z,
    // then rotated to face whichever street it actually fronts.
    const yaw = faceYaw(spec.face ?? nearestStreetFace(spec));
    const across = Math.abs(Math.sin(yaw)) > 0.5;
    const f = { ...spec, x: 0, z: 0, w: across ? spec.d : spec.w, d: across ? spec.w : spec.d };
    const kit = new VoxelKit();
    const glow = new VoxelKit();
    const spots: SignSpot[] = [];
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
      // Shopfront: glazing split by mullions, a door bay, and a dark kick plate.
      const sfW = f.w * 0.74;
      const sfZ = f.z + f.d / 2;
      const sfC = rng() < 0.6 ? P.windowWarm : P.neonCyan;
      kit.box(sfW + 0.12, floorH * 0.58, 0.05, f.x, floorH * 0.4, sfZ + 0.02, '#23262b');
      glow.box(sfW - 0.08, floorH * 0.5, 0.02, f.x, floorH * 0.42, sfZ + 0.05, sfC);
      const bays = Math.max(2, Math.round(sfW / 1.3));
      for (let m = 1; m < bays; m++) {
        kit.box(0.06, floorH * 0.52, 0.04, f.x - sfW / 2 + (sfW / bays) * m, floorH * 0.42, sfZ + 0.07, '#23262b');
      }
      kit.box(sfW, 0.28, 0.06, f.x, 0.14, sfZ + 0.04, '#2d3035');
      // Full-width Korean sign band above the shopfront (text via atlas)
      const bandC = ['#b04b50', '#3f6f5a', '#31517c', '#7a4a3a'][Math.floor(rng() * 4)];
      kit.box(f.w * 0.88, 0.85, 0.16, f.x, floorH * 0.82 + 0.42, f.z + f.d / 2 + 0.1, bandC);
      spots.push({
        x: f.x,
        y: floorH * 0.82 + 0.42,
        z: f.z + f.d / 2 + 0.22,
        w: Math.min(f.w * 0.84, 7),
        h: 0.78,
        ry: 0,
      });
      // Seoul shophouses stack a second business per floor: a sign band
      // across the upper floors too (학원, 치과, 노래방 on the 2nd and 3rd).
      for (let fl = 1; fl < Math.min(f.floors, 3); fl++) {
        if (rng() > 0.55) continue;
        const y = fl * floorH + 0.22;
        const bw = f.w * (0.5 + rng() * 0.3);
        const bx = f.x + (rng() - 0.5) * (f.w - bw) * 0.8;
        kit.box(bw + 0.08, 0.5, 0.12, bx, y, f.z + f.d / 2 + 0.08, '#2a2d33');
        spots.push({ x: bx, y, z: f.z + f.d / 2 + 0.15, w: bw, h: 0.44, ry: 0 });
      }
      // Projecting vertical sign (돌출간판) on the corner, perpendicular to
      // the facade so it reads down the street. Atlas text runs vertically.
      if (!lowRise && rng() < 0.7) {
        const sx = f.x + f.w / 2 - 0.5;
        const sz = f.z + f.d / 2 + 0.55;
        const vh = Math.min(3.4, (f.floors - 1) * floorH - 0.4);
        kit.box(0.5, 0.08, 0.7, sx, floorH + 0.6 + vh + 0.04, sz - 0.2, '#3a3d43');
        kit.box(0.5, 0.08, 0.7, sx, floorH + 0.6, sz - 0.2, '#3a3d43');
        kit.box(0.16, vh, 0.62, sx, floorH + 0.6 + vh / 2, sz, '#1d2026');
        for (const side of [1, -1]) {
          spots.push({ x: sx + side * 0.09, y: floorH + 0.6 + vh / 2, z: sz, w: 0.56, h: vh - 0.1, ry: side * (Math.PI / 2), vertical: true });
        }
      }
    }

    const chance = f.windowChance ?? 0.6;
    if (f.glass) {
      // Curtain wall: the body is the glass; thin aluminium mullions every
      // 1.5 m and a transom per floor, with a few lit panels behind it.
      const gh = bodyH - floorH;
      // The panes are their own material (glass profile: fresnel, no
      // masonry joints) so the tower doesn't read as tinted brick.
      const pane = new VoxelKit();
      pane.box(f.w + 0.02, gh, f.d + 0.02, f.x, floorH + gh / 2, f.z, f.glass);
      cityGlass.absorb(pane, new THREE.Matrix4().makeRotationY(yaw).setPosition(spec.x, 0, spec.z));
      const MUL = shade(f.glass, 1.35);
      for (const [len, isX] of [[f.w, true], [f.d, false]] as const) {
        const n = Math.max(2, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (i * len) / n;
          for (const sgn of [1, -1]) {
            if (isX) kit.box(0.06, gh, 0.06, f.x + t, floorH + gh / 2, f.z + sgn * (f.d / 2 + 0.03), MUL);
            else kit.box(0.06, gh, 0.06, f.x + sgn * (f.w / 2 + 0.03), floorH + gh / 2, f.z + t, MUL);
          }
        }
      }
      for (let fl = 1; fl < f.floors - (setback ? 1 : 0); fl++) {
        kit.box(f.w + 0.08, 0.08, f.d + 0.08, f.x, fl * floorH, f.z, MUL);
        for (const sgn of [1, -1]) {
          for (let i = 0; i < Math.round(f.w / 1.5); i++) {
            if (rng() > chance * 0.45) continue;
            const t = -f.w / 2 + (i + 0.5) * (f.w / Math.round(f.w / 1.5));
            glow.box(1.3, floorH - 0.5, 0.02, f.x + t, fl * floorH + floorH / 2, f.z + sgn * (f.d / 2 + 0.015), f.window);
          }
        }
      }
    }
    if (f.glass) {
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(spec.x, 0, spec.z);
      cityKit.absorb(kit, m);
      cityGlow.absorb(glow, m);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      for (const p of spots) signSpots.push({ ...p, x: spec.x + p.x * c + p.z * sn, z: spec.z - p.x * sn + p.z * c, ry: p.ry + yaw });
      continue;
    }
    // Each block gets one facade system, so the street reads as different
    // buildings by different builders rather than one tiled grid:
    //  - villa: paired windows with a shared sill (brick 빌라 walk-ups)
    //  - ribbon: continuous glazing strips between spandrels (offices)
    //  - punched: single tall windows on a wide rhythm (older concrete)
    const kind = lowRise ? 'villa' : f.floors >= 7 ? 'ribbon' : rng() < 0.5 ? 'villa' : 'punched';
    const pitch = kind === 'villa' ? 2.4 : kind === 'punched' ? 1.9 : 1.6;
    const winW = kind === 'villa' ? 0.7 : kind === 'punched' ? 0.82 : 1.42;
    const winH = kind === 'ribbon' ? 1.25 : kind === 'punched' ? 1.3 : 1.05;
    const cols = Math.max(1, Math.floor((f.w - 1) / pitch));
    const start = -((cols - 1) * pitch) / 2;
    const colsD = Math.max(1, Math.floor((f.d - 1) / pitch));
    const startD = -((colsD - 1) * pitch) / 2;
    const balconyFloors = !lowRise && f.w >= 9 && kind !== 'ribbon' && rng() < 0.45;
    const sillC = shade(f.wall, 0.7);
    // Unlit panes vary the way real glass does: curtains drawn, blinds,
    // reflections. One flat tone across a tower reads as a texture.
    const DARKS = [PANE_DARK, '#3c4352', '#4d5463', '#5a5650', '#3f4a52'];
    const pane = (lit: boolean): string => (lit ? (rng() < 0.8 ? f.window : '#5b667a') : DARKS[Math.floor(rng() * DARKS.length)]);

    /** One opening on a face. `n` is the face normal (x or z), `t` the offset along it. */
    const opening = (axis: 'x' | 'z', a: number, faceAt: number, sign: number, y: number, lit: boolean): void => {
      const out = (o: number): number => faceAt + sign * o;
      const sub = kind === 'villa' ? [-0.4, 0.4] : [0];
      for (const dx of sub) {
        const c = a + dx;
        if (axis === 'z') {
          kit.box(winW + 0.08, winH + 0.08, 0.05, c, y, out(0.025), frameC);
          kit.box(winW - 0.06, winH - 0.06, 0.04, c, y, out(0.03), '#1e2229');
          (lit ? glow : kit).box(winW - 0.12, winH - 0.12, 0.02, c, y, out(0.045), pane(lit));
          if (kind !== 'ribbon') kit.box(0.04, winH - 0.1, 0.03, c, y, out(0.055), frameC);
        } else {
          kit.box(0.05, winH + 0.08, winW + 0.08, out(0.025), y, c, frameC);
          kit.box(0.04, winH - 0.06, winW - 0.06, out(0.03), y, c, '#1e2229');
          (lit ? glow : kit).box(0.02, winH - 0.12, winW - 0.12, out(0.045), y, c, pane(lit));
          if (kind !== 'ribbon') kit.box(0.03, winH - 0.1, 0.04, out(0.055), y, c, frameC);
        }
      }
      const sillW = kind === 'villa' ? 1.7 : winW + 0.2;
      if (axis === 'z') kit.box(sillW, 0.07, 0.16, a, y - winH / 2 - 0.04, out(0.08), sillC);
      else kit.box(0.16, 0.07, sillW, out(0.08), y - winH / 2 - 0.04, a, sillC);
    };

    for (let fl = 0; fl < f.floors; fl++) {
      if (setback && fl >= f.floors - 1) break;
      const y = fl * floorH + floorH * 0.55;
      // Ribbon offices: a dark spandrel band ties each floor's glazing.
      if (kind === 'ribbon' && fl > 0) {
        for (const sign of [1, -1]) {
          kit.box(f.w - 0.5, winH + 0.2, 0.04, f.x, y, f.z + (f.d / 2 + 0.01) * sign, shade(f.wall, 0.55));
        }
      }
      for (let c = 0; c < cols; c++) {
        const wx = f.x + start + c * pitch;
        for (const sign of [1, -1]) {
          if (fl === 0 && sign === 1 && shopBand) continue;
          const lit = rng() < chance && rng() < 0.75;
          opening('z', wx, f.z + (f.d / 2) * sign, sign, y, lit);
          if (fl > 0 && rng() < 0.1) {
            kit.box(0.52, 0.36, 0.3, wx + 0.5, y - 0.85, f.z + (f.d / 2 + 0.16) * sign, '#9aa0a5');
          }
        }
      }
      // Side faces carry fewer openings: these are party walls in a real
      // Seoul block, so leave some of them blank.
      for (let c = 0; c < colsD; c++) {
        if (rng() < 0.35) continue;
        const wz = f.z + startD + c * pitch;
        const sign = rng() < 0.5 ? 1 : -1;
        const lit = rng() < chance * 0.8 && rng() < 0.75;
        opening('x', wz, f.x + (f.w / 2) * sign, sign, y, lit);
        if (fl > 0 && rng() < 0.08) {
          kit.box(0.3, 0.36, 0.52, f.x + (f.w / 2 + 0.16) * sign, y - 0.85, wz + 0.5, '#9aa0a5');
        }
      }
      // Balcony rows on the street face of wide apartment slabs
      if (balconyFloors && fl > 0) {
        const bz = f.z + f.d / 2;
        const bw = f.w * 0.9;
        kit.box(bw, 0.1, 0.56, f.x, y - 0.78, bz + 0.28, shade(f.wall, 0.82));
        // Railing: top rail and a mid rail on thin posts, open between.
        kit.box(bw, 0.05, 0.05, f.x, y - 0.12, bz + 0.54, '#3b3f45');
        kit.box(bw, 0.03, 0.03, f.x, y - 0.42, bz + 0.54, '#3b3f45');
        for (let k = 0; k <= Math.round(bw / 1.2); k++) {
          kit.box(0.04, 0.62, 0.04, f.x - bw / 2 + (bw / Math.round(bw / 1.2)) * k, y - 0.43, bz + 0.54, '#3b3f45');
        }
      }
    }

    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(spec.x, 0, spec.z);
    cityKit.absorb(kit, m);
    cityGlow.absorb(glow, m);
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (const p of spots) {
      signSpots.push({ ...p, x: spec.x + p.x * c + p.z * sn, z: spec.z - p.x * sn + p.z * c, ry: p.ry + yaw });
    }
  }

  const group = new THREE.Group();
  const litMesh = cityKit.toMesh(MATERIALS.lit);
  group.add(litMesh);
  if (!cityGlow.isEmpty) group.add(new THREE.Mesh(cityGlow.merge(), MATERIALS.glow));
  const occ: THREE.Mesh[] = [litMesh];
  if (!cityGlass.isEmpty) {
    const glassMesh = cityGlass.toMesh(MATERIALS.glassWall);
    group.add(glassMesh);
    occ.push(glassMesh);
  }

  return {
    object: group,
    occluders: occ,
    signSpots,
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
