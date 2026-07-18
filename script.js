// Scroll-triggered reveals and the Fig. 1 curve draw.
// Everything degrades gracefully: without JS the page is fully readable,
// and prefers-reduced-motion is handled in CSS.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealables = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("visible"));
  document.getElementById("trajectory")?.classList.add("drawn");
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("visible");
        if (entry.target.id === "trajectory") {
          entry.target.classList.add("drawn");
        }
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15 }
  );

  revealables.forEach((el) => observer.observe(el));
}
