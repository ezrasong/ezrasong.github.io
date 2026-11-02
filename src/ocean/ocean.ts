/**
 * The ASCII ocean behind the page: one orca, some marine snow, and food the
 * visitor can drop by tapping open water. Owns the canvas, sizing, frame
 * scheduling, and input; the model, motion, and rasterizer live beside it.
 *
 * Decorative only: the canvas is aria-hidden and never takes pointer events.
 */

import { AsciiRenderer, K_FOOD, type Palette } from "./ascii-renderer";
import { buildOrca, type OrcaTemplate } from "./orca-model";
import { OrcaMotion } from "./orca-motion";

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
    updateMask();
    renderer.draw(tpl, motion.pose, yToScreen, snowView, clock);
  };

  const step = (dt: number): void => {
    if (!motion || !tpl) return;
    clock += dt;
    motion.update(dt);
    for (const s of snow) {
      s.y += s.vy * dt;
      s.x += Math.sin(clock * 0.3 + s.vy) * 1.5 * dt;
      if (s.y > h) {
        s.y = -4;
        s.x = Math.random() * w;
      }
    }
    // Food sinks slowly and is eaten when the head reaches it.
    const ek = tpl.eyeStation;
    const hx = motion.pose.cx[ek]!;
    const hy = yToScreen(motion.pose.cy[ek]!);
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i]!;
      f.t += dt;
      f.y += 6 * dt;
      f.x += Math.sin(f.t * 1.7 + i) * 3 * dt;
      if (Math.hypot(f.x - hx, f.y - hy) < tpl.length * 0.09 || f.t > 14) food.splice(i, 1);
    }
    if (food.length) {
      const f = food[0]!;
      motion.call(clamp(f.x, motion.zone.x0, motion.zone.x1), h - f.y);
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

