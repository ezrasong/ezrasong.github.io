import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { KOREAN_FONT } from './SignTexture';

/**
 * The whole ground — grass, roads, sidewalks, plaza paving, park paths,
 * riverbank — is painted once into a single canvas texture on one plane:
 * one draw call, and it reads as a handmade miniature base plate.
 *
 * World extent: x ∈ [-80, 80], z ∈ [-70, 70].
 */
const WORLD_W = 160;
const WORLD_D = 140;
const SCALE = 13; // canvas px per world unit
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
  for (let i = 0; i < 260; i++) {
    const px = rng() * CW;
    const py = rng() * CD;
    const size = s(1 + rng() * 2.5);
    ctx.fillRect(px, py, size, size);
  }

  // --- Riverside park band (brighter, with a jogging path)
  ctx.fillStyle = '#639461';
  ctx.fillRect(u(-80), v(24), s(160), s(14));
  ctx.fillStyle = P.sand;
  ctx.fillRect(u(-80), v(31), s(160), s(2.2)); // path
  // bank
  ctx.fillStyle = '#b7a67f';
  ctx.fillRect(u(-80), v(36.5), s(160), s(1.5));
  // water under the river mesh, in case of gaps
  ctx.fillStyle = P.waterDeep;
  ctx.fillRect(u(-80), v(38), s(160), s(32));

  // --- Namsan foothill shading
  ctx.fillStyle = '#4e7d4c';
  ctx.beginPath();
  ctx.ellipse(u(0), v(-46), s(20), s(17), 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Roads
  const road = (x: number, z: number, w: number, d: number, sidewalk = 1.6) => {
    ctx.fillStyle = P.sidewalk;
    ctx.fillRect(u(x - w / 2 - sidewalk), v(z - d / 2 - sidewalk), s(w + sidewalk * 2), s(d + sidewalk * 2));
    ctx.fillStyle = P.asphalt;
    ctx.fillRect(u(x - w / 2), v(z - d / 2), s(w), s(d));
  };
  road(0, -25, 116, 6); // north main street (z=-25), spans city
  road(0, 22, 116, 6); // south riverside street
  road(0, 4, 6, 64); // central north-south spine, hill to river bank
  road(-24, -1.5, 6, 53); // Hongdae street
  road(24, -1.5, 6, 53); // Gangnam boulevard
  road(40, -30, 34, 4, 1.2); // hanok alley (narrower, calmer)

  // --- Lane dashes
  ctx.fillStyle = P.laneMark;
  const dash = (x: number, z: number, horizontal: boolean, len: number) => {
    for (let t = 0; t < len; t += 3) {
      if (horizontal) ctx.fillRect(u(x + t), v(z - 0.12), s(1.4), s(0.24));
      else ctx.fillRect(u(x - 0.12), v(z + t), s(0.24), s(1.4));
    }
  };
  dash(-58, -25, true, 116);
  dash(-58, 22, true, 116);
  dash(0, -22, false, 40);
  dash(-24, -22, false, 41);
  dash(24, -22, false, 41);

  // --- Crosswalks near the plaza and district gates
  const crosswalk = (x: number, z: number, horizontal: boolean) => {
    ctx.fillStyle = P.laneMark;
    for (let i = -2.4; i <= 2.4; i += 0.8) {
      if (horizontal) ctx.fillRect(u(x + i), v(z - 2.4), s(0.45), s(4.8));
      else ctx.fillRect(u(x - 2.4), v(z + i), s(4.8), s(0.45));
    }
  };
  crosswalk(0, -20.5, true);
  crosswalk(0, 17.5, true);
  crosswalk(-19.5, -1.5, false);
  crosswalk(19.5, -1.5, false);

  // --- Central plaza: circular paving with rings
  const px0 = u(0);
  const pz0 = v(2);
  ctx.fillStyle = P.plaza;
  ctx.beginPath();
  ctx.arc(px0, pz0, s(13), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.plazaDark;
  ctx.lineWidth = s(0.35);
  for (const r of [3, 6, 9, 12]) {
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

  // --- Painted street names (diegetic wayfinding)
  const roadText = (text: string, x: number, z: number, angle: number) => {
    ctx.save();
    ctx.translate(u(x), v(z));
    ctx.rotate(angle);
    ctx.fillStyle = P.laneMark;
    ctx.font = `700 ${s(1.9)}px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  roadText('홍대 →', -13, -1.5, 0);
  roadText('← 강남', 13, -1.5, 0);
  roadText('한강 ↑', 0, 13, 0);
  roadText('남산 ↓', 0, -14, 0);
  roadText('한옥골목 →', 31, -25.2, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshLambertMaterial({ map: texture })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
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
