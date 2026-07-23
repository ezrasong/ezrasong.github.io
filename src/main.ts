/**
 * Progressive enhancement for the site. Everything renders and reads without
 * this file; here we add: theme persistence, the mobile section menu, an
 * active-section indicator, a synthesized mechanical-key sound, and the
 * hero/section typewriter. All motion respects prefers-reduced-motion.
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  soundOn: false,
};

/* ---- Synthesized key sound --------------------------------------------- */
/* No audio files: a short filtered noise "click" plus a low triangle "thock",
   built fresh per keypress with small random variation so it never loops. */

type AC = AudioContext;
let audioCtx: AC | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensureAudio(): AC | null {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    const len = Math.floor(audioCtx.sampleRate * 0.05);
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playKey(strength = 1): void {
  if (!state.soundOn) return;
  const ctx = audioCtx;
  if (!ctx || !noiseBuffer || ctx.state !== "running") return;

  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.32 * strength;
  out.connect(ctx.destination);

  // Click: a brief band-passed noise burst.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1750 + Math.random() * 850;
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.5, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.03);
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t);
  noise.stop(t + 0.05);

  // Thock: a fast-decaying low triangle for the body of the press.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(148 + Math.random() * 44, t);
  osc.frequency.exponentialRampToValueAtTime(92, t + 0.05);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.4, t + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.09);
}

/* ---- Typewriter --------------------------------------------------------- */

function typeInto(
  target: HTMLElement,
  text: string,
  perChar: number,
  caret: boolean,
  sound = true,
): Promise<void> {
  return new Promise((resolve) => {
    target.textContent = "";
    let caretEl: HTMLElement | null = null;
    if (caret) {
      caretEl = document.createElement("span");
      caretEl.className = "caret";
      caretEl.setAttribute("aria-hidden", "true");
      target.appendChild(caretEl);
    }
    let i = 0;
    const step = (): void => {
      if (i >= text.length) {
        caretEl?.remove();
        resolve();
        return;
      }
      const ch = text[i]!;
      const node = document.createTextNode(ch);
      if (caretEl) target.insertBefore(node, caretEl);
      else target.appendChild(node);
      if (sound && ch.trim() !== "") playKey(0.85);
      i += 1;
      const pause = perChar + (ch === " " ? 45 : 0) + Math.random() * 32;
      window.setTimeout(step, pause);
    };
    step();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

let heroName: HTMLElement | null = null;
let heroText = "";

function setupHero(): void {
  heroName = document.querySelector<HTMLElement>("[data-typewriter]");
  if (!heroName) return;
  heroText = (heroName.textContent ?? "").trim();

  if (reduceMotion) {
    heroName.textContent = heroText;
    return;
  }
  // Reserve the final height so typing doesn't shift the page.
  const reserve = (): void => {
    if (!heroName) return;
    heroName.style.minHeight = `${heroName.getBoundingClientRect().height}px`;
    void typeInto(heroName, heroText, 60, true);
  };
  if (document.fonts?.ready) {
    document.fonts.ready.then(reserve).catch(reserve);
  } else {
    reserve();
  }
}

function retypeHero(): void {
  if (!heroName || reduceMotion || !heroText) return;
  void typeInto(heroName, heroText, 60, true);
}

function setupSectionTyping(): void {
  const eyebrows = Array.from(document.querySelectorAll<HTMLElement>(".section .eyebrow"));
  const prepared = eyebrows.map((eb) => {
    const promptEl = eb.querySelector(".eyebrow__prompt");
    const label = (eb.textContent ?? "").replace(/^\s*>\s*/, "").trim();
    eb.textContent = "";
    if (promptEl) {
      eb.appendChild(promptEl);
      eb.appendChild(document.createTextNode(" "));
    }
    const labelEl = document.createElement("span");
    labelEl.textContent = label; // final state for reduced-motion / no-IO
    eb.appendChild(labelEl);
    return { labelEl, label };
  });

  if (reduceMotion || !("IntersectionObserver" in window)) return;

  const map = new Map<Element, { labelEl: HTMLElement; label: string }>();
  prepared.forEach((p) => {
    p.labelEl.textContent = "";
    map.set(p.labelEl, p);
  });

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const p = map.get(entry.target);
        if (p) void typeInto(p.labelEl, p.label, 34, false);
        obs.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.4 },
  );
  prepared.forEach((p) => io.observe(p.labelEl));
}

/* ---- Interactive terminal ----------------------------------------------- */
/* A real command line: keystrokes clack, and commands drive the page. */

const TERM_PROMPT = "ezra@seoul ~ %";
const INTRO: Array<{ cmd: string; out: string }> = [
  { cmd: "whoami", out: "ezra song · software engineer" },
  { cmd: "ls ~/focus", out: "course-planner  chat-client  research-tools" },
  { cmd: "help", out: "it's a real shell. try: ls, cd about, open github" },
];
const SECTIONS = ["about", "experience", "work", "contact"];
const OPENERS: Record<string, string> = {
  github: "https://github.com/ezrasong",
  linkedin: "https://linkedin.com/in/e34song",
  resume: "Ezra_Song_Resume.pdf",
  email: "mailto:e34song@uwaterloo.ca",
};

let termBody: HTMLElement | null = null;
let currentInput: HTMLInputElement | null = null;
let termActivated = false;

function termScroll(): void {
  if (termBody) termBody.scrollTop = termBody.scrollHeight;
}

function termPrint(text: string, cls = "term__out"): void {
  if (!termBody) return;
  const line = document.createElement("div");
  line.className = "term__line";
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  line.appendChild(span);
  termBody.appendChild(line);
  termScroll();
}

function clearTerm(): void {
  if (termBody) termBody.textContent = "";
}

function scrollToId(id: string): void {
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  if (id === "home" || id === "top") {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

/* Returns the lines to print; may perform navigation / toggles as a side effect. */
function runCommand(raw: string): Array<{ text: string; cls?: string }> {
  const input = raw.trim();
  if (!input) return [];
  const parts = input.split(/\s+/);
  const c = (parts[0] ?? "").toLowerCase();
  const arg = (parts[1] ?? "").toLowerCase();

  // Bare section names and cd/goto both navigate.
  const navTo = c === "cd" || c === "goto" ? arg : SECTIONS.includes(c) || c === "home" || c === "top" ? c : null;
  if (navTo !== null) {
    if (SECTIONS.includes(navTo) || navTo === "home" || navTo === "top") {
      scrollToId(navTo);
      return [{ text: `→ ${navTo}`, cls: "term__accent" }];
    }
    return [{ text: `no such section: ${navTo || "?"}  (try: ${SECTIONS.join(", ")})` }];
  }

  switch (c) {
    case "help":
      return [
        { text: "commands", cls: "term__accent" },
        { text: "  ls              list sections" },
        { text: "  cd <name>       jump there: about, experience, work, contact" },
        { text: "  open <link>     github, linkedin, resume, email" },
        { text: "  whoami          who is this" },
        { text: "  theme [d|l]     switch colour theme" },
        { text: "  sound [on|off]  toggle the key sound" },
        { text: "  clear           clear the screen" },
      ];
    case "ls":
    case "dir":
      return [{ text: SECTIONS.join("   ") }];
    case "whoami":
      return [{ text: "ezra song · software engineer · waterloo" }];
    case "open": {
      const url = OPENERS[arg];
      if (!url) return [{ text: `can't open: ${arg || "?"}  (github, linkedin, resume, email)` }];
      window.open(url, arg === "email" ? "_self" : "_blank", "noopener");
      return [{ text: `opening ${arg}…`, cls: "term__accent" }];
    }
    case "theme": {
      const next = arg.startsWith("d") ? "dark" : arg.startsWith("l") ? "light" : currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      return [{ text: `theme → ${next}`, cls: "term__accent" }];
    }
    case "sound": {
      const on = arg === "on" ? true : arg === "off" ? false : !state.soundOn;
      setSound(on);
      return [{ text: `sound → ${on ? "on" : "off"}`, cls: "term__accent" }];
    }
    case "clear":
      clearTerm();
      return [];
    case "echo":
      return [{ text: parts.slice(1).join(" ") }];
    default:
      return [{ text: `command not found: ${c} (try 'help')` }];
  }
}

function makeSpan(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function printPrompt(): void {
  if (!termBody) return;
  const line = document.createElement("div");
  line.className = "term__cmdline";
  const prompt = makeSpan("term__prompt", TERM_PROMPT + " ");
  const typed = makeSpan("term__typed", "");
  const cursor = makeSpan("term__cursor", "");
  cursor.setAttribute("aria-hidden", "true");
  const field = document.createElement("input");
  field.className = "term__input";
  field.type = "text";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.setAttribute("autocapitalize", "off");
  field.setAttribute("aria-label", "Terminal command");

  line.append(prompt, typed, cursor, field);
  termBody.appendChild(line);
  currentInput = field;
  termScroll();

  field.addEventListener("input", () => {
    typed.textContent = field.value;
    playKey(0.7);
    termScroll();
  });
  field.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    playKey(1);
    const value = field.value;
    cursor.remove();
    field.remove();
    typed.textContent = value;
    line.className = "term__line";
    runCommand(value).forEach((o) => termPrint(o.text, o.cls ?? "term__out"));
    printPrompt();
  });

  if (termActivated) field.focus({ preventScroll: true });
}

async function typeCmdLine(cmd: string): Promise<void> {
  if (!termBody) return;
  const line = document.createElement("div");
  line.className = "term__cmdline";
  const prompt = makeSpan("term__prompt", TERM_PROMPT + " ");
  const typed = makeSpan("term__typed", "");
  const cursor = makeSpan("term__cursor", "");
  line.append(prompt, typed, cursor);
  termBody.appendChild(line);
  await typeInto(typed, cmd, 46, false);
  cursor.remove();
  line.className = "term__line";
  termScroll();
}

/* Drag the terminal freely over the screen by its title bar (transform), clamped
   so the bar can't be lost. Resize is native via CSS `resize`. */
function setupTermWindow(root: HTMLElement): void {
  const bar = root.querySelector<HTMLElement>(".term__bar");
  if (!bar) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let pending: { x: number; y: number } | null = null;

  const apply = (): void => {
    raf = 0;
    if (!pending) return;
    tx = baseX + (pending.x - startX);
    ty = baseY + (pending.y - startY);
    root.style.transform = `translate(${tx}px, ${ty}px)`;
    // Loose clamp: it can go nearly off any edge, just keep a sliver on-screen.
    const r = root.getBoundingClientRect();
    const pad = 28;
    let cx = 0;
    let cy = 0;
    if (r.right < pad) cx = pad - r.right;
    else if (r.left > window.innerWidth - pad) cx = window.innerWidth - pad - r.left;
    if (r.bottom < pad) cy = pad - r.bottom;
    else if (r.top > window.innerHeight - pad) cy = window.innerHeight - pad - r.top;
    if (cx || cy) {
      tx += cx;
      ty += cy;
      root.style.transform = `translate(${tx}px, ${ty}px)`;
    }
  };

  bar.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    baseX = tx;
    baseY = ty;
    root.style.willChange = "transform";
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    pending = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  });
  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    pending = null;
    root.style.willChange = "";
    try {
      bar.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* pointer already released */
    }
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
}

async function setupTerminal(): Promise<void> {
  termBody = document.querySelector<HTMLElement>("[data-term]");
  const root = document.querySelector<HTMLElement>("[data-term-root]");
  if (!termBody || !root) return;

  setupTermWindow(root);
  root.addEventListener("click", (e) => {
    // A drag on the bar shouldn't also steal focus mid-gesture.
    if ((e.target as Element).closest(".term__bar")) return;
    termActivated = true;
    currentInput?.focus({ preventScroll: true });
  });

  if (reduceMotion) {
    INTRO.forEach((l) => {
      const line = document.createElement("div");
      line.className = "term__line";
      line.append(makeSpan("term__prompt", TERM_PROMPT + " "), makeSpan("term__typed", l.cmd));
      termBody!.appendChild(line);
      termPrint(l.out);
    });
    printPrompt();
    return;
  }

  await sleep(850); // let the hero name land first
  for (const l of INTRO) {
    await typeCmdLine(l.cmd);
    await sleep(150);
    termPrint(l.out);
    await sleep(300);
  }
  printPrompt();
}

/* ---- Load-in + scroll reveal -------------------------------------------- */

function setupLoad(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-load]"));
  els.forEach((el) => {
    el.style.setProperty("--i", el.getAttribute("data-load") ?? "0");
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => els.forEach((el) => el.classList.add("in"))),
  );
}

function setupReveal(): void {
  document
    .querySelectorAll<HTMLElement>(".work-grid > *")
    .forEach((el, i) => el.style.setProperty("--i", String(i)));
  document
    .querySelectorAll<HTMLElement>(".exp-grid > *")
    .forEach((el, i) => el.style.setProperty("--i", String(i)));
  document.querySelectorAll<HTMLElement>(".keyboard").forEach((kb) => {
    kb.querySelectorAll<HTMLElement>(".skill-key").forEach((k, i) =>
      k.style.setProperty("--i", String(i)),
    );
  });

  const targets = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .keyboard"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach((t) => t.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
  );
  targets.forEach((t) => io.observe(t));
}

/* ---- Theme -------------------------------------------------------------- */

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let soundBtn: HTMLButtonElement | null = null;

function applyTheme(next: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch (e) {
    /* storage may be unavailable */
  }
}

function setSound(on: boolean): void {
  if (on) ensureAudio();
  state.soundOn = on;
  soundBtn?.setAttribute("aria-pressed", String(on));
  try {
    localStorage.setItem("sound", on ? "on" : "off");
  } catch (e) {
    /* storage may be unavailable */
  }
}

function setupTheme(): void {
  const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  btn?.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    playKey(1);
  });
}

/* ---- Sound toggle ------------------------------------------------------- */

function setupSound(): void {
  soundBtn = document.querySelector<HTMLButtonElement>("[data-sound-toggle]");
  if (!soundBtn) return;
  soundBtn.addEventListener("click", () => {
    const next = !state.soundOn;
    setSound(next);
    if (next) {
      playKey(1);
      // Replay the signature so the sound is heard immediately on enable.
      window.setTimeout(retypeHero, 140);
    }
  });
}

/* ---- Tactile clicks on every key --------------------------------------- */

function setupKeyClicks(): void {
  // A clack on anything that actually clicks: keys, links, buttons.
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Element | null;
      if (target?.closest("a[href], button, .key")) playKey(0.9);
    },
    { passive: true },
  );
}

/* ---- Nav: scrolled shadow, active section, mobile menu ------------------ */

function setupNav(): void {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  const onScroll = (): void => {
    nav?.setAttribute("data-scrolled", String(window.scrollY > 8));
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Active-section indicator.
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]"));
  const byId = new Map(links.map((l) => [l.getAttribute("href")?.slice(1) ?? "", l]));
  const sections = ["work", "experience", "about", "contact"]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);

  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.removeAttribute("aria-current"));
          byId.get(entry.target.id)?.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    sections.forEach((s) => spy.observe(s));
  }

  // Mobile disclosure menu.
  const menuBtn = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const menu = document.querySelector<HTMLElement>(".nav-links");
  if (menuBtn && menu) {
    menu.id = menu.id || "nav-links";
    const setOpen = (open: boolean): void => {
      menu.setAttribute("data-open", String(open));
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () => {
      setOpen(menu.getAttribute("data-open") !== "true");
    });
    menu.addEventListener("click", (e) => {
      if ((e.target as Element).closest("a")) setOpen(false);
    });
    document.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (!t.closest(".nav-links") && !t.closest("[data-menu-toggle]")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }
}

/* ---- Boot --------------------------------------------------------------- */

function boot(): void {
  setupTheme();
  setupSound();
  setupKeyClicks();
  setupNav();
  setupReveal();
  setupLoad();
  setupSectionTyping();
  setupHero();
  void setupTerminal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

export {};
