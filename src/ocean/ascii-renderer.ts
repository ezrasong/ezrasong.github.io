/**
 * Character-grid rasterizer. Points are projected orthographically into
 * cells; a per-cell depth buffer keeps the nearest surface, which is lit and
 * mapped to one of a fixed set of tiles (background square + glyph). Tiles
 * are pre-rendered once per size into an atlas, so a frame is one
 * drawImage per lit cell and no text layout.
 *
 * The grid is sized in whole device pixels so glyphs stay sharp at any DPR.
 */

import {
  GRP_FLUKE, GRP_PEC, MAT_BLACK, MAT_WHITE, type OrcaTemplate,
} from "./orca-model";
import type { Pose } from "./orca-motion";

const RAMP = "  .,:;t%SX8#@";
const LEVELS = RAMP.length;
/** Extra tiles after the ramp. */
const T_EYE = LEVELS;
const T_SHADOW = LEVELS + 1;
const T_SPECK0 = LEVELS + 2;
const SPECKS = ["'", ",", "`", ".", "·"];
const T_FOOD = T_SPECK0 + SPECKS.length;
const TILE_COUNT = T_FOOD + 1;
/** Kind code for food pellets in the overlay list. */
export const K_FOOD = SPECKS.length;

export interface Palette {
  bg: string;
  /** Tile colour at luminance 0 and 1. */
  lo: [number, number, number];
  hi: [number, number, number];
  speck: string;
  eye: string;
  shadow: string;
  food: string;
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): string => {
  const c = (i: number): number => Math.round(a[i]! + (b[i]! - a[i]!) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
};

// Key light from upper left, slightly in front.
const LX = -0.42;
const LY = 0.72;
const LZ = 0.55;
const LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN;
const ly = LY / LN;
const lz = LZ / LN;
// Half vector with the viewer at +z, for the wet-skin highlight.
const HX0 = lx;
const HY0 = ly;
const HZ0 = lz + 1;
const HN = Math.hypot(HX0, HY0, HZ0);
const hx = HX0 / HN;
const hy = HY0 / HN;
const hz = HZ0 / HN;

export class AsciiRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement | null = null;
  private palette: Palette;

  /** Cell size in device px, and in CSS px. */
  cw = 0;
  ch = 0;
  cssCw = 0;
  cssCh = 0;
  cols = 0;
  rows = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  private depth = new Float32Array(0);
  private lum = new Float32Array(0);
  private kind = new Int16Array(0);
  /** Cells drawn last frame, so they can be cleared without a full clear. */
  private drawn = new Int32Array(0);
  private drawnCount = 0;
  private stamp = new Uint32Array(0);
  private frame = 1;

  /** 0..1, global intensity. */
  intensity = 1;
  /** Cells under page text, drawn faint so the copy stays readable. */
  private mask = new Uint8Array(0);
  /** Opacity of masked cells. */
  maskAlpha = 0.14;

  constructor(canvas: HTMLCanvasElement, palette: Palette) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.palette = palette;
  }

  setPalette(p: Palette): void {
    this.palette = p;
    this.atlas = null;
    this.buildAtlas();
    this.clearAll();
  }

  resize(cssW: number, cssH: number, cellCssW: number, cellCssH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.cw = Math.max(4, Math.round(cellCssW * dpr));
    this.ch = Math.max(6, Math.round(cellCssH * dpr));
    this.cssCw = this.cw / dpr;
    this.cssCh = this.ch / dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.cols = Math.ceil(this.canvas.width / this.cw);
    this.rows = Math.ceil(this.canvas.height / this.ch);
    const n = this.cols * this.rows;
    this.depth = new Float32Array(n);
    this.lum = new Float32Array(n);
    this.kind = new Int16Array(n);
    this.drawn = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.mask = new Uint8Array(n);
    this.drawnCount = 0;
    this.buildAtlas();
    this.clearAll();
  }

  private buildAtlas(): void {
    const { cw, ch, palette: p } = this;
    if (!cw) return;
    const a = document.createElement("canvas");
    a.width = cw * TILE_COUNT;
    a.height = ch;
    const g = a.getContext("2d")!;
    const fontPx = Math.round(ch * 0.7);
    g.font = `500 ${fontPx}px "Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Tiles are squares inset by a hairline, so the grid itself reads.
    const gap = Math.max(1, Math.round(this.dpr));
    const tile = (i: number, fill: string | null, glyph: string, color: string): void => {
      const x = i * cw;
      g.fillStyle = p.bg;
      g.fillRect(x, 0, cw, ch);
      if (fill) {
        g.fillStyle = fill;
        g.fillRect(x, 0, cw - gap, ch - gap);
      }
      if (glyph.trim()) {
        g.fillStyle = color;
        g.fillText(glyph, x + (cw - gap) / 2, (ch - gap) / 2 + ch * 0.04);
      }
    };
    for (let i = 0; i < LEVELS; i++) {
      const t = i / (LEVELS - 1);
      // Fills climb slowly through the darks and quickly at the top, so the
      // black skin stays a family of near-greys and the white patches pop.
      const ft = 0.06 + 0.94 * Math.pow(t, 1.7);
      const fill = mix(p.lo, p.hi, ft);
      // Glyph ink sits a fixed step brighter (or darker, on light tiles).
      const ink = mix(p.lo, p.hi, ft < 0.55 ? Math.min(1, ft + 0.22) : ft - 0.34);
      tile(i, fill, RAMP[i]!, ink);
    }
    tile(T_EYE, "rgb(10,10,9)", "o", p.eye);
    tile(T_SHADOW, p.shadow, " ", p.speck);
    SPECKS.forEach((s, i) => tile(T_SPECK0 + i, null, s, p.speck));
    tile(T_FOOD, null, "*", p.food);
    this.atlas = a;
  }

  /**
   * Mark the cells covered by these CSS-px rects. Each grows by a cell
   * sideways and a row and a half vertically, so lines and paragraphs of one
   * block merge into a single quiet area instead of stripes.
   */
  setMask(rects: ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>): void {
    const { mask, cols, rows, cssCw, cssCh } = this;
    mask.fill(0);
    for (const r of rects) {
      const c0 = Math.max(0, Math.floor(r.left / cssCw) - 1);
      const c1 = Math.min(cols - 1, Math.ceil(r.right / cssCw));
      const r0 = Math.max(0, Math.floor(r.top / cssCh - 1.5));
      const r1 = Math.min(rows - 1, Math.ceil(r.bottom / cssCh + 1.5) - 1);
      for (let y = r0; y <= r1; y++) mask.fill(1, y * cols + c0, y * cols + c1 + 1);
    }
  }

  private clearAll(): void {
    this.ctx.fillStyle = this.palette.bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawnCount = 0;
  }

  /** CSS px → cell index, or -1. */
  private cellAt(x: number, y: number): number {
    const c = Math.floor(x / this.cssCw);
    const r = Math.floor(y / this.cssCh);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /**
   * Rasterize one orca pose. World y is up; `yToScreen` converts it to CSS
   * px from the top. Marine snow is passed in already in screen space.
   */
  draw(
    tpl: OrcaTemplate,
    pose: Pose,
    yToScreen: (y: number) => number,
    snow: ReadonlyArray<{ x: number; y: number; k: number }>,
    t: number,
  ): void {
    if (!this.atlas) return;
    const f = ++this.frame;
    const { stamp, depth, lum, kind, cols } = this;
    const touched: number[] = [];

    const mark = (cell: number, z: number, l: number, k: number): void => {
      if (stamp[cell] !== f) {
        stamp[cell] = f;
        depth[cell] = -Infinity;
        touched.push(cell);
      }
      if (z > depth[cell]!) {
        depth[cell] = z;
        lum[cell] = l;
        kind[cell] = k;
      }
    };

    const cosF = Math.cos(pose.fluke);
    const sinF = Math.sin(pose.fluke);
    const cosP = Math.cos(pose.pec);
    const sinP = Math.sin(pose.pec);
    const spread = 1 + pose.pecSpread * 0.55;

    const { st, of, ou, ol, nf, nu, nl, alb, mat, grp } = tpl;
    for (let i = 0; i < tpl.count; i++) {
      const k = st[i]!;
      let f0 = of[i]!;
      let u0 = ou[i]!;
      let l0 = ol[i]!;
      let nF = nf[i]!;
      let nU = nu[i]!;
      const nL = nl[i]!;
      const g = grp[i]!;
      if (g === GRP_FLUKE) {
        // Pitch the flukes about the lateral axis.
        const ff = f0 * cosF - u0 * sinF;
        u0 = f0 * sinF + u0 * cosF;
        f0 = ff;
        const nnF = nF * cosF - nU * sinF;
        nU = nF * sinF + nU * cosF;
        nF = nnF;
      } else if (g === GRP_PEC) {
        const df = f0 - tpl.pecPivotF;
        const du = u0 - tpl.pecPivotU;
        f0 = tpl.pecPivotF + df * cosP - du * sinP;
        u0 = tpl.pecPivotU + df * sinP + du * cosP;
        l0 *= spread;
      }
      const tx = pose.tx[k]!, ty = pose.ty[k]!, tz = pose.tz[k]!;
      const ux = pose.ux[k]!, uy = pose.uy[k]!, uz = pose.uz[k]!;
      const lx2 = pose.lx[k]!, ly2 = pose.ly[k]!, lz2 = pose.lz[k]!;
      const x = pose.cx[k]! + tx * f0 + ux * u0 + lx2 * l0;
      const y = pose.cy[k]! + ty * f0 + uy * u0 + ly2 * l0;
      const z = pose.cz[k]! + tz * f0 + uz * u0 + lz2 * l0;
      let wx = tx * nF + ux * nU + lx2 * nL;
      let wy = ty * nF + uy * nU + ly2 * nL;
      let wz = tz * nF + uz * nU + lz2 * nL;
      // Fins are two-sided sheets: face the viewer.
      if (g !== 0 && wz < 0) {
        wx = -wx;
        wy = -wy;
        wz = -wz;
      } else if (g === 0 && wz < -0.25) continue; // back face of the body
      const cell = this.cellAt(x, yToScreen(y));
      if (cell < 0) continue;
      const diff = Math.max(0, wx * lx + wy * ly + wz * lz);
      const spec = Math.pow(Math.max(0, wx * hx + wy * hy + wz * hz), 28);
      const a = alb[i]!;
      const m = mat[i]!;
      // Black skin gets its own low band with strong form shading and a wet
      // highlight; grey and white read by albedo, lightly shaded.
      let l = m === MAT_BLACK
        ? 0.07 + 0.42 * diff + 0.24 * spec
        : a * (0.8 + 0.24 * diff) + 0.05 * spec;
      // Rim darkening at grazing angles separates overlapping parts.
      if (m === MAT_BLACK) l *= 0.8 + 0.2 * Math.min(1, wz * 1.6 + 0.35);
      mark(cell, z, Math.min(1, l), m === MAT_WHITE ? 1 : 0);
    }

    // Eyes: on whichever side faces the viewer, if not occluded.
    const ek = tpl.eyeStation;
    for (const side of [1, -1]) {
      const lz2 = pose.lz[ek]! * side;
      if (lz2 < 0.2) continue;
      const x = pose.cx[ek]! + pose.ux[ek]! * tpl.eyeU + pose.lx[ek]! * tpl.eyeL * side;
      const y = pose.cy[ek]! + pose.uy[ek]! * tpl.eyeU + pose.ly[ek]! * tpl.eyeL * side;
      const z = pose.cz[ek]! + pose.uz[ek]! * tpl.eyeU + pose.lz[ek]! * tpl.eyeL * side;
      const cell = this.cellAt(x, yToScreen(y));
      if (cell >= 0 && stamp[cell] === f && z >= depth[cell]! - tpl.length * 0.03) {
        kind[cell] = 2;
      }
    }

    // Shadow cast down-right, and loose specks where the body meets water.
    const body = touched.length;
    const rows = this.rows;
    for (let j = 0; j < body; j++) {
      const c = touched[j]!;
      const col = c % cols;
      const row = (c - col) / cols;
      for (const [dc, dr] of [[1, 1], [2, 2], [1, 2]] as const) {
        if (col + dc >= cols || row + dr >= rows) continue;
        const s = c + dr * cols + dc;
        if (stamp[s] !== f) {
          stamp[s] = f;
          depth[s] = -Infinity;
          lum[s] = 0;
          kind[s] = 3;
          touched.push(s);
        }
      }
      // Hash the cell with a slow clock so specks flicker, not crawl.
      const h = Math.imul(c ^ (Math.floor(t * 1.6) * 2654435761), 2246822519) >>> 0;
      if (h % 23 === 0) {
        const s = c + ((h >>> 8) % 3 - 1) * 2 + (((h >>> 12) % 3) - 1) * cols * 2;
        if (s >= 0 && s < stamp.length && stamp[s] !== f) {
          stamp[s] = f;
          depth[s] = -Infinity;
          kind[s] = 4 + ((h >>> 16) % SPECKS.length);
          touched.push(s);
        }
      }
    }
    for (const p of snow) {
      const c = this.cellAt(p.x, p.y);
      if (c >= 0 && stamp[c] !== f) {
        stamp[c] = f;
        depth[c] = -Infinity;
        kind[c] = 4 + p.k;
        touched.push(c);
      }
    }

    // Clear last frame's cells that are now empty, then draw this frame.
    const { ctx, cw, ch, atlas } = this;
    ctx.fillStyle = this.palette.bg;
    for (let j = 0; j < this.drawnCount; j++) {
      const c = this.drawn[j]!;
      if (stamp[c] === f) continue;
      const col = c % cols;
      ctx.fillRect(col * cw, ((c - col) / cols) * ch, cw, ch);
    }
    const { mask, maskAlpha } = this;
    ctx.globalAlpha = 1;
    let n = 0;
    for (const c of touched) {
      const dim = mask[c] ? this.intensity * maskAlpha : this.intensity;
      const col = c % cols;
      const x = col * cw;
      const y = ((c - col) / cols) * ch;
      const k = kind[c]!;
      let tileIdx: number;
      if (k === 2) tileIdx = T_EYE;
      else if (k === 3) tileIdx = T_SHADOW;
      else if (k >= 4) tileIdx = k - 4 === K_FOOD ? T_FOOD : T_SPECK0 + (k - 4);
      else {
        const l = lum[c]! * (k === 1 ? 1 : 0.92);
        tileIdx = Math.max(1, Math.min(LEVELS - 1, Math.round(l * (LEVELS - 1))));
      }
      // Dimming is a fade toward the page, so clear the cell first.
      if (dim < 1) {
        ctx.fillRect(x, y, cw, ch);
        ctx.globalAlpha = dim;
      }
      ctx.drawImage(atlas!, tileIdx * cw, 0, cw, ch, x, y, cw, ch);
      if (dim < 1) ctx.globalAlpha = 1;
      this.drawn[n++] = c;
    }
    this.drawnCount = n;
  }

  get width(): number {
    return this.cssW;
  }

  get height(): number {
    return this.cssH;
  }
}
