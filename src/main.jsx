import { createRoot } from "react-dom/client";
import * as THREE from "three";
import App from "./App.jsx";
import siteDataLocal from "./site-data.json";

window.THREE = { ...THREE };
window.SITE_DATA = siteDataLocal;
window.SITE_DATA_URL = new URL("./site-data.json", import.meta.url).href;
window.REACT_RENDERED = true;

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
