import * as THREE from 'three';

/**
 * Seoul sits in a bowl of granite mountains: Bukhansan's rocky ridges to
 * the north, softer forested hills all round. These are built as height-
 * displaced grids (not cones), coloured per vertex by slope and height so
 * the forest thins into bare granite near the crests.
 */

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    v += amp * noise(x, z);
    x *= 2.03;
    z *= 2.03;
    amp *= 0.5;
  }
  return v;
}
/** Ridged noise: sharp crests, the look of granite ridgelines. */
function ridged(x: number, z: number): number {
  let v = 0;
  let amp = 0.55;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(noise(x, z) * 2 - 1);
    v += amp * n * n;
    x *= 2.1;
    z *= 2.1;
    amp *= 0.48;
  }
  return v;
}

export interface RangeOptions {
  /** Footprint centre and half-extents. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Peak height. */
  height: number;
  /** 0 = rounded forested hills, 1 = sharp granite ridges. */
  rock: number;
  seed: number;
  /** Grid resolution along each axis. */
  res?: number;
  forest?: string;
  forestDark?: string;
  granite?: string;
}

/**
 * One mountain mass: an elliptical footprint whose height is shaped by a
 * soft falloff times fbm/ridged noise. Flat-shaded faces (non-indexed) give
 * the facetted read the rest of the diorama uses.
 */
/** Surface height of a range at world (x, z), matching createRange. */
export function rangeHeight(o: RangeOptions, x: number, z: number): number {
  const u = (x - o.x) / o.hx;
  const v = (z - o.z) / o.hz;
  const r = Math.sqrt(u * u + v * v);
  if (r >= 1) return -0.4;
  const fall = Math.pow(Math.cos((r * Math.PI) / 2), 1.4);
  const nx = u * 2.4 + o.seed * 3.1;
  const nz = v * 2.4 - o.seed * 1.7;
  const shape = (1 - o.rock) * fbm(nx, nz) * 1.4 + o.rock * ridged(nx * 0.8, nz * 0.8) * 1.5;
  return o.height * fall * (0.35 + shape) - 0.4;
}

export function createRange(o: RangeOptions): THREE.BufferGeometry {
  const res = o.res ?? 48;
  const FOREST = new THREE.Color(o.forest ?? '#4a7445');
  const FOREST_DARK = new THREE.Color(o.forestDark ?? '#3a5f3a');
  const GRANITE = new THREE.Color(o.granite ?? '#8c8a80');
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const pt = (i: number, j: number): [number, number, number] => {
    const u = (i / res) * 2 - 1;
    const v = (j / res) * 2 - 1;
    const x = o.x + u * o.hx;
    const z = o.z + v * o.hz;
    return [x, rangeHeight(o, x, z), z];
  };
  const shadeTri = (a: number[], b: number[], d: number[]) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const ny = Math.abs(n[1] / len);
    const h = (a[1] + b[1] + d[1]) / 3 / o.height;
    // Steep faces and crests go to granite; the rest is forest in two tones.
    // Granite only on the steepest faces of the upper slopes and the crests.
    const high = THREE.MathUtils.smoothstep(h, 0.55, 0.85);
    const rockiness = (THREE.MathUtils.smoothstep(0.62 - ny, 0, 0.2) * high + THREE.MathUtils.smoothstep(h, 0.86, 1.0) * 0.6) * o.rock;
    const tone = hash(a[0] * 0.37, a[2] * 0.41);
    c.copy(tone < 0.5 ? FOREST : FOREST_DARK).lerp(GRANITE, Math.min(1, rockiness));
    c.multiplyScalar(0.92 + tone * 0.16);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const p00 = pt(i, j);
      const p10 = pt(i + 1, j);
      const p01 = pt(i, j + 1);
      const p11 = pt(i + 1, j + 1);
      if (p00[1] <= -0.39 && p10[1] <= -0.39 && p01[1] <= -0.39 && p11[1] <= -0.39) continue;
      pos.push(...p00, ...p01, ...p10);
      shadeTri(p00, p01, p10);
      pos.push(...p10, ...p01, ...p11);
      shadeTri(p10, p01, p11);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
