// Screenshot helper for the user manual. Drives the demo build (npm run build && npx next start -p 3100) with Playwright.
//
//   const { open, snap, settle } = require("./shoot.cjs");
//   const { page, close } = await open({ role: "supervisor", device: "desktop" });
//   await page.goto(url("/ordenes")); await settle(page);
//   await snap(page, "ordenes-lista");                     // viewport
//   await snap(page, "ordenes-filtros", { el: page.locator("…") });   // one element (+ padding)
//   await close();
//
// Every context is a fresh browser profile: the demo store re-seeds relative to "now", so agents never share state.
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.PK_BASE ?? "http://localhost:3100";
const SHOTS = path.join(__dirname, "..", "shots");

const DEVICES = {
  // 1440 × 900 at 1.5× → 2160 px wide: ~300 dpi at the manual's full text width.
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
  // iPhone-class phone at 2× → 780 px wide: crisp at the manual's phone-figure width.
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

let browserPromise = null;
// Native date and time inputs follow the browser's own language: render them as a phone set to Mexican Spanish would.
const browser = () =>
  (browserPromise ??= chromium.launch({ args: ["--lang=es-MX"], env: { ...process.env, LANG: "es_MX.UTF-8", LANGUAGE: "es_MX:es" } }));

const url = (p) => (p.startsWith("http") ? p : BASE + p);

/** Waits for fonts, network and the entrance animations to finish. */
async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Opens a signed-in page. role: "supervisor" | "administracion" | "direccion" | null (stay on /login).
 * theme: "light" | "dark" (the app follows prefers-color-scheme by default).
 */
async function open({ role = "supervisor", device = "desktop", theme = "light", start = "/" } = {}) {
  const b = await browser();
  const ctx = await b.newContext({
    ...DEVICES[device],
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: "es-MX",
    timezoneId: "America/Monterrey",
    permissions: ["geolocation"],
    // A point in Monterrey's metro area: GPS capture in the jornada screen works with it.
    geolocation: { latitude: 25.6866, longitude: -100.3161, accuracy: 12 },
  });
  const page = await ctx.newPage();
  await page.goto(url("/login"));
  await settle(page, 600);
  if (role) {
    const labels = { supervisor: /^Supervisor/, administracion: /^Administración/, direccion: /^Dirección/ };
    // Account builds show the e-mail form first; the demo picker sits behind «Entrar al demo».
    const demo = page.getByRole("button", { name: "Entrar al demo" });
    if (await demo.count()) await demo.click();
    await page.getByRole("radio", { name: labels[role] }).click();
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await page.waitForURL(url("/"));
    await settle(page, 1200);
    if (start !== "/") {
      await page.goto(url(start));
      await settle(page);
    }
  }
  return { page, ctx, close: () => ctx.close() };
}

/**
 * Saves shots/<name>.jpg.
 *  el:       a Locator to capture alone (padding px of surrounding page around it, default 16)
 *  fullPage: whole scroll height of the document (the desktop app scrolls inside #main-scroll: prefer `scroller`)
 *  scroller: true → temporarily lets #main-scroll grow so the whole work panel is captured (desktop pages)
 *  clip:     {x,y,width,height} in CSS px
 */
async function snap(page, name, { el, padding = 16, fullPage = false, scroller = false, clip, quality = 86 } = {}) {
  const file = path.join(SHOTS, `${name}.jpg`);
  const opts = { path: file, type: "jpeg", quality, animations: "disabled", caret: "hide" };
  if (el) {
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const box = await el.boundingBox();
    if (!box) throw new Error(`snap(${name}): element not visible`);
    const vp = page.viewportSize();
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    opts.clip = { x, y, width: Math.min(vp.width - x, box.width + padding * 2), height: box.height + padding * 2 };
  } else if (clip) {
    opts.clip = clip;
  }
  if (scroller) {
    const restore = await page.evaluate(() => {
      const s = document.getElementById("main-scroll");
      if (!s) return null;
      // The shell is locked to the viewport and the page scrolls inside #main-scroll: a taller viewport shows all of it.
      return s.scrollHeight;
    });
    if (restore) {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.width, height: Math.min(restore + 140, 6000) });
      await page.waitForTimeout(500);
      await page.screenshot(opts);
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      return file;
    }
  }
  await page.screenshot({ ...opts, fullPage });
  return file;
}

async function done() {
  if (browserPromise) await (await browserPromise).close();
}

module.exports = { open, snap, settle, url, done, BASE, SHOTS };
