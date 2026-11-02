/**
 * Where the orca swims on each page. Wide screens keep it in the open water
 * to the right of the text column, crossing behind it now and then;
 * narrow screens let it pass underneath the text,
 * where the renderer fades it so the copy stays readable.
 *
 * The zone bounds the head, so the far edge leaves room for the turning
 * circle (about a third of a body length) and the body trailing behind.
 */

import type { OceanOptions } from "./ocean";

const TEXT =
  ".bar--top, [data-content] h1, [data-content] h2, [data-content] h3, [data-content] p, [data-content] dl, [data-content] .links, [data-content] .choice, .bar > *";

const wide = (w: number): boolean => w >= 900;

const portfolioLength = (w: number, h: number): number =>
  wide(w) ? Math.min(w * 0.4, h * 0.95, 760) : Math.min(w * 0.92, 420);

export const portfolioWater: OceanOptions = {
  length: portfolioLength,
  zone: (w, h) => {
    const turn = portfolioLength(w, h) * 0.4;
    return wide(w)
      ? { x0: w * 0.3 + turn, x1: w - turn * 0.6, y0: h * 0.3, y1: h * 0.78 }
      : { x0: turn, x1: w - turn, y0: h * 0.45, y1: h * 0.8 };
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
