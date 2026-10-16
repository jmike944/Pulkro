# Manual de usuario · brief for chapter authors

You write chapters of the **user manual of Pulkro Cuadrillas** (a Next.js PWA in this repo, `/home/user/Pulkro`). The manual is a
PDF assembled from HTML fragments with Paged.js and styled with the app's own design language. Read this whole brief first.

## Audience and voice
- Readers: Pulkro staff — **Supervisores** (field, phone), **Administración** (orders, post-sale, desktop or phone) and **Dirección**
  (control, indicators). Non-technical. They know cleaning work, not software.
- Language: **Spanish (México)**, *usted*, never *tú* (`Pulse`, `Elija`, `Escriba`, `su unidad`; never `Pulsa`, `tu`). Short, concrete,
  present tense. Sentence case. Same voice as the app (see `docs/CONVENTIONS.md` → Copy/Voice).
- Name UI elements **exactly** as the app shows them (button, tab, menu labels, field names, status names). Copy them from the code
  or the screenshot, never translate or paraphrase. Wrap them in `<span class="ui">…</span>` (navy filled primary buttons:
  `<span class="ui primary">…</span>`). Keys: `<span class="kbd">⌘K</span>`.
- Describe what the app **does now**, verified in code and in the running app. No internal references (`doc §2`, `PROPUESTO`,
  `PENDIENTE`, file names, component names, "demo seed"), no developer talk, no promises of future features. Where the app itself
  says something is pending/por definir, you may say "por definir" plainly.
- Explain *why* where it helps the reader (business rules: ANTES/DESPUÉS photos required to close, envío manual sin confirmación de
  entrega, offline with pending marks, nueva versión after reopening, roles see only their scope).
- Never say "demo"/"datos de demostración" except where a screen really is about the demo (login picker, "Restablecer datos demo").
  The screenshots use demo data: do not comment on it.
- Cross-reference other chapters by name, not number: «consulte el capítulo *Cierre y validación*». Chapter names are in the plan below.

## Plan (chapter file → owner)
| File prefix | Chapter (opener `<h1>`) | Group label (`.num`) |
|---|---|---|
| 01 | Conozca Pulkro Cuadrillas | Introducción |
| 02 | Entrar a la app | Primeros pasos |
| 03 | La pantalla y la navegación | Primeros pasos |
| 04 | Inicio y Pendientes | Primeros pasos |
| 05 | Órdenes | Operación |
| 06 | Nueva orden | Operación |
| 07 | Agenda y asignación | Operación |
| 08 | La jornada en campo | Operación |
| 09 | Mapa | Operación |
| 10 | Evidencias | Operación |
| 11 | Incidencias | Operación |
| 12 | Cierre y validación | Seguimiento |
| 13 | Reportes y envío al cliente | Seguimiento |
| 14 | Postventa | Seguimiento |
| 15 | Encuesta de satisfacción (lo que ve el cliente) | Seguimiento |
| 16 | Clientes | Seguimiento |
| 17 | Bitácora | Seguimiento |
| 18 | Indicadores | Gestión |
| 19 | Equipo | Gestión |
| 20 | Configuración | Sistema |
| 21 | Trabajo sin conexión y sincronización | Sistema |
| 22 | Centro de ayuda y preguntas frecuentes | Sistema |
| 23 | Apéndice: roles, permisos y estados | Referencia |

Only create/edit **your** files: `chapters/<NN>-<slug>.html`, `tools/capture-<NN>-<slug>.cjs`, `shots/<NN>-*.jpg` for your
prefixes. Never edit `assets/`, `tools/build.cjs`, `tools/shoot.cjs`, other chapters or anything in the app (`src/`). Do not commit.

## Where things are
- Manual root: `/home/user/Pulkro/docs/manual` (`assets/manual.css` = all the styles you may use; `chapters/_ejemplo.html` =
  markup sample of every component).
- App code: `src/features/<module>/` (one folder per screen), nav model `src/components/shell/nav.ts`, permissions
  `src/lib/permissions.ts`, statuses `src/lib/status.ts`, business rules `src/lib/domain.ts`, store actions `src/lib/store.ts`,
  in-app help `src/features/ayuda/help-content.ts`, requirements `docs/requisitos.md`, conventions `docs/CONVENTIONS.md`.
- The app runs (production build, demo data, no backend) at **http://localhost:3100**. Do not start, stop or rebuild servers.
  A second build with account sign-in enabled (e-mail/password form; no real backend behind it) runs at **http://localhost:3200**
  (only chapter 02 needs it: `PK_BASE=http://localhost:3200`).

## Screenshots
Write a capture script per chapter, `tools/capture-<NN>-<slug>.cjs`, using the helper:

```js
const { open, snap, settle, url, done } = require("./shoot.cjs");
(async () => {
  const { page, close } = await open({ role: "supervisor", device: "desktop" }); // role: supervisor | administracion | direccion | null
  await page.goto(url("/ordenes")); await settle(page);
  await snap(page, "05-ordenes-lista");                                   // viewport (1440×900 desktop, 390×844 phone)
  await page.getByRole("button", { name: "Filtros" }).click(); await settle(page, 500);
  await snap(page, "05-ordenes-filtros", { el: page.getByRole("dialog") }); // one element + 16px padding
  await close();
  // phone: open({ role, device: "phone" }) · dark theme: open({ ..., theme: "dark" })
  await done();
})();
```
Run it with `node tools/capture-<NN>-<slug>.cjs` from `docs/manual`. Each `open()` is a fresh browser profile with freshly seeded
data (dates relative to today), so you can create, check in, close, etc. freely — nothing is shared with other authors. The
helper sets reduced motion, Spanish locale, Monterrey timezone and a granted GPS position in Monterrey.

- **Look at every screenshot you keep** (Read the .jpg) and re-shoot if it shows a spinner, a toast covering content, a half-open
  sheet, an empty state you did not intend, a cut-off dialog or hover artifacts. Close toasts or wait them out before shooting.
- Prefer real, meaningful states (an order with jornadas, photos and incidents; a filled form) over empty screens.
- Desktop full-screen shots for overview screens; **element crops** (`{ el }`) for dialogs, sheets, menus, cards, forms — they read
  better on paper; **phone shots** wherever the task is done on the phone (all field work is), and at least once per chapter where
  the phone layout differs meaningfully. `snap(..., { scroller: true })` captures a whole desktop page that scrolls (tall image —
  only if it stays legible; otherwise shoot parts).
- Budget: about **5–12 figures per chapter** (more for big chapters like the jornada, fewer for small ones). Every figure must earn
  its place.
- Markers: for the 1–2 key overview screenshots of a chapter you may place numbered markers over the image and explain them in a
  legend. Compute their positions from element bounding boxes in your capture script (left/top in % of the viewport) and print them,
  then paste them as `<span class="mark" style="left:12.5%;top:20%">1</span>` inside `.frame`, followed by `<ol class="legend">`.
  Put markers next to (not on top of) the text they point at.

## Markup (see `chapters/_ejemplo.html` and `assets/manual.css`)
One file per chapter, starting with the opener:

```html
<section class="chapter" id="cap-ordenes">
  <header class="opener">
    <div class="num">Operación</div>                       <!-- the build prefixes "Capítulo N · " -->
    <h1>Órdenes</h1>                                        <!-- may use <em> for an italic accent word -->
    <p class="desc">One or two sentences with <b>bold</b> key ideas, like the app's PageHeader descriptions.</p>
    <div class="glass">
      <div><div class="eyebrow">En este capítulo</div><ul><li>…4–8 items matching your h2 sections…</li></ul></div>
      <div class="who"><div class="eyebrow">Disponible para</div><span class="roles"><span class="role sup">Supervisor</span><span class="role adm">Administración</span><span class="role dir">Dirección</span></span></div>
    </div>
  </header>
  <p class="lead">Intro paragraph.</p>
  <h2 class="section">Section title</h2>      <!-- appears in the table of contents; data-toc="shorter" to shorten -->
  …
</section>
```
Components: `h2.section`, `h3`, `h4` (small uppercase label), `p.lead`, `.access` strip (“Disponible para” + role chips; use when a
section's roles differ from the chapter's), role chips `.role.sup|.adm|.dir|.all` (+`.off` for no access), `ol.steps` (numbered
task steps; first `<b>` of each li is the step title), `.note.tip` (Consejo) `.note.warn` (Importante) `.note.rule` (Regla) `.note.danger`
(Atención) `.note.phone-tip` (En el teléfono) — each with `<b class="note-t">Label</b><p>…</p>`, status `.pill.<tone>` (tones as in
`src/lib/status.ts`: slate, blue, sky, amber, red, teal, violet, navy), `table` (with `<thead>`), `table.kv`, `table.matrix`, `.cards`
(+`.three`) of `.card`, `.duo` (phone/crop + text side by side; `.right` puts the image right; `.wide` for a wider crop),
`.phones` (2 phones) / `.phones.three`.

Figures (captions are auto-numbered “Figura N.M”; write `<b>Short title.</b> one sentence`):
```html
<figure class="shot"><div class="frame"><img src="shots/05-ordenes-lista.jpg" alt="…"></div><figcaption><b>Lista de órdenes.</b> …</figcaption></figure>
<figure class="shot crop w60"><div class="frame"><img src="shots/05-filtros.jpg" alt="…"></div><figcaption>…</figcaption></figure>   <!-- w40|w50|w60|w70|w80 -->
<figure class="shot phone"><div class="frame"><img src="shots/08-entrada.jpg" alt="…"></div><figcaption>…</figcaption></figure>
```
Layout tips: Letter page, ~6.9in text width. A desktop figure is ~4.6in tall (2 per page max) — put text before it, not a lone
heading. Phones are ~5in tall: put them in `.duo` with the explanation beside them or in `.phones` pairs. Crops of small dialogs
at w50–w60. Avoid ending a section with a lone figure followed by a page break with half a page empty: alternate text and figures.

## Check your work
1. `node tools/build.cjs --only 05,06` (your prefixes) → `build/draft-05,06.pdf`; it prints `OVERFLOW` lines for content clipped at a
   page bottom (fix those: shrink a crop, split a `.duo`) and `missing images` for bad paths.
2. Look at the pages: `pdftoppm -r 60 -png build/draft-05,06.pdf build/p-05` then Read a few PNGs (compose them into a contact sheet
   with Python PIL if useful). Check figure sizes, empty half-pages, broken layouts.
3. Re-read your Spanish for usted voice, exact UI labels and accuracy against the code.

## Report back
A short summary: chapters written (file, approx. pages, figure count), anything in the app that looked broken or that you could not
capture, and any fact you were unsure about.
