import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import type { BuildingType, Facing } from '../types';
import { makeSign } from './SignTexture';
import { MATERIALS, VoxelKit } from './voxel';

export interface ColliderSpec {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
}

export interface BuiltStructure {
  group: THREE.Group;
  /** Local-space colliders; World transforms them to world space. */
  colliders: ColliderSpec[];
  /** Local-space point just outside the door where the trigger sits. */
  entranceLocal: THREE.Vector3;
  /** Meshes the follow camera should treat as view blockers. */
  occluders: THREE.Mesh[];
  /** Pulsing marker shown when the player is close enough to interact. */
  highlight: THREE.Group;
}

export interface BuildingSpec {
  type: BuildingType;
  width: number;
  depth: number;
  floors: number;
  accent: string;
  signText: string;
  signSubtext?: string;
}

export function facingToYaw(facing: Facing): number {
  switch (facing) {
    case 'east':
      return 0;
    case 'west':
      return Math.PI;
    case 'north':
      return Math.PI / 2;
    case 'south':
      return -Math.PI / 2;
  }
}

const FLOOR_H = 2.6;

/**
 * Builds a structure at the origin with its door centered on the +X face.
 * The caller rotates/positions the group and converts colliders.
 */
export function buildStructure(spec: BuildingSpec): BuiltStructure {
  switch (spec.type) {
    case 'phone-booth':
      return buildPhoneBooth(spec);
    case 'subway-station':
      return buildSubwayStation(spec);
    case 'hanok-house':
      return buildHanok(spec);
    default:
      return buildBlockBuilding(spec);
  }
}

/* ------------------------------------------------------------------ */

interface BodyStyle {
  wall: string;
  wallAlt: string;
  window: string;
  windowChance: number;
  roof: string;
}

function styleFor(type: BuildingType, accent: string): BodyStyle {
  switch (type) {
    case 'arcade':
      return { wall: '#4a3d55', wallAlt: '#3c3145', window: accent, windowChance: 0.55, roof: '#352b3d' };
    case 'creative-studio':
      return { wall: P.brick, wallAlt: P.brickDark, window: P.windowWarm, windowChance: 0.75, roof: P.roof };
    case 'tech-lab':
      return { wall: P.concrete, wallAlt: P.concreteDark, window: P.windowCool, windowChance: 0.8, roof: P.roof };
    case 'glass-store':
      return { wall: P.glass, wallAlt: P.glassDark, window: P.windowWarm, windowChance: 0.9, roof: '#e8e4dc' };
    case 'server-facility':
      return { wall: '#7c8288', wallAlt: '#6b7176', window: '#9adf9f', windowChance: 0.35, roof: '#5a6066' };
    case 'office-tower':
      return { wall: '#5f7285', wallAlt: '#526375', window: P.windowWarm, windowChance: 0.65, roof: P.roof };
    case 'workshop':
      return { wall: P.woodLight, wallAlt: '#a6794c', window: P.windowWarm, windowChance: 0.7, roof: '#8a5a3a' };
    default:
      return { wall: P.concrete, wallAlt: P.concreteDark, window: P.windowWarm, windowChance: 0.7, roof: P.roof };
  }
}

function buildBlockBuilding(spec: BuildingSpec): BuiltStructure {
  const { width: w, depth: d, floors } = spec;
  const style = styleFor(spec.type, spec.accent);
  const h = floors * FLOOR_H;
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const rng = mulberry32(hashCode(spec.signText));
  const FRAME = '#2c313d';
  const PANE_DARK = '#3d4657';
  const isShop = spec.type === 'arcade' || spec.type === 'creative-studio' || spec.type === 'glass-store' || spec.type === 'workshop';

  // Massing: chamfered main body over a slightly recessed ground band, so
  // the block reads as base + shaft instead of one extrusion.
  kit.boxOn(w - 0.24, FLOOR_H, d - 0.24, 0, 0, 0, style.wallAlt);
  kit.rbox(w, h - FLOOR_H, d, 0, FLOOR_H + (h - FLOOR_H) / 2, 0, style.wall, 0.12);
  // Belt course between base and shaft
  kit.box(w + 0.14, 0.22, d + 0.14, 0, FLOOR_H, 0, style.roof);
  // Parapet (chamfered) + roof slab
  kit.rboxOn(w + 0.26, 0.4, d + 0.26, 0, h - 0.05, 0, style.roof, 0.1);
  kit.box(w - 0.5, 0.14, d - 0.5, 0, h + 0.3, 0, '#565c66');

  // Window grid: framed cells with lit or dark panes on every face — the
  // facade reads structured in daylight, alive at night.
  const winW = 0.95;
  const winH = 1.15;
  const addWindows = (faceW: number, axis: 'x' | 'z', sign: 1 | -1) => {
    const cols = Math.max(1, Math.floor((faceW - 1.6) / 1.7));
    const startOffset = -((cols - 1) * 1.7) / 2;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const along = startOffset + c * 1.7;
        const isFront = axis === 'x' && sign === 1;
        // Ground floor: door column clear; shops get a storefront instead.
        if (f === 0 && (isShop || (isFront && Math.abs(along) < 1.5))) continue;
        const y = f * FLOOR_H + FLOOR_H * 0.58;
        const wall = axis === 'x' ? w : d;
        const off = wall / 2 - (f === 0 ? 0.12 : 0);
        const lit = rng() < style.windowChance && rng() < 0.8;
        const color = lit ? style.window : PANE_DARK;
        if (axis === 'x') {
          kit.box(0.1, winH + 0.18, winW + 0.18, sign * (off + 0.02), y, along, FRAME);
          if (lit) glow.box(0.08, winH, winW, sign * (off + 0.06), y, along, color);
          else kit.box(0.08, winH, winW, sign * (off + 0.06), y, along, color);
          // Occasional AC unit under a window
          if (f > 0 && rng() < 0.12) {
            kit.box(0.36, 0.34, 0.5, sign * (off + 0.2), y - winH / 2 - 0.26, along + 0.2, '#9aa0a5');
            kit.box(0.05, 0.24, 0.4, sign * (off + 0.39), y - winH / 2 - 0.26, along + 0.2, '#7e858b');
          }
        } else {
          kit.box(winW + 0.18, winH + 0.18, 0.1, along, y, sign * (off + 0.02), FRAME);
          if (lit) glow.box(winW, winH, 0.08, along, y, sign * (off + 0.06), color);
          else kit.box(winW, winH, 0.08, along, y, sign * (off + 0.06), color);
          if (f > 0 && rng() < 0.12) {
            kit.box(0.5, 0.34, 0.36, along - 0.2, y - winH / 2 - 0.26, sign * (off + 0.2), '#9aa0a5');
          }
        }
      }
    }
  };
  addWindows(d, 'x', 1);
  addWindows(d, 'x', -1);
  addWindows(w, 'z', 1);
  addWindows(w, 'z', -1);

  // Shops: full-width storefront glass band on the front face with an
  // accent awning; the door slots into it.
  if (isShop) {
    const bx = (w - 0.24) / 2;
    glow.box(0.08, FLOOR_H * 0.62, d - 1.6, bx + 0.02, FLOOR_H * 0.42, 0, style.window);
    kit.box(0.12, FLOOR_H * 0.72, 0.16, bx + 0.04, FLOOR_H * 0.42, -(d - 1.5) / 2, FRAME);
    kit.box(0.12, FLOOR_H * 0.72, 0.16, bx + 0.04, FLOOR_H * 0.42, (d - 1.5) / 2, FRAME);
    kit.box(0.12, 0.16, d - 1.3, bx + 0.04, FLOOR_H * 0.78, 0, FRAME);
    // Awning: sloped slab standing off the wall
    kit.box(1.1, 0.09, d - 1.0, bx + 0.62, FLOOR_H * 0.92, 0, spec.accent);
    kit.box(1.0, 0.05, d - 1.2, bx + 0.6, FLOOR_H * 0.87, 0, '#efe7d8');
  }

  // Utility pipe down one rear corner + drain shoe.
  kit.cylinder(0.07, 0.07, h - 0.4, -w / 2 - 0.09, (h - 0.4) / 2, -d / 2 + 0.5, '#6f757c', 6);
  kit.box(0.2, 0.3, 0.2, -w / 2 - 0.09, 0.15, -d / 2 + 0.5, '#6f757c');

  // Rooftop clutter: water tank + HVAC with pipe elbow (deterministic mix).
  if (rng() < 0.8) {
    kit.cylinder(0.62, 0.62, 1.0, -w / 4, h + 0.85, -d / 4, '#c8b98f', 10);
    kit.cylinder(0.66, 0.66, 0.12, -w / 4, h + 1.42, -d / 4, '#a89a75', 10);
    for (let leg = 0; leg < 3; leg++) {
      const a = (leg / 3) * Math.PI * 2;
      kit.box(0.08, 0.5, 0.08, -w / 4 + Math.cos(a) * 0.45, h + 0.55, -d / 4 + Math.sin(a) * 0.45, '#7a6f52');
    }
  }
  if (rng() < 0.7) {
    kit.rboxOn(1.3, 0.7, 1.0, w / 5, h + 0.35, d / 5, '#8a9096', 0.08);
    kit.box(0.9, 0.06, 0.7, w / 5, h + 1.08, d / 5, '#767c82');
  }

  // Door on +X face (mounted on the recessed ground band)
  addDoor(kit, glow, (w - 0.24) / 2, spec.accent);

  // Type-specific dressing
  switch (spec.type) {
    case 'arcade': {
      // Neon frame stripes up the front corners + marquee
      glow.box(0.18, h * 0.9, 0.18, w / 2 + 0.05, h * 0.45, d / 2 - 0.3, P.neonPink);
      glow.box(0.18, h * 0.9, 0.18, w / 2 + 0.05, h * 0.45, -d / 2 + 0.3, P.neonCyan);
      glow.box(0.15, 0.15, d, w / 2 + 0.08, h - 0.4, 0, P.neonYellow);
      // Checkered entry tiles
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const c = (i + j) % 2 === 0 ? '#efe7d8' : '#2e2837';
          kit.box(0.8, 0.06, 0.8, w / 2 + 0.6 + j * 0.8, 0.03, -1.2 + i * 0.8, c);
        }
      }
      // Rooftop vertical sign pole
      kit.boxOn(0.25, 2.4, 0.25, -w / 2 + 1, h, -d / 2 + 1, '#2e2837');
      glow.boxOn(0.5, 1.8, 0.12, -w / 2 + 1, h + 0.4, -d / 2 + 1.2, P.neonPink);
      break;
    }
    case 'creative-studio': {
      // Cream band + awning over the door (rooted into the wall face)
      kit.box(w + 0.1, 0.5, d + 0.1, 0, FLOOR_H, 0, '#e5d9bd');
      kit.box(0.9, 0.12, 3.4, w / 2 + 0.42, FLOOR_H * 0.85, 0, spec.accent);
      // Paper stack by the door
      kit.boxOn(0.7, 0.5, 0.9, w / 2 + 0.9, 0, 2.3, '#efe9da');
      kit.boxOn(0.6, 0.35, 0.8, w / 2 + 0.9, 0.5, 2.3, '#e2dbc8');
      // Rooftop billboard easel
      kit.boxOn(0.15, 1.6, 1.8, 0, h, d / 2 - 1.2, P.hanokWood);
      break;
    }
    case 'tech-lab': {
      // Antenna mast + dish
      kit.boxOn(0.22, 3.6, 0.22, -w / 2 + 1.2, h, -d / 2 + 1.2, '#4d565f');
      glow.box(0.3, 0.3, 0.3, -w / 2 + 1.2, h + 3.7, -d / 2 + 1.2, '#ff5d5d');
      kit.cylinder(0.9, 0.25, 0.5, w / 4, h + 0.4, d / 4, '#c8cdd2', 10);
      // Cyan data strip around the body, snapped to a floor boundary so it
      // never slices through a window row.
      glow.box(w + 0.08, 0.14, d + 0.08, 0, Math.round((h * 0.66) / FLOOR_H) * FLOOR_H, 0, spec.accent);
      break;
    }
    case 'glass-store': {
      // Mullion frame lines; verticals sit on the window-grid pitch (1.7) so
      // they land between window quads instead of crossing them.
      for (let f = 1; f < floors; f++) kit.box(w + 0.12, 0.14, d + 0.12, 0, f * FLOOR_H, 0, '#e8e4dc');
      for (const cx of [-3.4, 0, 3.4]) kit.box(0.14, h, 0.14, w / 2 + 0.02, h / 2, cx, '#e8e4dc');
      // Floating cube logo on the roof
      glow.boxOn(0.9, 0.9, 0.9, 0, h + 0.7, 0, spec.accent);
      break;
    }
    case 'server-facility': {
      // AC units + vent rows + status LEDs
      for (const zz of [-d / 4, d / 4]) kit.boxOn(1.6, 1.0, 1.6, -w / 4, h, zz, '#9aa0a5');
      for (let i = 0; i < 3; i++) kit.box(0.1, 1.6, 1.2, w / 2 + 0.04, h * 0.5, -d / 3 + i * (d / 3), '#5f6569');
      for (let i = 0; i < 5; i++) glow.box(0.08, 0.12, 0.12, w / 2 + 0.06, 1.9, -1.6 + i * 0.8, i % 2 ? P.neonGreen : '#3f8f46');
      // Pipes
      kit.cylinder(0.16, 0.16, h, 0.16, h / 2, d / 2 + 0.2, '#8f959a', 6);
      break;
    }
    case 'office-tower': {
      // Setback crown + rooftop details
      kit.boxOn(w * 0.6, FLOOR_H, d * 0.6, 0, h, 0, style.wallAlt);
      kit.boxOn(w * 0.62, 0.25, d * 0.62, 0, h + FLOOR_H, 0, style.roof);
      kit.boxOn(0.18, 2.8, 0.18, 0, h + FLOOR_H + 0.2, 0, '#4d565f');
      glow.box(0.26, 0.26, 0.26, 0, h + FLOOR_H + 3.1, 0, '#ff5d5d');
      // Glass lobby
      glow.box(0.1, FLOOR_H * 0.7, d * 0.7, w / 2 + 0.02, FLOOR_H * 0.4, 0, P.windowCool);
      break;
    }
    case 'workshop': {
      // Sawtooth roof
      for (let i = 0; i < 3; i++) {
        kit.boxOn(w / 3, 0.9, d, -w / 3 + i * (w / 3), h, 0, i % 2 ? '#8a5a3a' : '#96633f');
      }
      // Garage door + tool rack
      kit.box(0.12, 1.9, 2.6, w / 2 + 0.02, 0.95, -d / 4, '#7c6a55');
      kit.box(0.1, 0.9, 1.4, w / 2 + 0.04, 1.5, d / 4, '#5d4a37');
      break;
    }
    default:
      break;
  }

  group.add(kit.toMesh(MATERIALS.lit));
  if (!glow.isEmpty) {
    const glowMesh = new THREE.Mesh(glow.merge(), MATERIALS.glow);
    group.add(glowMesh);
  }

  // Sign above the door, mounted on a sign box that stands off the wall
  const signW = Math.min(w * 0.8, 6);
  const mount = new VoxelKit();
  mount.box(0.14, 1.4, signW + 0.16, w / 2 + 0.02, FLOOR_H + 0.9, 0, '#141824');
  const mountMesh = new THREE.Mesh(mount.merge(), MATERIALS.lit);
  mountMesh.castShadow = true;
  group.add(mountMesh);
  const sign = makeSign({
    text: spec.signText,
    subtext: spec.signSubtext,
    bg: '#1d1f2a',
    fg: spec.accent,
    width: signW,
    height: 1.25,
    glow: true,
  });
  sign.position.set(w / 2 + 0.1, FLOOR_H + 0.9, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  const bodyMesh = group.children[0] as THREE.Mesh;
  return {
    group,
    colliders: [{ w, h, d, x: 0, y: h / 2, z: 0 }],
    entranceLocal: new THREE.Vector3(w / 2 + 1.3, 0, 0),
    occluders: [bodyMesh],
    highlight: makeHighlight(spec.accent, w / 2 + 1.3),
  };
}

/* ------------------------------------------------------------------ */

function buildHanok(spec: BuildingSpec): BuiltStructure {
  const { width: w, depth: d } = spec;
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const bodyH = 2.4;

  // Raised wooden platform
  kit.boxOn(w + 0.8, 0.5, d + 0.8, 0, 0, 0, P.hanokWood);
  // Walls
  kit.boxOn(w, bodyH, d, 0, 0.5, 0, P.hanokWall);
  // Wooden columns at corners and door
  for (const cx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    for (const cz of [-d / 2 + 0.25, d / 2 - 0.25]) {
      kit.boxOn(0.4, bodyH, 0.4, cx, 0.5, cz, P.hanokWood);
    }
  }
  // Lattice windows (warm)
  glow.box(0.06, 1.1, 1.4, w / 2 + 0.01, 1.7, -d / 4, P.windowWarm);
  glow.box(0.06, 1.1, 1.4, w / 2 + 0.01, 1.7, d / 4, P.windowWarm);
  // Tiled roof: wide lifted eaves stepping into a true gabled ridge, with
  // eave-end caps — the classic hanok silhouette instead of a slab stack.
  const roofBase = 0.5 + bodyH;
  kit.boxOn(w + 2.6, 0.3, d + 2.6, 0, roofBase, 0, P.hanokRoof);
  kit.boxOn(w + 1.7, 0.3, d + 1.7, 0, roofBase + 0.3, 0, P.roofTile);
  kit.prism(d + 1.0, 1.35, w + 0.8, 0, roofBase + 0.6, 0, P.hanokRoof, Math.PI / 2);
  kit.box(w + 1.0, 0.22, 0.7, 0, roofBase + 1.95, 0, '#333a45'); // ridge beam
  // Eave-end caps (the pale roundels along the eave edges, ±z sides)
  for (const side of [-1, 1]) {
    const cols = Math.max(4, Math.round(w / 1.6));
    for (let i = 0; i < cols; i++) {
      const xx = -w / 2 - 0.9 + (i / (cols - 1)) * (w + 1.8);
      kit.box(0.18, 0.18, 0.18, xx, roofBase + 0.08, side * (d / 2 + 1.2), '#d9d2c0');
    }
  }
  // Tile courses: thin ridges parallel to the roof ridge, stepping up the
  // ±z slopes of the prism.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const zz = side * ((d + 1.0) / 2) * (1 - t);
      kit.box(w + 0.9 - t * 0.5, 0.1, 0.14, 0, roofBase + 0.62 + t * 1.28, zz, '#39404b');
    }
  }
  // Door (front +X)
  addDoor(kit, glow, w / 2, spec.accent, 0.5);
  // Low courtyard wall with gate gap — hugs the house side of the approach
  // so it never juts into the alley the door opens onto.
  kit.boxOn(0.4, 1.1, d * 0.7, w / 2 + 1.1, 0, -d / 2 - 0.6, P.hanokWall);
  kit.boxOn(0.5, 0.2, d * 0.7, w / 2 + 1.1, 1.1, -d / 2 - 0.6, P.roofTile);

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  const sign = makeSign({
    text: spec.signText,
    subtext: spec.signSubtext,
    bg: '#2b2118',
    fg: '#ffd9a0',
    width: 3.4,
    height: 1.0,
    glow: true,
  });
  sign.position.set(w / 2 + 0.1, bodyH + 0.4, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  const bodyMesh = group.children[0] as THREE.Mesh;
  return {
    group,
    colliders: [
      { w: w + 0.8, h: bodyH + 2, d: d + 0.8, x: 0, y: (bodyH + 2) / 2, z: 0 },
      { w: 0.4, h: 1.3, d: d * 0.7, x: w / 2 + 1.1, y: 0.65, z: -d / 2 - 0.6 },
    ],
    entranceLocal: new THREE.Vector3(w / 2 + 1.6, 0, 0),
    occluders: [bodyMesh],
    highlight: makeHighlight(spec.accent, w / 2 + 1.6),
  };
}

/* ------------------------------------------------------------------ */

function buildPhoneBooth(spec: BuildingSpec): BuiltStructure {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const w = 1.4;
  const h = 2.6;

  kit.boxOn(w, 0.15, w, 0, 0, 0, '#8f2f24');
  // Corner posts
  for (const cx of [-w / 2 + 0.12, w / 2 - 0.12]) {
    for (const cz of [-w / 2 + 0.12, w / 2 - 0.12]) {
      kit.boxOn(0.22, h, 0.22, cx, 0.15, cz, spec.accent);
    }
  }
  // Glass panes
  glow.box(0.05, h * 0.55, w - 0.5, -w / 2 + 0.02, h * 0.55, 0, '#cfe8ef');
  glow.box(w - 0.5, h * 0.55, 0.05, 0, h * 0.55, -w / 2 + 0.02, '#cfe8ef');
  glow.box(w - 0.5, h * 0.55, 0.05, 0, h * 0.55, w / 2 - 0.02, '#cfe8ef');
  // Crown + lamp
  kit.boxOn(w + 0.2, 0.4, w + 0.2, 0, h + 0.15, 0, '#8f2f24');
  glow.boxOn(0.3, 0.2, 0.3, 0, h + 0.55, 0, P.lampGlow);

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  const sign = makeSign({
    text: '전화',
    subtext: 'CONTACT',
    bg: '#8f2f24',
    fg: '#ffe9d0',
    width: 1.2,
    height: 0.6,
    glow: true,
  });
  sign.position.set(0, h - 0.15, w / 2 + 0.11);
  group.add(sign);

  return {
    group,
    colliders: [{ w, h: h + 0.5, d: w, x: 0, y: (h + 0.5) / 2, z: 0 }],
    entranceLocal: new THREE.Vector3(w / 2 + 1.1, 0, 0),
    occluders: [],
    highlight: makeHighlight(spec.accent, w / 2 + 1.1),
  };
}

/* ------------------------------------------------------------------ */

function buildSubwayStation(spec: BuildingSpec): BuiltStructure {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const w = spec.width; // canopy length
  const d = spec.depth;

  // Canopy on four pillars over a "descending" stair
  const canopyY = 2.7;
  for (const cx of [-w / 2 + 0.3, w / 2 - 0.3]) {
    for (const cz of [-d / 2 + 0.3, d / 2 - 0.3]) {
      kit.boxOn(0.35, canopyY, 0.35, cx, 0, cz, '#3f4d5c');
    }
  }
  kit.boxOn(w + 0.6, 0.35, d + 0.6, 0, canopyY, 0, '#4d6275');
  // Accent strip embedded in the canopy fascia (not hanging below its edge)
  glow.box(w + 0.5, 0.14, 0.14, 0, canopyY + 0.12, d / 2 + 0.28, spec.accent);

  // Stairwell: dark pit ringed by a low wall, steps fading down
  kit.boxOn(0.3, 0.9, d - 0.8, -w / 2 + 0.9, 0, 0, '#8f958f');
  kit.boxOn(w - 1.6, 0.9, 0.3, 0, 0, -d / 2 + 0.5, '#8f958f');
  kit.boxOn(w - 1.6, 0.9, 0.3, 0, 0, d / 2 - 0.5, '#8f958f');
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    kit.box(w - 2.2, 0.18, d - 1.4, -0.2 - t * 0.0, 0.05 - i * 0.16, 0, i < 2 ? '#7d8386' : '#565b5e');
  }
  glow.box(w - 2.4, 0.05, d - 1.6, -0.2, -0.72, 0, '#ffedbe'); // light from below

  // Rooftop sign mounting: two posts + a solid board core
  const signY = canopyY + 1.15;
  kit.boxOn(0.12, 0.85, 0.12, -1.6, canopyY + 0.35, 0, '#3f4d5c');
  kit.boxOn(0.12, 0.85, 0.12, 1.6, canopyY + 0.35, 0, '#3f4d5c');
  kit.box(4.4, 1.1, 0.08, 0, signY, 0, '#0d2545');

  group.add(kit.toMesh(MATERIALS.lit));
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  // Line-1 style roundel sign on both faces of the board
  for (const side of [1, -1] as const) {
    const sign = makeSign({
      text: '① 포트폴리오역',
      subtext: 'PORTFOLIO STN · LINKS',
      bg: '#12325c',
      fg: '#ffffff',
      border: spec.accent,
      width: 4.4,
      height: 1.1,
      glow: true,
    });
    sign.position.set(0, signY, side * 0.06);
    if (side === -1) sign.rotation.y = Math.PI;
    group.add(sign);
  }

  return {
    group,
    // Solid block under the canopy so the player can't fall into the "stairs";
    // the interaction happens at the entrance edge.
    colliders: [{ w: w - 1, h: 1.6, d: d - 0.6, x: 0, y: 0.35, z: 0 }],
    entranceLocal: new THREE.Vector3(w / 2 + 1.2, 0, 0),
    occluders: [],
    highlight: makeHighlight(spec.accent, w / 2 + 1.2),
  };
}

/* ------------------------------------------------------------------ */

function addDoor(kit: VoxelKit, glow: VoxelKit, faceX: number, accent: string, baseY = 0): void {
  // Inset dark doorway + frame + lamp + step
  kit.box(0.14, 2.0, 1.5, faceX + 0.01, baseY + 1.0, 0, '#20242e');
  kit.box(0.18, 2.2, 0.22, faceX + 0.03, baseY + 1.1, -0.85, '#2e333f');
  kit.box(0.18, 2.2, 0.22, faceX + 0.03, baseY + 1.1, 0.85, '#2e333f');
  kit.box(0.18, 0.22, 1.9, faceX + 0.03, baseY + 2.2, 0, '#2e333f');
  kit.boxOn(1.2, 0.18, 1.9, faceX + 0.5, 0, 0, '#9b958a'); // step
  glow.box(0.16, 0.22, 0.5, faceX + 0.06, baseY + 2.45, 0, accent); // door lamp
}

function makeHighlight(accent: string, doorDist: number): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.1, 24),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(doorDist, 0.06, 0);
  group.add(ring);
  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  beacon.position.set(doorDist, 2.1, 0);
  group.add(beacon);
  group.visible = false;
  return group;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
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
