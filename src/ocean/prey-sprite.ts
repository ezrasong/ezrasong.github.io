import { PREY_SQUID, type Prey } from './prey';

/** Small ASCII silhouettes: tail, scales, eye and paired fins; squid have a
 * tapered mantle and three trailing arms. Animation keeps their anatomy
 * intact when fleeing instead of replacing the animal with a dash.
 */
export const PREY_GLYPHS = ['>', '<', '=', 'o', '/', '\\', '~', '(', ')', '#', '-', '{', '}'];
const MIRROR: Record<string, string> = { '>': '<', '<': '>', '/': '\\', '\\': '/', '(': ')', ')': '(', '}': '{', '{': '}' };

export function preySprite(p: Prey): readonly string[] {
  const beat = Math.floor(p.age * (p.fear > 0.5 ? 11 : 5) + p.school) % 2;
  const rows = p.kind === PREY_SQUID
    ? [beat ? ' -\\ /\\ ' : ' ~\\ /\\ ', beat ? '~~(o##>' : '-~(o##>', beat ? ' ~/ \\/ ' : ' -/ \\/ ']
    : [beat ? '  /\\  ' : '  /-  ', beat ? '}<=o> ' : '><=o> ', beat ? '  \\/  ' : '  \\-  '];
  if (p.vx >= 0) return rows;
  return rows.map((row) => [...row].reverse().map((c) => MIRROR[c] ?? c).join(''));
}
