import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from './CelShading';

/**
 * Terrain shaping for the diorama.
 *
 * The playable urban core stays physically flat (the whole collision world
 * is authored against y=0), but the *visible* terrain is a displaced grid:
 * riverbanks slope down into a real riverbed, the Namsan base swells, and
 * past the perimeter an apron of rolling hills carries the ground to the
 * fog so the map never reads as a floating slab. Every elevated region sits
 * where the player is fenced out, so collision and visuals never disagree.
 *
 * The shoreline is analytic — shoreNorth/shoreSouth are shared by the
 * terrain mesh, the painted ground, and the water shader (in GLSL), so the
 * three systems always agree about where the water meets the land.
 */

export const WORLD_W = 208;
export const WORLD_D = 208;

/** Water surface height. */
export const WATER_Y = 0.06;
export const RIVERBED_Y = -1.6;

/** North water edge (z) as a curved function of x. Stays ≥ 20 (rail 19.4). */
export function shoreNorth(x: number): number {
  return 21.8 + 1.2 * Math.sin(x * 0.045 + 1.7) + 0.6 * Math.sin(x * 0.11 + 0.4);
}

/** South water edge (z). Stays ≤ 48.2 (rail 48.6). */
export function shoreSouth(x: number): number {
  return 46.4 + 1.2 * Math.sin(x * 0.05 + 3.9) + 0.6 * Math.sin(x * 0.13 + 2.1);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cheap deterministic 2D value noise for the apron hills. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Visible terrain height. ZERO everywhere the player can walk; shaped only
 * in fenced-off regions (riverbed, Namsan base, beyond the perimeter).
 */
export function terrainHeight(x: number, z: number): number {
  let h = 0;

  // --- Riverbed: slope from just past the bank rails down to the bed.
  const n = shoreNorth(x);
  const s = shoreSouth(x);
  const dip = smoothstep(n - 1.6, n + 5.5, z) * (1 - smoothstep(s - 5.5, s + 1.6, z));
  h += RIVERBED_Y * dip;

  // --- Namsan foothill swell, entirely inside the blocked cylinder (r=16.3).
  const dn = Math.hypot(x - 0, z - -58);
  h += 2.2 * smoothstep(16.2, 9, dn);

  // --- Apron: rolling hills past the playable edge. Ramp in over ~26 units
  // so the boundary itself stays flat where the invisible walls sit.
  const beyond = Math.max(
    0,
    Math.abs(x) - 96,
    -(z + 96), // north
    z - 102 // south
  );
  if (beyond > 0) {
    const ramp = smoothstep(2, 30, beyond);
    const rolling =
      (valueNoise(x * 0.021 + 7.3, z * 0.021 + 2.9) - 0.35) * 9 +
      (valueNoise(x * 0.055 + 1.1, z * 0.055 + 9.4) - 0.5) * 3;
    // The river keeps flowing east/west: carve its channel through the apron.
    const riverGap = smoothstep(16, 22, z) * (1 - smoothstep(46.5, 52.5, z));
    h += ramp * Math.max(rolling, 0.4) * (1 - riverGap);
    h += RIVERBED_Y * riverGap * ramp * 0; // channel already carved by dip above
  }

  return h;
}

export interface TerrainResult {
  /** Textured inner terrain (painted canvas on a displaced grid). */
  inner: THREE.Mesh;
  /** Rolling vertex-colored apron continuing to the fog. */
  apron: THREE.Mesh;
}

/** Cut actual openings into the flat city while retaining its displaced grid. */
function createGroundGeometry(openings: readonly THREE.Vector2[][]): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 104, 104);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  const patches = openings.map((outline) => {
    const box = new THREE.Box2().setFromPoints(outline);
    // Boundaries on the original 2 m grid; the extra cell keeps the hole
    // strictly inside the replacement patch, including rotated entrances.
    box.min.set(Math.floor(box.min.x / 2) * 2 - 2, Math.floor(box.min.y / 2) * 2 - 2);
    box.max.set(Math.ceil(box.max.x / 2) * 2 + 2, Math.ceil(box.max.y / 2) * 2 + 2);
    const shape = new THREE.Shape([
      new THREE.Vector2(box.min.x, -box.min.y), new THREE.Vector2(box.max.x, -box.min.y),
      new THREE.Vector2(box.max.x, -box.max.y), new THREE.Vector2(box.min.x, -box.max.y),
    ]);
    shape.holes.push(new THREE.Path(outline.map((p) => new THREE.Vector2(p.x, -p.y))));
    const patch = new THREE.ShapeGeometry(shape);
    patch.rotateX(-Math.PI / 2);
    const p = patch.attributes.position;
    const uv = patch.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(terrainHeight(p.getX(i), p.getZ(i))) > 0.001) throw new Error('Ground openings must lie in the flat city');
      uv.setXY(i, p.getX(i) / WORLD_W + 0.5, 0.5 - p.getZ(i) / WORLD_D);
    }
    return { box, geometry: patch };
  });
  const index = geo.getIndex()!;
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const center = new THREE.Vector2((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3);
    if (!patches.some((patch) => patch.box.containsPoint(center))) kept.push(a, b, c);
  }
  geo.setIndex(kept);
  geo.computeVertexNormals();
  if (!patches.length) return geo;
  const parts = [geo, ...patches.map((p) => p.geometry)];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * Builds the displaced inner terrain (painted canvas texture) plus the
 * surrounding apron of hills.
 */
export function createTerrain(canvas: HTMLCanvasElement, openings: readonly THREE.Vector2[][] = []): TerrainResult {
  const geo = createGroundGeometry(openings);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  const inner = new THREE.Mesh(geo, celMaterial({ profile: 'ground', map: texture }));
  inner.receiveShadow = true;

  // --- Apron: coarse ring out to the fog horizon, vertex-colored.
  const apronSize = 720;
  const apronSeg = 96;
  const ageo = new THREE.PlaneGeometry(apronSize, apronSize, apronSeg, apronSeg);
  ageo.rotateX(-Math.PI / 2);
  const apos = ageo.attributes.position;
  const colors = new Float32Array(apos.count * 3);
  const grass = new THREE.Color('#567f52');
  const grassFar = new THREE.Color('#48704e');
  const rock = new THREE.Color('#6f7d6c');
  const water = new THREE.Color('#35607c');
  const tmp = new THREE.Color();
  for (let i = 0; i < apos.count; i++) {
    const x = apos.getX(i);
    const z = apos.getZ(i) + 4; // recenter slightly south, matching the city
    apos.setZ(i, z);
    const inCity = Math.abs(x) < WORLD_W / 2 - 1 && Math.abs(z - 4) < WORLD_D / 2 - 1;
    const h = terrainHeight(x, z);
    // Drop the apron where the painted world sits so they never z-fight.
    apos.setY(i, inCity ? h - 0.25 : h);
    const riverBand = z > shoreNorth(x) - 1 && z < shoreSouth(x) + 1;
    const dist = Math.max(Math.abs(x), Math.abs(z - 4));
    tmp.copy(riverBand ? water : h > 4.5 ? rock : grass);
    if (!riverBand) tmp.lerp(grassFar, smoothstep(120, 300, dist));
    // Macro mottling so big fields never read as one flat tone.
    const m = 0.92 + valueNoise(x * 0.08, z * 0.08) * 0.16;
    colors[i * 3] = tmp.r * m;
    colors[i * 3 + 1] = tmp.g * m;
    colors[i * 3 + 2] = tmp.b * m;
  }
  ageo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // This is an outer ring. A second ground layer beneath the entire city
  // would cover basement/stair openings again a quarter-metre down.
  const apronIndex = ageo.getIndex()!;
  const outer: number[] = [];
  for (let i = 0; i < apronIndex.count; i += 3) {
    const triangle = [apronIndex.getX(i), apronIndex.getX(i + 1), apronIndex.getX(i + 2)];
    if (!triangle.every((v) => Math.abs(apos.getX(v)) < WORLD_W / 2 && Math.abs(apos.getZ(v)) < WORLD_D / 2)) outer.push(...triangle);
  }
  ageo.setIndex(outer);
  ageo.computeVertexNormals();
  const apron = new THREE.Mesh(ageo, celMaterial({ profile: 'ground', vertexColors: true }));
  apron.receiveShadow = true;

  return { inner, apron };
}
