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
import { PreyField, type Prey } from "./prey";
import { steerPod } from "./pod-motion";

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
    target: Prey | null;
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
  let clock = 0;
  let running = false;
  const snow: Snow[] = [];
  const food: Food[] = [];
  let feeder: Orca | null = null;
  let meal: Food | null = null;
  let huntLeader: Orca | null = null;
  let catches = 0;
  const prey = new PreyField();

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
    renderer.resize(w, h, small ? 6 : 9, small ? 9 : 13);
    const L = opts.length(w, h);
    const prev = motion;
    tpl = buildOrca(L, renderer.cssCw, renderer.cssCh);
    motion = new OrcaMotion(tpl, 0x5eed);
    const z = opts.zone(w, h);
    // World y is up from the bottom of the viewport.
    motion.zone = { x0: z.x0, x1: z.x1, y0: h - z.y1, y1: h - z.y0 };
    pod.length = 0;
    feeder = null;
    meal = null;
    huntLeader = null;
    pod.push({ tpl, motion, stay: Infinity, leaving: false, fullFor: 0.5, target: null });
    prey.resize(w, h, L);
    for (const f of food) {
      f.x = clamp(f.x, renderer.cssCw, w - renderer.cssCw);
      f.y = clamp(f.y, renderer.cssCh, h - renderer.cssCh);
    }
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
  const render = (dt = 0): void => {
    if (!tpl || !motion) return;
    snowView.length = 0;
    for (const s of snow) snowView.push({ x: s.x, y: s.y, k: s.k });
    for (const f of food) snowView.push({ x: f.x, y: f.y, k: K_FOOD });
    updateMask();
    renderer.draw(pod.map((o) => ({ tpl: o.tpl, pose: o.motion.pose })), yToScreen, snowView, clock, dt, prey.list);
  };

  const step = (dt: number): void => {
    if (!motion || !tpl) return;
    clock += dt;
    if (!meal || !food.includes(meal) || !feeder || !pod.includes(feeder) || feeder.leaving) {
      feeder?.motion.finishPursuit();
      meal = food[food.length - 1] ?? null;
      feeder = null;
      if (meal) {
        let closest = Infinity;
        for (const o of pod) {
          if (o.leaving) continue;
          const distance = Math.hypot(o.motion.x - meal.x, yToScreen(o.motion.y) - meal.y);
          if (distance < closest) { closest = distance; feeder = o; }
        }
      }
    }
    // Keep a target until it is caught or leaves, and spread hunters across
    // different prey. Re-selecting the nearest fish every frame caused the
    // orcas to hesitate between members of a scattering school.
    const claimed = new Set<Prey>();
    for (const o of pod) {
      if (o.leaving || o === feeder || o.fullFor > 0) continue;
      if (!o.target || !prey.list.includes(o.target) || claimed.has(o.target)
        || o.target.x < 0 || o.target.x > w || o.target.y < 0 || o.target.y > h) {
        const hadTarget = o.target !== null;
        o.target = prey.nearest(o.motion.x, yToScreen(o.motion.y), claimed);
        if (!o.target && hadTarget) o.motion.finishPursuit();
      }
      if (o.target) claimed.add(o.target);
    }
    if (!huntLeader?.target || !prey.list.includes(huntLeader.target) || huntLeader.leaving || huntLeader.fullFor > 0 || huntLeader === feeder) {
      huntLeader = null;
      let closest = Infinity;
      for (const o of pod) {
        if (!o.target || o.leaving || o === feeder || o.fullFor > 0) continue;
        const distance = Math.hypot(o.target.x - o.motion.x, o.target.y - yToScreen(o.motion.y));
        if (distance < closest) { closest = distance; huntLeader = o; }
      }
    }
    const priority = feeder ?? huntLeader;
    for (const o of pod) {
      if (o.leaving || o === feeder || !o.target || o.fullFor > 0) continue;
      const p = o.target;
      const lead = clamp(Math.hypot(p.x - o.motion.x, p.y - yToScreen(o.motion.y)) / Math.max(o.motion.speed, 1) * 0.25, 0.15, 0.7);
      const x = clamp(p.x + p.vx * lead, 8, w - 8);
      const y = h - clamp(p.y + p.vy * lead, 8, h - 8);
      if (o === priority) o.motion.feed(x, y);
      else o.motion.chase(x, y);
    }
    if (feeder && meal) feeder.motion.feed(meal.x, h - meal.y);
    steerPod(pod, priority?.motion);
    for (const o of pod) o.motion.update(dt);
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
      pod.push({ tpl: vt, motion: vm, stay: 35 + Math.random() * 30, leaving: false, fullFor: 0.3, target: null });
    }
    for (let i = pod.length - 1; i >= 1; i--) {
      const o = pod[i]!;
      o.stay -= dt;
      if (o.stay <= 0 && !o.leaving && o !== feeder) {
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
      return { o, x: o.motion.pose.cx[0]!, y: yToScreen(o.motion.pose.cy[0]!) };
    });
    // Food stays available through a long turn and settles at the viewport
    // floor. Test bites at the snout, where the feeding target actually is.
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i]!;
      f.t += dt;
      f.y = Math.min(h - renderer.cssCh, f.y + 6 * dt);
      f.x = clamp(f.x + Math.sin(f.t * 1.7 + i) * 3 * dt, renderer.cssCw, w - renderer.cssCw);
      const eater = pod.find((o) => Math.hypot(f.x - o.motion.pose.cx[0]!, f.y - yToScreen(o.motion.pose.cy[0]!)) < o.tpl.length * 0.09);
      if (eater) {
        eater.fullFor = 1;
        eater.motion.poke();
        food.splice(i, 1);
      }
    }
    // Prey flee the nearest head and get hunted by any hungry orca. Food
    // the visitor dropped takes priority over fullness and prey hunting.
    const threats = pod.flatMap((o) => [0, 0.25, 0.5, 0.75].map((s) => {
      const k = Math.round(s * (o.motion.pose.cx.length - 1));
      return { x: o.motion.pose.cx[k]!, y: yToScreen(o.motion.pose.cy[k]!) };
    }));
    prey.update(dt, threats, tpl.length * 0.45);
    for (const { o, x, y } of heads) {
      o.fullFor -= dt;
      const eaten = prey.eatNear(x, y, o.tpl.length * 0.09);
      if (eaten > 0) {
        catches += eaten;
        o.fullFor = 0.65;
        o.target = null;
        if (o !== feeder) o.motion.finishPursuit();
        o.motion.poke();
      }
    }
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    // Update motion on every display frame, including phones. Substeps keep
    // a delayed frame from stretching body trails or skipping through prey.
    let remaining = dt;
    while (remaining > 0.000001) {
      const slice = Math.min(remaining, 1 / 60);
      step(slice);
      remaining -= slice;
    }
    render(dt);
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

  // Links and copy are left alone; empty section padding is open water too.
  const isWater = (t: EventTarget | null): boolean => {
    const el = t as Element | null;
    if (!el || !(el instanceof Element)) return false;
    return !el.closest("a, button, input, textarea, select, label, p, h1, h2, h3, li, dd, dt");
  };

  const dropFood = (x: number, y: number): void => {
    // Keep two older drops plus this one, even during repeated tapping.
    food.splice(0, Math.max(0, food.length - 6));
    for (let i = 0; i < 3; i++) {
      food.push({
        x: clamp(x + (i - 1) * renderer.cssCw * 1.6, renderer.cssCw, w - renderer.cssCw),
        y: clamp(y - (i % 2) * renderer.cssCh, renderer.cssCh, h - renderer.cssCh),
        t: 0,
      });
    }
    meal = null; // A new tap gets an immediate response, ahead of older food.
  };
  const onPointerDown = (e: PointerEvent): void => {
    motion?.poke();
    if (!running || !isWater(e.target) || e.button !== 0) return;
    dropFood(e.clientX, e.clientY);
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
    get length() { return tpl?.length ?? 0; },
    stop,
    start,
    /** Freeze a pose for inspection: head at (x, y) CSS px, heading yaw. */
    pose: (x: number, y: number, yaw: number) => {
      stop();
      motion?.place(x, h - y, yaw);
      render();
    },
    feed: dropFood,
    /** Feeding state for deterministic interaction checks. */
    food: () => food.map((f) => ({ x: f.x, y: f.y, age: f.t })),
    get feeder() { return feeder ? pod.indexOf(feeder) : -1; },
    prey: () => prey.list.map((p) => ({ ...p })),
    get catches() { return catches; },
    hunters: () => pod.map((o) => o.target ? { x: o.target.x, y: o.target.y } : null),
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

