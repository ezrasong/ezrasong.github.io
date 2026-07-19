import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';

/**
 * The whole ground — grass, roads, sidewalks, plaza paving, park paths,
 * riverbanks — is painted once into a single canvas texture on one plane:
 * one draw call, and it reads as a handmade miniature base plate.
 *
 * World extent: x ∈ [-104, 104], z ∈ [-104, 104].
 * Layout (mini-Seoul, north = -z):
 *   z ≈ -104..-86  Bukhansan mountain backdrop band
 *   z ≈  -86..-42  Namsan hill + hanok alley (east)
 *   z  =  -34      Namsan-ro (east-west arterial)
 *   z ≈  -28..0    Starlight Plaza (spawn), Hongdae west, Insadong east
 *   z  =   8       Gangbyeon riverside boulevard (north bank)
 *   z ≈   12..20   Hangang park band + jogging path
 *   z ≈   20..48   THE HAN RIVER (crossed by two bridges + pier)
 *   z ≈   48..53   south bank strip
 *   z  =   56      Olympic-daero (south riverside boulevard)
 *   z ≈   60..76   Gangnam blocks (east) / Yeouido + apartments (west)
 *   z  =   80      Teheran-ro
 *   z ≈   84..96   deep Gangnam second row
 */
const WORLD_W = 208;
const WORLD_D = 208;
const SCALE = 15; // canvas px per world unit (3120×3120)
const CW = WORLD_W * SCALE;
const CD = WORLD_D * SCALE;

function u(x: number): number {
  return (x + WORLD_W / 2) * SCALE;
}
function v(z: number): number {
  return (z + WORLD_D / 2) * SCALE;
}
function s(len: number): number {
  return len * SCALE;
}

export const RIVER_NORTH_EDGE = 20;
export const RIVER_SOUTH_EDGE = 48;

/** World half-extent, for consumers mapping world coords onto the canvas. */
export const GROUND_EXTENT = WORLD_W / 2;

let paintedCanvas: HTMLCanvasElement | null = null;

/** The canvas painted by createGround — reused by the minimap. */
export function getGroundCanvas(): HTMLCanvasElement | null {
  return paintedCanvas;
}

export function createGround(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CD;
  const ctx = canvas.getContext('2d')!;

  // --- Base grass with hand-placed tonal patches
  ctx.fillStyle = P.grass;
  ctx.fillRect(0, 0, CW, CD);
  ctx.fillStyle = P.grassDark;
  const rng = mulberry32(7);
  for (let i = 0; i < 420; i++) {
    const px = rng() * CW;
    const py = rng() * CD;
    const size = s(1 + rng() * 2.5);
    ctx.fillRect(px, py, size, size);
  }

  // --- Northern mountain band (under the Bukhansan backdrop meshes)
  ctx.fillStyle = '#3f6a41';
  ctx.fillRect(0, v(-104), CW, s(18));
  ctx.fillStyle = '#456f44';
  ctx.fillRect(0, v(-88), CW, s(4));

  // --- Hangang park band north of the river (brighter, with a jogging path)
  ctx.fillStyle = '#639461';
  ctx.fillRect(u(-104), v(11), s(208), s(7.5));
  ctx.fillStyle = P.sand;
  ctx.fillRect(u(-104), v(14.6), s(208), s(1.6)); // jogging path
  // north bank
  ctx.fillStyle = '#b7a67f';
  ctx.fillRect(u(-104), v(18.3), s(208), s(1.7));
  // water base under the animated river mesh (avoids gaps at the shore)
  ctx.fillStyle = P.waterDeep;
  ctx.fillRect(u(-104), v(20), s(208), s(28));
  // south bank + park strip
  ctx.fillStyle = '#b7a67f';
  ctx.fillRect(u(-104), v(48), s(208), s(1.6));
  ctx.fillStyle = '#639461';
  ctx.fillRect(u(-104), v(49.6), s(208), s(3.2));

  // --- Namsan foothill shading
  ctx.fillStyle = '#4e7d4c';
  ctx.beginPath();
  ctx.ellipse(u(0), v(-58), s(20), s(17), 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Roads
  // Painted in two passes: first every road with its sidewalk apron, then
  // every asphalt core again. Without the second pass, each later road's
  // sidewalk apron stamps light strips across the asphalt of the roads it
  // crosses, leaving broken-looking junctions.
  const ROADS: [number, number, number, number, number?][] = [
    // North bank, east-west
    [0, -34, 168, 6], // Namsan-ro
    [0, 8, 168, 6], // Gangbyeon riverside boulevard
    // South bank, east-west
    [0, 56, 168, 6], // Olympic-daero
    [0, 80, 168, 6], // Teheran-ro
    // North bank, north-south
    [0, -11, 6, 58], // spine: Namsan gate → bridge
    [-32, -13, 6, 42], // Hongdae street
    [-64, -13, 6, 42], // Hongdae west street
    [32, -13, 6, 42], // Insadong street
    [64, -13, 6, 42], // east street
    [-48, 11, 6, 14], // Yanghwa bridge connector
    // South bank, north-south
    [0, 73, 6, 46], // spine south: bridge → Teheran-ro
    [32, 66, 6, 28], // Gangnam street
    [64, 66, 6, 28], // Gangnam east street
    [-48, 66, 6, 28], // Yeouido street
    // Hanok alley (narrower, calmer)
    [46, -44, 40, 4, 1.2],
  ];
  ctx.fillStyle = P.sidewalk;
  for (const [x, z, w, d, sidewalk = 1.6] of ROADS) {
    ctx.fillRect(
      u(x - w / 2 - sidewalk),
      v(z - d / 2 - sidewalk),
      s(w + sidewalk * 2),
      s(d + sidewalk * 2)
    );
  }
  ctx.fillStyle = P.asphalt;
  for (const [x, z, w, d] of ROADS) {
    ctx.fillRect(u(x - w / 2), v(z - d / 2), s(w), s(d));
  }
  // Paved aprons where the bridge ramps land on the south bank, so the
  // ramps meet pavement instead of a stripe of park grass.
  ctx.fillRect(u(-3.8), v(48), s(7.6), s(5.2)); // Hangang bridge landing
  ctx.fillRect(u(-51.4), v(48), s(6.8), s(5.2)); // Yanghwa bridge landing

  // --- Lane dashes
  ctx.fillStyle = P.laneMark;
  const dash = (x: number, z: number, horizontal: boolean, len: number) => {
    for (let t = 0; t < len; t += 3) {
      if (horizontal) ctx.fillRect(u(x + t), v(z - 0.12), s(1.4), s(0.24));
      else ctx.fillRect(u(x - 0.12), v(z + t), s(0.24), s(1.4));
    }
  };
  dash(-84, -34, true, 168);
  dash(-84, 8, true, 168);
  dash(-84, 56, true, 168);
  dash(-84, 80, true, 168);
  dash(0, -40, false, 58);
  dash(0, 50, false, 46);
  dash(-32, -34, false, 42);
  dash(-64, -34, false, 42);
  dash(32, -34, false, 42);
  dash(64, -34, false, 42);
  dash(32, 52, false, 28);
  dash(64, 52, false, 28);
  dash(-48, 52, false, 28);

  // --- Clear the junction boxes: lane dashes must never run through an
  // intersection (they were crossing each other mid-junction). Repaint
  // plain asphalt over every crossing, then lay crosswalks on top.
  const junctions: [number, number][] = [];
  for (const jx of [-64, -32, 0, 32, 64]) junctions.push([jx, -34], [jx, 8]);
  junctions.push([-48, 8]); // Yanghwa bridge connector meets the boulevard
  for (const jx of [-48, 0, 32, 64]) junctions.push([jx, 56], [jx, 80]);
  ctx.fillStyle = P.asphalt;
  for (const [jx, jz] of junctions) {
    ctx.fillRect(u(jx - 3), v(jz - 3), s(6), s(6));
  }

  // --- Crosswalks at the busy junctions
  const crosswalk = (x: number, z: number, horizontal: boolean) => {
    ctx.fillStyle = P.laneMark;
    // Each 0.45-wide stripe is centered on its offset so the band sits
    // symmetrically on the road instead of drifting half a stripe sideways.
    for (let i = -2.4; i <= 2.4; i += 0.8) {
      if (horizontal) ctx.fillRect(u(x + i - 0.225), v(z - 2.4), s(0.45), s(4.8));
      else ctx.fillRect(u(x - 2.4), v(z + i - 0.225), s(4.8), s(0.45));
    }
  };
  crosswalk(0, -34, true); // plaza → Namsan gate
  crosswalk(-32, -34, true);
  crosswalk(32, -34, true);
  crosswalk(0, 8, true); // plaza → Hangang bridge
  crosswalk(-48, 8, true); // → Yanghwa bridge
  crosswalk(-32, 8, true);
  crosswalk(32, 8, true);
  crosswalk(0, 56, true); // bridge landing → Gangnam
  crosswalk(-48, 56, true); // → Yeouido
  crosswalk(32, 80, true);
  crosswalk(64, 80, true);

  // --- Central plaza: circular paving with rings
  const px0 = u(0);
  const pz0 = v(-14);
  ctx.fillStyle = P.plaza;
  ctx.beginPath();
  ctx.arc(px0, pz0, s(12), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.plazaDark;
  ctx.lineWidth = s(0.35);
  for (const r of [3, 6, 9, 11.4]) {
    ctx.beginPath();
    ctx.arc(px0, pz0, s(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  // compass star at the very center
  ctx.fillStyle = P.plazaDark;
  ctx.save();
  ctx.translate(px0, pz0);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -s(2.6));
    ctx.lineTo(s(0.7), 0);
    ctx.lineTo(-s(0.7), 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Street-name wayfinding is no longer baked into this (deliberately
  // chunky) base plate — World.addWayfinding() lays crisp floating decals
  // on top of the roads instead.

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshLambertMaterial({ map: texture })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  paintedCanvas = canvas;
  return mesh;
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
