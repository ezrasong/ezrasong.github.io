import { PREY_SQUID, type Prey } from './prey';

// A compact character lattice keeps the fins and arms attached to the body.
const FISH = ['   /\\   ', '><((o)> ', '   \\/   '];
const SQUID = [' ~\\ /\\  ', '~~(o##> ', ' ~/ \\/  '];
const GLYPHS = '<>/\\()o#~';
const atlases = new Map<string, HTMLCanvasElement>();

/** Cache transparent glyphs once, as with the orca's character atlas. */
function glyphAtlas(colors: { prey: string; preyBright: string }): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const key = `${dpr}:${colors.prey}:${colors.preyBright}`;
  const cached = atlases.get(key);
  if (cached) return cached;
  const width = Math.ceil(8 * dpr), height = Math.ceil(12 * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = width * GLYPHS.length;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `500 ${7.5 * dpr}px "Geist Mono Variable", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let row = 0; row < 2; row++) {
    ctx.fillStyle = row ? colors.preyBright : colors.prey;
    for (let col = 0; col < GLYPHS.length; col++) {
      ctx.fillText(GLYPHS[col]!, (col + 0.5) * width, (row + 0.5) * height);
    }
  }
  atlases.set(key, canvas);
  return canvas;
}

/** ASCII anatomy moving continuously with the animal, without filled shapes. */
export function drawPrey(
  ctx: CanvasRenderingContext2D, p: Prey, scale: number,
  colors: { prey: string; preyBright: string },
): void {
  const atlas = glyphAtlas(colors);
  const width = atlas.width / GLYPHS.length, height = atlas.height / 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  const size = scale * (0.9 + (p.school % 3) * 0.08);
  ctx.scale(size, size);
  const squid = p.kind === PREY_SQUID;
  const rows = squid ? SQUID : FISH;
  const beat = p.age * (6 + p.fear * 7) + p.school;
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]!;
    for (let col = 0; col < line.length; col++) {
      const glyph = line[col]!;
      if (glyph === ' ') continue;
      // Tail and trailing arms flex without flipping the whole sprite or
      // replacing a fleeing fish with a different symbol.
      const flex = squid ? Math.max(0, (3 - col) / 3) : col < 2 ? 1 : 0;
      const wave = Math.sin(beat - col * 0.5 + row * 0.6) * flex * 1.3;
      const bright = glyph === 'o' || glyph === '#';
      ctx.drawImage(atlas, GLYPHS.indexOf(glyph) * width, bright ? height : 0, width, height,
        (col - 3.5) * 4.5 - 4, (row - 1) * 7 + wave - 6, 8, 12);
    }
  }
  ctx.restore();
}
