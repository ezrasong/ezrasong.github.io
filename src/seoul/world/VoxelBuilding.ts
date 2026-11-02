import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import type { BuildingType, Facing } from '../types';
import { makeSign } from './SignTexture';
import { MATERIALS, VoxelKit } from './voxel';
import { hanokHouse, hanokWall } from './Hanok';
import { buildBody, FLOOR_H } from './ProjectBuildings';

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

function buildBlockBuilding(spec: BuildingSpec): BuiltStructure {
  const { width: w, depth: d, floors } = spec;
  const h = floors * FLOOR_H;
  const group = new THREE.Group();
  const body = buildBody(spec, mulberry32(hashCode(spec.signText)));

  const bodyMesh = body.kit.toMesh(MATERIALS.lit);
  group.add(bodyMesh);
  const occluders = [bodyMesh];
  if (!body.glow.isEmpty) group.add(new THREE.Mesh(body.glow.merge(), MATERIALS.glow));
  if (!body.glass.isEmpty) {
    const glassMesh = body.glass.toMesh(MATERIALS.glassWall);
    group.add(glassMesh);
    occluders.push(glassMesh);
  }
  for (const e of body.extras) group.add(e);

  // Name sign over the door. Most types mount it on a dark sign box that
  // stands off the wall; the tower letters it straight onto the podium.
  const signW = body.signW;
  if (body.mount) {
    const mount = new VoxelKit();
    mount.box(0.14, 1.4, signW + 0.16, w / 2 + 0.1, body.signY, 0, '#141824');
    const mountMesh = new THREE.Mesh(mount.merge(), MATERIALS.lit);
    mountMesh.castShadow = true;
    group.add(mountMesh);
  }
  const sign = makeSign({
    text: spec.signText,
    subtext: spec.signSubtext,
    bg: body.mount ? '#1d1f2a' : '#2a2c30',
    fg: spec.accent,
    width: signW,
    height: 1.25,
    glow: true,
  });
  sign.position.set(w / 2 + (body.mount ? 0.18 : 0.08), body.signY, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  return {
    group,
    colliders: [{ w, h, d, x: 0, y: h / 2, z: 0 }, ...body.colliders],
    entranceLocal: new THREE.Vector3(w / 2 + 1.3, 0, 0),
    occluders,
    highlight: makeHighlight(spec.accent, w / 2 + 1.3),
  };
}

/* ------------------------------------------------------------------ */

function buildHanok(spec: BuildingSpec): BuiltStructure {
  // Frontage runs along local z, depth along x; the door faces +x.
  const W = spec.width;
  const D = spec.depth;
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const paper = new VoxelKit();
  const group = new THREE.Group();
  const { floorY } = hanokHouse(kit, glow, paper, { width: W, depth: D, doorway: true });
  // Courtyard walls run out from both sides of the house to the alley, so
  // the house sits inside its own compound as hanok do.
  for (const s of [-1, 1]) hanokWall(kit, D / 2 - 1.0, s * (W / 2 + 1.0), 4.4, true);

  const bodyMesh = kit.toMesh(MATERIALS.lit);
  group.add(bodyMesh);
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  group.add(new THREE.Mesh(paper.merge(), MATERIALS.paper));

  // Name plaque (현판) on the lintel over the door, dark wood with
  // carved-gold lettering, below the bracket course.
  const sign = makeSign({
    text: spec.signText,
    subtext: spec.signSubtext,
    bg: '#3a2a1d',
    fg: '#e9c98f',
    border: '#5a412c',
    width: 2.0,
    height: 0.62,
    glow: true,
  });
  sign.position.set(D / 2 + 0.13, floorY + 2.12, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  return {
    group,
    colliders: [
      { w: D + 1.3, h: 4.5, d: W + 1.3, x: 0, y: 2.25, z: 0 },
      { w: 4.4, h: 1.6, d: 0.6, x: D / 2 - 1.0, y: 0.8, z: -(W / 2 + 1.0) },
      { w: 4.4, h: 1.6, d: 0.6, x: D / 2 - 1.0, y: 0.8, z: W / 2 + 1.0 },
    ],
    entranceLocal: new THREE.Vector3(D / 2 + 2.3, 0, 0),
    occluders: [bodyMesh],
    highlight: makeHighlight(spec.accent, D / 2 + 2.3),
  };
}

/* ------------------------------------------------------------------ */

function buildPhoneBooth(spec: BuildingSpec): BuiltStructure {
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const group = new THREE.Group();
  const w = 1.4;
  const h = 2.6;

  // Korean street phone booth (공중전화): a slim aluminium frame with
  // glazed sides, a grey roof cap, and the green-and-white 공중전화 band.
  // The door side (+x) is open toward the approach.
  const FRAME = '#c9cdd2';
  const FRAME_DARK = '#8d939a';
  kit.boxOn(w, 0.08, w, 0, 0, 0, '#7e8389');
  for (const cx of [-w / 2 + 0.05, w / 2 - 0.05]) {
    for (const cz of [-w / 2 + 0.05, w / 2 - 0.05]) {
      kit.boxOn(0.1, h, 0.1, cx, 0.08, cz, FRAME);
    }
  }
  // Glazed sides with a kick panel and a mid rail (glass reads dark by day)
  const paneH = h * 0.62;
  const paneY = 0.6 + paneH / 2;
  for (const [px, pz, rot] of [[-w / 2, 0, true], [0, -w / 2, false], [0, w / 2, false]] as const) {
    const pw = w - 0.12;
    if (rot) {
      kit.box(0.04, 0.5, pw, px, 0.33, pz, FRAME_DARK);
      glow.box(0.03, paneH, pw - 0.04, px, paneY, pz, '#bcd6e2');
      kit.box(0.05, 0.05, pw, px, paneY, pz, FRAME);
    } else {
      kit.box(pw, 0.5, 0.04, px, 0.33, pz, FRAME_DARK);
      glow.box(pw - 0.04, paneH, 0.03, px, paneY, pz, '#bcd6e2');
      kit.box(pw, 0.05, 0.05, px, paneY, pz, FRAME);
    }
  }
  // Phone unit on the back wall, with handset and shelf
  kit.box(0.18, 0.6, 0.42, -w / 2 + 0.16, 1.45, 0, '#3f6db5');
  kit.box(0.08, 0.36, 0.1, -w / 2 + 0.28, 1.5, 0.12, '#25282d');
  kit.box(0.34, 0.04, 0.6, -w / 2 + 0.24, 1.08, 0, FRAME_DARK);
  // Roof cap and the sign band on every side
  kit.boxOn(w + 0.14, 0.34, w + 0.14, 0, h + 0.08, 0, '#e8ebee');
  kit.boxOn(w + 0.2, 0.08, w + 0.2, 0, h + 0.42, 0, '#9aa0a6');
  glow.boxOn(0.24, 0.1, 0.24, 0, h + 0.5, 0, P.lampGlow);
  const bodyMesh = kit.toMesh(MATERIALS.lit);
  group.add(bodyMesh);
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));

  // 공중전화 band, the KT green on white, facing the approach and the plaza.
  for (const [px, pz, ry] of [[w / 2 + 0.08, 0, Math.PI / 2], [0, w / 2 + 0.08, 0], [0, -w / 2 - 0.08, Math.PI]] as const) {
    const sign = makeSign({
      text: '공중전화',
      bg: '#f4f5f2',
      fg: '#1f7a4d',
      border: '#1f7a4d',
      width: 1.32,
      height: 0.3,
      glow: true,
    });
    sign.position.set(px, h + 0.25, pz);
    sign.rotation.y = ry;
    group.add(sign);
  }

  return {
    group,
    colliders: [{ w, h: h + 0.5, d: w, x: 0, y: (h + 0.5) / 2, z: 0 }],
    entranceLocal: new THREE.Vector3(w / 2 + 1.1, 0, 0),
    occluders: [bodyMesh],
    highlight: makeHighlight(spec.accent, w / 2 + 1.1),
  };
}

/* ------------------------------------------------------------------ */

function buildSubwayStation(spec: BuildingSpec): BuiltStructure {
  // A Seoul Metro exit (출구): a stair dropping into the ground inside a
  // granite-capped parapet, under a glass-and-steel canopy, with the pole
  // sign carrying the line roundel, the station name and the exit number.
  // The stair opens toward +x, which is where the player enters.
  const kit = new VoxelKit();
  const glow = new VoxelKit();
  const glass = new VoxelKit();
  const group = new THREE.Group();
  const w = spec.width; // stair length, along x
  const d = spec.depth; // width across
  const STEEL = '#59606a';
  const GRANITE = '#a19c92';
  const LINE = '#0d3692'; // Line 1 blue

  // Parapet walls along both sides and the far end, granite cap on top
  for (const s of [-1, 1]) {
    kit.boxOn(w, 0.95, 0.3, 0, 0, s * (d / 2 - 0.15), '#8b8780');
    kit.boxOn(w + 0.04, 0.08, 0.38, 0, 0.95, s * (d / 2 - 0.15), GRANITE);
  }
  kit.boxOn(0.3, 0.95, d, -w / 2 + 0.15, 0, 0, '#8b8780');
  kit.boxOn(0.38, 0.08, d + 0.04, -w / 2 + 0.15, 0.95, 0, GRANITE);
  // The street is one flat plane, so the stair can't actually cut into it.
  // Instead the well is raised: the parapet stands 0.95 m tall, and the
  // flight is modelled inside it as solid treads stepping DOWN from the
  // parapet top toward a dark landing, with lit risers so every step reads.
  // From street level and from the follow camera it reads as a stair
  // dropping into the concourse.
  const steps = 9;
  const top = 0.92;
  const bottom = -0.02;
  const inner = d - 0.7;
  const run = (w - 1.2) / steps;
  for (let i = 0; i < steps; i++) {
    const x = w / 2 - 0.5 - (i + 0.5) * run;
    const y = top - ((top - bottom) * (i + 1)) / steps;
    const t = i / (steps - 1);
    const tread = '#' + new THREE.Color('#9a9c98').lerp(new THREE.Color('#4a4e52'), t).getHexString();
    // Solid step down to the well floor so no gap shows under any tread
    kit.boxOn(run + 0.02, y + 0.02, inner, x, -0.02, 0, '#3a3d40');
    kit.box(run + 0.02, 0.06, inner, x, y, 0, tread);
    kit.box(0.08, 0.03, inner, x + run / 2 - 0.04, y + 0.035, 0, '#d1ac3e'); // anti-slip nosing
  }
  // Entry: a short landing at street level in front of the first step,
  // then the dark opening at the bottom with the concourse light.
  kit.box(0.5, 0.94, inner, w / 2 - 0.25, 0.45, 0, '#8e918f');
  kit.box(0.6, 0.04, inner, w / 2 - 0.3, 0.94, 0, '#a7a9a5');
  kit.boxOn(0.5, 0.9, inner, -w / 2 + 0.55, -0.02, 0, '#16181b');
  glow.box(0.04, 0.6, inner - 0.2, -w / 2 + 0.81, 0.35, 0, '#ffedbe');
  // Stainless handrails following the flight on both sides
  for (const sd of [-1, 1]) {
    const z = sd * (inner / 2 - 0.08);
    kit.bar(w / 2 - 0.5, top + 0.85, z, -w / 2 + 0.9, bottom + 0.85, z, 0.05, '#c3c8cd');
    for (const xp of [w / 2 - 0.5, 0, -w / 2 + 0.9]) {
      const yp = top + ((bottom - top) * (w / 2 - 0.5 - xp)) / (w - 1.4);
      kit.bar(xp, yp, z, xp, yp + 0.85, z, 0.04, '#c3c8cd');
    }
  }

  // Canopy: steel portal frames with a glass roof, curved down toward the
  // entry the way the newer Seoul exits are
  const canopyY = 2.75;
  const frames = 4;
  for (let i = 0; i < frames; i++) {
    const x = -w / 2 + 0.3 + (i * (w - 0.6)) / (frames - 1);
    for (const s of [-1, 1]) kit.boxOn(0.12, canopyY, 0.12, x, 0, s * (d / 2 - 0.15), STEEL);
    kit.box(0.14, 0.14, d, x, canopyY, 0, STEEL);
  }
  for (const s of [-1, 1]) kit.box(w - 0.4, 0.12, 0.12, 0, canopyY, s * (d / 2 - 0.15), STEEL);
  glass.box(w - 0.4, 0.04, d - 0.2, 0, canopyY + 0.1, 0, '#6f8796');
  // Front lip curving down over the entry
  kit.profile([[0, 0], [0.5, -0.12], [0.75, -0.42], [0.69, -0.45], [0.46, -0.18], [0, -0.07]], d + 0.1, w / 2 - 0.2, canopyY + 0.12, 0, STEEL);
  // Exit number plate on the canopy fascia, facing the approach
  glow.box(0.04, 0.3, 0.3, w / 2 + 0.36, canopyY - 0.12, d / 2 - 0.5, '#f5c400');

  // Pole sign standing beside the entry
  const px = w / 2 + 0.4;
  const pz = -d / 2 - 0.45;
  kit.cylinder(0.08, 0.1, 3.2, px, 1.6, pz, STEEL, 8);
  kit.box(0.14, 1.15, 0.92, px, 3.6, pz, '#e9ebec');
  kit.cylinder(0.32, 0.32, 0.12, px, 4.45, pz, LINE, 16);
  glow.box(0.02, 1.05, 0.82, px + 0.08, 3.6, pz, '#ffffff');

  const bodyMesh = kit.toMesh(MATERIALS.lit);
  group.add(bodyMesh);
  group.add(new THREE.Mesh(glow.merge(), MATERIALS.glow));
  const glassMesh = glass.toMesh(MATERIALS.glassWall);
  group.add(glassMesh);

  // Station sign over the canopy, both faces: line roundel + name
  const signY = canopyY + 0.75;
  const board = new VoxelKit();
  board.box(0.1, 0.9, 4.0, 0, signY, 0, '#0b2a6a');
  for (const s of [-1, 1]) board.boxOn(0.08, 0.5, 0.08, 0, canopyY + 0.15, s * 1.6, STEEL);
  group.add(board.toMesh(MATERIALS.lit));
  for (const side of [1, -1] as const) {
    const sign = makeSign({
      text: '① 포트폴리오역',
      subtext: 'PORTFOLIO STN · LINKS',
      bg: LINE,
      fg: '#ffffff',
      border: spec.accent,
      width: 4.0,
      height: 0.86,
      glow: true,
    });
    sign.position.set(side * 0.07, signY, 0);
    sign.rotation.y = side * (Math.PI / 2);
    group.add(sign);
  }
  // Small exit-number sign on the pole, toward the approach
  const pole = makeSign({ text: '1', subtext: '출구 EXIT', bg: '#f5c400', fg: '#1a1a1a', width: 0.8, height: 0.95, glow: true });
  // Keep the lettering in front of the illuminated panel's outer face.
  pole.position.set(px + 0.105, 3.6, pz);
  pole.rotation.y = Math.PI / 2;
  group.add(pole);

  return {
    group,
    // Solid block over the stair well so the player can't fall in; the
    // interaction happens at the entry edge.
    colliders: [
      { w: w - 1, h: 1.6, d: d - 0.6, x: 0, y: 0.35, z: 0 },
      { w: 0.3, h: 3.2, d: 0.3, x: px, y: 1.6, z: pz },
    ],
    entranceLocal: new THREE.Vector3(w / 2 + 1.2, 0, 0),
    occluders: [bodyMesh, glassMesh],
    highlight: makeHighlight(spec.accent, w / 2 + 1.2),
  };
}

/* ------------------------------------------------------------------ */

function makeHighlight(accent: string, doorDist: number): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.05, 48),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(doorDist, 0.06, 0);
  group.add(ring);
  // A small marker over the doorway, kept above head height so a close
  // camera never has it filling the frame.
  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  beacon.position.set(doorDist, 2.6, 0);
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
