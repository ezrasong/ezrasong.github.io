import * as THREE from 'three';
import { addWindSway, celMaterial } from './CelShading';
import { shoreNorth, shoreSouth } from './Terrain';

/**
 * Instanced wind-blown grass, authored per patch rather than scattered
 * globally: the Hangang park band, the south bank strip, the Hongdae
 * pocket park, hanok courtyard tufts, the Namsan skirt, and reed clusters
 * along both waterlines. Every patch carries its own exclusion tests so
 * blades never grow through roads, paths, ramps, or building lots.
 *
 * One InstancedMesh per layer (grass + reeds). Instances are shuffled at
 * build time, so quality presets can simply truncate `mesh.count`.
 */

interface Patch {
  /** Sample a candidate world position. */
  sample: (rng: () => number) => [number, number];
  /** Approximate blade budget at full density. */
  budget: number;
  /** Extra rejection test (true = keep). */
  keep?: (x: number, z: number) => boolean;
  /** Scale range. */
  sMin: number;
  sMax: number;
}

function rect(x0: number, x1: number, z0: number, z1: number): Patch['sample'] {
  return (rng) => [x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0)];
}
function disc(cx: number, cz: number, r: number): Patch['sample'] {
  return (rng) => {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * r;
    return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr];
  };
}

/** Joint exclusions for the park band. */
function parkKeep(x: number, z: number): boolean {
  if (Math.abs(x) < 4.8) return false; // spine road + bridge approach
  if (Math.abs(x + 48) < 4.8) return false; // Yanghwa connector
  if (x > 11.3 && x < 16.7 && z > 18) return false; // pier approach
  const path = 15.2 + Math.sin(x * 0.05 + 1.2) * 1.1 + Math.sin(x * 0.017) * 0.7;
  if (Math.abs(z - path) < 1.15) return false; // jogging path
  if (z > shoreNorth(x) - 2.3) return false; // sandy bank
  return true;
}

function southBankKeep(x: number, z: number): boolean {
  if (Math.abs(x) < 4.6 || Math.abs(x + 48) < 4.4) return false; // landings
  if (z < shoreSouth(x) + 2.3) return false; // sandy bank
  const path = 51.6 + Math.sin(x * 0.045 + 3.0) * 0.7;
  if (Math.abs(z - path) < 0.95) return false; // riverside path
  return true;
}

const PATCHES: Patch[] = [
  // Hangang park band (the big one)
  { sample: rect(-84, 84, 11.5, 19.2), budget: 5200, keep: parkKeep, sMin: 0.75, sMax: 1.25 },
  // South bank strip
  { sample: rect(-84, 84, 49.8, 53.2), budget: 2400, keep: southBankKeep, sMin: 0.7, sMax: 1.15 },
  // Hongdae pocket park
  { sample: rect(-29, -22.6, -13, 0.5), budget: 500, sMin: 0.7, sMax: 1.1 },
  // Hanok courtyard tufts
  { sample: disc(33.5, -49, 1.9), budget: 90, sMin: 0.6, sMax: 1.0 },
  { sample: disc(47.5, -49, 2.0), budget: 90, sMin: 0.6, sMax: 1.0 },
  // Namsan skirt ring
  {
    sample: (rng) => {
      const a = rng() * Math.PI * 2;
      const r = 16.8 + rng() * 4.2;
      return [Math.cos(a) * r, -58 + Math.sin(a) * r];
    },
    budget: 900,
    keep: (x, z) => !(Math.abs(x) < 5.4 && z > -44) && z < -38.8,
    sMin: 0.8,
    sMax: 1.35,
  },
  // Plaza tree surrounds
  { sample: disc(-15, -6, 1.6), budget: 60, sMin: 0.6, sMax: 0.95 },
  { sample: disc(15, -6, 1.6), budget: 60, sMin: 0.6, sMax: 0.95 },
  { sample: disc(-13, -22, 1.5), budget: 55, sMin: 0.6, sMax: 0.95 },
  { sample: disc(13, -22, 1.5), budget: 55, sMin: 0.6, sMax: 0.95 },
];

/** Crossed-quad blade with a baked base→tip vertex-color gradient. */
function bladeGeometry(width: number, height: number, tip: string, base: string): THREE.BufferGeometry {
  const tipC = new THREE.Color(tip);
  const baseC = new THREE.Color(base);
  const positions: number[] = [];
  const colors: number[] = [];
  const addQuad = (rot: number) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hw = width / 2;
    // Two triangles, tapered to 40% width at the top.
    const quad = [
      [-hw, 0], [hw, 0], [hw * 0.4, height],
      [-hw, 0], [hw * 0.4, height], [-hw * 0.4, height],
    ];
    for (const [px, py] of quad) {
      positions.push(px * c, py, px * s);
      const t = py / height;
      const col = baseC.clone().lerp(tipC, t);
      colors.push(col.r, col.g, col.b);
    }
  };
  addQuad(0);
  addQuad(Math.PI / 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Meadow-lighting trick: all normals point up so blades shade like the
  // ground they grow from instead of flickering between facings.
  const count = positions.length / 3;
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    normals[i * 3 + 1] = 1;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

export interface GrassResult {
  object: THREE.Object3D;
  /** density 0..1 truncates instance counts (quality presets). */
  setDensity: (d: number) => void;
}

export function createGrass(): GrassResult {
  const group = new THREE.Group();
  const rng = mulberry32(517);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ---- Grass blades
  const bladeGeo = bladeGeometry(0.24, 0.42, '#7cb96a', '#3f6b3e');
  const bladeMat = celMaterial({ profile: 'foliage', vertexColors: true });
  bladeMat.side = THREE.DoubleSide;
  addWindSway(bladeMat, 0.09, 2.3, 0.04, 0.55);

  const placements: { x: number; z: number; s: number }[] = [];
  for (const patch of PATCHES) {
    let placed = 0;
    let attempts = 0;
    while (placed < patch.budget && attempts < patch.budget * 4) {
      attempts++;
      const [x, z] = patch.sample(rng);
      if (patch.keep && !patch.keep(x, z)) continue;
      placements.push({ x, z, s: patch.sMin + rng() * (patch.sMax - patch.sMin) });
      placed++;
    }
  }
  // Shuffle so count-truncation thins evenly instead of clearing whole patches.
  for (let i = placements.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [placements[i], placements[j]] = [placements[j], placements[i]];
  }

  const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.y = rng() * Math.PI;
    dummy.scale.set(p.s, p.s * (0.85 + rng() * 0.5), p.s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setScalar(0.85 + rng() * 0.3);
    if (rng() < 0.06) color.set('#c9c06a').multiplyScalar(0.9 + rng() * 0.2); // dry tufts
    if (rng() < 0.045) color.set('#e79ec1'); // tiny flowers
    grass.setColorAt(i, color);
  });
  grass.castShadow = false;
  grass.receiveShadow = false;
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);

  // ---- Reeds along both waterlines
  const reedGeo = bladeGeometry(0.16, 1.15, '#b9b06e', '#5f7a48');
  const reedMat = celMaterial({ profile: 'foliage', vertexColors: true });
  reedMat.side = THREE.DoubleSide;
  addWindSway(reedMat, 0.14, 1.6, 0.15, 1.2);

  const reedPlacements: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 46; i++) {
    // Cluster anchors along each bank, skipping bridges and the pier.
    const x = -86 + rng() * 172;
    if (Math.abs(x) < 5.5 || Math.abs(x + 48) < 5.5 || (x > 10.9 && x < 17.1)) continue;
    const north = rng() < 0.55;
    const cz = north ? shoreNorth(x) - 0.55 : shoreSouth(x) + 0.55;
    const n = 3 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) {
      reedPlacements.push({
        x: x + (rng() - 0.5) * 1.6,
        z: cz + (rng() - 0.5) * 0.7,
        s: 0.7 + rng() * 0.6,
      });
    }
  }
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedPlacements.length);
  reedPlacements.forEach((p, i) => {
    dummy.position.set(p.x, -0.1, p.z);
    dummy.rotation.y = rng() * Math.PI;
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    reeds.setMatrixAt(i, dummy.matrix);
    color.setScalar(0.85 + rng() * 0.3);
    reeds.setColorAt(i, color);
  });
  reeds.castShadow = false;
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  const fullGrass = placements.length;
  const fullReeds = reedPlacements.length;
  return {
    object: group,
    setDensity: (d: number) => {
      grass.count = Math.round(fullGrass * Math.min(1, Math.max(0, d)));
      reeds.count = Math.round(fullReeds * Math.min(1, Math.max(0.4, d)));
    },
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
