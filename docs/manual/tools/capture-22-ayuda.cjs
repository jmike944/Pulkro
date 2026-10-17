// Capítulo 22 · Centro de ayuda y preguntas frecuentes — capturas.
const { open, snap, settle, url, done } = require("./shoot.cjs");

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

(async () => {
  /* ── Administración, escritorio ── */
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/ayuda" });
    await settle(page, 2000);
    // pick a decision step so the detail panel shows a rule with its two branches
    await page.getByRole("button", { name: /^Paso 11:/ }).click();
    await settle(page, 1200);
    await page.mouse.move(2, 400);
    await page.locator("#main-scroll").evaluate((el) => el.scrollTo(0, 0));
    await settle(page, 600);
    await snap(page, "22-ayuda-escritorio");
    const vp = page.viewportSize();
    for (const [k, loc] of [
      ["secciones", page.getByRole("link", { name: "Flujo", exact: true })],
      ["recorrido", page.getByRole("button", { name: /recorrido/ })],
      ["paso", page.getByRole("button", { name: /^Paso 11:/ })],
      ["llamar", page.getByRole("link", { name: /Llamar a Pulkro/ })],
    ]) {
      const b = await loc.first().boundingBox().catch(() => null);
      if (b) console.log("mark", k, "left", pct(b.x - 14, vp.width), "top", pct(b.y + b.height / 2, vp.height), JSON.stringify(b));
    }

    await page.setViewportSize({ width: 1440, height: 1400 });
    await settle(page, 600);
    // business rules (first row)
    const rules = page.getByText(/^Reglas de negocio · /);
    let b = await rules.boundingBox();
    await page.locator("#main-scroll").evaluate((el, d) => el.scrollBy(0, d), b.y - 120);
    await settle(page, 1500);
    b = await rules.boundingBox();
    await page.mouse.move(2, 400);
    await snap(page, "22-reglas", { clip: { x: b.x - 16, y: b.y - 16, width: 1092, height: 380 } });

    await close();
  }

  /* ── Supervisor, teléfono ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/ayuda" });
    await settle(page, 2000);
    const faq = page.getByText("Preguntas frecuentes", { exact: true }).last();
    const b = await faq.boundingBox();
    await page.evaluate((y) => window.scrollBy(0, y - 90), b.y);
    await settle(page, 1000);
    await snap(page, "22-telefono-preguntas");
    await close();
  }
  await done();
})();
