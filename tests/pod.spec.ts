import { expect, test } from '@playwright/test';
import { buildOrca } from '../src/ocean/orca-model';
import { OrcaMotion } from '../src/ocean/orca-motion';
import { steerPod } from '../src/ocean/pod-motion';
import { PREY_FISH, PREY_SQUID, type Prey } from '../src/ocean/prey';
import { preySprite } from '../src/ocean/prey-sprite';
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
  // Avoidance expires and normal input can steer back onto the food plane.
  for (let i = 0; i < 1200; i++) { a.call(1200, 450); a.update(1 / 60); }
  expect(Math.abs(a.z)).toBeLessThan(tpl.length * 0.1);
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

test('prey retain distinct anatomy and direction during escape animation', () => {
  const prey: Prey = { x: 0, y: 0, vx: 1, vy: 0, kind: PREY_FISH, school: 0, age: 0, life: 40, fear: 0 };
  for (const kind of [PREY_FISH, PREY_SQUID]) {
    prey.kind = kind;
    const right = preySprite(prey);
    const left = preySprite({ ...prey, vx: -1 });
    expect(left).not.toEqual(right);
    expect(right.join('')).toContain('o');
    const fleeing = preySprite({ ...prey, fear: 1, age: 0.1 });
    expect(fleeing).not.toEqual(right);
    expect(fleeing.join('')).toContain('o');
    expect(fleeing.join('').replace(/\s/g, '').length).toBeGreaterThan(8);
    expect(fleeing.join('')).toContain(kind === PREY_SQUID ? '#' : '=');
  }
});

test('a crossing keeps the foreground silhouette and its eyes intact in either input order', () => {
  // Record the renderer's atlas tile choices, avoiding font and GPU differences.
  const palette: Palette = { bg: '#171615', lo: [36, 34, 31], hi: [236, 232, 222], speck: '#4a4640', eye: '#f1ede4', shadow: '#121110', food: '#d9774b', prey: '#8fa7b0', preyBright: '#c9dde3' };
  const created: any[] = [];
  const canvas = () => {
    const tiles = new Map<string, number>();
    const fills: any[] = [];
    const context = {
      fillStyle: '', fillText() {},
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
      const shadow = created[1].fills.find((f: any) => f.color === palette.shadow).x / 11;
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
  } finally {
    (globalThis as any).document = savedDocument;
    (globalThis as any).window = savedWindow;
  }
});
