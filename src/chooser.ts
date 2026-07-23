/** Landing chooser: pick an experience with the keyboard (1 / 2) or a click. */

let audioCtx: AudioContext | null = null;

function clack(): void {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const ctx = audioCtx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.28;
    out.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(172, t);
    osc.frequency.exponentialRampToValueAtTime(92, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.09);
  } catch (e) {
    /* audio unavailable */
  }
}

function go(url: string): void {
  clack();
  window.setTimeout(() => {
    window.location.href = url;
  }, 70);
}

const choices = Array.from(document.querySelectorAll<HTMLAnchorElement>(".choice"));

window.addEventListener("keydown", (e) => {
  if (e.key === "1") {
    e.preventDefault();
    go("./portfolio.html");
  } else if (e.key === "2") {
    e.preventDefault();
    go("./seoul.html");
  }
});

choices.forEach((c) => c.addEventListener("click", () => clack()));
choices[0]?.focus({ preventScroll: true });

export {};
