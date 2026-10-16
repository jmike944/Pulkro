// Capítulo 13 · Reportes y envío al cliente. Run from docs/manual: node tools/capture-13-reportes.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { open, snap, settle, url, done, SHOTS } = require("./shoot.cjs");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pk-manual-13-"));

async function mark(page, loc, label, dx = 0, dy = 0) {
  const b = await loc.first().boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(label, "not visible");
  console.log(`${label}: left:${(((b.x + dx) / vp.width) * 100).toFixed(1)}%;top:${(((b.y + b.height / 2 + dy) / vp.height) * 100).toFixed(1)}%`);
}
const waitToasts = (page) => page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 25000 }).catch(() => {});
const FOLIO = "OS-24395";

/** The "Reporte final" card, shot in a taller window so it is never cut. */
async function snapCard(page, name, from) {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 1400 });
  await page.waitForTimeout(600);
  const card = page.locator("div.bg-aurora-frame", { hasText: "Un solo reporte por servicio" }).first();
  await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  if (from) {
    // only the lower part of the card, from the `from` heading down
    const c = await card.boundingBox();
    const f = await card.getByText(from, { exact: true }).boundingBox();
    await snap(page, name, { clip: { x: c.x - 10, y: f.y - 22, width: c.width + 20, height: c.y + c.height - f.y + 32 } });
  } else await snap(page, name, { el: card, padding: 10 });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

(async () => {
  /* ── desktop: hub, workspace, generate, PDF, share, new version ── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "desktop", start: "/reportes" });
    ctx.on("page", (p) => p.close().catch(() => {})); // wa.me tabs
    await settle(page, 1500);
    await mark(page, page.getByText("Por generar", { exact: true }).first(), "h1 pipeline");
    await mark(page, page.getByText("Últimas 6 semanas"), "h2 semanas");
    await mark(page, page.getByRole("tab", { name: /Por generar/ }), "h3 tabs");
    await mark(page, page.getByRole("link", { name: /^Generar$/ }), "h4 generar");
    await snap(page, "13-hub");

    // Workspace before the first version
    await page.goto(url(`/ordenes/${FOLIO}/reporte`));
    await settle(page, 2500);
    await mark(page, page.getByRole("tab", { name: /Vista previa/ }), "w1 tabs");
    await mark(page, page.getByRole("button", { name: /Editar descripción/ }), "w2 editar");
    await mark(page, page.getByRole("button", { name: /Generar PDF v1/ }), "w3 generar");
    await mark(page, page.getByText("Compartir con el cliente"), "w4 compartir");
    await snap(page, "13-taller");

    await page.getByRole("tab", { name: /Fotos/ }).click();
    await settle(page, 1200);
    await page.mouse.move(5, 890);
    await snap(page, "13-fotos", { clip: { x: 300, y: 215, width: 690, height: 500 } });
    await page.getByRole("tab", { name: /Vista previa/ }).click();
    await settle(page, 1200);

    // Generate v1 (progress, then ready)
    await page.getByRole("button", { name: /Generar PDF v1/ }).click();
    await page.getByText(/Versión v1 lista para compartir/).waitFor({ timeout: 60000 });
    await waitToasts(page);
    await settle(page, 800);

    // Download the real PDF and render its pages
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Descargar PDF/ }).first().click()]);
    const pdf = path.join(TMP, "reporte.pdf");
    await dl.saveAs(pdf);
    execFileSync("pdftoppm", ["-r", "150", "-jpeg", "-jpegopt", "quality=88", pdf, path.join(TMP, "p")]);
    const pages = fs.readdirSync(TMP).filter((f) => /^p-\d+\.jpg$/.test(f)).sort();
    console.log("pdf pages", pages.length);
    pages.slice(0, 2).forEach((f, i) => fs.copyFileSync(path.join(TMP, f), path.join(SHOTS, `13-pdf-p${i + 1}.jpg`)));
    await waitToasts(page);

    // WhatsApp from the desktop: the PDF is downloaded and WhatsApp opens with the message
    await Promise.all([page.waitForEvent("download").catch(() => {}), page.getByRole("button", { name: /Compartir por WhatsApp/ }).click()]);
    await settle(page, 1200);
    await waitToasts(page);

    // A new version after changing the description
    await page.getByRole("button", { name: /Editar descripción/ }).click();
    await settle(page, 700);
    const ta = page.getByRole("textbox", { name: "Descripción del servicio" });
    await ta.click();
    await page.keyboard.press("End");
    await ta.press("Control+End");
    await page.keyboard.type(" Se dejaron limpias y secas las alfombras del auditorio.");
    await page.getByRole("button", { name: /^Listo$/ }).click();
    await settle(page, 900);
    await snapCard(page, "13-cambios");
    await page.getByRole("button", { name: /Generar PDF v2/ }).click();
    await page.getByText(/Versión v2 lista para compartir/).waitFor({ timeout: 60000 });
    await waitToasts(page);
    await settle(page, 800);
    const hist = page.getByRole("heading", { name: "Versiones" }).locator("xpath=ancestor::div[contains(@class,'xl:block')][1]");
    await hist.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(page, 500);
    await snap(page, "13-historial", { el: hist, padding: 12 });

    // A page of the paper preview at 100 %
    await page.getByRole("button", { name: "100%" }).click();
    await settle(page, 1200);
    await close();
  }

  /* ── desktop: no connection, the PDF waits ── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "desktop", start: `/ordenes/${FOLIO}/reporte` });
    await settle(page, 2500);
    await ctx.setOffline(true);
    await settle(page, 800);
    await page.getByRole("button", { name: /Generar PDF v1/ }).click();
    await page.getByText(/Versión v1 lista para compartir/).waitFor({ timeout: 60000 });
    await waitToasts(page);
    await settle(page, 800);
    await snapCard(page, "13-sin-conexion", "Compartir con el cliente");
    await ctx.setOffline(false);
    await close();
  }

  /* ── phone: card, share sheet, sent ── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "phone", start: `/ordenes/${FOLIO}/reporte` });
    ctx.on("page", (p) => p.close().catch(() => {}));
    await settle(page, 2500);
    await snap(page, "13-tel-taller");
    await page.getByRole("button", { name: /Generar PDF v1/ }).click();
    await page.getByText("Compartir con el cliente").first().waitFor({ timeout: 60000 });
    await settle(page, 1500);
    await snap(page, "13-tel-compartir");
    await Promise.all([page.waitForEvent("download").catch(() => {}), page.getByRole("button", { name: /WhatsApp/ }).first().click()]);
    await page.getByText(/Envío iniciado por WhatsApp/).first().waitFor({ timeout: 30000 });
    await settle(page, 1500);
    await waitToasts(page);
    await snap(page, "13-tel-enviado");
    await close();
  }
  await done();
})();
