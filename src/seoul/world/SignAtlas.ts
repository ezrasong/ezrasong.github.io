import * as THREE from 'three';
import { KOREAN_FONT } from './SignTexture';

/**
 * One shared sign atlas for the whole filler city: generic Korean shop
 * signs drawn into a single canvas, and every signboard quad UV-maps into
 * one of its cells. All the city's signboards together cost one texture
 * and one draw call. Horizontal rows carry the fascia bands; vertical
 * columns the projecting corner signs, lettered top to bottom the way
 * Seoul signs are.
 */
const ATLAS_SIGNS: { text: string; sub?: string; bg: string; fg: string; style?: 'band' | 'panel' | 'box' | 'plain' }[] = [
  { text: '치킨 · 호프', sub: 'CHICKEN', bg: '#8f2f24', fg: '#ffe9c9' },
  { text: '코인노래방', bg: '#22355c', fg: '#7de0ff', style: 'box' },
  { text: '온누리약국', bg: '#f2efe6', fg: '#2e7d4f', style: 'panel' },
  { text: '편의점 24', bg: '#1f4d3a', fg: '#ffd447' },
  { text: '행복공인중개사', bg: '#f2efe6', fg: '#31517c', style: 'panel' },
  { text: '헤어살롱', bg: '#2c2a2e', fg: '#f0d9e4', style: 'plain' },
  { text: '김밥천국', bg: '#d97a2e', fg: '#fff3e0' },
  { text: '카페 봄', bg: '#3a2f28', fg: '#e8c9a0', style: 'plain' },
  { text: '크린세탁', bg: '#2e5c74', fg: '#dff3ff' },
  { text: '정육점 마트', bg: '#7a2530', fg: '#ffd9c9' },
  { text: '수학학원', bg: '#f2efe6', fg: '#b03a2e', style: 'panel' },
  { text: '서울치과', bg: '#e9f0f2', fg: '#1f6f8b', style: 'panel' },
  { text: 'PC방', bg: '#121822', fg: '#5ff0c8', style: 'box' },
  { text: '떡볶이 분식', bg: '#c4362c', fg: '#fff2c4' },
  { text: '안경 렌즈', bg: '#f6f3ec', fg: '#262a30', style: 'panel' },
  { text: '고기집 삼겹살', bg: '#3b2a22', fg: '#ffb35c' },
];

const ATLAS_VERTICAL: { text: string; bg: string; fg: string }[] = [
  { text: '노래방', bg: '#1b2a55', fg: '#ff7ad1' },
  { text: '치과', bg: '#f2efe6', fg: '#1f6f8b' },
  { text: '학원', bg: '#f2efe6', fg: '#b03a2e' },
  { text: '호프', bg: '#8f2f24', fg: '#ffe9c9' },
  { text: '당구장', bg: '#1f4d3a', fg: '#ffd447' },
  { text: '약국', bg: '#2e7d4f', fg: '#ffffff' },
];

export interface AtlasSpot {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ry: number;
  vertical?: boolean;
}

export function makeShopSignAtlas(spots: AtlasSpot[]): THREE.Mesh {
  const ROW = 96;
  const W = 768;
  const VW = 96; // each vertical sign is one 96-px column, full height
  const H_ROWS = ATLAS_SIGNS.length;
  const canvas = document.createElement('canvas');
  canvas.width = W + VW * ATLAS_VERTICAL.length;
  canvas.height = ROW * H_ROWS;
  const ctx = canvas.getContext('2d')!;
  const CW = canvas.width;
  const CH = canvas.height;

  ATLAS_SIGNS.forEach((sg, i) => {
    const y0 = i * ROW;
    const style = sg.style ?? 'band';
    ctx.fillStyle = sg.bg;
    ctx.fillRect(0, y0, W, ROW);
    if (style === 'band') {
      ctx.fillStyle = sg.fg;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, y0 + 3, W, 3);
      ctx.fillRect(0, y0 + ROW - 6, W, 3);
      ctx.globalAlpha = 1;
    } else if (style === 'box') {
      ctx.strokeStyle = sg.fg;
      ctx.lineWidth = 4;
      ctx.strokeRect(8, y0 + 8, W - 16, ROW - 16);
    } else if (style === 'panel') {
      // Acrylic panel signs: a coloured stripe down the left edge
      ctx.fillStyle = sg.fg;
      ctx.fillRect(0, y0, 22, ROW);
    }
    ctx.fillStyle = sg.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${style === 'plain' ? 500 : 800} ${Math.round(ROW * 0.56)}px ${KOREAN_FONT}`;
    ctx.fillText(sg.text, W * 0.46, y0 + ROW * 0.53, W * 0.7);
    // Phone number, the staple of Korean signboards
    ctx.font = `600 ${Math.round(ROW * 0.18)}px ${KOREAN_FONT}`;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'right';
    ctx.fillText(sg.sub ?? `02-${320 + i * 57}-${1000 + i * 731}`, W - 24, y0 + ROW * 0.78);
    ctx.globalAlpha = 1;
  });

  ATLAS_VERTICAL.forEach((sg, i) => {
    const x0 = W + i * VW;
    ctx.fillStyle = sg.bg;
    ctx.fillRect(x0, 0, VW, CH);
    ctx.strokeStyle = sg.fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(x0 + 6, 6, VW - 12, CH - 12);
    ctx.fillStyle = sg.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...sg.text];
    const size = Math.min(VW * 0.7, (CH * 0.8) / chars.length / 1.15);
    ctx.font = `800 ${Math.round(size)}px ${KOREAN_FONT}`;
    chars.forEach((ch, k) => {
      ctx.fillText(ch, x0 + VW / 2, CH / 2 + (k - (chars.length - 1) / 2) * size * 1.15);
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let hi = 0;
  let vi = 0;
  for (const sp of spots) {
    let u0: number, u1: number, v0: number, v1: number;
    if (sp.vertical) {
      // Both faces of one projecting sign share a column.
      const col = Math.floor(vi++ / 2) % ATLAS_VERTICAL.length;
      u0 = (W + col * VW + 2) / CW;
      u1 = (W + (col + 1) * VW - 2) / CW;
      v0 = 0.005;
      v1 = 0.995;
    } else {
      // Scattered but deterministic, so neighbouring shops differ.
      const row = (hi++ * 7) % H_ROWS;
      u0 = 0.01;
      u1 = (W - 4) / CW;
      v0 = 1 - (row + 1) / H_ROWS + 0.004;
      v1 = 1 - row / H_ROWS - 0.004;
    }
    const cos = Math.cos(sp.ry);
    const sin = Math.sin(sp.ry);
    const hw = sp.w / 2;
    const hh = sp.h / 2;
    // Quad corners in local sign space (x along the face, normal +z),
    // rotated by ry about y.
    const base = positions.length / 3;
    for (const [lx, ly] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      positions.push(sp.x + lx * cos, sp.y + ly, sp.z - lx * sin);
    }
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
