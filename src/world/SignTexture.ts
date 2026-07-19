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

export { KOREAN_FONT };
