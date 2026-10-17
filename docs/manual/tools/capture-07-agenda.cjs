// Chapter 07 · Agenda y asignación (supervisor). Week / day / list views, workload strip and double bookings, the
// "Por asignar" panel, scheduling an order (dates → crew → confirmation), the jornada sheet,
// changing the crew of one or all pending jornadas and rescheduling one jornada.
//
//   node tools/capture-07-agenda.cjs            (from docs/manual)
//   node tools/capture-07-agenda.cjs phone      (only one part: desk | phone)
//
// The page clock (Date only) reads 08:40 of today (Monterrey), the same morning as chapter 08.
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


/** Center of an element as % of the viewport, for the numbered markers over a full screenshot. */
async function mark(page, label, locator, dx = 0, dy = 0) {
  const b = await locator.boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(label, "not visible");
  const l = (((b.x + dx) / vp.width) * 100).toFixed(1);
  const t = (((b.y + dy) / vp.height) * 100).toFixed(1);
  console.log(`${label}: left:${l}%;top:${t}%`);
}

/* ───────────── desktop ───────────── */

async function desk() {
  const { page, close } = await openAt({ device: "desktop" });
  const { order } = await findOrder(page, "Desengrase de cocina del restaurante");
  await page.goto(url("/agenda"));
  await settle(page, 2500);
  await snap(page, "07-semana");
  // markers (positions printed for the chapter)
  await mark(page, "1 Hoy / flechas", page.getByRole("button", { name: "Hoy", exact: true }), -14, 20);
  await mark(page, "2 Semana Día Lista", page.getByRole("button", { name: "Semana", exact: true }), -12, 20);
  await mark(page, "3 Carga de personal", page.getByText("Carga de personal", { exact: true }), -14, 8);
  await mark(page, "4 Doble asignación", page.locator("button[aria-expanded]", { hasText: "con doble asignación" }), 6, 10);
  await mark(page, "5 Jornada en curso", page.locator("button[aria-label*='En curso']").first(), -6, 10);
  await mark(page, "6 Por asignar", page.getByRole("heading", { name: "Por asignar" }), -16, 12);

  // workload strip + the double-booking note, expanded
  await page.locator("button[aria-expanded]", { hasText: "con doble asignación" }).click();
  await settle(page, 900);
  const strip = page.getByText("Carga de personal", { exact: true });
  const note = page.locator("button[aria-expanded]", { hasText: "con doble asignación" }).locator("xpath=..");
  const row4 = note.locator("li").nth(3);
  await row4.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const a = await strip.boundingBox();
  const b = await note.boundingBox();
  const r = await row4.boundingBox();
  await snap(page, "07-carga", { clip: { x: a.x - 16, y: a.y - 14, width: b.x + b.width - a.x + 32, height: r.y + r.height - a.y + 14 } });
  await page.locator("button[aria-expanded]", { hasText: "con doble asignación" }).click();
  await settle(page, 600);

  // Día
  await page.getByRole("button", { name: "Día", exact: true }).click();
  await settle(page, 1500);
  await scrollTo(page, "h3", 20);
  // the day card, from its title to early afternoon
  const card = await page.locator("h3").first().locator("xpath=ancestor::div[contains(@class,'rounded-[22px]')][1]").boundingBox();
  await snap(page, "07-dia", { clip: { x: card.x - 12, y: card.y - 12, width: card.width + 24, height: Math.min(620, 900 - card.y) } });
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await settle(page, 1200);
  await page.evaluate(() => document.getElementById("main-scroll")?.scrollTo(0, 0));

  // ── Programar ── (a taller window: the dialogs fit without scrolling)
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.waitForTimeout(500);
  await page.locator('aside[aria-label="Órdenes por asignar"]').getByRole("button", { name: "Programar" }).click();
  await settle(page, 1200);
  const dlg = page.getByRole("dialog");
  const d1 = await dlg.getByLabel("Fecha").first().inputValue();
  await dlg.getByLabel("Inicio").first().fill("08:00");
  await dlg.getByLabel("Término").first().fill("15:00");
  await dlg.getByRole("button", { name: "Agregar otro día" }).click();
  await page.waitForTimeout(600);
  const d2 = await dlg.getByLabel("Fecha").nth(1).inputValue();
  await dlg.getByLabel("Fecha").nth(1).fill(d1);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(500);
  await snap(page, "07-programar-fechas", { el: dlg, padding: 0 });
  await dlg.getByLabel("Fecha").nth(1).fill(d2);
  await page.waitForTimeout(400);
  await dlg.getByRole("button", { name: /Continuar/ }).click();
  await settle(page, 900);
  // crew: three people, the first ones of the list (people already booked those days are listed last, flagged)
  const people = dlg.locator("ul li button");
  for (const i of [0, 1, 2]) await people.nth(i).click();
  await page.waitForTimeout(300);
  // one more who already works those days, to show the warning
  const busy = dlg.locator("ul li button", { hasText: "Otra cuadrilla" }).first();
  if (await busy.count()) await busy.click();
  await page.waitForTimeout(500);
  await dlg.getByRole("button", { name: /Continuar/ }).click();
  await settle(page, 900);
  await dlg.getByRole("checkbox").check();
  await page.waitForTimeout(500);
  await snap(page, "07-programar-confirmar", { el: dlg, padding: 0 });
  await dlg.getByRole("button", { name: "Programar", exact: true }).click();
  await settle(page, 2500);
  await noToasts(page);

  // ── the jornada sheet of the new order (J1) ──
  const block = page.locator(`[data-order-id="${order.id}"]`).filter({ visible: true }).first();
  await block.click();
  await settle(page, 1200);
  const sheet = page.getByRole("dialog");

  // Cambiar cuadrilla, applied to every pending jornada
  await sheet.getByRole("button", { name: /Cambiar cuadrilla/ }).click();
  await settle(page, 1000);
  const crew = page.getByRole("dialog").last();
  await crew.getByRole("switch").click();
  await page.waitForTimeout(300);
  // one person leaves, one joins
  const leaving = await crew.locator("ul li button[class*='bg-blue-wash']").last().elementHandle();
  const joining = await crew.locator("ul li button:not([class*='bg-blue-wash'])").first().elementHandle();
  await joining.click();
  await page.waitForTimeout(300);
  await leaving.click();
  await crew.getByRole("button", { name: "Cambio de turno" }).click();
  await page.waitForTimeout(500);
  await snap(page, "07-cambiar-cuadrilla", { el: crew, padding: 0 });
  await crew.getByRole("button", { name: "Guardar cuadrilla" }).click();
  await settle(page, 1500);
  await noToasts(page);

  // Reprogramar the second jornada one day later
  await sheet.getByRole("tab").nth(1).click();
  await settle(page, 1000);
  await page.getByRole("dialog").getByRole("button", { name: /Reprogramar/ }).click();
  await settle(page, 1000);
  const mv = page.getByRole("dialog").last();
  const cur = await mv.getByLabel("Fecha", { exact: true }).inputValue();
  const next = new Date(`${cur}T12:00:00`);
  next.setDate(next.getDate() + 1);
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  await mv.getByLabel("Fecha", { exact: true }).fill(next.toISOString().slice(0, 10));
  await mv.getByRole("button", { name: "Solicitud del cliente" }).click();
  await mv.getByRole("checkbox").check();
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(500);
  await snap(page, "07-reprogramar", { el: mv, padding: 0 });
  await mv.getByRole("button", { name: "Reprogramar", exact: true }).click();
  await settle(page, 1500);
  await noToasts(page);

  // a multi-day order already under way: J1 closed, J2 in progress, J3 pending
  await page.keyboard.press("Escape");
  await settle(page, 800);
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await settle(page, 1500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page, 600);
  await page.locator("button[aria-label*='En curso']").filter({ visible: true }).first().click();
  await settle(page, 1200);
  await snap(page, "07-hoja-en-curso", { el: page.getByRole("dialog"), padding: 0 });
  await close();
}

/* ───────────── phone ───────────── */

async function phone() {
  const { page, close } = await openAt({ device: "phone" });
  await page.goto(url("/agenda"));
  await settle(page, 2000);
  await scrollTo(page, "section[aria-label]", 70);
  await snap(page, "07-tel-lista");
  await close();
}

(async () => {
  const only = process.argv[2];
  const parts = { desk, phone };
  for (const [name, fn] of Object.entries(parts)) if (!only || only === name) await fn();
  if (bp) await (await bp).close();
})().catch(async (e) => {
  console.error(e);
  if (bp) await (await bp).close();
  process.exit(1);
});
