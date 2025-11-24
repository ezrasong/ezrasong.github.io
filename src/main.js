import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import siteDataLocal from "./site-data.json";

// Bridge globals expected by the legacy scene code.
const THREE_NS = Object.assign({}, THREE);
THREE_NS.GLTFLoader = GLTFLoader;
window.THREE = THREE_NS;

const siteDataUrl = new URL("./site-data.json", import.meta.url).href;
window.SITE_DATA_URL = siteDataUrl;

async function loadSiteData() {
  const dataUrl = siteDataUrl;
  try {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Site data fetch failed: ${response.status}`);
    const json = await response.json();
    window.SITE_DATA = json;
    return json;
  } catch (error) {
    console.warn("Falling back to embedded site data", error);
    window.SITE_DATA = window.SITE_DATA || siteDataLocal || null;
    return window.SITE_DATA;
  }
}

async function bootstrap() {
  await loadSiteData();
  const { initScene } = await import("./legacy-main.js");
  if (typeof initScene === "function") {
    initScene();
  }
  window.__VITE_APP_BOOTSTRAPPED__ = true;
}

bootstrap();
