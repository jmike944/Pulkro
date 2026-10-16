// Capítulo 05 · Órdenes — lista, detalle, pestañas y acciones de la orden.
// node tools/capture-05-ordenes.cjs [lista] [filas] [tel] [detalle] [teldet]   (from docs/manual; no argument = all)
// Native date/time inputs follow the browser's language: render them as a Mexican phone would.
process.env.LANG = "es_MX.UTF-8";
process.env.LANGUAGE = "es_MX";
const { open, snap, settle, url, done } = require("./shoot.cjs");

/** Prints marker positions (% of the viewport) at the left edge (or `side`) of each element. */
async function marks(page, label, items) {
  const vp = page.viewportSize();
  const out = [];
  for (const it of items) {
    const box = await it.loc.first().boundingBox();
    if (!box) {
      out.push(`${it.n}: (not visible)`);
      continue;
    }
    const dx = it.dx ?? -16;
    const x = it.side === "right" ? box.x + box.width + Math.abs(dx) : box.x + dx;
    const y = box.y + (it.dy ?? box.height / 2);
    out.push(`<span class="mark" style="left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%">${it.n}</span>`);
  }
  console.log(`\n[${label}]\n` + out.join("\n"));
}

/** Parks the mouse so no row or button shows its hover state. */
const rest = async (page) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
};

/** Drops the focus ring a dialog puts on its first control. */
const blur = (page) => page.evaluate(() => document.activeElement && document.activeElement.blur());

const ONLY = process.argv.slice(2);
const want = (k) => !ONLY.length || ONLY.includes(k);

/** The supervisor's multi-day order in progress (3 jornadas, photos, an incident). */
const FOLIO = "OS-24397";
/** An order with its report sent (closure validated): Reabrir is available. */
const CLOSED = "OS-24385";

(async () => {
  /* ───────── Lista (Administración) ───────── */
  if (want("lista")) {
    const { page, close } = await open({ role: "administracion", device: "desktop" });
    await page.goto(url("/ordenes"));
    await settle(page, 1500);
    await rest(page);
    await snap(page, "05-lista");
    const main = page.locator("#main-scroll");
    await marks(page, "05-lista", [
      { n: 1, loc: main.getByText(/abiertas,/).first(), dx: -36 },
      { n: 2, loc: page.getByRole("button", { name: "Exportar" }), dx: -16 },
      { n: 3, loc: page.getByRole("group", { name: "Filtros rápidos por etapa" }), dx: -36, dy: 40 },
      { n: 4, loc: page.getByRole("tab", { name: /^Abiertas/ }), dx: -36 },
      { n: 5, loc: page.getByRole("textbox", { name: "Buscar órdenes" }), dx: -36 },
      { n: 6, loc: page.getByRole("button", { name: "Prioridad alta" }), side: "right", dx: 16 },
      { n: 7, loc: main.locator("li").first(), dx: -36 },
      { n: 8, loc: main.locator("li").first().getByRole("link").last(), dx: -16 },
    ]);
    await close();
  }

  /* ───────── Filas (Supervisor, Abiertas): five rows in different situations ───────── */
  if (want("filas")) {
    const { page, close } = await open({ role: "supervisor", device: "desktop" });
    await page.goto(url("/ordenes"));
    await settle(page, 1800);
    await page.setViewportSize({ width: 1440, height: 1500 });
    await page.waitForTimeout(1500);
    await rest(page);
    const list = page.locator("#main-scroll .\\@container").first();
    const head = await list.locator("> div").first().boundingBox();
    const r5 = await list.locator(":scope > ul > li").nth(4).boundingBox();
    await snap(page, "05-filas", { clip: { x: head.x - 20, y: head.y - 8, width: head.width + 40, height: r5.y + r5.height - head.y + 16 } });
    await close();
  }

  /* ───────── Lista en el teléfono + hoja de filtros ───────── */
  if (want("tel")) {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.goto(url("/ordenes"));
    await settle(page, 1800);
    await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Buscar órdenes"]');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    });
    await settle(page, 900);
    await snap(page, "05-lista-telefono");
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 500);
    await page.getByRole("button", { name: /^Filtros/ }).click();
    await settle(page, 700);
    await page.getByRole("combobox", { name: "Cliente" }).click();
    await settle(page, 400);
    await page.getByRole("option", { name: "Bonafont" }).click();
    await settle(page, 600);
    await snap(page, "05-filtros-telefono");
    await close();
  }

  /* ───────── Detalle (Supervisor, orden en ejecución) ───────── */
  if (want("detalle")) {
    const { page, close } = await open({ role: "supervisor", device: "desktop" });
    await page.goto(url(`/ordenes/${FOLIO}`));
    await settle(page, 2000);
    await rest(page);
    await snap(page, "05-detalle");
    const main = page.locator("#main-scroll");
    await marks(page, "05-detalle", [
      { n: 1, loc: main.getByRole("heading", { level: 1 }), dx: -35, dy: 14 },
      { n: 2, loc: main.getByRole("link", { name: "Bonafont" }).first(), dx: -35, dy: 9 },
      { n: 3, loc: main.getByText(/en curso desde las/).first(), dx: -35, dy: 16 },
      { n: 4, loc: main.getByRole("link", { name: /Abrir jornada/ }), dx: -16 },
      { n: 5, loc: main.getByRole("tab", { name: /^Resumen/ }), dx: -35 },
      { n: 6, loc: main.getByRole("heading", { name: "Línea de tiempo" }), side: "right", dx: 66 },
      { n: 7, loc: main.getByText("Horas reales").first(), dx: -40 },
      { n: 8, loc: main.getByRole("link", { name: /Continuar jornada/ }).first(), dx: -16 },
    ]);

    // Right column: Cuadrilla + Historial de reasignaciones
    await page.setViewportSize({ width: 1440, height: 2400 });
    await page.waitForTimeout(800);
    await rest(page);
    {
      const crew = await main.getByRole("button", { name: "Cambiar cuadrilla" }).boundingBox();
      const sitio = await main.getByText("Sitio", { exact: true }).first().boundingBox();
      const hist = await main.getByText("Historial de reasignaciones").first().locator("xpath=..").boundingBox();
      await snap(page, "05-detalle-cuadrilla", { clip: { x: sitio.x - 16, y: crew.y - 18, width: 360 + 32, height: hist.y + hist.height - crew.y + 32 } });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    // Más acciones
    await main.evaluate((s) => s.scrollTo(0, 0));
    await page.getByRole("button", { name: "Más acciones" }).click();
    await settle(page, 600);
    await snap(page, "05-menu", { el: page.getByRole("menu"), padding: 3 });
    await page.keyboard.press("Escape");
    await settle(page, 400);

    // Jornadas tab: header + jornada 1
    await page.getByRole("tab", { name: /^Jornadas/ }).click();
    await settle(page, 1300);
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.waitForTimeout(700);
    await rest(page);
    {
      const h = await main.getByRole("heading", { name: /^Jornadas · / }).boundingBox();
      const card = await main.locator("ul > li").first().boundingBox();
      await snap(page, "05-jornadas", { clip: { x: card.x - 16, y: h.y - 16, width: card.width + 32, height: card.y + card.height - h.y + 26 } });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // Evidencia tab: header + jornada 1
    await page.getByRole("tab", { name: /^Evidencia/ }).click();
    await settle(page, 1500);
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.waitForTimeout(800);
    await rest(page);
    {
      const h = await main.getByRole("heading", { name: "Evidencia por jornada" }).boundingBox();
      const j1 = await main.locator("section").filter({ has: page.getByRole("heading", { name: /^Jornada 1/ }) }).first().boundingBox();
      await snap(page, "05-evidencia", { clip: { x: j1.x - 16, y: h.y - 16, width: j1.width + 32, height: j1.y + j1.height - h.y + 28 } });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // Reprogramar (from the Resumen tab's "⋯" menu)
    await page.getByRole("tab", { name: /^Resumen/ }).click();
    await settle(page, 800);
    await page.getByRole("button", { name: "Más acciones" }).click();
    await settle(page, 500);
    await page.getByRole("menuitem", { name: /Reprogramar/ }).click();
    await settle(page, 900);
    await blur(page);
    await page.waitForTimeout(200);
    await snap(page, "05-reprogramar", { el: page.getByRole("dialog"), padding: 14 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Reabrir: an order with its closure validated
    await page.goto(url(`/ordenes/${CLOSED}`));
    await settle(page, 1800);
    await rest(page);
    await page.getByRole("button", { name: "Más acciones" }).click();
    await settle(page, 500);
    await page.getByRole("menuitem", { name: /Reabrir/ }).click();
    await settle(page, 900);
    await page.getByRole("button", { name: "Queja del cliente: repaso de áreas" }).click();
    await settle(page, 400);
    await blur(page);
    await page.waitForTimeout(200);
    await snap(page, "05-reabrir", { el: page.getByRole("dialog"), padding: 14 });
    await close();
  }

  /* ───────── Detalle en el teléfono (Supervisor): the site card ───────── */
  if (want("teldet")) {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.goto(url(`/ordenes/${FOLIO}`));
    await settle(page, 2000);
    await page.getByRole("region", { name: "Sitio y contacto" }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 220));
    await settle(page, 500);
    await snap(page, "05-detalle-telefono-2");
    await close();
  }

  await done();
})();
