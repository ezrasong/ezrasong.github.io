# Ezra Song · Creative Developer

Immersive, audio-reactive portfolio built with Three.js. It renders a bubble field, animated GLTF swimmers (Quagsire + Wailord), and interactive project panels driven by a single `site-data.js` config.

## Quick start

1. Node 18+ recommended.
2. Install deps: `npm install`
3. Start dev server with live reload: `npm run dev`
   - Serves from the repo root at `http://localhost:4173`
   - Watches HTML, JS, CSS, and assets; browser auto-refreshes on save

## Project layout

- `index.html` — entry point wiring scripts and DOM hooks for the scene and panels.
- `main.js` — Three.js scene, shaders, audio reactivity, and interaction logic.
- `site-data.js` — editable portfolio content (projects, stats, links, education, etc.).
- `style.css` — layout and typography.
- `assets/audio/chill-chip.wav` — soundtrack used for visuals and audio response.
- `assets/models/quagsire.glb` — optional swimmer; drop in your model to enable it.
- `assets/models/wailord.glb` — Wailord swimmer used in the scene (replaceable).
- `dist/` — previously generated static build; not required for local dev.

## Editing content

- Update copy, links, stats, and project bubbles in `site-data.js`.
- Replace audio by swapping `assets/audio/chill-chip.wav`.
- Swap or add swimmers by replacing the GLB files in `assets/models/` (the paths in `main.js` expect `quagsire.glb` and `wailord.glb`).

## Deployment

This is a static site—no build step needed. For GitHub Pages, point Pages to the repository root (default branch). For other hosts, serve the root directory; ensure `assets/` remains relative to `index.html`.
