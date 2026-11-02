/** Portfolio: the orca ocean, plus the active-section marker in the nav. */

import "./style.css";

import { startOcean } from "./ocean/ocean";
import { portfolioWater } from "./ocean/water";

const canvas = document.querySelector<HTMLCanvasElement>("[data-ocean]");
if (canvas) startOcean(canvas, portfolioWater);

// The current section is the last one whose top has passed a third of the
// way down the screen; at the very bottom it's the last section, however
// short it is.
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-nav]"));
const sections = links
  .map((l) => document.getElementById(l.hash.slice(1)))
  .filter((s): s is HTMLElement => s !== null);

let ticking = false;
const mark = (): void => {
  ticking = false;
  const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  let current = -1;
  sections.forEach((s, i) => {
    if (s.getBoundingClientRect().top < window.innerHeight / 3) current = i;
  });
  if (atEnd) current = sections.length - 1;
  links.forEach((l, i) => {
    if (i === current) l.setAttribute("aria-current", "true");
    else l.removeAttribute("aria-current");
  });
};
window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(mark);
    }
  },
  { passive: true },
);
mark();

export {};
