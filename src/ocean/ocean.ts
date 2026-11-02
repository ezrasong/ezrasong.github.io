/**
 * The ASCII ocean behind the page: one orca, some marine snow, and food the
 * visitor can drop by tapping open water. Owns the canvas, sizing, frame
 * scheduling, and input; the model, motion, and rasterizer live beside it.
 *
 * Decorative only: the canvas is aria-hidden and never takes pointer events.
 */

import { AsciiRenderer, K_FOOD, K_PREY, type Palette } from "./ascii-renderer";
import { buildOrca, type OrcaTemplate } from "./orca-model";
import { OrcaMotion } from "./orca-motion";
import { PreyField, PREY_SQUID } from "./prey";

export interface OceanOptions {
  /**
   * Where the orca may swim, in CSS px of the viewport, recomputed on
   * resize. Return the open water not covered by text.
   */
  zone: (w: number, h: number) => { x0: number; x1: number; y0: number; y1: number };
  /** Body length in CSS px for a given viewport. */
  length: (w: number, h: number) => number;
  /** Elements whose boxes dim the orca where it passes behind them. */
  maskSelector?: string;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

const PALETTE: Palette = {
  bg: "#171615",
  lo: [36, 34, 31],
  hi: [236, 232, 222],
  speck: "#4a4640",
  eye: "#f1ede4",
  shadow: "#121110",
  food: "#d9774b",
  prey: "#8fa7b0",
  preyBright: "#c9dde3",
};

interface Snow {
  x: number;
  y: number;
  vy: number;
  k: number;
}

interface Food {
  x: number;
  y: number;
  t: number;
}

export function startOcean(canvas: HTMLCanvasElement, opts: OceanOptions): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const renderer = new AsciiRenderer(canvas, PALETTE);

  let tpl: OrcaTemplate | null = null;
  /** The pod. The first orca is resident; the rest are visitors. */
  interface Orca {
    tpl: OrcaTemplate;
    motion: OrcaMotion;
    /** Seconds until a visitor heads for the exit; Infinity for the resident. */
    stay: number;
    leaving: boolean;
    fullFor: number;
  }
  const pod: Orca[] = [];
  const MAX_POD = 3;
  /** Seconds until the next visitor may arrive. */
  let visitIn = 25;
  let motion: OrcaMotion | null = null;
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let running = false;
  const snow: Snow[] = [];
  const food: Food[] = [];
  const prey = new PreyField();

  // Low-power devices get 30 fps; the grid quantizes motion anyway.
  const lowPower = coarse || (navigator.hardwareConcurrency ?? 8) <= 4;
  const frameDt = lowPower ? 1 / 30 : 1 / 60;

  const yToScreen = (y: number): number => h - y;

  const layout = (): void => {
    const nw = window.innerWidth;
    // Use the large viewport height so mobile URL-bar changes don't rebuild.
    const nh = Math.max(window.innerHeight, document.documentElement.clientHeight);
    if (nw === w && Math.abs(nh - h) < 120 && tpl) {
      h = Math.max(h, nh);
      return;
    }
    w = nw;
    h = nh;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const small = w < 640;
    renderer.resize(w, h, small ? 8 : 11, small ? 12 : 16);
    const L = opts.length(w, h);
    const prev = motion;
    tpl = buildOrca(L, renderer.cssCw, renderer.cssCh);
    motion = new OrcaMotion(tpl, 0x5eed);
    const z = opts.zone(w, h);
    // World y is up from the bottom of the viewport.
    motion.zone = { x0: z.x0, x1: z.x1, y0: h - z.y1, y1: h - z.y0 };
    pod.length = 0;
    pod.push({ tpl, motion, stay: Infinity, leaving: false, fullFor: 6 });
    prey.resize(w, h);
    if (prev) {
      const px = Math.min(Math.max(prev.x, z.x0), z.x1);
      motion.place(px, (motion.zone.y0 + motion.zone.y1) / 2, prev.yaw);
    } else {
      // Enter from just outside the zone, already mid-stroke.
      motion.place(z.x0 + (z.x1 - z.x0) * 0.28, (motion.zone.y0 + motion.zone.y1) / 2 + L * 0.05, -0.08);
    }
    snow.length = 0;
    const count = Math.round((w * h) / (small ? 9000 : 14000));
    for (let i = 0; i < count; i++) {
      snow.push({ x: Math.random() * w, y: Math.random() * h, vy: 4 + Math.random() * 7, k: Math.floor(Math.random() * 5) });
    }
    maskDirty = true;
    render();
  };

  const snowView: Array<{ x: number; y: number; k: number }> = [];
  const render = (): void => {
    if (!tpl || !motion) return;
    snowView.length = 0;
    for (const s of snow) snowView.push({ x: s.x, y: s.y, k: s.k });
    for (const f of food) snowView.push({ x: f.x, y: f.y, k: K_FOOD });
    for (const p of prey.list) {
      const g = p.fear > 0.5 ? 4 : p.kind === PREY_SQUID ? (p.vx >= 0 ? 2 : 3) : p.vx >= 0 ? 0 : 1;
      snowView.push({ x: p.x, y: p.y, k: K_PREY + g });
    }
    updateMask();
    renderer.draw(pod.map((o) => ({ tpl: o.tpl, pose: o.motion.pose })), yToScreen, snowView, clock);
  };

  const step = (dt: number): void => {
    if (!motion || !tpl) return;
    clock += dt;
    for (const o of pod) o.motion.update(dt);
    // Keep the pod spaced: when two heads get within a body length, the
    // smaller one veers off, so they swim near each other instead of
    // overlapping into one shape.
    for (let i = 1; i < pod.length; i++) {
      const a = pod[i]!;
      if (a.leaving) continue;
      for (let j = 0; j < pod.length; j++) {
        if (j === i) continue;
        const b2 = pod[j]!;
        const dx = a.motion.x - b2.motion.x;
        const dy = a.motion.y - b2.motion.y;
        const min = (a.tpl.length + b2.tpl.length) * 0.55;
        if (dx * dx + dy * dy < min * min) {
          const zn = a.motion.zone;
          a.motion.avoid(clamp(a.motion.x + Math.sign(dx || 1) * min * 1.5, zn.x0, zn.x1), clamp(a.motion.y + Math.sign(dy || 1) * min * 0.4, zn.y0, zn.y1));
        }
      }
    }
    // Visitors: a smaller orca (a female or a juvenile) swims in from a side
    // edge every half minute or so, stays a while, then leaves the way it came.
    visitIn -= dt;
    if (visitIn <= 0 && pod.length < MAX_POD) {
      visitIn = 25 + Math.random() * 25;
      const scale = 0.62 + Math.random() * 0.2;
      const vt = buildOrca(tpl.length * scale, renderer.cssCw, renderer.cssCh);
      const vm = new OrcaMotion(vt, 1 + ((Math.random() * 0x7ffffffe) | 0));
      vm.zone = { ...motion.zone };
      const fromLeft = Math.random() < 0.5;
      const y = vm.zone.y0 + (vm.zone.y1 - vm.zone.y0) * (0.2 + Math.random() * 0.6);
      vm.place(fromLeft ? -vt.length * 0.4 : w + vt.length * 0.4, y, fromLeft ? 0 : Math.PI);
      vm.call(fromLeft ? vm.zone.x0 + (vm.zone.x1 - vm.zone.x0) * 0.4 : vm.zone.x0 + (vm.zone.x1 - vm.zone.x0) * 0.6, y);
      pod.push({ tpl: vt, motion: vm, stay: 35 + Math.random() * 30, leaving: false, fullFor: 3 });
    }
    for (let i = pod.length - 1; i >= 1; i--) {
      const o = pod[i]!;
      o.stay -= dt;
      if (o.stay <= 0 && !o.leaving) {
        // Head out past the nearest side edge.
        o.leaving = true;
        o.motion.zone = { x0: -w, x1: 2 * w, y0: o.motion.zone.y0, y1: o.motion.zone.y1 };
      }
      if (o.leaving) {
        const out = o.motion.x < w / 2 ? -o.tpl.length * 1.6 : w + o.tpl.length * 1.6;
        o.motion.call(out, o.motion.y);
        if (o.motion.x < -o.tpl.length * 1.3 || o.motion.x > w + o.tpl.length * 1.3) pod.splice(i, 1);
      }
    }
    for (const s of snow) {
      s.y += s.vy * dt;
      s.x += Math.sin(clock * 0.3 + s.vy) * 1.5 * dt;
      if (s.y > h) {
        s.y = -4;
        s.x = Math.random() * w;
      }
    }
    // Head positions in screen space
    const heads = pod.map((o) => {
      const ek = o.tpl.eyeStation;
      return { o, x: o.motion.pose.cx[ek]!, y: yToScreen(o.motion.pose.cy[ek]!) };
    });
    // Food sinks slowly and is eaten when any head reaches it.
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i]!;
      f.t += dt;
      f.y += 6 * dt;
      f.x += Math.sin(f.t * 1.7 + i) * 3 * dt;
      if (f.t > 14 || heads.some((hd) => Math.hypot(f.x - hd.x, f.y - hd.y) < hd.o.tpl.length * 0.09)) food.splice(i, 1);
    }
    // Prey flee the nearest head and get hunted by any hungry orca. Food
    // the visitor dropped always comes first, for the resident.
    prey.update(dt, heads, tpl.length * 0.6);
    for (const { o, x, y } of heads) {
      o.fullFor -= dt;
      if (prey.eatNear(x, y, o.tpl.length * 0.09) > 0) {
        o.fullFor = 5 + Math.random() * 6;
        o.motion.poke();
      }
      if (o.leaving) continue;
      const zn = o.motion.zone;
      if (o === pod[0] && food.length) {
        const f = food[0]!;
        o.motion.call(clamp(f.x, zn.x0, zn.x1), h - f.y);
      } else if (o.fullFor <= 0) {
        const p = prey.nearest(x, y);
        // Lead the target a little, the way a hunter cuts off a fleeing
        // fish, and only hunt inside the water the orca may swim in.
        if (p) o.motion.chase(clamp(p.x + p.vx * 0.5, zn.x0, zn.x1), clamp(h - (p.y + p.vy * 0.5), zn.y0, zn.y1));
      }
    }
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : frameDt;
    last = now;
    acc += dt;
    if (acc < frameDt * 0.92) return;
    const d = Math.min(acc, 0.1);
    acc = 0;
    step(d);
    render();
  };

  const start = (): void => {
    if (running || reduce.matches) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const onVisibility = (): void => (document.hidden ? stop() : start());
  const onReduce = (): void => {
    if (reduce.matches) {
      stop();
      render();
    } else start();
  };

  // Text boxes are re-measured at most once a frame while scrolling.
  let maskDirty = true;
  const maskEls = opts.maskSelector ? Array.from(document.querySelectorAll(opts.maskSelector)) : [];
  const updateMask = (): void => {
    if (!maskDirty) return;
    maskDirty = false;
    const rects = [];
    for (const el of maskEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h && r.width > 0) rects.push(r);
    }
    renderer.setMask(rects);
  };

  let lastScroll = window.scrollY;
  const onScroll = (): void => {
    const y = window.scrollY;
    maskDirty = true;
    if (!running) {
      updateMask();
      render();
    }
    // Scrolling stirs the water a little: the orca wakes from idle.
    if (Math.abs(y - lastScroll) > 40) motion?.poke();
    lastScroll = y;
  };

  // Open water only: anything inside the page's content is left alone.
  const isWater = (t: EventTarget | null): boolean => {
    const el = t as Element | null;
    if (!el || !(el instanceof Element)) return false;
    return !el.closest("a, button, input, textarea, select, label, [data-content], p, h1, h2, h3, li, dd, dt");
  };

  const onPointerDown = (e: PointerEvent): void => {
    motion?.poke();
    if (!running || !isWater(e.target) || e.button !== 0) return;
    if (food.length > 6) food.shift();
    for (let i = 0; i < 3; i++) {
      food.push({ x: e.clientX + (i - 1) * renderer.cssCw * 1.6, y: e.clientY - (i % 2) * renderer.cssCh, t: 0 });
    }
  };

  let px = 0;
  let py = 0;
  let pt = 0;
  const onPointerMove = (e: PointerEvent): void => {
    motion?.poke();
    const now = performance.now();
    const dt = (now - pt) / 1000;
    if (dt > 0 && dt < 0.1 && motion) {
      const v = Math.hypot(e.clientX - px, e.clientY - py) / dt;
      if (v > 1400) motion.startle(e.clientX, h - e.clientY);
    }
    px = e.clientX;
    py = e.clientY;
    pt = now;
  };

  let resizeRaf = 0;
  const onResize = (): void => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      layout();
      maskDirty = true;
      onScroll();
    });
  };

  // Glyphs are pre-rendered, so wait for the face before the first atlas.
  const fontReady = document.fonts?.load
    ? document.fonts.load('500 16px "Geist Mono Variable"').catch(() => undefined)
    : Promise.resolve();
  void fontReady.then(() => {
    layout();
    onScroll();
    render();
    canvas.dataset.ready = "true";
    start();
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  reduce.addEventListener("change", onReduce);

  // Debug and test hook.
  (window as unknown as { __ocean?: unknown }).__ocean = {
    get motion() {
      return motion;
    },
    get pod() {
      return pod.length;
    },
    /** Head positions of every orca, CSS px from the top-left (tests). */
    heads: () => pod.map((o) => [Math.round(o.motion.x), Math.round(h - o.motion.y)]),
    /** Bring a visitor in now (tests). */
    visit: () => {
      visitIn = 0;
    },
    get cells() {
      return { cols: renderer.cols, rows: renderer.rows };
    },
    stop,
    start,
    /** Freeze a pose for inspection: head at (x, y) CSS px, heading yaw. */
    pose: (x: number, y: number, yaw: number) => {
      stop();
      motion?.place(x, h - y, yaw);
      render();
    },
    feed: (x: number, y: number) => food.push({ x, y, t: 0 }),
  };

  return () => {
    stop();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    reduce.removeEventListener("change", onReduce);
  };
}

