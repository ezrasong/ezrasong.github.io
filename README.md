# Ezra Song — Creative Developer Portfolio

Personal portfolio site built with plain HTML/CSS/JS and Three.js. It renders an interactive bubble scene, panels for featured work, and structured content loaded from `site-data.js`. The site is deployed via GitHub Pages from the repository root.

Live site: https://ezrasong.github.io

## Tech Stack
- Three.js for WebGL scene (`three.min.js`, `GLTFLoader.js`)
- Vanilla HTML/CSS/JS (`index.html`, `style.css`, `main.js`)
- Local dev server via `live-server`

## Project Structure
- `index.html` — Page markup and script/style includes.
- `style.css` — Global styles and layout.
- `main.js` — Three.js scene, shaders, input handling, UI bindings.
- `site-data.js` — All content (links, stats, skills, experience, projects, education).
- `assets/` — Static assets like audio and models.
- `dist/` — An optimized build snapshot (not required for local dev; GitHub Pages serves from the repo root).
- `package.json` — Dev scripts and dependencies.

## Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+ (bundled with Node)

## Getting Started
1. Install dependencies:
   - `npm install`
2. Start the local dev server:
   - `npm start`
   - Opens at `http://127.0.0.1:4173` (or `http://localhost:4173`).
3. Edit files and refresh; `live-server` auto-reloads on save.

Notes
- The page includes scripts in this order: `site-data.js`, `three.min.js`, `GLTFLoader.js`, then `main.js`. Keep this order so `main.js` has access to `window.THREE` and `window.SITE_DATA`.
- If port `4173` is busy, change the port in `package.json` under the `dev` script.

## Editing Content
Most copy lives either directly in `index.html` or in `site-data.js` as structured data.

- Profile links, stats, skills, experience: update corresponding arrays/objects in `site-data.js`.
- Featured projects and bubble projects: edit `featuredProjects` and `bubbleProjects` in `site-data.js`.
- Page sections (hero, headings, lede text): edit the HTML in `index.html`.

Example — add a featured project in `site-data.js`:
```js
featuredProjects: [
  {
    title: "Project Name",
    description: "Short, plain-language summary of what it is and why it’s interesting.",
    stack: ["React", "TypeScript"],
    link: "https://github.com/your/repo",
    image: "https://.../preview.jpg"
  },
  // ...
]
```

Example — add a bubble project in `site-data.js`:
```js
bubbleProjects: [
  {
    title: "Project Name",
    description: "One–two sentence description.",
    link: "https://github.com/your/repo",
    tint: "#6fb1ff", // bubble color
    image: "https://.../preview.jpg", // or a local path you add under assets/
    position: { x: -0.5, y: 0.7, z: -0.2 }
  },
  // ...
]
```

Tips
- Host images on a reliable CDN (or add under `assets/`) and use reasonable sizes (e.g., 1200px wide) to keep loads snappy.
- Keep copy short and skimmable; long text is harder to read in overlay panels.

## Assets
- Audio: `assets/audio/chill-chip.wav`
- Models: `assets/models/*.glb`

If you add new assets, place them under `assets/` and reference them with relative paths from HTML/JS.

## Accessibility & Polish Checklist
- Provide descriptive `alt` text for any images displayed in panels.
- Ensure color contrast meets WCAG AA for text on backgrounds.
- Check keyboard focus order and that interactive controls (like the close button in the panel) have clear labels and `aria` attributes.
- Verify mobile layout (viewport widths 360–414px) and large screens (1440–1920px).
- Confirm content encoding is UTF-8 in your editor to avoid garbled characters.

## Deployment (GitHub Pages)
This is a user site repository (`<username>.github.io`), so GitHub Pages serves directly from the default branch root.

Steps
1. Push changes to the `main` branch.
2. In GitHub: Settings → Pages → Source should be set to “Deploy from a branch” and `main` / `/ (root)`.
3. Wait ~1–2 minutes for the site to refresh at `https://<username>.github.io`.

Custom domain (optional)
- Add your domain under Settings → Pages, then create a `CNAME` record at your DNS provider pointing to `<username>.github.io`.
- Commit a `CNAME` file at the repo root with your domain name to keep it sticky.

## Troubleshooting
- Error: `Three.js is not available. Ensure the CDN script is loaded before main.js.`
  - Ensure `<script src="./three.min.js"></script>` appears before `<script src="./main.js"></script>` in `index.html`.
- Blank canvas or missing models/images
  - Check asset paths in `index.html`/`site-data.js` and that files exist under `assets/`.
- Local server shows old content
  - Hard-refresh the browser (Ctrl/Cmd+Shift+R) to clear the cache.

## Roadmap Ideas (Optional)
- Add a bundler (e.g., Vite) for minification, cache-busting, and dev ergonomics.
- Generate content from JSON and validate with a schema.
- Add tests for data shape and link validity.

## License
No license specified. If you plan to open-source, add a `LICENSE` file or state your terms here.

