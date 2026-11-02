import * as THREE from 'three';
import { VoxelKit } from './voxel';

/**
 * Traditional Korean architecture: the curved giwa tile roof and the hanok
 * house built under it. Everything is generated in local space and pushed
 * into the caller's kits, so a house still merges into the same draw calls
 * as the rest of its district.
 */

export interface RoofOptions {
  /** Eave-to-eave length along the ridge (local x). */
  len: number;
  /** Eave-to-eave depth across the ridge (local z). */
  depth: number;
  /** Ridge height above the eave line. */
  rise: number;
  /** How far the four eave corners sweep up (처마 앙곡). */
  lift?: number;
  /** Where the hip gives way to the gable (팔작지붕). 1 = full hip. */
  gableAt?: number;
  /** Stop the slopes at this fraction (skirt roofs under an upper storey). */
  tMax?: number;
  /** Spacing of the round cover-tile ridges running down the slope. */
  pitch?: number;
  tile?: string;
  under?: string;
  gable?: string;
}

const tmp = new THREE.Color();

/**
 * Hip-and-gable roof with a concave profile (steep at the ridge, flattening
 * toward the eave) and upswept corners. The tile surface is corrugated into
 * cover-tile ridges, so the slopes read as giwa rows instead of a smooth
 * slab. Underside is a rafter-coloured soffit, joined to the top by an eave
 * fascia. Returns one geometry with position / normal / color / uv.
 */
export function hanokRoof(o: RoofOptions): THREE.BufferGeometry {
  const Lx = o.len / 2;
  const Lz = o.depth / 2;
  const lift = o.lift ?? 0.35;
  const tg = Math.min(o.gableAt ?? 0.62, 1);
  const tMax = o.tMax ?? 1;
  const pitch = o.pitch ?? 0.34;
  const TILE = new THREE.Color(o.tile ?? '#4c5159');
  const CREST = TILE.clone().multiplyScalar(1.22);
  const GROOVE = TILE.clone().multiplyScalar(0.72);
  const EAVE = TILE.clone().multiplyScalar(0.6);
  const UNDER = new THREE.Color(o.under ?? '#6e4c33');
  const GABLE = new THREE.Color(o.gable ?? '#d9d0bc');
  const thick = 0.16;
  const ROWS = 9;

  const height = (t: number) => o.rise * Math.pow(t, 1.7);
  const sweep = (u: number, t: number) => lift * Math.pow(Math.abs(u), 3) * Math.pow(1 - t, 2);

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  // Winds each quad so its face normal points along `want` (up for tiles,
  // down for the soffit, outward for fascias and gables).
  const quad = (a: number, b: number, c: number, d: number, want: [number, number, number]) => {
    const p = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const [A, B, C] = [p(a), p(b), p(c)];
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };

  // One slope: `point(u, t)` maps across-slope u ∈ [-1, 1] and up-slope t
  // to a footprint (x, z); `along(u, t)` is the world distance along the
  // eave used to phase the tile ridges.
  const slope = (
    point: (u: number, t: number) => [number, number],
    alongLen: (t: number) => number,
    tTop: number,
    out: [number, number]
  ) => {
    const cols = 2 * Math.max(2, Math.round(alongLen(0) / pitch));
    const grid: number[][] = [];
    const soffit: number[][] = [];
    for (let r = 0; r <= ROWS; r++) {
      const t = (r / ROWS) * tTop;
      const row: number[] = [];
      const under: number[] = [];
      for (let c = 0; c <= cols; c++) {
        const u = (c / cols) * 2 - 1;
        const [x, z] = point(u, t);
        const crest = c % 2 === 0;
        const y = height(t) + sweep(u, t) + (crest ? 0.05 : 0);
        const shade = r === 0 ? EAVE : crest ? CREST : GROOVE;
        row.push(push(x, y, z, shade));
        if (c % 2 === 0) {
          tmp.copy(UNDER).multiplyScalar(0.85 + 0.15 * t);
          under.push(push(x, y - thick - (r === 0 ? 0 : 0.04), z, tmp));
        }
      }
      grid.push(row);
      soffit.push(under);
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        quad(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c], [0, 1, 0]);
      }
      for (let c = 0; c + 1 < soffit[r].length; c++) {
        quad(soffit[r][c], soffit[r + 1][c], soffit[r + 1][c + 1], soffit[r][c + 1], [0, -1, 0]);
      }
    }
    // Eave fascia: drop from the tile edge to the soffit edge.
    for (let c = 0; c + 2 <= cols; c += 2) {
      const a = grid[0][c];
      const b = grid[0][c + 2];
      const ua = soffit[0][c / 2];
      const ub = soffit[0][c / 2 + 1];
      quad(a, ua, ub, b, [out[0], 0, out[1]]);
    }
    return grid;
  };

  const xg = Lx - tg * Lz; // where the gable face stands
  // Long slopes (±z). Below the gable line they shrink with the hip; above
  // it they keep the gable width up to the ridge.
  const longTop = tMax;
  for (const s of [1, -1] as const) {
    slope(
      (u, t) => [u * (Lx - Math.min(t, tg) * Lz), s * Lz * (1 - t)],
      () => o.len,
      longTop,
      [0, s]
    );
  }
  // Hip ends (±x), up to the gable line.
  const hipTop = Math.min(tg, tMax);
  for (const s of [1, -1] as const) {
    slope(
      (u, t) => [s * (Lx - t * Lz), u * Lz * (1 - t)],
      () => o.depth,
      hipTop,
      [s, 0]
    );
  }
  // Gable triangles (합각) closing the ends above the hip.
  if (tMax >= 1 && tg < 1) {
    for (const s of [1, -1] as const) {
      const x = s * xg;
      const steps = 6;
      const left: number[] = [];
      const right: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = tg + ((1 - tg) * i) / steps;
        const y = height(t) + lift * Math.pow(1 - t, 2) - 0.02;
        left.push(push(x, y, -Lz * (1 - t), GABLE));
        right.push(push(x, y, Lz * (1 - t), GABLE));
      }
      for (let i = 0; i < steps; i++) quad(left[i], right[i], right[i + 1], left[i + 1], [s, 0, 0]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Ridge (용마루) and hip ridges (추녀마루) laid along a hanokRoof with the
 * same options, with the white mortar band real ridges carry.
 */
export function roofRidges(kit: VoxelKit, o: RoofOptions, x: number, y: number, z: number): void {
  const Lx = o.len / 2;
  const Lz = o.depth / 2;
  const tg = Math.min(o.gableAt ?? 0.62, 1);
  const lift = o.lift ?? 0.35;
  const xg = Lx - tg * Lz;
  const DARK = '#353a41';
  const h = (t: number) => o.rise * Math.pow(t, 1.7);
  const top = y + h(1);
  kit.box(xg * 2 + 0.5, 0.3, 0.36, x, top + 0.1, z, DARK);
  kit.box(xg * 2 + 0.3, 0.07, 0.4, x, top - 0.02, z, '#d6d0c2');
  // Ridge-end ornaments (취두): little raised blocks at both ends
  for (const s of [-1, 1]) kit.box(0.3, 0.5, 0.42, x + s * (xg + 0.2), top + 0.25, z, DARK);
  // Hip ridges from each eave corner up to the gable foot
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      let px = x + sx * Lx;
      let py = y + lift + 0.08;
      let pz = z + sz * Lz;
      const N = 4;
      for (let i = 1; i <= N; i++) {
        const t = (tg * i) / N;
        const nx = x + sx * (Lx - t * Lz);
        const nz = z + sz * Lz * (1 - t);
        const ny = y + h(t) + lift * Math.pow(1 - t, 2) + 0.08;
        kit.bar(px, py, pz, nx, ny, nz, 0.2, DARK);
        px = nx;
        py = ny;
        pz = nz;
      }
    }
  }
}

export interface HanokHouseOptions {
  /** Frontage, along local z. */
  width: number;
  /** Depth, along local x; the front faces +x. */
  depth: number;
  /** Leave the centre bay open as a doorway (interactive houses). */
  doorway?: boolean;
  /** Wood tone for posts and beams. */
  wood?: string;
  seed?: number;
}

export interface HanokHouseResult {
  /** Height of the plinth top, the floor level. */
  floorY: number;
  /** Height of the main beam under the eave. */
  beamY: number;
}

/**
 * A single-storey hanok: granite plinth (기단) with front steps, round wood
 * posts on a regular bay rhythm, plaster walls with a timber dado, paper
 * lattice doors (창호) across the front, a bracket course under the eave,
 * and the curved giwa roof. Front faces +x; door bay centred on z = 0.
 */
export function hanokHouse(
  kit: VoxelKit,
  glow: VoxelKit,
  paper: VoxelKit,
  o: HanokHouseOptions
): HanokHouseResult {
  const W = o.width;
  const D = o.depth;
  const WOOD = o.wood ?? '#6b4a32';
  const WOOD_DARK = '#4e3524';
  const STONE = '#aaa497';
  const STONE_TOP = '#bdb7aa';
  const PLASTER = '#ebe5d5';
  const plinth = 0.55;
  const postH = 2.3;
  const beamY = plinth + postH;

  // Plinth: dressed granite with a lighter capping course and two steps.
  kit.boxOn(D + 1.2, plinth - 0.08, W + 1.2, 0, 0, 0, STONE);
  kit.boxOn(D + 1.3, 0.08, W + 1.3, 0, plinth - 0.08, 0, STONE_TOP);
  for (let i = 0; i < 2; i++) {
    kit.boxOn(0.42, plinth * (1 - i * 0.5) - 0.02, 2.2 - i * 0.2, D / 2 + 0.81 + i * 0.4, 0, 0, i ? STONE : STONE_TOP);
  }

  // Walls: plaster on the sides and back, timber dado below.
  kit.boxOn(D - 0.1, postH, W - 0.1, 0, plinth, 0, PLASTER);
  kit.box(D, 0.5, W, 0, plinth + 0.25, 0, WOOD);

  // Posts on the bay grid, a perimeter beam (창방) and the bracket course.
  // Odd bay count so a bay is always centred on z = 0 (the door).
  const bays = Math.max(3, Math.round(W / 2.1) | 1);
  const bayW = W / bays;
  const sideBays = Math.max(2, Math.round(D / 2.1));
  const postAt = (px: number, pz: number) => {
    kit.cylinder(0.12, 0.14, postH, px, plinth + postH / 2, pz, WOOD, 8);
    kit.box(0.34, 0.12, 0.34, px, plinth + 0.06, pz, STONE_TOP); // post base stone
  };
  for (let i = 0; i <= bays; i++) {
    const pz = -W / 2 + i * bayW;
    postAt(D / 2, pz);
    postAt(-D / 2, pz);
  }
  for (let i = 1; i < sideBays; i++) {
    const px = -D / 2 + (i * D) / sideBays;
    postAt(px, W / 2);
    postAt(px, -W / 2);
  }
  kit.box(D + 0.24, 0.26, W + 0.24, 0, beamY - 0.13, 0, WOOD);
  kit.box(D + 0.4, 0.14, W + 0.4, 0, beamY + 0.07, 0, WOOD_DARK);
  // Brackets: a small block over every post and one mid-bay on the front
  for (let i = 0; i <= bays * 2; i++) {
    const pz = -W / 2 + (i * bayW) / 2;
    kit.box(0.26, 0.18, 0.2, D / 2 + 0.16, beamY + 0.23, pz, i % 2 ? WOOD_DARK : WOOD);
  }

  // Front: paper lattice doors in every bay, the centre bay left open as
  // the doorway when the house is enterable.
  const fx = D / 2 + 0.02;
  for (let i = 0; i < bays; i++) {
    const zc = -W / 2 + (i + 0.5) * bayW;
    const isDoor = o.doorway && Math.abs(zc) < bayW * 0.5;
    if (isDoor) {
      kit.box(0.08, 1.95, bayW - 0.34, fx, plinth + 1.0, zc, '#24201c');
      // Lintel band above the opening
      kit.box(0.1, 0.3, bayW - 0.2, fx + 0.02, plinth + 2.1, zc, WOOD_DARK);
      continue;
    }
    const panels = 2;
    const pw = (bayW - 0.34) / panels;
    for (let p = 0; p < panels; p++) {
      const pz = zc - (bayW - 0.34) / 2 + (p + 0.5) * pw;
      const ph = 1.55;
      const py = plinth + 0.5 + ph / 2 + 0.05;
      paper.box(0.04, ph - 0.08, pw - 0.1, fx + 0.01, py, pz, '#f1e2bf');
      // Frame + lattice: 2 verticals, 3 horizontals
      kit.box(0.07, ph, 0.06, fx + 0.04, py, pz - pw / 2 + 0.03, WOOD_DARK);
      kit.box(0.07, ph, 0.06, fx + 0.04, py, pz + pw / 2 - 0.03, WOOD_DARK);
      kit.box(0.07, 0.06, pw, fx + 0.04, py + ph / 2 - 0.03, pz, WOOD_DARK);
      kit.box(0.07, 0.06, pw, fx + 0.04, py - ph / 2 + 0.03, pz, WOOD_DARK);
      for (let k = 1; k <= 2; k++) kit.box(0.05, ph - 0.1, 0.03, fx + 0.04, py, pz - pw / 2 + (k * pw) / 3, WOOD_DARK);
      for (let k = 1; k <= 3; k++) kit.box(0.05, 0.03, pw - 0.1, fx + 0.04, py - ph / 2 + (k * ph) / 4, pz, WOOD_DARK);
    }
    // Transom window band above the doors
    paper.box(0.04, 0.22, bayW - 0.44, fx + 0.01, plinth + 2.02, zc, '#f1e2bf');
  }
  // Small high windows on the sides
  for (const s of [-1, 1]) {
    paper.box(0.7, 0.55, 0.04, 0, plinth + 1.5, s * (W / 2 + 0.01), '#f1e2bf');
    kit.box(0.84, 0.08, 0.07, 0, plinth + 1.8, s * (W / 2 + 0.03), WOOD_DARK);
    kit.box(0.84, 0.08, 0.07, 0, plinth + 1.2, s * (W / 2 + 0.03), WOOD_DARK);
  }
  // One warm lantern by the door
  glow.box(0.22, 0.3, 0.22, D / 2 + 0.3, plinth + 2.0, bayW * 0.5 + 0.35, '#ffd9a0');
  kit.box(0.04, 0.3, 0.04, D / 2 + 0.3, plinth + 2.3, bayW * 0.5 + 0.35, WOOD_DARK);

  // Roof: ridge along the frontage (local z).
  const roof: RoofOptions = {
    len: W + 2.4,
    depth: D + 2.4,
    rise: 1.9 + D * 0.06,
    lift: 0.42,
    gableAt: 0.6,
  };
  const geo = hanokRoof(roof);
  geo.rotateY(Math.PI / 2);
  geo.translate(0, beamY + 0.22, 0);
  kit.add(geo);
  const ridge = new VoxelKit();
  roofRidges(ridge, roof, 0, 0, 0);
  kit.absorb(ridge, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, beamY + 0.22, 0));

  return { floorY: plinth, beamY };
}

/**
 * Courtyard wall (담장): stone footing, plaster body, and its own little
 * tiled roof cap. Runs along local z, centred on (x, z).
 */
export function hanokWall(kit: VoxelKit, x: number, z: number, len: number, alongX = false): void {
  const h = 1.25;
  const rot = alongX ? 0 : Math.PI / 2;
  const at = (lx: number, lz: number): [number, number] => (alongX ? [x + lz, z + lx] : [x + lx, z + lz]);
  const [bx, bz] = at(0, 0);
  kit.boxOn(alongX ? len : 0.5, 0.45, alongX ? 0.5 : len, bx, 0, bz, '#9c968a');
  kit.boxOn(alongX ? len : 0.4, h - 0.45, alongX ? 0.4 : len, bx, 0.45, bz, '#e6dfcf');
  // Decorative band of roof tiles set into the plaster (꽃담 hint)
  kit.box(alongX ? len - 0.4 : 0.42, 0.09, alongX ? 0.42 : len - 0.4, bx, 0.86, bz, '#8f7a68');
  const cap: RoofOptions = { len: len + 0.2, depth: 0.95, rise: 0.32, lift: 0.08, gableAt: 1, pitch: 0.26 };
  const geo = hanokRoof(cap);
  geo.rotateY(rot);
  geo.translate(bx, h, bz);
  kit.add(geo);
  kit.box(alongX ? len + 0.2 : 0.2, 0.12, alongX ? 0.2 : len + 0.2, bx, h + 0.36, bz, '#353a41');
}
