// Capítulo 14 · Postventa. Run from docs/manual: node tools/capture-14-postventa.cjs
const { open, snap, settle, url, done } = require("./shoot.cjs");

const only = process.argv[2] ? process.argv[2].split(",") : null;
const want = (k) => !only || only.includes(k);

/** Hide / show the toast stack (sonner) so a toast never covers a screenshot. */
const toasts = async (page, visible) => {
  await page.evaluate((v) => {
    let s = document.getElementById("pk-hide-toasts");
    if (!v && !s) {
      s = document.createElement("style");
      s.id = "pk-hide-toasts";
      s.textContent = "[data-sonner-toaster]{display:none !important}";
      document.head.appendChild(s);
    }
    if (v && s) s.remove();
  }, visible);
};

/** Let a long dialog grow to its content (it scrolls inside a 900px box in the app) so one crop shows the whole form. */
const tallDialogs = (page) =>
  page.addStyleTag({ content: "[role=dialog]{max-height:none !important} [role=dialog] [data-slot=dialog-body], [role=dialog] .overflow-y-auto{max-height:none !important;overflow:visible !important}" });

/** Prints a marker position (center-left of a locator) in % of the viewport. */
async function mark(page, n, loc, { dx = 0, dy = 0, side = "left" } = {}) {
  const b = await loc.boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(`mark ${n}: not visible`);
  const x = side === "left" ? b.x - 14 + dx : side === "right" ? b.x + b.width + 14 + dx : b.x + b.width / 2 + dx;
  const y = side === "top" ? b.y - 14 + dy : b.y + b.height / 2 + dy;
  console.log(`mark ${n}: left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%`);
}

/** The photo «Simular» button only exists in the demo build: keep it out of the manual's screenshots. */
const noDemo = (ctx) =>
  ctx.addInitScript(() => {
    const css = 'button[title^="Agregar una foto de ejemplo"]{display:none !important}';
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  });

(async () => {
  /* ───────── Administración · escritorio ───────── */
  {
    const { page, ctx, close } = await open({ role: "administracion", device: "desktop" });
    await noDemo(ctx);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url("/").replace(/\/$/, "") });
    await page.goto(url("/postventa"));
    await settle(page, 1500);

    // New case: fill the whole form, then capture it in full.
    await page.getByRole("button", { name: "Nuevo caso" }).click();
    await settle(page, 900);
    await page.getByRole("option").first().click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Trabajo incompleto" }).click();
    await page.getByRole("group", { name: "Severidad" }).getByRole("button", { name: "Alta" }).click();
    await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
    await page.locator("#nc-desc").fill("No se limpiaron los cristales interiores del comedor, que estaban incluidos en la orden. El contacto lo reportó por WhatsApp.");
    await page.waitForTimeout(500);
    if (want("nuevo")) {
      await page.setViewportSize({ width: 1440, height: 1500 });
      const st = await tallDialogs(page);
      await page.waitForTimeout(600);
      await snap(page, "14-nuevo-caso", { el: page.getByRole("dialog") });
      await st.evaluate((n) => n.remove());
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Registrar caso" }).click();
    await page.waitForTimeout(600);
    await toasts(page, false);
    await settle(page, 900);

    // Overview: header, satisfaction hero, tabs.
    if (want("vista")) {
      await page.evaluate(() => document.getElementById("main-scroll")?.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await snap(page, "14-postventa");
      await mark(page, 1, page.getByRole("button", { name: "Nuevo caso" }), { side: "left", dx: -6 });
      await mark(page, 2, page.getByText("Satisfacción del cliente").first(), { side: "top" });
      await mark(page, 3, page.getByText(/^Satisfacción en \d{4}/).first(), { side: "left" });
      await mark(page, 4, page.getByText("Por dar seguimiento").first(), { side: "right", dx: 18 });
    }

    // The board (first row of cards of each column).
    if (want("tablero")) {
      const board = page.locator("section[aria-label^='Abierto']").locator("xpath=..");
      await board.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById("main-scroll")?.scrollBy(0, -40));
      await page.waitForTimeout(500);
      const bb = await board.boundingBox();
      // bottom of the tallest first card in a column
      const firsts = page.locator("section[aria-label] > div > article:first-child");
      let bottom = bb.y + 300;
      for (let i = 0; i < (await firsts.count()); i++) {
        const b = await firsts.nth(i).boundingBox();
        if (b) bottom = Math.max(bottom, b.y + b.height);
      }
      await snap(page, "14-tablero", { clip: { x: bb.x - 12, y: bb.y - 12, width: bb.width + 24, height: bottom - bb.y + 26 } });
    }

    // Case detail: add a note so the case shows fresh activity.
    await page.goto(url("/postventa/PV-0064"));
    await settle(page, 1300);
    await toasts(page, false);
    await page.locator("#case-note").fill("Llamada con el contacto: se acordó una visita de revisión el lunes a primera hora.");
    await page.getByRole("button", { name: "Agregar nota" }).click();
    await settle(page, 900);
    if (want("detalle")) {
      await page.evaluate(() => document.getElementById("main-scroll")?.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await snap(page, "14-caso-detalle");
      await mark(page, 1, page.getByText("Seguimiento del caso").first(), { side: "left" });
      await mark(page, 2, page.getByText("Estado del caso").first(), { side: "left" });
      await mark(page, 3, page.getByRole("button", { name: "Marcar resuelto" }), { side: "left" });
      await mark(page, 4, page.locator("#case-note"), { side: "left" });
    }
    // Resolve, then close.
    await page.getByRole("button", { name: "Marcar resuelto" }).click();
    await settle(page, 700);
    await page.locator("#case-move-text").fill("Se programó un repaso sin costo del área de piso; el contacto revisó y quedó conforme.");
    await page.waitForTimeout(400);
    await page.getByRole("dialog").getByRole("button", { name: "Marcar como resuelto" }).click();
    await settle(page, 900);
    await page.getByRole("button", { name: "Cerrar caso" }).click();
    await settle(page, 700);
    await page.getByRole("dialog").getByRole("checkbox").click();
    await page.waitForTimeout(400);
    if (want("cerrar")) await snap(page, "14-cerrar-caso", { el: page.getByRole("dialog") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Encuestas tab.
    await page.goto(url("/postventa"));
    await settle(page, 1300);
    await toasts(page, false);
    await page.getByText(/^Encuestas/).first().click();
    await settle(page, 1200);
    if (want("encuestas")) {
      const head = page.getByText("Orden y cliente", { exact: true });
      await head.scrollIntoViewIfNeeded();
      await page.setViewportSize({ width: 1440, height: 1600 });
      await page.waitForTimeout(500);
      const search = page.getByPlaceholder("Buscar folio, cliente o comentario");
      await search.evaluate((n) => n.scrollIntoView({ block: "start" }));
      await page.evaluate(() => document.getElementById("main-scroll")?.scrollBy(0, -24));
      await page.mouse.move(5, 5);
      await page.waitForTimeout(600);
      const sb = await search.boundingBox();
      await snap(page, "14-encuestas", { clip: { x: sb.x - 16, y: sb.y - 16, width: 1440 - sb.x - 40, height: 598 } });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);
    }
    // Por dar seguimiento: generate a survey.
    await page.getByText(/^Por dar seguimiento/).first().click();
    await settle(page, 1200);
    const gen = page.getByRole("button", { name: /Generar encuesta/ }).first();
    if (want("generar")) {
      await gen.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById("main-scroll")?.scrollBy(0, 200));
      await page.waitForTimeout(400);
      const list = page.locator("ul").filter({ has: gen }).first();
      const lb = await list.boundingBox();
      await gen.click();
      await page.waitForTimeout(500);
      const menu = await page.getByRole("menu").boundingBox();
      const top = lb.y - 12;
      await snap(page, "14-generar-encuesta", { clip: { x: lb.x - 16, y: top, width: lb.width + 32, height: Math.max(menu.y + menu.height, lb.y + 300) - top + 16 } });
      await page.getByRole("menuitem", { name: "QR en sitio" }).click();
    } else {
      await gen.click();
      await page.getByRole("menuitem", { name: "QR en sitio" }).click();
    }
    await settle(page, 1200);
    if (want("qr")) await snap(page, "14-encuesta-qr", { el: page.getByRole("dialog") });
    await page.keyboard.press("Escape");
    await settle(page, 700);
    // Answer received by phone: manual capture.
    await page.locator("li").filter({ hasText: "Encuesta generada" }).first().getByRole("button", { name: /Registrar respuesta/ }).click();
    await settle(page, 800);
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("radio", { name: /^4 de 5/ }).first().click();
    await page.waitForTimeout(500);
    await dlg.getByRole("radiogroup", { name: "Puntualidad" }).getByRole("radio", { name: /^3 de 5/ }).click().catch(() => {});
    await dlg.getByRole("radio", { name: "8 de 10" }).click();
    await dlg.locator("#ms-comment").fill("Quedó bien en general, pero la cuadrilla llegó media hora tarde.");
    await page.waitForTimeout(500);
    if (want("manual")) {
      await page.setViewportSize({ width: 1440, height: 1400 });
      const st = await tallDialogs(page);
      await page.waitForTimeout(600);
      await snap(page, "14-respuesta-manual", { el: dlg });
      await st.evaluate((n) => n.remove());
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await close();
  }

  /* ───────── Supervisor · teléfono ───────── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "phone" });
    await noDemo(ctx);
    await page.goto(url("/postventa"));
    await settle(page, 1300);
    await page.getByRole("button", { name: "Nuevo caso" }).click();
    await settle(page, 900);
    await page.getByRole("option").first().click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Calidad del servicio" }).click();
    await page.getByRole("button", { name: "Teléfono", exact: true }).click();
    await page.locator("#nc-desc").fill("Quedaron marcas de agua en los vidrios de la recepción.");
    await page.locator("#nc-desc").blur();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Registrar caso" }).click();
    await settle(page, 1200);
    await page.getByRole("button", { name: "Volver a Postventa" }).click();
    await settle(page, 1000);
    await toasts(page, false);
    if (want("tel-lista")) {
      await page.getByRole("button", { name: /^Activos/ }).scrollIntoViewIfNeeded();
      await page.evaluate(() => { const sc = document.getElementById("main-scroll"); (sc && sc.scrollHeight > sc.clientHeight + 4 ? sc : window).scrollBy(0, 80); });
      await page.waitForTimeout(600);
      await snap(page, "14-tel-postventa");
    }
    await close();
  }
  await done();
})();
