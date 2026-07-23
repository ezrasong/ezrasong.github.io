import * as THREE from 'three';

const KOREAN_FONT = '"IBM Plex Sans KR", "Malgun Gothic", sans-serif';

export interface SignOptions {
  text: string;
  subtext?: string;
  bg: string;
  fg: string;
  border?: string;
  /** world size of the sign plane */
  width: number;
  height: number;
  glow?: boolean;
}

/**
 * Draws a pixel-flavored storefront sign to a canvas and returns a mesh.
 * Textures use NearestFilter so the lettering keeps a chunky, printed look.
 */
export function makeSign(opts: SignOptions): THREE.Mesh {
  const px = 96; // canvas pixels per world unit
  const w = Math.round(opts.width * px);
  const h = Math.round(opts.height * px);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, w, h);
  const border = opts.border ?? opts.fg;
  const bw = Math.max(3, Math.round(h * 0.05));
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, w, bw);
  ctx.fillRect(0, h - bw, w, bw);
  ctx.fillRect(0, 0, bw, h);
  ctx.fillRect(w - bw, 0, bw, h);

  ctx.fillStyle = opts.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainSize = opts.subtext ? h * 0.42 : h * 0.52;
  ctx.font = `700 ${Math.round(mainSize)}px ${KOREAN_FONT}`;
  ctx.fillText(opts.text, w / 2, opts.subtext ? h * 0.36 : h * 0.5, w * 0.9);
  if (opts.subtext) {
    ctx.font = `500 ${Math.round(h * 0.2)}px ${KOREAN_FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(opts.subtext, w / 2, h * 0.74, w * 0.9);
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const material = opts.glow
    ? new THREE.MeshBasicMaterial({ map: texture })
    : new THREE.MeshLambertMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.height), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** Small floor decal (e.g. tutorial keys, painted road text). */
export function makeDecal(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  width: number,
  height: number,
  resolution = 64,
  smooth = false
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const ctx = canvas.getContext('2d')!;
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * One shared sign atlas for the whole filler city: 10 generic Korean shop
 * signs drawn into a single canvas, and every storefront sign band quad
 * UV-maps into one of its rows. All the city's signboards together cost
 * one texture and one draw call.
 */
const ATLAS_SIGNS: { text: string; bg: string; fg: string }[] = [
  { text: '치킨 · 호프', bg: '#8f2f24', fg: '#ffe9c9' },
  { text: '서울 노래방', bg: '#22355c', fg: '#7de0ff' },
  { text: '한강 약국', bg: '#efe7d8', fg: '#2e7d4f' },
  { text: '편의점 24시', bg: '#1f4d3a', fg: '#ffd447' },
  { text: '공인중개사 부동산', bg: '#f2efe6', fg: '#31517c' },
  { text: '미용실 헤어', bg: '#5c2e4d', fg: '#ffb8d9' },
  { text: '분식 · 김밥', bg: '#d97a2e', fg: '#fff3e0' },
  { text: '카페 다방', bg: '#3a2f28', fg: '#e8c9a0' },
  { text: '세탁소', bg: '#2e5c74', fg: '#dff3ff' },
  { text: '정육점 마트', bg: '#7a2530', fg: '#ffd9c9' },
];

export function makeShopSignAtlas(
  spots: { x: number; y: number; z: number; w: number; h: number; ry: number }[]
): THREE.Mesh {
  const ROW = 96;
  const W = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = ROW * ATLAS_SIGNS.length;
  const ctx = canvas.getContext('2d')!;
  ATLAS_SIGNS.forEach((s, i) => {
    const y0 = i * ROW;
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, y0, W, ROW);
    ctx.fillStyle = s.fg;
    ctx.fillRect(0, y0 + 2, W, 4);
    ctx.fillRect(0, y0 + ROW - 6, W, 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(ROW * 0.52)}px ${KOREAN_FONT}`;
    ctx.fillText(s.text, W / 2, y0 + ROW * 0.54, W * 0.92);
    // Phone-number flourish, the staple of Korean signboards
    ctx.font = `500 ${Math.round(ROW * 0.2)}px ${KOREAN_FONT}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText('02-' + String(300 + i * 57).padStart(3, '0') + '-' + String(1000 + i * 731), W * 0.85, y0 + ROW * 0.82);
    ctx.globalAlpha = 1;
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  spots.forEach((s, si) => {
    const row = si % ATLAS_SIGNS.length;
    const v0 = 1 - (row + 1) / ATLAS_SIGNS.length;
    const v1 = 1 - row / ATLAS_SIGNS.length;
    const cos = Math.cos(s.ry);
    const sin = Math.sin(s.ry);
    const hw = s.w / 2;
    const hh = s.h / 2;
    // Quad corners in local sign space (x along the face, normal +z),
    // rotated by ry about y.
    const base = positions.length / 3;
    for (const [lx, ly] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      positions.push(s.x + lx * cos, s.y + ly, s.z - lx * sin);
    }
    uvs.push(0.04, v0 + 0.02, 0.96, v0 + 0.02, 0.96, v1 - 0.02, 0.04, v1 - 0.02);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export { KOREAN_FONT };
