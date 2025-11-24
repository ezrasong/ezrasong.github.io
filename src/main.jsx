import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import App from "./App.jsx";
import siteDataLocal from "./site-data.json";

const THREE_NS = { ...THREE, GLTFLoader };
window.THREE = THREE_NS;
window.SITE_DATA = siteDataLocal;
window.SITE_DATA_URL = new URL("./site-data.json", import.meta.url).href;

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
