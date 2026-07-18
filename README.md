# ezrasong.github.io

Personal site of Ezra Song, styled as a short mathematics working paper —
graph-paper grid, arXiv-style title block, numbered sections, projects as
captioned figures, and contact links as a references list.

Live site: https://ezrasong.github.io

## Stack

Hand-written HTML, CSS, and a few lines of JavaScript. No frameworks, no
dependencies, no build step.

- `index.html` — all content and structure
- `styles.css` — design tokens, layout, the graph-paper grid, animations
- `script.js` — scroll reveals and the Fig. 1 curve-draw animation
- `assets/` — résumé PDF

Type is set in [STIX Two Text](https://fonts.google.com/specimen/STIX+Two+Text)
(display) and IBM Plex Sans / Mono (body and labels), loaded from Google Fonts.

## Development

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 5173
```

## Deployment

Pushes to `main` deploy the repository root to GitHub Pages via
`.github/workflows/deploy.yml`. No build step — the artifact is the repo
itself.

## Editing content

Everything lives in `index.html`: experience entries under `§1`, skills under
`§2 Notation`, projects as figures under `§3`, education and awards under
`§4`, and links under `References`. The trajectory chart (Fig. 1) is an
inline SVG at the top of the file — points are plain `<circle>` + `<text>`
pairs if a new milestone needs plotting.
