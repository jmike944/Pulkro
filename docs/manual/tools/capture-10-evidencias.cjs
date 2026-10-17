// Capítulo 10 · Evidencias. Run from docs/manual: node tools/capture-10-evidencias.cjs
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { open, snap, settle, url, done } = require("./shoot.cjs");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pk-manual-10-"));

/** Center-left of an element in % of the viewport (for numbered markers). */
async function mark(page, loc, label, dx = 0, dy = 0) {
  const b = await loc.first().boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(label, "not visible");
  console.log(`${label}: left:${(((b.x + dx) / vp.width) * 100).toFixed(1)}%;top:${(((b.y + b.height / 2 + dy) / vp.height) * 100).toFixed(1)}%`);
}

const waitToasts = (page) => page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 20000 }).catch(() => {});

(async () => {
  /* ── desktop ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", start: "/evidencias" });
    await settle(page, 1200);
    await mark(page, page.getByRole("tab", { name: /Pendientes/ }), "m1 tabs");
    await mark(page, page.getByRole("button", { name: /Filtrar por estado/ }), "m2 estado");
    await mark(page, page.getByText("Respuesta", { exact: true }), "m3 stats");
    await mark(page, page.getByRole("button", { name: /Foto DESPUÉS · Jornada 1/ }), "m4 row");
    await snap(page, "10-pendientes", { clip: { x: 0, y: 0, width: 1440, height: 640 } });

    // Request detail (right sheet)
    await page.getByRole("button", { name: /Foto DESPUÉS · Jornada 1/ }).click();
    await settle(page, 1200);
    await snap(page, "10-solicitud", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Gallery
    await page.getByRole("tab", { name: /Galería/ }).click();
    await settle(page, 1200);
    await mark(page, page.getByRole("button", { name: /Filtrar por tipo/ }), "g1 filtros");
    await mark(page, page.getByRole("button", { name: /Filtrar por fechas/ }), "g2 fechas");
    await mark(page, page.getByText(/fotos ·/).first(), "g3 total");

    // A picture "from the phone's gallery": a clean scene, saved as a file dated two days ago (before the jornada began).
    const tile = page.getByRole("button", { name: /^Foto Después · Área administrativa/ }).first();
    await tile.evaluate((el) => [...el.children].slice(1).forEach((c) => (c.style.visibility = "hidden")));
    const pic = path.join(TMP, "IMG_4471.jpg");
    await tile.screenshot({ path: pic, type: "jpeg", quality: 90 });
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    old.setUTCHours(15, 12, 0, 0); // 09:12 in Monterrey, two days ago
    fs.utimesSync(pic, old, old);
    await page.reload();
    await settle(page, 1200);

    // Upload it as the missing DESPUÉS from the request sheet
    await page.getByRole("tab", { name: /Pendientes/ }).click();
    await settle(page, 600);
    await page.getByRole("button", { name: /Foto DESPUÉS · Jornada 1/ }).click();
    await settle(page, 1000);
    await page.getByRole("dialog").getByRole("button", { name: /Subir foto DESPUÉS/ }).click();
    await settle(page, 700);
    await page.getByRole("dialog").getByRole("button", { name: "Área administrativa", exact: true }).click();
    await page.getByRole("dialog").locator('input[type="file"][multiple]').setInputFiles(pic);
    await settle(page, 2500);
    await waitToasts(page);
    await settle(page, 600);
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // The flagged photo in the gallery (client filter) and in the viewer
    await page.getByRole("tab", { name: /Galería/ }).click();
    await settle(page, 900);
    await page.getByRole("button", { name: /Filtrar por cliente/ }).click();
    await page.getByRole("menuitemradio", { name: /Hospital San Rafael|San Rafael/ }).click();
    await settle(page, 1200);
    await page.mouse.move(5, 890);
    await snap(page, "10-galeria-filtro", { clip: { x: 300, y: 270, width: 1130, height: 352 } });
    const flagged = page.getByRole("button", { name: /^Foto Después · Área administrativa · OS-24393/ }).first();
    await flagged.click();
    await settle(page, 1500);
    const lb = page.getByRole("dialog");
    await lb.getByRole("button", { name: "Antes y después", exact: true }).click();
    await settle(page, 3500);
    await snap(page, "10-comparar", { el: lb, padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Compliance
    await page.goto(url("/evidencias?tab=cumplimiento"));
    await settle(page, 2500);
    await snap(page, "10-cumplimiento", { clip: { x: 300, y: 278, width: 1100, height: 622 } });
    await close();
  }

  /* ── phone: list, request flow, success ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/evidencias" });
    await settle(page, 1200);
    await snap(page, "10-tel-pendientes");
    await page.getByText("Foto DESPUÉS · Jornada 1").first().click();
    await settle(page, 1400);
    await snap(page, "10-tel-solicitud");
    await page.getByRole("button", { name: "Simular" }).click();
    await settle(page, 2500);
    await waitToasts(page);
    await settle(page, 2500);
    await snap(page, "10-tel-recibida");
    await close();
  }
  await done();
})();
