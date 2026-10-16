// Capítulo 12 · Cierre y validación. Run from docs/manual: node tools/capture-12-cierre.cjs
const { open, snap, settle, url, done } = require("./shoot.cjs");

async function mark(page, loc, label, dx = 0, dy = 0) {
  const b = await loc.first().boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(label, "not visible");
  console.log(`${label}: left:${(((b.x + dx) / vp.width) * 100).toFixed(1)}%;top:${(((b.y + b.height / 2 + dy) / vp.height) * 100).toFixed(1)}%`);
}
const waitToasts = (page) => page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 20000 }).catch(() => {});

/** A handwritten-looking signature on the pad. */
async function sign(page) {
  const pad = page.getByRole("img", { name: /Área para firmar/ });
  await pad.scrollIntoViewIfNeeded();
  const b = await pad.boundingBox();
  const x0 = b.x + b.width * 0.16;
  const w = b.width * 0.62;
  const yc = b.y + b.height * 0.5;
  const strokes = [
    Array.from({ length: 70 }, (_, i) => {
      const t = i / 69;
      return [x0 + w * 0.62 * t + 14 * Math.sin(t * Math.PI * 7), yc - 26 * Math.sin(t * Math.PI * 5) * (1 - 0.35 * t) + 8 * t];
    }),
    Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return [x0 + w * 0.58 + w * 0.36 * t, yc - 18 + 30 * t - 22 * Math.sin(t * Math.PI)];
    }),
    Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return [x0 + w * 0.05 + w * 0.9 * t, yc + 34 + 5 * Math.sin(t * Math.PI * 2)];
    }),
  ];
  for (const s of strokes) {
    await page.mouse.move(s[0][0], s[0][1]);
    await page.mouse.down();
    for (const [x, y] of s.slice(1)) await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
}

/** Scrolls the nearest scrolling ancestor of `loc` so that `loc` sits at the top (block: "start") or center. */
const scrollTo = (loc, block = "start") => loc.evaluate((el, block) => el.scrollIntoView({ block }), block);

(async () => {
  /* ── desktop: a ready order, the dialog, the closure ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", start: "/ordenes/OS-24392" });
    await settle(page, 1500);
    const cta = page.getByRole("button", { name: /^Validar cierre$/ }).first();
    await mark(page, cta, "o1 validar");
    await mark(page, page.getByText("Listo para validar").first(), "o2 listo");
    await snap(page, "12-orden-lista");

    await cta.click();
    await settle(page, 1500);
    const dlg = page.getByRole("dialog");
    // only the top of the dialog: title and the review checklist
    const db = await dlg.boundingBox();
    const cut = await dlg.getByText("Conformidad del cliente", { exact: true }).boundingBox();
    await snap(page, "12-dlg-revision", { clip: { x: db.x, y: db.y, width: db.width, height: cut.y - db.y - 6 } });

    await dlg.locator("#conf-role").fill("Gerente de mantenimiento");
    await sign(page);
    const summary = dlg.locator("#closure-summary");
    await dlg.getByText(/Confirmo que el servicio se ejecutó/).click();
    await settle(page, 500);
    await page.mouse.move(5, 890);
    await scrollTo(summary, "center");
    await settle(page, 400);
    await snap(page, "12-dlg-confirmar", { el: dlg, padding: 0 });

    await dlg.getByRole("button", { name: /Validar cierre/ }).last().click();
    await settle(page, 2500);
    await waitToasts(page);
    await snap(page, "12-validado", { el: page.getByRole("dialog"), padding: 0 });
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).last().click();
    await settle(page, 1200);

    // Reopen an order whose report was already sent
    await page.goto(url("/reportes?tab=enviados"));
    await settle(page, 1500);
    const href = await page.locator('a[href^="/ordenes/OS-"][href$="/reporte"]').first().getAttribute("href");
    const folio = href.split("/")[2];
    console.log("reopen", folio);
    await page.goto(url(`/ordenes/${folio}`));
    await settle(page, 1500);
    await page.getByRole("button", { name: "Más acciones" }).first().click();
    await settle(page, 600);
    await page.getByRole("menuitem", { name: /Reabrir/ }).click();
    await settle(page, 900);
    const rd = page.getByRole("dialog");
    await rd.getByRole("button", { name: "Queja del cliente: repaso de áreas" }).click();
    await rd.getByText(/Entiendo que debo/).click();
    await settle(page, 500);
    await snap(page, "12-reabrir", { el: rd, padding: 0 });
    await rd.getByRole("button", { name: /Reabrir orden/ }).click();
    await settle(page, 1500);
    await waitToasts(page);
    await close();
  }

  /* ── desktop: missing photo (exception) and a hard block ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", start: "/ordenes/OS-24393" });
    await settle(page, 1500);
    await page.getByRole("button", { name: /Validar con excepción autorizada/ }).first().click();
    await settle(page, 1500);
    const dlg = page.getByRole("dialog");
    await dlg.locator("#closure-exception").fill("El cliente cerró el área de sanitarios al terminar; no se permitió la foto DESPUÉS. Se envió confirmación por correo.");
    await settle(page, 600);
    await page.mouse.move(5, 890);
    await snap(page, "12-dlg-excepcion", { el: dlg, padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);
    const discard = page.getByRole("button", { name: /Descartar/ });
    if (await discard.count()) await discard.first().click();
    await settle(page, 600);

    // A blocking incident on the ready order
    await page.goto(url("/incidencias"));
    await settle(page, 1200);
    await page.getByRole("button", { name: "Registrar incidencia" }).click();
    await settle(page, 900);
    const reg = page.getByRole("dialog");
    await reg.getByText("OS-24392").first().click();
    await settle(page, 800);
    await reg.getByRole("button", { name: /Solicitud o queja en sitio/ }).click();
    await reg.locator("#inc-desc").fill("El gerente pidió repasar las juntas del baño de damas antes de aceptar el servicio.");
    await reg.getByRole("switch", { name: "Impide el cierre" }).click();
    await reg.getByRole("button", { name: "Registrar incidencia" }).click();
    await settle(page, 1500);
    await waitToasts(page);
    await page.goto(url("/ordenes/OS-24392?cerrar=1"));
    await settle(page, 1800);
    await waitToasts(page);
    await snap(page, "12-dlg-bloqueado", { el: page.getByRole("dialog"), padding: 0 });
    await close();
  }

  /* ── phone: the three steps and the success screen ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/ordenes/OS-24392" });
    await settle(page, 1500);
    await page.getByRole("button", { name: /^Validar cierre$/ }).first().click();
    await settle(page, 1500);
    await snap(page, "12-tel-paso1");
    await page.getByRole("button", { name: "Continuar" }).click();
    await settle(page, 900);
    await page.locator("#conf-role").fill("Gerente de mantenimiento");
    await sign(page);
    await page.getByRole("img", { name: /Firma capturada/ }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(page, 500);
    await snap(page, "12-tel-paso2");
    await page.getByRole("button", { name: "Continuar" }).click();
    await settle(page, 900);
    await page.getByText(/Confirmo que el servicio se ejecutó/).click();
    await settle(page, 500);
    await page.getByText("Así aparece en el reporte").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(page, 500);
    await snap(page, "12-tel-paso3");
    await page.getByRole("button", { name: /Validar cierre/ }).last().click();
    await settle(page, 2500);
    await waitToasts(page);
    await snap(page, "12-tel-validado");
    await close();
  }
  await done();
})();
