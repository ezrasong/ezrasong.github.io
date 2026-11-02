/** Landing chooser: 1 / 2 on the keyboard, or a click. */

import "./style.css";

import { startOcean } from "./ocean/ocean";
import { chooserWater } from "./ocean/water";

const canvas = document.querySelector<HTMLCanvasElement>("[data-ocean]");
if (canvas) startOcean(canvas, chooserWater);

const choices = Array.from(document.querySelectorAll<HTMLAnchorElement>(".choice"));

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = choices[Number(e.key) - 1];
  if (!target) return;
  e.preventDefault();
  target.click();
});

export {};
