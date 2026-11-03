import { expect, test } from '@playwright/test';
import { buildOrca } from '../src/ocean/orca-model';
import { OrcaMotion } from '../src/ocean/orca-motion';
import { steerPod } from '../src/ocean/pod-motion';
import { PreyField, PREY_FISH, PREY_SQUID } from '../src/ocean/prey';
import { AsciiRenderer, type Palette } from '../src/ocean/ascii-renderer';

function separation(a: OrcaMotion, b: OrcaMotion): number {
  let closest = Infinity;
  for (let i = 0; i < a.pose.cx.length; i += 3) {
    for (let j = 0; j < b.pose.cx.length; j += 3) {
      closest = Math.min(closest, Math.hypot(
        a.pose.cx[i]! - b.pose.cx[j]!, a.pose.cy[i]! - b.pose.cy[j]!, a.pose.cz[i]! - b.pose.cz[j]!,
      ));
    }
  }
  return closest;
}

test('head-on pod members yield smoothly even while both are called to food', () => {
  for (const [w, h, length] of [[1440, 900, 490], [390, 800, 214]]) {
    const pod = [length, length * 0.72].map((l, i) => {
      const tpl = buildOrca(l, 8, 12);
      return { tpl, motion: new OrcaMotion(tpl, 7 + i) };
    });
    const [a, b] = pod.map((o) => o.motion);
    for (const m of [a, b]) m.zone = { x0: length * 0.35, x1: w - length * 0.35, y0: h * 0.14, y1: h * 0.88 };
    a.place(w * 0.25, h * 0.5, 0);
    b.place(w * 0.75, h * 0.5, Math.PI);
    let closest = Infinity;
    for (let frame = 0; frame < 20 * 60; frame++) {
      // These calls used to overwrite avoidance on every simulation step.
      a.call(w * 0.75, h * 0.5);
      b.call(w * 0.25, h * 0.5);
      steerPod(pod);
      for (const m of [a, b]) {
        const previous = [m.x, m.y, m.z];
        m.update(1 / 60);
        expect(Math.hypot(m.x - previous[0], m.y - previous[1], m.z - previous[2])).toBeLessThan(length / 60);
      }
      closest = Math.min(closest, separation(a, b));
    }
    expect(closest, `spine separation at ${w}px`).toBeGreaterThan(length * 0.2);
  }
});

test('body avoidance notices a trailing flank and releases once the pod clears', () => {
  const tpl = buildOrca(300, 8, 12);
  const pod = [0, 1].map((i) => ({ tpl, motion: new OrcaMotion(tpl, i + 7) }));
  const [a, b] = pod.map((o) => o.motion);
  for (const m of [a, b]) m.zone = { x0: 0, x1: 1400, y0: 0, y1: 900 };
  a.place(400, 450, 0);
  b.place(700, 450, 0); // Its tail is next to a's head; its head is far away.
  steerPod(pod);
  a.call(1200, 450);
  a.update(1 / 60);
  expect(a.yaw).toBeLessThan(0);
  // Once this animal takes the meal, yielding must not trap it in a lane.
  let reached = false;
  for (let i = 0; i < 1200; i++) {
    a.feed(1200, 450); a.update(1 / 60);
    if (Math.hypot(a.x - 1200, a.y - 450, a.z) < tpl.length * 0.09) { reached = true; break; }
  }
  expect(reached).toBe(true);
});

test('coincident animals separate without NaNs or position jumps', () => {
  const tpl = buildOrca(300, 8, 12);
  const pod = [0, 1, 2].map((i) => ({ tpl, motion: new OrcaMotion(tpl, i + 7) }));
  for (const { motion } of pod) {
    motion.zone = { x0: 100, x1: 1340, y0: 50, y1: 850 };
    motion.place(720, 450, 0);
  }
  for (let frame = 0; frame < 25 * 60; frame++) {
    steerPod(pod);
    for (const { motion } of pod) {
      const x = motion.x, y = motion.y, z = motion.z;
      motion.update(1 / 60);
      expect(Math.hypot(motion.x - x, motion.y - y, motion.z - z)).toBeLessThan(5);
    }
  }
  for (let i = 0; i < pod.length; i++) {
    for (let j = i + 1; j < pod.length; j++) expect(separation(pod[i].motion, pod[j].motion)).toBeGreaterThan(60);
  }
});

test('fish and squid turn and accelerate away from an approaching orca', () => {
  for (const kind of [PREY_FISH, PREY_SQUID]) {
    const field = new PreyField();
    field.resize(390, 800);
    field.list.length = 0;
    const p = { x: 250, y: 300, vx: -10, vy: 0, heading: Math.PI, kind, school: 1, age: 1, life: 40, fear: 0 };
    field.list.push(p);
    for (let i = 0; i < 45; i++) field.update(1 / 60, [{ x: 220, y: 300 }], 130);
    expect(p.fear).toBeGreaterThan(0.4);
    expect(p.vx).toBeGreaterThan(10);
    expect(p.x).toBeGreaterThan(260);
  }
});

test('prey spawn throughout the water, including the centre and every quadrant', () => {
  const random = Math.random;
  try {
    let seed = 12345;
    Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    const quadrants = new Set<number>();
    let interior = 0;
    for (let i = 0; i < 60; i++) {
      const field = new PreyField();
      field.resize(1440, 900);
      for (const p of field.list) {
        quadrants.add((p.x > 720 ? 1 : 0) + (p.y > 450 ? 2 : 0));
        if (p.x > 288 && p.x < 1152 && p.y > 180 && p.y < 720) interior++;
      }
      field.update(1 / 60, [], 200); // No predator is also a valid state.
    }
    expect(quadrants.size).toBe(4);
    expect(interior).toBeGreaterThan(30);
  } finally { Math.random = random; }
});

test('layered silhouettes keep their foreground and translate smoothly at every angle', () => {
  // Record the renderer's atlas tile choices, avoiding font and GPU differences.
  const palette: Palette = { bg: '#171615', lo: [36, 34, 31], hi: [236, 232, 222], speck: '#4a4640', eye: '#f1ede4', shadow: '#121110', food: '#d9774b', prey: '#8fa7b0', preyBright: '#c9dde3' };
  const created: any[] = [];
  const canvas = () => {
    const tiles = new Map<string, number>();
    const fills: any[] = [];
    const context = {
      fillStyle: '',
      save() {}, restore() {}, scale() {},
      fillText(glyph: string, x: number) { fills.push({ x, glyph }); },
      fillRect(x: number) { fills.push({ x, color: this.fillStyle }); },
      drawImage(...args: any[]) {
        if (args.length === 9) tiles.set(`${args[5]},${args[6]}`, args[1] / args[3]);
      },
    };
    return { tiles, fills, getContext: () => context };
  };
  const savedDocument = globalThis.document, savedWindow = globalThis.window;
  try {
    (globalThis as any).window = { devicePixelRatio: 1 };
    (globalThis as any).document = { createElement: () => { const c = canvas(); created.push(c); return c; } };
    const tpl = buildOrca(360, 11, 16);
    const rear = new OrcaMotion(tpl), front = new OrcaMotion(tpl);
    rear.place(500, 220, 0);
    front.place(500, 245, 1);
    for (let i = 0; i < front.pose.cz.length; i++) front.pose.cz[i] += 200;
    const near = { tpl, pose: front.pose }, far = { tpl, pose: rear.pose };
    const render = (bodies: typeof near[]) => {
      created.length = 0;
      const renderer = new AsciiRenderer(canvas() as unknown as HTMLCanvasElement, palette);
      renderer.resize(800, 400, 11, 16);
      renderer.draw(bodies, (y) => 400 - y, [], 0);
      const shadow = Math.floor(created[1].fills.find((f: any) => f.glyph === 'o').x / 11) + 1;
      return { tiles: created[0].tiles as Map<string, number>, shadow };
    };
    const alone = render([near]);
    const crossing = render([far, near]);
    expect(render([near, far]).tiles).toEqual(crossing.tiles);
    let checked = 0;
    for (const [cell, tile] of alone.tiles) {
      if (tile >= alone.shadow) continue;
      expect(crossing.tiles.get(cell), `foreground cell ${cell}`).toBe(tile);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    for (const yaw of [0, 0.7, Math.PI / 2, 2.4]) {
      front.place(351.8, 210, yaw); // Half-pixel move crosses a grid boundary.
      const before = render([near]);
      for (let k = 0; k < front.pose.cx.length; k++) front.pose.cx[k] += 0.5;
      const after = render([near]);
      expect(after.tiles.size).toBe(before.tiles.size);
      for (const [cell, tile] of before.tiles) {
        const [x, y] = cell.split(',').map(Number);
        expect(after.tiles.get(`${x + 0.5},${y}`), `sub-cell movement at ${yaw}`).toBe(tile);
      }
    }
  } finally {
    (globalThis as any).document = savedDocument;
    (globalThis as any).window = savedWindow;
  }
});
