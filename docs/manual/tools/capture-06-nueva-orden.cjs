// Capítulo 06 · Nueva orden — el asistente de alta, paso por paso (Administración), en escritorio y en el teléfono.
// node tools/capture-06-nueva-orden.cjs [escritorio] [telefono]   (from docs/manual; no argument = both)

// Native date/time inputs follow the browser's language: render them as a Mexican phone would.
process.env.LANG = "es_MX.UTF-8";
process.env.LANGUAGE = "es_MX";
const { open, snap, settle, url, done } = require("./shoot.cjs");

const ONLY = process.argv.slice(2);
const want = (k) => !ONLY.length || ONLY.includes(k);

const REF = "COT-2026-1702";
const INSTRUCCIONES = "Acceso por recepción de 7:00 a 9:00. Presentar identificación y EPP completo.";

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

const rest = async (page) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
};
const blur = (page) => page.evaluate(() => document.activeElement && document.activeElement.blur());
const top = (page) => page.evaluate(() => (document.getElementById("main-scroll") ?? document.scrollingElement).scrollTo(0, 0));
/** Runs `fn` with a viewport tall enough for the whole step: the sticky action bar then sits after the form, not over it. */
async function tall(page, fn) {
  await page.setViewportSize({ width: 1440, height: 2600 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById("main-scroll").scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.mouse.move(2, 2);
  await fn();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
}

(async () => {
  /* ───────── Escritorio (Administración) ───────── */
  if (want("escritorio")) {
    const { page, close } = await open({ role: "administracion", device: "desktop" });
    await page.goto(url("/ordenes/nueva"));
    await settle(page, 1500);
    await rest(page);

    // Paso 1 · cliente con dos sitios
    await page.getByRole("option", { name: /Megacable/ }).click();
    await settle(page, 900);
    await page.getByRole("radio", { name: /Centro de atención Contry/ }).click();
    await settle(page, 600);
    const main = page.locator("#main-scroll");
    await page.locator("#no-ref").fill(REF);
    await page.getByRole("button", { name: "Alta", exact: true }).click();
    await page.locator("#no-ref").blur();
    await settle(page, 500);
    await top(page);
    await settle(page, 500);
    await rest(page);
    await snap(page, "06-paso1");
    await marks(page, "06-paso1", [
      { n: 1, loc: page.getByRole("list", { name: "Pasos" }), dx: -36 },
      { n: 2, loc: main.getByText("Megacable", { exact: true }).first(), dx: -120 },
      { n: 3, loc: main.getByRole("radiogroup", { name: "Sitio" }), dx: -36, dy: 30 },
      { n: 4, loc: main.getByText(/^Vista previa/), dx: -30 },
      { n: 5, loc: main.getByText(/^Paso 1 de 4 · /), dx: -52 },
    ]);

    // Paso 2 · servicio
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 1200);
    await page.getByRole("radio", { name: /Limpieza profunda/ }).click();
    await settle(page, 1200);
    await rest(page);
    // special instructions and one custom activity
    await main.getByRole("textbox", { name: "Instrucciones especiales" }).fill(INSTRUCCIONES);
    await page.getByRole("textbox", { name: "Nueva actividad" }).fill("Limpieza de mamparas de atención");
    await page.getByRole("textbox", { name: "Nueva actividad" }).press("Enter");
    await settle(page, 700);
    await blur(page);
    await tall(page, async () => {
      const a = await main.getByRole("heading", { name: "Actividades" }).boundingBox();
      const sec = main.getByRole("heading", { name: "Actividades" }).locator("xpath=ancestor::section[1]");
      const b = await sec.boundingBox();
      await snap(page, "06-paso2-actividades", { clip: { x: b.x - 16, y: a.y - 18, width: b.width + 32, height: b.y + b.height - a.y + 4 } });
    });

    // Paso 3 · programación
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 1200);
    await page.getByRole("combobox", { name: "Supervisor" }).click();
    await settle(page, 500);
    await page.getByRole("option", { name: /Daniela Ortiz/ }).click();
    await settle(page, 500);
    await page.getByRole("button", { name: "2 días" }).click();
    await settle(page, 900);
    await rest(page);
    // supervisor and jornadas in one crop (the crew notice is described in the text)
    await tall(page, async () => {
      const a = await main.getByRole("heading", { name: "Supervisor", exact: true }).boundingBox();
      const sec = main.getByRole("heading", { name: "Jornadas" }).locator("xpath=ancestor::section[1]");
      const b = await sec.boundingBox();
      await snap(page, "06-paso3-form", { clip: { x: b.x - 16, y: a.y - 18, width: b.width + 32, height: b.y + b.height - a.y + 4 } });
    });

    // Paso 4 · revisión
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 2200);
    await rest(page);
    await page.getByRole("checkbox", { name: /Confirmo que el trabajo/ }).click();
    await settle(page, 500);
    await blur(page);
    await tall(page, async () => {
      const col = main.getByText("Se guardará como").locator("xpath=ancestor::div[contains(@class,'space-y-6')][1]");
      // bottom of the receipt: schedule, supervisor, total and the confirmation
      const a = await main.getByRole("heading", { name: "Programación y cuadrilla" }).boundingBox();
      const c = await col.boundingBox();
      await snap(page, "06-revision-final", { clip: { x: c.x - 16, y: a.y - 26, width: c.width + 32, height: c.y + c.height - a.y + 42 } });
    });

    // Crear
    await page.getByRole("button", { name: "Crear orden" }).click();
    await page.waitForURL(/\/ordenes\/OS-/);
    await settle(page, 1200);
    await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 15000 }).catch(() => {});
    await settle(page, 600);
    await rest(page);
    await snap(page, "06-creada");
    console.log("\ncreated:", page.url());
    await close();
  }

  /* ───────── Teléfono (Administración) ───────── */
  if (want("telefono")) {
    const { page, close } = await open({ role: "administracion", device: "phone" });
    await page.goto(url("/ordenes/nueva"));
    await settle(page, 1500);
    await page.getByRole("option", { name: /Megacable/ }).click();
    await settle(page, 800);
    await page.getByRole("radio", { name: /Centro de atención Contry/ }).click();
    await page.locator("#no-ref").fill(REF);
    await page.locator("#no-ref").blur();
    await settle(page, 500);
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 1200);
    await page.getByRole("radio", { name: /Limpieza profunda/ }).click();
    await settle(page, 1000);
    await page.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollTop && (el.scrollTop = 0)));
    await settle(page, 400);
    await snap(page, "06-telefono-paso2");
    await page.getByRole("button", { name: /^Resumen de la orden/ }).click();
    await settle(page, 900);
    await snap(page, "06-telefono-resumen");
    await page.getByRole("button", { name: "Cerrar" }).last().click();
    await settle(page, 600);
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 1000);
    await page.getByRole("combobox", { name: "Supervisor" }).click();
    await settle(page, 500);
    await page.getByRole("option", { name: /Daniela Ortiz/ }).click();
    await settle(page, 500);
    await page.getByRole("button", { name: "Siguiente" }).click();
    await settle(page, 1500);
    await page.getByRole("checkbox", { name: /Confirmo que el trabajo/ }).click();
    await settle(page, 400);
    await page.getByRole("button", { name: "Crear orden" }).click();
    await settle(page, 2500);
    await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 15000 }).catch(() => {});
    await settle(page, 400);
    await snap(page, "06-telefono-creada");
    await close();
  }

  await done();
})();
