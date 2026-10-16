// Chapter 08 · La jornada en campo. Walks one whole jornada on the phone (entrada → ANTES → bitácora → cuadrilla →
// incidencia → salida → DESPUÉS → desglose → cierre), plus the GPS edge cases, a flagged gallery photo, a multi-day order,
// the desktop layout and the read-only "Modo consulta".
//
//   node tools/capture-08-jornada.cjs            (from docs/manual)
//   node tools/capture-08-jornada.cjs gps        (only one part: main | gps | flag | multi | desk | consulta)
//
// The page clock (Date only) is set to 08:40 of today (Monterrey) and moved forward between steps, so the jornada lasts a
// realistic morning-to-afternoon instead of a few minutes. The GPS is placed at the jornada's site.
// Photos are real captures through the app's camera / gallery inputs: the JPEGs are rendered from the app's own sample scenes
// (build/ch08-fotos/), so ANTES and DESPUÉS of an area line up in the comparison slider.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const { snap, settle, url } = require("./shoot.cjs");

/* ───────────── prelude (same as capture-07/09) ───────────── */

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
let bp = null;
// Spanish browser UI: native date and time pickers read 19/10/2026 and 08:00 like on the phones in the field.
const browser = () => (bp ??= chromium.launch({ args: ["--lang=es-MX"], env: { ...process.env, LANG: "es_MX.UTF-8", LANGUAGE: "es_MX:es" } }));
const TODAY = (() => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const at = (hm) => new Date(`${TODAY}T${hm}:00-06:00`);

/** In-page: shifts `Date` by an offset kept in localStorage, so the app lives at another hour of today. */
function clockShim(initialOffset) {
  const KEY = "__pk_clock_offset";
  const RealDate = Date;
  let off = initialOffset;
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) off = Number(v);
    else localStorage.setItem(KEY, String(off));
  } catch {}
  window.__pkShift = (ms) => {
    off += ms;
    try {
      localStorage.setItem(KEY, String(off));
    } catch {}
  };
  class ShiftedDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(RealDate.now() + off);
      else super(...a);
    }
    static now() {
      return RealDate.now() + off;
    }
  }
  ShiftedDate.parse = RealDate.parse;
  ShiftedDate.UTC = RealDate.UTC;
  window.Date = ShiftedDate;
}

/** Signed-in page whose clock reads `time` (Date) and with an optional GPS position. */
async function openAt({ role = "supervisor", device = "phone", time = at("08:40"), geo, gps = true } = {}) {
  const ctx = await (await browser()).newContext({
    ...DEVICES[device],
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "es-MX",
    timezoneId: "America/Monterrey",
    permissions: gps ? ["geolocation"] : [],
    geolocation: geo ?? { latitude: 25.6866, longitude: -100.3161, accuracy: 12 },
  });
  // Only Date is shifted (timers and animations keep the real clock); the offset survives reloads.
  await ctx.addInitScript(clockShim, time.getTime() - Date.now());
  // Sample-photo and sample-location shortcuts exist only in the demo session: real accounts never see them.
  await ctx.addInitScript(() => {
    const hide = () =>
      document.querySelectorAll("button").forEach((b) => {
        const t = b.getAttribute("title") || "";
        if (t.startsWith("Agregar una foto de ejemplo") || (b.textContent || "").includes("(demo)")) b.style.display = "none";
      });
    new MutationObserver(hide).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  await page.goto(url("/login"));
  await settle(page, 600);
  const labels = { supervisor: /^Supervisor/, administracion: /^Administración/, direccion: /^Dirección/ };
  await page.getByRole("radio", { name: labels[role] }).click();
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await page.waitForURL(url("/"));
  await settle(page, 1200);
  return { page, ctx, close: () => ctx.close() };
}

/** The persisted demo state (IndexedDB). */
function readState(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("pulkro-cuadrillas");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const g = req.result.transaction("state", "readonly").objectStore("state").get("pulkro-cuadrillas");
          g.onsuccess = () => {
            let v = g.result;
            if (typeof v === "string") v = JSON.parse(v);
            resolve(v.state ?? v);
          };
        };
      }),
  );
}

/** Jornadas of the order whose title contains `title`, sorted by day, with the order's site. */
async function findOrder(page, title) {
  const s = await readState(page);
  const order = s.orders.find((o) => o.title && o.title.includes(title));
  if (!order) throw new Error(`order not found: ${title}`);
  const site = s.sites.find((x) => x.id === order.siteId);
  const jornadas = s.jornadas.filter((j) => j.orderId === order.id).sort((a, b) => a.dayIndex - b.dayIndex);
  return { order, site, jornadas };
}

/** Waits until no toast is on screen (they auto-dismiss). */
async function noToasts(page, max = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if ((await page.locator("[data-sonner-toast]").count()) === 0) return;
    await page.waitForTimeout(300);
  }
}

/** Moves the page clock forward by "HH:MM:SS" (the app reads the new time on its next tick). */
async function ff(page, hhmmss) {
  const [h, m, sec] = hhmmss.split(":").map(Number);
  await page.evaluate((ms) => window.__pkShift(ms), ((h * 60 + m) * 60 + sec) * 1000);
}

/** Waits until every flow / dialog has finished closing. */
async function noDialogs(page, max = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if ((await page.locator("[role=dialog], [role=alertdialog]").count()) === 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("a dialog did not close");
}

/** Reloads the current screen so every time-based label is fresh after a jump of the clock. */
async function refresh(page) {
  await page.reload();
  await settle(page, 1500);
}

/** Scrolls the page (window or the app's scroller) so `selector` sits `offset` px below the top. */
async function scrollTo(page, selector, offset = 0) {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const sc = document.getElementById("main-scroll");
      const r = el.getBoundingClientRect();
      if (sc && sc.scrollHeight > sc.clientHeight) sc.scrollBy(0, r.top - off - sc.getBoundingClientRect().top);
      else window.scrollBy(0, r.top - off);
    },
    [selector, offset],
  );
  await page.waitForTimeout(700);
}

/** Element crop on the phone: the fixed tab bar is hidden meanwhile so it does not cover the element. */
async function crop(page, name, el, opts = {}) {
  const tag = await page.addStyleTag({ content: 'nav[aria-label="Navegación principal"]{display:none!important}' });
  await page.waitForTimeout(200);
  await snap(page, name, { el, ...opts });
  await tag.evaluate((n) => n.remove());
}

/* ───────────── sample photos (rendered from the app's scenes) ───────────── */

const PHOTOS = path.join(__dirname, "..", "build", "ch08-fotos");
const AREAS = [
  { area: "Comedor de personal", file: "comedor", order: "nave de envasado", from: "cocina" },
  { area: "Oficinas piso 3", file: "oficinas", from: "oficina" },
  { area: "Baños planta baja", file: "banos", from: "bano" },
];

/** A copy of `file` dated a few seconds before the page's clock: the app treats it as a fresh camera shot. */
async function fresh(page, file) {
  const now = await page.evaluate(() => Date.now());
  const dir = path.join(PHOTOS, "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(file));
  fs.copyFileSync(file, dst);
  const t = new Date(now - 4000);
  fs.utimesSync(dst, t, t);
  return dst;
}

/** Renders ANTES (dirty) and DESPUÉS (clean) JPEGs of a kitchen, an office and a restroom from the app's sample scenes. */
async function makePhotos() {
  if (AREAS.every((a) => fs.existsSync(path.join(PHOTOS, `${a.file}-antes.jpg`)) && fs.existsSync(path.join(PHOTOS, `${a.file}-despues.jpg`)))) return;
  fs.mkdirSync(PHOTOS, { recursive: true });
  const { page, close } = await openAt({ role: "direccion", device: "desktop" });
  const s = await readState(page);
  // one ANTES scene photo of each kind, from any jornada
  const pick = (scene) => s.photos.find((p) => p.kind === "antes" && p.jornadaId && p.source && p.source.scene === scene);
  for (const a of AREAS) {
    const p = pick(a.from);
    await page.goto(url(`/jornada/${p.jornadaId}`));
    await settle(page, 2500);
    const svg = await page.evaluate((id) => {
      const thumbs = Array.from(document.querySelectorAll('#fotos-antes svg[role="img"]'));
      // the thumb whose area matches the picked photo
      const host = thumbs.find((t) => (t.closest("button") || t.parentElement).textContent.includes(id));
      return (host || thumbs[0]).outerHTML;
    }, p.area);
    for (const kind of ["antes", "despues"]) {
      const html = `<!doctype html><html><body style="margin:0;background:#000">${svg}</body></html>`;
      const shot = await (await browser()).newPage({ viewport: { width: 1280, height: 960 } });
      await shot.setContent(html);
      await shot.evaluate((clean) => {
        const el = document.querySelector("svg");
        el.setAttribute("width", "1280");
        el.setAttribute("height", "960");
        el.removeAttribute("class");
        if (clean) {
          // DESPUÉS: the same scene without the grime layer and the dull filter
          const groups = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "g");
          groups[0].removeAttribute("filter");
          groups[1].remove();
        }
      }, kind === "despues");
      await shot.screenshot({ path: path.join(PHOTOS, `${a.file}-${kind}.jpg`), type: "jpeg", quality: 88 });
      await shot.close();
    }
  }
  await close();
}

/* ───────────── part: main walkthrough (phone) ───────────── */

async function main() {
  const { page, ctx, close } = await openAt({ device: "phone" });
  const { site, jornadas } = await findOrder(page, "comedor y oficinas");
  const j = jornadas[0];
  const jUrl = url(`/jornada/${j.id}`);
  // GPS a few meters from the site
  await ctx.setGeolocation({ latitude: site.lat + 0.00009, longitude: site.lng - 0.00006, accuracy: 9 });
  const rail = "nav[aria-label='Avance de la jornada']";

  await ff(page, "01:35:00"); // 10:15
  await page.goto(url("/"));
  await settle(page, 1500);
  await snap(page, "08-hoy-telefono");

  await page.goto(jUrl);
  await settle(page, 1800);
  await snap(page, "08-pendiente");
  await scrollTo(page, rail, 12);
  await snap(page, "08-pendiente-hero");

  // ── ENTRADA ──
  await ff(page, "00:08:00"); // 10:23
  await page.getByRole("button", { name: /Registrar entrada/ }).click();
  await page.waitForTimeout(700);
  await snap(page, "08-gps-buscando");
  await page.getByRole("button", { name: "Confirmar entrada" }).waitFor();
  await settle(page, 900);
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(400);
  await snap(page, "08-gps-verificada");
  await page.getByRole("button", { name: "Confirmar entrada" }).click();
  await settle(page, 1800);
  await noToasts(page);
  await snap(page, "08-entrada-registrada");

  // ── ANTES ──
  await page.getByRole("dialog").getByRole("button", { name: /Tomar fotos ANTES/ }).click();
  await settle(page, 1500);
  const dlg = page.getByRole("dialog").last();
  await dlg.getByLabel("Área").fill("Comedor de personal");
  await noToasts(page);
  await snap(page, "08-antes-composer");
  for (const a of AREAS) {
    await ff(page, "00:02:30");
    await dlg.getByLabel("Área").fill(a.area);
    await dlg.locator('input[type="file"][capture]').setInputFiles(await fresh(page, path.join(PHOTOS, `${a.file}-antes.jpg`)));
    await page.waitForTimeout(1500);
  }
  await noToasts(page);
  await settle(page, 600);
  await snap(page, "08-antes-tomadas");
  await dlg.getByRole("button", { name: /Listo/ }).click();
  await noDialogs(page);

  // ── en curso ──
  await ff(page, "00:55:00"); // ~11:25
  await refresh(page);
  await scrollTo(page, rail, 12);
  await snap(page, "08-en-curso");

  // ── nota de bitácora ──
  await page.getByRole("button", { name: /^Nota/ }).click();
  await settle(page, 1000);
  await page.getByRole("dialog").getByRole("button", { name: "Revisión de áreas con el contacto en sitio" }).click();
  await page.waitForTimeout(300);
  await snap(page, "08-nota");
  await page.getByRole("button", { name: /Agregar a la bitácora/ }).click();
  await noDialogs(page);
  await noToasts(page);

  // ── cambio de cuadrilla ──
  await ff(page, "00:40:00"); // ~12:05
  await page.locator("#jornada-hero").getByRole("button", { name: "Cambiar", exact: true }).click();
  await settle(page, 1000);
  const crew = page.getByRole("dialog").last();
  // add the first person not yet in the crew
  const options = crew.locator("ul li button");
  const n = await options.count();
  for (let i = 0; i < n; i++) {
    const cls = (await options.nth(i).getAttribute("class")) || "";
    if (!cls.includes("bg-blue-wash")) {
      await options.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(500);
  await crew.evaluate((d) => d.querySelector("[class*='overflow-y-auto']")?.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await snap(page, "08-cuadrilla");
  await crew.getByRole("button", { name: "Refuerzo por carga de trabajo" }).click();
  await page.waitForTimeout(500);
  await snap(page, "08-cuadrilla-motivo");
  await crew.getByRole("button", { name: "Guardar cuadrilla" }).click();
  await noDialogs(page);
  await noToasts(page);

  // ── incidencia ──
  await ff(page, "01:10:00"); // ~13:15
  await page.getByRole("button", { name: /^Incidencia/ }).click();
  await settle(page, 1200);
  const inc = page.getByRole("dialog").last();
  await inc.getByRole("button", { name: /Faltante de material/ }).click();
  await page.waitForTimeout(400);
  await snap(page, "08-incidencia-tipo");
  await inc.getByRole("button", { name: /Continuar/ }).click();
  await settle(page, 800);
  await inc.getByRole("textbox").first().fill("No llegó el desengrasante para la cocina del comedor; se pidió reposición a almacén.");
  await page.waitForTimeout(300);
  await inc.getByRole("button", { name: /Registrar incidencia/ }).click();
  await settle(page, 1500);
  await noToasts(page);
  await snap(page, "08-incidencia-registrada");
  await page.keyboard.press("Escape");
  await noDialogs(page);
  await noToasts(page);

  // resolve it inline
  await ff(page, "00:50:00"); // ~14:05
  await refresh(page);
  const incSection = page.locator("#incidencias");
  await incSection.scrollIntoViewIfNeeded();
  await incSection.getByRole("button", { name: "Resolver" }).click();
  await settle(page, 600);
  await incSection.getByRole("textbox").fill("Almacén entregó el desengrasante a las 13:50; se completó la cocina.");
  await page.waitForTimeout(300);
  await crop(page, "08-incidencia-resolver", incSection);
  await incSection.getByRole("button", { name: /Marcar resuelta/ }).click();
  await settle(page, 800);
  await noToasts(page);

  // ── SALIDA ──
  await ff(page, "04:20:00"); // ~18:25
  await refresh(page);
  await scrollTo(page, rail, 12);
  await page.getByRole("button", { name: /Registrar salida/ }).click();
  await page.getByRole("button", { name: "Confirmar salida" }).waitFor({ timeout: 15000 });
  await settle(page, 900);
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(300);
  await snap(page, "08-salida-revision");
  await page.getByRole("button", { name: "Confirmar salida" }).click();
  await settle(page, 1800);
  await noToasts(page);
  await snap(page, "08-salida-registrada");

  // ── DESPUÉS ──
  await page.getByRole("dialog").getByRole("button", { name: /Tomar fotos DESPUÉS/ }).click();
  await settle(page, 1500);
  const dd = page.getByRole("dialog").last();
  await noToasts(page);
  await snap(page, "08-despues-composer");
  for (const a of AREAS) {
    await ff(page, "00:01:40");
    await dd.getByLabel("Área").fill(a.area);
    await dd.locator('input[type="file"][capture]').setInputFiles(await fresh(page, path.join(PHOTOS, `${a.file}-despues.jpg`)));
    await page.waitForTimeout(1500);
  }
  await noToasts(page);
  await dd.getByRole("button", { name: /Listo/ }).click();
  await noDialogs(page);

  // ── desglose de horas ──
  await page.locator("#jornada-hero").getByRole("button", { name: /Desglose de horas/ }).click();
  await settle(page, 1200);
  await snap(page, "08-desglose");
  await page.getByRole("button", { name: "Guardar desglose" }).click();
  await settle(page, 1500);
  await noToasts(page);
  await snap(page, "08-desglose-guardado");
  await page.getByRole("button", { name: "Volver a la jornada" }).click();
  await noDialogs(page);
  await noToasts(page);

  // ── closed jornada ──
  await refresh(page);
  await scrollTo(page, rail, 12);
  await snap(page, "08-cerrada");
  await scrollTo(page, "#jornada-hero", -40);
  await page.evaluate(() => {
    const hero = document.getElementById("jornada-hero");
    window.scrollBy(0, hero.getBoundingClientRect().bottom - 40);
  });
  await page.waitForTimeout(800);
  await snap(page, "08-listo-cierre");

  // comparison + bitácora
  const ba = page.getByRole("slider", { name: "Comparar antes y después" }).locator("xpath=ancestor::section[1]");
  await ba.scrollIntoViewIfNeeded();
  await settle(page, 3000);
  await crop(page, "08-antes-despues", ba);
  await crop(page, "08-bitacora", page.locator("#bitacora"));


  await close();
}

/* ───────────── part: GPS edge cases (phone) ───────────── */

async function gps() {
  // far from the site: justification required
  {
    const { page, close } = await openAt({ device: "phone" });
    const { jornadas } = await findOrder(page, "comedor y oficinas");
    await ff(page, "01:40:00"); // 10:20
    await page.goto(url(`/jornada/${jornadas[0].id}`));
    await settle(page, 1500);
    await page.getByRole("button", { name: /Registrar entrada/ }).click();
    await page.getByRole("button", { name: "Confirmar entrada" }).waitFor();
    await settle(page, 900);
    await page.getByRole("dialog").evaluate((d) => d.querySelector("[class*='overflow-y-auto']")?.scrollTo(0, 260));
    await page.waitForTimeout(400);
    await snap(page, "08-gps-lejos");
    // supervisión remota
    await page.getByRole("button", { name: /Supervisión remota/ }).click();
    await settle(page, 600);
    await page.getByRole("dialog").locator("#gps-note").fill("Superviso otra obra; el líder de cuadrilla confirmó la llegada por videollamada.");
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(400);
    await page.getByRole("dialog").evaluate((d) => d.querySelector("[class*='overflow-y-auto']")?.scrollTo(0, 440));
    await page.waitForTimeout(400);
    await snap(page, "08-gps-remota");
    await close();
  }
  // location permission denied
  {
    const { page, close } = await openAt({ device: "phone", gps: false });
    const { jornadas } = await findOrder(page, "comedor y oficinas");
    await ff(page, "01:40:00"); // 10:20
    await page.goto(url(`/jornada/${jornadas[0].id}`));
    await settle(page, 1500);
    await page.getByRole("button", { name: /Registrar entrada/ }).click();
    await page.getByRole("button", { name: "Confirmar entrada" }).waitFor({ timeout: 15000 });
    await settle(page, 900);
    await page.getByRole("dialog").evaluate((d) => d.querySelector("[class*='overflow-y-auto']")?.scrollTo(0, 300));
    await page.waitForTimeout(400);
    await snap(page, "08-gps-sin-permiso");
    await close();
  }
}

/* ───────────── part: a gallery photo taken before the entrada (phone) ───────────── */

async function flag() {
  const { page, ctx, close } = await openAt({ device: "phone" });
  const { site, jornadas } = await findOrder(page, "comedor y oficinas");
  await ctx.setGeolocation({ latitude: site.lat + 0.00009, longitude: site.lng - 0.00006, accuracy: 9 });
  await ff(page, "01:40:00"); // 10:20
  await page.goto(url(`/jornada/${jornadas[0].id}`));
  await settle(page, 1500);
  await page.getByRole("button", { name: /Registrar entrada/ }).click();
  await page.getByRole("button", { name: "Confirmar entrada" }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar entrada" }).click();
  await settle(page, 1500);
  await page.getByRole("button", { name: "Volver a la jornada" }).click();
  await settle(page, 1200);
  await noToasts(page);
  await ff(page, "00:30:00");
  // a DESPUÉS picked from the gallery whose file is from 09:10, before the entrada
  const old = path.join(PHOTOS, "galeria-0910.jpg");
  fs.copyFileSync(path.join(PHOTOS, "oficinas-despues.jpg"), old);
  const t = at("09:10");
  fs.utimesSync(old, t, t);
  const sec = page.locator("#fotos-despues");
  await sec.scrollIntoViewIfNeeded();
  await sec.getByLabel("Área").fill("Oficinas piso 3");
  await sec.locator('input[type="file"]:not([capture])').setInputFiles(old);
  await page.waitForTimeout(1800);
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await snap(page, "08-foto-marcada");
  await close();
}

/* ───────────── part: multi-day order, salida of day 2 (phone) ───────────── */

async function multi() {
  const { page, ctx, close } = await openAt({ device: "phone", time: at("08:40") });
  const { site, jornadas } = await findOrder(page, "nave de envasado");
  await ctx.setGeolocation({ latitude: site.lat - 0.00007, longitude: site.lng + 0.00005, accuracy: 11 });
  const live = jornadas.find((x) => x.status === "en_curso");
  await ff(page, "06:30:00"); // ~15:10
  await page.goto(url(`/jornada/${live.id}`));
  await settle(page, 1500);
  await page.getByRole("button", { name: /Registrar salida/ }).click();
  await page.getByRole("button", { name: "Confirmar salida" }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar salida" }).click();
  await settle(page, 1500);
  await page.getByRole("button", { name: "Volver a la jornada" }).click();
  await settle(page, 1200);
  await noToasts(page);
  await page.evaluate(() => {
    const hero = document.getElementById("jornada-hero");
    window.scrollBy(0, hero.getBoundingClientRect().bottom - 300);
  });
  await page.waitForTimeout(800);
  await snap(page, "08-siguiente-jornada");
  await close();
}

/* ───────────── part: desktop layout ───────────── */

async function desk() {
  const { page, ctx, close } = await openAt({ device: "desktop" });
  const { site, jornadas } = await findOrder(page, "comedor y oficinas");
  await ctx.setGeolocation({ latitude: site.lat + 0.00009, longitude: site.lng - 0.00006, accuracy: 9 });
  await ff(page, "01:40:00"); // 10:20
  await page.goto(url(`/jornada/${jornadas[0].id}`));
  await settle(page, 1500);
  await page.getByRole("button", { name: /Registrar entrada/ }).click();
  await page.getByRole("button", { name: "Confirmar entrada" }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar entrada" }).click();
  await settle(page, 1500);
  await page.getByRole("button", { name: "Volver a la jornada" }).click();
  await settle(page, 1200);
  const sec = page.locator("#fotos-antes");
  for (const a of AREAS) {
    await ff(page, "00:02:00");
    await sec.getByLabel("Área").fill(a.area);
    await sec.locator('input[type="file"][capture]').setInputFiles(await fresh(page, path.join(PHOTOS, `${a.file}-antes.jpg`)));
    await page.waitForTimeout(1500);
  }
  await noToasts(page);
  // the photo viewer with the data kept with each photo
  await sec.locator("ul button").first().click();
  await settle(page, 1500);
  await snap(page, "08-foto-detalle", { el: page.getByRole("dialog") });
  await page.keyboard.press("Escape");
  await noDialogs(page);
  await ff(page, "01:10:00");
  await refresh(page);
  await snap(page, "08-escritorio");
  await close();
}

/* ───────────── part: Modo consulta (Dirección) ───────────── */

async function consulta() {
  const { page, close } = await openAt({ role: "direccion", device: "desktop" });
  const { jornadas } = await findOrder(page, "nave de envasado");
  await ff(page, "02:50:00"); // 11:30
  const live = jornadas.find((x) => x.status === "en_curso");
  await page.goto(url(`/jornada/${live.id}`));
  await settle(page, 2000);
  await snap(page, "08-consulta");
  await close();
}

(async () => {
  const only = process.argv[2];
  await makePhotos();
  const parts = { main, gps, flag, multi, desk, consulta };
  for (const [name, fn] of Object.entries(parts)) if (!only || only === name) await fn();
  if (bp) await (await bp).close();
})().catch(async (e) => {
  console.error(e);
  if (bp) await (await bp).close();
  process.exit(1);
});
