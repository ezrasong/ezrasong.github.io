# ezrasong.github.io

Ezra Song's personal site. One entrance, **two ways in**. A chooser at the door
sends you to whichever build you want:

- **Portfolio:** a clean, fast, single page with a real working terminal.
- **Mini Seoul:** a playable low-poly 3D Seoul you drive a poro through,
  knocking on buildings to open the work.

Both cover the same projects and experience, and each has a switch to hop back
to the other. Built with Vite and TypeScript, no UI framework.

**Live:** https://ezrasong.github.io

## Pages

| Route | File | What it is |
| --- | --- | --- |
| `/` | `index.html` + `src/chooser.ts` | The landing chooser (press `1` / `2`) |
| `/portfolio.html` | `portfolio.html` + `src/main.ts` + `src/style.css` | The clean portfolio |
| `/seoul.html` | `seoul.html` + `src/seoul/**` | The 3D Mini Seoul (Three.js) |

It's a Vite multi-page app; the three HTML entries are wired in
`vite.config.ts`. The Three.js bundle only loads on `/seoul.html`.

## Design (Seoul dusk)

Both surfaces share one palette, carried over from the 3D world: a warm sunset
accent (`#c96f4a`) over a dusk / hanok-cream neutral system, with neon cyan
(`#4ce0d2`) for terminal prompts and carets. Dark by default; a light "hanok
paper" mode via the toggle or the `theme` command. Type is **Pixelify Sans**
throughout (Minecraft-style pixel). Pressable controls are keycaps that
physically depress, and every click plays a synthesized key clack when sound is
on.

### Portfolio signature: the terminal

The hero's right side is a real shell. Keystrokes play a synthesized mechanical
clack (no audio files; Web Audio, off by default). Commands:

- `help`, `ls`, `whoami`, `clear`
- `cd <name>` (or a bare section name) scrolls to about / experience / work /
  contact
- `open github | linkedin | resume | email`
- `theme [dark|light]`, `sound [on|off]`

It's a floating window: drag it by the title bar, resize it from the corner.
Motion (typewriter, reveals) respects `prefers-reduced-motion`, and every page
reads with JavaScript disabled.

## Structure

```
index.html        chooser landing
portfolio.html    the clean portfolio
seoul.html        the 3D Mini Seoul
src/
  chooser.ts      landing: keyboard 1/2 + selection sound
  main.ts         portfolio enhancement: theme, terminal, sound, reveals
  style.css       shared design system (portfolio + chooser)
  seoul/          the 3D engine (Three.js, cannon-es, GSAP)
    config/        editable content: profile, projects, places, palette
    world/         cel shading, terrain, water, buildings, props, weather
    ...
public/
  models/poro.glb, Ezra_Song_Resume.pdf, robots.txt, sitemap.xml
```

## Updating the résumé

Replace **`public/Ezra_Song_Resume.pdf`** with a new résumé using GitHub's
**Add file → Upload files** inside `public/`, keeping the filename exactly
the same. Commit to `main` (or merge a PR). The existing Pages workflow
extracts it and deploys both experiences automatically. No API key is needed.

The PDF updates the download, education, skills, work history, résumé
projects, awards, contact links, and current/recent role wording. The clean
portfolio shows the résumé in its experience section; Mini Seoul shows it
in About Ezra, Skills Workshop, and Experience Tower. Featured projects with
the same repository URL also receive the updated description and stack.

Keep the current **text-based, single-column layout** and sections:
Education, Technical Skills, Professional Experience, Projects, and
Hackathons & Awards. Put dates/stacks/results on the right as in the current
PDF, and use real bullet points. Scanned PDFs, password-protected PDFs, and
unexpected layouts fail the build with an extraction error; the last good
deployment stays live. The parser supports up to five pages and 5 MB.

Locally, `npm run resume:sync` refreshes `src/content/resume.json` and the
marked blocks in `portfolio.html` and `seoul.html` (including search metadata
and the accessible text summary). Both `npm run dev` and `npm run build`
run this first. Generated content is committed as a readable snapshot;
GitHub regenerates it during deployment without making a bot commit.

## Editing other content

- **Portfolio:** edit outside the `resume:…` comment blocks in `portfolio.html`.
- **Mini Seoul:** curated projects and world placement stay in `src/seoul/config/`.
  New résumé projects appear in Experience Tower without moving buildings.
- **Chooser copy:** in `index.html`.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build of all three pages into dist/
npm run preview    # serve the production build
```

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: `npm ci`, `npm run build`,
and publish `dist/` to GitHub Pages.
