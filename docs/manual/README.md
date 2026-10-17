# Manual de usuario · Pulkro Cuadrillas

The user manual (Spanish, México) as a PDF, styled with the app's own design language, plus everything needed to rebuild it.

- `Pulkro_Cuadrillas_Manual_de_Usuario.pdf` — print quality (Letter, ~200 pages).
- `Pulkro_Cuadrillas_Manual_de_Usuario_ligero.pdf` — same content with screen-resolution screenshots, to send by e-mail or WhatsApp.

## Layout
- `chapters/NN-*.html` — one HTML fragment per chapter (`00-*` front matter, `99-*` back cover, `_*` not built).
  `chapters/_ejemplo.html` shows every component; `BRIEF.md` is the style guide (voice, markup, screenshots).
- `assets/manual.css` — print stylesheet (Paged.js) on the app's tokens; `assets/fonts.css` + `fonts/static/` — static
  instances of the app's fonts; `assets/bg-*.jpg` — the aurora backgrounds, pre-rendered (`tools/render-backgrounds.cjs`).
- `tools/capture-NN-*.cjs` — Playwright scripts that take each chapter's screenshots into `shots/` (not versioned).
- `tools/build.cjs` — assembles the chapters, builds the index, figure numbers, running headers and bookmarks, and prints the PDF.

## Rebuild
```bash
npm run build && npx next start -p 3100           # the app, demo build, from the repo root
# chapter 02 also shoots the e-mail sign-in: a second build with NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY set, on port 3200
for f in docs/manual/tools/capture-*.cjs; do node "$f"; done
node docs/manual/tools/build.cjs                  # print PDF
node docs/manual/tools/build.cjs --light          # light PDF
node docs/manual/tools/build.cjs --only 05,06     # draft of some chapters → docs/manual/build/
```
Needs the Playwright Chromium, Python 3 with Pillow and pypdf, and poppler (`pdftoppm`) to preview pages.
