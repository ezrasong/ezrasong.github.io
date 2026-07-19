import { PALETTE as P } from '../config/palette';
import { shoreNorth, shoreSouth } from './Terrain';

/**
 * The whole ground — grass, roads, sidewalks, plaza paving, park paths,
 * riverbanks — is painted once into a single canvas texture that wraps the
 * displaced terrain grid (see Terrain.ts) and doubles as the minimap.
 *
 * World extent: x ∈ [-104, 104], z ∈ [-104, 104].
 * Layout (mini-Seoul, north = -z):
 *   z ≈ -104..-86  Bukhansan mountain backdrop band
 *   z ≈  -86..-42  Namsan hill + hanok alley (east)
 *   z  =  -34      Namsan-ro (east-west arterial)
 *   z ≈  -28..0    Starlight Plaza (spawn), Hongdae west, Insadong east
 *   z  =   8       Gangbyeon riverside boulevard (north bank)
 *   z ≈   12..20   Hangang park band + jogging path
 *   z ≈   20..48   THE HAN RIVER (curved shores; two bridges + pier)
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

/** The canvas painted by paintGroundCanvas — reused by the minimap. */
export function getGroundCanvas(): HTMLCanvasElement | null {
  return paintedCanvas;
}

/** Road rectangles [x, z, w, d, sidewalkWidth?] shared by several layers. */
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
];

export function paintGroundCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CD;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(7);

  // ---------------------------------------------------------------- grass
  ctx.fillStyle = P.grass;
  ctx.fillRect(0, 0, CW, CD);
  // Macro mottling: layered soft blobs in darker/lighter tones read as
  // meadow variation instead of a single flat green (or square patches).
  const mottle = (color: string, alpha: number, count: number, rMin: number, rMax: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const px = rng() * CW;
      const py = rng() * CD;
      const r = s(rMin + rng() * (rMax - rMin));
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * (0.55 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  mottle(P.grassDark, 0.5, 260, 2.5, 9);
  mottle('#659a5e', 0.4, 220, 1.5, 6);
  mottle('#527e4e', 0.35, 200, 1, 4);
  mottle('#6ea360', 0.25, 140, 0.8, 2.6);

  // --- Northern mountain band (under the Bukhansan backdrop meshes)
  ctx.fillStyle = '#3f6a41';
  ctx.fillRect(0, v(-104), CW, s(18));
  ctx.fillStyle = '#456f44';
  ctx.fillRect(0, v(-88), CW, s(4));

  // ------------------------------------------------------------- riverside
  // Hangang park band north of the river (brighter green)
  ctx.fillStyle = '#639461';
  ctx.fillRect(u(-104), v(11), s(208), s(8));
  mottleBand(ctx, rng, v(11), v(19), '#578a55', 90);

  // Sandy banks follow the curved shoreline. North bank: sand from the
  // park edge down to the waterline; the water fill comes after.
  fillShoreBand(ctx, (x) => shoreNorth(x) - 2.2, (x) => shoreNorth(x) + 0.3, P.sand);
  fillShoreBand(ctx, (x) => shoreNorth(x) - 2.4, (x) => shoreNorth(x) - 1.5, '#b7a67f');
  // South bank
  fillShoreBand(ctx, (x) => shoreSouth(x) - 0.3, (x) => shoreSouth(x) + 2.2, P.sand);
  fillShoreBand(ctx, (x) => shoreSouth(x) + 1.5, (x) => shoreSouth(x) + 2.4, '#b7a67f');
  ctx.fillStyle = '#639461';
  fillShoreBand(ctx, (x) => shoreSouth(x) + 2.2, () => 53.4, '#639461');

  // Water base under the animated river shader (fills the curved channel,
  // so terrain never shows through between waves).
  fillShoreBand(ctx, (x) => shoreNorth(x) - 0.4, (x) => shoreSouth(x) + 0.4, P.waterDeep);
  // Riverbed shading: darker center channel.
  fillShoreBand(ctx, (x) => shoreNorth(x) + 6, (x) => shoreSouth(x) - 6, '#2e5570');

  // Curved jogging path through the park band.
  strokePath(
    ctx,
    (t) => {
      const x = -104 + t * 208;
      return [x, 15.2 + Math.sin(x * 0.05 + 1.2) * 1.1 + Math.sin(x * 0.017) * 0.7];
    },
    1.5,
    P.sand
  );
  // South bank riverside path.
  strokePath(
    ctx,
    (t) => {
      const x = -104 + t * 208;
      return [x, 51.6 + Math.sin(x * 0.045 + 3.0) * 0.7];
    },
    1.3,
    '#c0b08b'
  );

  // --- Namsan foothill shading
  ctx.fillStyle = '#4e7d4c';
  ctx.beginPath();
  ctx.ellipse(u(0), v(-58), s(20), s(17), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#457244';
  ctx.beginPath();
  ctx.ellipse(u(2), v(-56), s(14), s(12), 0.3, 0, Math.PI * 2);
  ctx.fill();

  // ---------------------------------------------------------------- roads
  // Painted in layers: sidewalk aprons (rounded), curbs, then all asphalt
  // cores (rounded) so junctions merge into smooth fillets.
  for (const [x, z, w, d, sidewalk = 1.6] of ROADS) {
    ctx.fillStyle = P.sidewalk;
    roundRectPath(
      ctx,
      u(x - w / 2 - sidewalk),
      v(z - d / 2 - sidewalk),
      s(w + sidewalk * 2),
      s(d + sidewalk * 2),
      s(2.2)
    );
    ctx.fill();
  }
  // Sidewalk paving joints (subtle grid lines along each apron)
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = s(0.06);
  for (const [x, z, w, d, sidewalk = 1.6] of ROADS) {
    const horizontal = w > d;
    if (horizontal) {
      for (let px = x - w / 2; px <= x + w / 2; px += 2.4) {
        ctx.beginPath();
        ctx.moveTo(u(px), v(z - d / 2 - sidewalk));
        ctx.lineTo(u(px), v(z + d / 2 + sidewalk));
        ctx.stroke();
      }
    } else {
      for (let pz = z - d / 2; pz <= z + d / 2; pz += 2.4) {
        ctx.beginPath();
        ctx.moveTo(u(x - w / 2 - sidewalk), v(pz));
        ctx.lineTo(u(x + w / 2 + sidewalk), v(pz));
        ctx.stroke();
      }
    }
  }
  // Curbs: a darker rim just outside the asphalt.
  for (const [x, z, w, d] of ROADS) {
    ctx.fillStyle = P.curb;
    roundRectPath(ctx, u(x - w / 2 - 0.3), v(z - d / 2 - 0.3), s(w + 0.6), s(d + 0.6), s(1.7));
    ctx.fill();
  }
  // Asphalt cores.
  for (const [x, z, w, d] of ROADS) {
    ctx.fillStyle = P.asphalt;
    roundRectPath(ctx, u(x - w / 2), v(z - d / 2), s(w), s(d), s(1.5));
    ctx.fill();
  }
  // Asphalt wear: patches and tone variation over the road network.
  ctx.save();
  for (const [x, z, w, d] of ROADS) {
    roundRectPath(ctx, u(x - w / 2), v(z - d / 2), s(w), s(d), s(1.5));
    ctx.clip();
    // patch clip accumulates — draw immediately per road
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < Math.max(6, (w * d) / 80); i++) {
      ctx.fillStyle = rng() < 0.5 ? '#4f545e' : P.asphaltLight;
      const px = u(x - w / 2 + rng() * w);
      const py = v(z - d / 2 + rng() * d);
      const r = s(0.8 + rng() * 2.2);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.save();
  }
  ctx.restore();

  // Paved aprons where the bridge ramps land on the south bank.
  ctx.fillStyle = P.asphalt;
  ctx.fillRect(u(-3.8), v(48), s(7.6), s(5.2)); // Hangang bridge landing
  ctx.fillRect(u(-51.4), v(48), s(6.8), s(5.2)); // Yanghwa bridge landing

  // ------------------------------------------------------------- markings
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

  // Clear the junction boxes: lane dashes must never cross an intersection.
  const junctions: [number, number][] = [];
  for (const jx of [-64, -32, 0, 32, 64]) junctions.push([jx, -34], [jx, 8]);
  junctions.push([-48, 8]);
  for (const jx of [-48, 0, 32, 64]) junctions.push([jx, 56], [jx, 80]);
  ctx.fillStyle = P.asphalt;
  for (const [jx, jz] of junctions) {
    ctx.fillRect(u(jx - 3), v(jz - 3), s(6), s(6));
  }

  // Edge lines along the arterials (solid, outside the dashes).
  ctx.fillStyle = 'rgba(216,210,192,0.5)';
  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    if (horizontal) {
      ctx.fillRect(u(x - w / 2 + 1), v(z - d / 2 + 0.28), s(w - 2), s(0.14));
      ctx.fillRect(u(x - w / 2 + 1), v(z + d / 2 - 0.42), s(w - 2), s(0.14));
    } else {
      ctx.fillRect(u(x - w / 2 + 0.28), v(z - d / 2 + 1), s(0.14), s(d - 2));
      ctx.fillRect(u(x + w / 2 - 0.42), v(z - d / 2 + 1), s(0.14), s(d - 2));
    }
  }

  // Bus lane: warm tint along the south side of Teheran-ro.
  ctx.fillStyle = 'rgba(140,84,66,0.5)';
  ctx.fillRect(u(-84), v(81.1), s(168), s(1.55));
  ctx.fillStyle = 'rgba(226,220,204,0.55)';
  for (let x = -80; x < 84; x += 21) {
    ctx.font = `700 ${s(1.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('BUS', u(x), v(82.1));
  }

  // Crosswalks at the busy junctions.
  const crosswalk = (x: number, z: number, horizontal: boolean) => {
    ctx.fillStyle = P.laneMark;
    for (let i = -2.4; i <= 2.4; i += 0.8) {
      if (horizontal) ctx.fillRect(u(x + i - 0.225), v(z - 2.4), s(0.45), s(4.8));
      else ctx.fillRect(u(x - 2.4), v(z + i - 0.225), s(4.8), s(0.45));
    }
  };
  crosswalk(0, -34, true);
  crosswalk(-32, -34, true);
  crosswalk(32, -34, true);
  crosswalk(0, 8, true);
  crosswalk(-48, 8, true);
  crosswalk(-32, 8, true);
  crosswalk(32, 8, true);
  crosswalk(0, 56, true);
  crosswalk(-48, 56, true);
  crosswalk(32, 80, true);
  crosswalk(64, 80, true);

  // Stop lines just before each crosswalk on the north-south streets.
  ctx.fillStyle = P.laneMark;
  for (const [jx] of [[-32], [32], [0]] as const) {
    ctx.fillRect(u(jx - 2.6), v(-34 + 3.2), s(2.4), s(0.4));
    ctx.fillRect(u(jx + 0.2), v(-34 - 3.6), s(2.4), s(0.4));
  }

  // Turn arrows on the spine approaches to the river boulevard.
  const arrow = (x: number, z: number, dirZ: 1 | -1) => {
    ctx.save();
    ctx.translate(u(x), v(z));
    if (dirZ === -1) ctx.rotate(Math.PI);
    ctx.fillStyle = P.laneMark;
    ctx.beginPath();
    ctx.moveTo(0, s(1.4));
    ctx.lineTo(0, -s(0.6));
    ctx.lineTo(-s(0.42), -s(0.6));
    ctx.lineTo(0, -s(1.5));
    ctx.lineTo(s(0.42), -s(0.6));
    ctx.lineTo(0, -s(0.6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  arrow(-1.4, 2, -1);
  arrow(1.4, -16, 1);
  arrow(-1.4, 66, -1);
  arrow(1.4, 50.5, 1);

  // Manholes + storm drains scattered along the asphalt.
  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    const count = Math.floor((horizontal ? w : d) / 22);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count + (rng() - 0.5) * 0.06;
      const mx = horizontal ? x - w / 2 + t * w : x + (rng() - 0.5) * (w * 0.4);
      const mz = horizontal ? z + (rng() - 0.5) * (d * 0.4) : z - d / 2 + t * d;
      ctx.fillStyle = '#494e57';
      ctx.beginPath();
      ctx.arc(u(mx), v(mz), s(0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3d434c';
      ctx.lineWidth = s(0.07);
      ctx.beginPath();
      ctx.arc(u(mx), v(mz), s(0.22), 0, Math.PI * 2);
      ctx.stroke();
    }
    // storm drains near junction curbs
    if (horizontal) {
      ctx.fillStyle = '#41464f';
      for (const jx of [-64, -32, 0, 32, 64]) {
        if (Math.abs(jx) > w / 2 - 4) continue;
        ctx.fillRect(u(jx + 4.2), v(z - d / 2 + 0.15), s(0.9), s(0.3));
        ctx.fillRect(u(jx - 5.1), v(z + d / 2 - 0.45), s(0.9), s(0.3));
      }
    }
  }

  // -------------------------------------------------------------- hanok alley
  // The alley is stone-paved with joint lines and slightly wavy edges.
  const alley = { x0: 26, x1: 66, z: -44, w: 4.6 };
  ctx.fillStyle = P.stone;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = alley.x0 + t * (alley.x1 - alley.x0);
    const zz = alley.z - alley.w / 2 - Math.sin(x * 0.35) * 0.25;
    if (i === 0) ctx.moveTo(u(x), v(zz));
    else ctx.lineTo(u(x), v(zz));
  }
  for (let i = 40; i >= 0; i--) {
    const t = i / 40;
    const x = alley.x0 + t * (alley.x1 - alley.x0);
    const zz = alley.z + alley.w / 2 + Math.sin(x * 0.3 + 2) * 0.25;
    ctx.lineTo(u(x), v(zz));
  }
  ctx.closePath();
  ctx.fill();
  // Stone joints
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = s(0.07);
  for (let x = alley.x0 + 1; x < alley.x1; x += 1.5) {
    ctx.beginPath();
    ctx.moveTo(u(x), v(alley.z - alley.w / 2));
    ctx.lineTo(u(x + 0.3), v(alley.z + alley.w / 2));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.moveTo(u(alley.x0), v(alley.z - 0.6));
  ctx.lineTo(u(alley.x1), v(alley.z - 0.4));
  ctx.stroke();

  // Alley connector from the east street.
  ctx.fillStyle = P.stone;
  ctx.fillRect(u(29.2), v(-46), s(5.6), s(12.2));

  // ------------------------------------------------------------------ plaza
  const px0 = u(0);
  const pz0 = v(-14);
  ctx.fillStyle = P.plaza;
  ctx.beginPath();
  ctx.arc(px0, pz0, s(12), 0, Math.PI * 2);
  ctx.fill();
  // Two-tone paving wedges
  ctx.fillStyle = 'rgba(160,143,116,0.35)';
  for (let i = 0; i < 12; i += 2) {
    ctx.beginPath();
    ctx.moveTo(px0, pz0);
    ctx.arc(px0, pz0, s(12), (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = P.plazaDark;
  ctx.lineWidth = s(0.35);
  for (const r of [3, 6, 9, 11.4]) {
    ctx.beginPath();
    ctx.arc(px0, pz0, s(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Compass star at the very center
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

  // Curved footpath: plaza → Hongdae pocket park.
  strokePath(
    ctx,
    (t) => [-12 - t * 12.5, -14 + Math.sin(t * 2.2) * 2.4 + t * 6],
    1.2,
    '#a89a7f'
  );

  paintedCanvas = canvas;
  return canvas;
}

/** Fills the band between two curved z(x) edges across the full width. */
function fillShoreBand(
  ctx: CanvasRenderingContext2D,
  top: (x: number) => number,
  bottom: (x: number) => number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const x = -104 + (i / steps) * 208;
    const z = top(x);
    if (i === 0) ctx.moveTo(u(x), v(z));
    else ctx.lineTo(u(x), v(z));
  }
  for (let i = steps; i >= 0; i--) {
    const x = -104 + (i / steps) * 208;
    ctx.lineTo(u(x), v(bottom(x)));
  }
  ctx.closePath();
  ctx.fill();
}

/** Strokes a parametric path (t 0..1 → world x,z) with a given width. */
function strokePath(
  ctx: CanvasRenderingContext2D,
  fn: (t: number) => [number, number],
  width: number,
  color: string
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = s(width);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const [x, z] = fn(i / steps);
    if (i === 0) ctx.moveTo(u(x), v(z));
    else ctx.lineTo(u(x), v(z));
  }
  ctx.stroke();
}

/** Horizontal band of soft mottling between two canvas-y values. */
function mottleBand(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  y0: number,
  y1: number,
  color: string,
  count: number
): void {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = rng() * CW;
    const py = y0 + rng() * (y1 - y0);
    const r = s(0.8 + rng() * 2.4);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
