/**
 * Where the orca swims on each page. The portfolio is all open water: the
 * orca roams the whole viewport and the renderer fades it under the text so
 * the copy stays readable. The chooser keeps it beside its two choices.
 *
 * The zone bounds the head, so the far edge leaves room for the turning
 * circle (about a third of a body length) and the body trailing behind.
 */

import type { OceanOptions } from "./ocean";

const TEXT =
  ".bar--top, [data-content] h1, [data-content] h2, [data-content] h3, [data-content] p, [data-content] dl, [data-content] .links, [data-content] .choice, .bar > *";

const wide = (w: number): boolean => w >= 900;

const portfolioLength = (w: number, h: number): number =>
  wide(w) ? Math.min(w * 0.34, h * 0.8, 640) : Math.min(w * 0.55, 260);

export const portfolioWater: OceanOptions = {
  length: portfolioLength,
  // The whole viewport is water; the text masks dim it where it passes
  // behind the copy. The zone only keeps the head far enough inside the
  // edges that its turning circle stays on screen.
  zone: (w, h) => {
    const turn = portfolioLength(w, h) * 0.35;
    return { x0: turn, x1: w - turn, y0: h * 0.14, y1: h * 0.88 };
  },
  maskSelector: TEXT,
};

const chooserLength = (w: number, h: number): number =>
  wide(w) ? Math.min(w * 0.42, h * 0.95, 780) : Math.min(w * 0.95, 440);

export const chooserWater: OceanOptions = {
  length: chooserLength,
  zone: (w, h) => {
    const turn = chooserLength(w, h) * 0.4;
    return wide(w)
      ? { x0: w * 0.3 + turn, x1: w - turn * 0.6, y0: h * 0.34, y1: h * 0.8 }
      : { x0: turn, x1: w - turn, y0: h * 0.74, y1: h * 0.86 };
  },
  maskSelector: TEXT,
};
