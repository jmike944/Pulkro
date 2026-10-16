// Chapter 09 · Mapa. The day's services of the supervisor at 11:00 (one in progress with an open incident, one finished,
// one late without entrada): desktop page, the service sheet, the "Con incidencia" filter, the phone layout and the
// supervisor filter that Dirección gets.
//
//   node tools/capture-09-mapa.cjs              (from docs/manual)
//
// The basemap tiles come from tiles.openfreemap.org: where they cannot load, the app shows «Mapa sin conexión» over the map
// (that is what these captures show when the host is unreachable).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const { snap, settle, url } = require("./shoot.cjs");

/* ───────────── prelude (same as capture-07/08) ───────────── */

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

/** Registers an open incident on the jornada in progress of the "nave de envasado" order (desktop dialog). */
async function addIncident(page) {
  const { jornadas } = await findOrder(page, "nave de envasado");
  const live = jornadas.find((x) => x.status === "en_curso");
  await page.goto(url(`/jornada/${live.id}`));
  await settle(page, 1500);
  await page.getByRole("button", { name: /^Incidencia/ }).click();
  await settle(page, 1000);
  const dlg = page.getByRole("dialog").last();
  await dlg.getByRole("button", { name: /Daños/ }).click();
  // the phone flow asks type and severity first, then the description
  const next = dlg.getByRole("button", { name: "Continuar" });
  if (await next.count()) {
    await next.click();
    await settle(page, 800);
  }
  await dlg.getByRole("textbox").first().fill("Se desprendió una lámina del techo en el andén 2; se acordonó el área.");
  await page.waitForTimeout(300);
  await dlg.getByRole("button", { name: "Registrar incidencia" }).click();
  await settle(page, 1200);
  await page.keyboard.press("Escape");
  await noDialogs(page);
}

async function desk() {
  const { page, close } = await openAt({ device: "desktop" });
  await ff(page, "02:20:00"); // 11:00
  await addIncident(page);
  await page.goto(url("/mapa"));
  await settle(page, 3500);
  await snap(page, "09-mapa");

  // the sheets (a taller window shows them whole)
  await page.setViewportSize({ width: 1440, height: 1100 });
  await settle(page, 800);
  // the sheet of the late service
  await page.locator('section[aria-label="Servicios del día"]').getByRole("button", { name: /Terza/ }).filter({ visible: true }).first().click();
  await settle(page, 1500);
  await snap(page, "09-hoja-sin-entrada", { el: page.getByRole("dialog"), padding: 0 });
  await page.keyboard.press("Escape");
  await noDialogs(page);
  // the sheet of the service in progress, with its incident
  await page.locator('section[aria-label="Servicios del día"]').getByRole("button", { name: /Bonafont/ }).filter({ visible: true }).first().click();
  await settle(page, 1500);
  await snap(page, "09-hoja", { el: page.getByRole("dialog"), padding: 0 });
  await page.keyboard.press("Escape");
  await noDialogs(page);

  await close();
}

async function phone() {
  const { page, close } = await openAt({ device: "phone" });
  await ff(page, "02:20:00"); // 11:00
  await addIncident(page);
  await page.goto(url("/mapa"));
  await settle(page, 3500);
  await snap(page, "09-tel-mapa");
  await page.locator('section[aria-label="Servicios del día"]').getByRole("button", { name: /Bonafont/ }).filter({ visible: true }).first().click();
  await settle(page, 1500);
  await snap(page, "09-tel-hoja");
  await close();
}

async function direccion() {
  const { page, close } = await openAt({ role: "direccion", device: "desktop" });
  await ff(page, "02:20:00"); // 11:00
  await page.goto(url("/mapa"));
  await settle(page, 3500);
  const trigger = await page.getByRole("combobox", { name: "Supervisor" }).boundingBox();
  await page.getByRole("combobox", { name: "Supervisor" }).click();
  await settle(page, 800);
  const menu = await page.getByRole("listbox").boundingBox();
  const x = Math.min(trigger.x, menu.x) - 16;
  await snap(page, "09-supervisor", { clip: { x, y: trigger.y - 16, width: Math.max(trigger.x + trigger.width, menu.x + menu.width) - x + 16, height: menu.y + menu.height - trigger.y + 32 } });
  await close();
}

(async () => {
  const only = process.argv[2];
  const parts = { desk, phone, direccion };
  for (const [name, fn] of Object.entries(parts)) if (!only || only === name) await fn();
  if (bp) await (await bp).close();
})().catch(async (e) => {
  console.error(e);
  if (bp) await (await bp).close();
  process.exit(1);
});
