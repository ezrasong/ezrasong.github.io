/**
 * The HUD's icon set: one 24px grid, 1.75 stroke, round caps. Inline so
 * every icon inherits currentColor and needs no request.
 */

const svg = (body: string, size = 20): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  back: svg('<path d="M19 12H6"/><path d="m11 6-6 6 6 6"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  soundOff: svg('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="m16 10 4 4"/><path d="m20 10-4 4"/>'),
  soundOn: svg('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  directory: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>'),
  home: svg('<path d="M4 11 12 4l8 7"/><path d="M6.5 9.5V20h11V9.5"/>'),
  expand: svg('<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="m20 4-6.5 6.5"/><path d="M4 20l6.5-6.5"/>', 14),
  jump: svg('<path d="M12 19V6"/><path d="m6 11 6-6 6 6"/>', 24),
  external: svg('<path d="M8 16 16 8"/><path d="M9 8h7v7"/>', 14),
  arrow: svg('<path d="M5 12h13"/><path d="m13 7 5 5-5 5"/>', 14),
};
