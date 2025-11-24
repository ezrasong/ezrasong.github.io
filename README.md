# Ezra Song — Creative Developer Portfolio

Portfolio built with Three.js and React (Vite). The scene renders interactive bubbles, panels for featured work, and loads structured content from `site-data.json`.

Live site: https://ezrasong.github.io

## Tech Stack

- Vite (dev/build) + React
- Three.js (ESM) for the scene (`src/legacy-main.js`)
- App shell/styles in `src/App.jsx` and `src/style.css`

## Project Structure

- `index.html` — Root HTML with Vite/React entry.
- `src/main.jsx` — React/Vite entry; wires globals and renders `App`.
- `src/App.jsx` — Page shell and markup.
- `src/legacy-main.js` — Three.js scene, shaders, input handling, UI bindings.
- `src/style.css` — Global styles/layout.
- `site-data.json` — Content payload (lives in `src/`, emitted with the build for runtime fetch).
- `assets/` — Static assets (audio, models, data) served via Vite `publicDir`.
- `dist/` — Vite build output.

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+ (bundled with Node)

## Getting Started

1. Install deps: `npm install`
2. Dev server: `npm start` (opens at http://localhost:5173)
3. Build: `npm run build` (outputs to `dist/`)
4. Preview build: `npm run preview`

## Deployment (GitHub Pages)

Build locally or in CI and publish `dist/` (e.g., deploy to `gh-pages` or set Pages to the built output). The root HTML’s `/src/main.jsx` is for development; production should serve the built `dist` bundle.

## Editing Content

- Structured data: edit `site-data.json` (profile links, stats, skills, experience, featured projects, bubble projects, education).
- Page copy/layout: edit `src/App.jsx` (hero, headings, lede text).
- Images: host in `assets/` or a CDN; keep reasonable sizes (e.g., ~1200px wide).

Example snippet in `site-data.json`:

```json
"featuredProjects": [
  {
    "title": "Project Name",
    "description": "Short summary.",
    "stack": ["React", "TypeScript"],
    "link": "https://github.com/your/repo",
    "image": "https://.../preview.jpg"
  }
]
```

## Assets

- Audio: `assets/audio/chill-chip.wav`
- Models: `assets/models/*.glb`

## Troubleshooting

- Blank canvas or missing assets: confirm paths and that files exist under `assets/`.
- Stale content: hard-refresh (Ctrl/Cmd+Shift+R) and ensure `npm run dev` is running; rebuild for production.

## License

No license specified. Add one if you plan to open-source.
