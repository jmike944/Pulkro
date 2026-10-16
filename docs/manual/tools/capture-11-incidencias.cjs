// Capítulo 11 · Incidencias. Run from docs/manual: node tools/capture-11-incidencias.cjs
const { open, snap, settle, url, done } = require("./shoot.cjs");

async function mark(page, loc, label, dx = 0, dy = 0) {
  const b = await loc.first().boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(label, "not visible");
  console.log(`${label}: left:${(((b.x + dx) / vp.width) * 100).toFixed(1)}%;top:${(((b.y + b.height / 2 + dy) / vp.height) * 100).toFixed(1)}%`);
}
const waitToasts = (page) => page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 20000 }).catch(() => {});

const DESC = "Se desprendió una loseta del piso de producción al mover la tarima de material; el área quedó acordonada.";

(async () => {
  /* ── desktop: register, list, detail, resolve ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", start: "/incidencias" });
    await settle(page, 1200);
    await page.getByRole("button", { name: "Registrar incidencia" }).click();
    await settle(page, 900);
    const dlg = page.getByRole("dialog");

    await dlg.getByText("OS-24397").first().click();
    await settle(page, 900);
    await dlg.getByRole("button", { name: /Daños/ }).click();
    await dlg.getByRole("button", { name: "Alta", exact: true }).click();
    await settle(page, 500);
    await snap(page, "11-reg-tipo", { el: dlg, padding: 0 });

    await dlg.locator("#inc-desc").fill(DESC);
    await dlg.getByRole("button", { name: /Simular/ }).click();
    await settle(page, 600);
    await dlg.getByRole("switch", { name: "Impide el cierre" }).click();
    await settle(page, 700);
    await waitToasts(page);
    await dlg.locator("#inc-desc").evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return (p.scrollTop = p.scrollHeight);
    });
    await page.mouse.move(5, 890);
    await settle(page, 500);
    await snap(page, "11-reg-detalle", { el: dlg, padding: 0 });
    await dlg.getByRole("button", { name: "Registrar incidencia" }).click();
    await settle(page, 1500);
    await waitToasts(page);
    // the new incident opens in the side panel: close it to see the page
    await page.keyboard.press("Escape");
    await settle(page, 900);
    await page.goto(url("/incidencias"));
    await settle(page, 1500);
    await mark(page, page.getByRole("button", { name: "Registrar incidencia" }), "m1 registrar");
    await mark(page, page.getByText("Bloquean cierre", { exact: true }), "m2 bloquean");
    await mark(page, page.getByText("Por tipo", { exact: true }), "m3 por tipo");
    await snap(page, "11-incidencias");

    // Detail sheet
    await page.getByRole("button", { name: /· Daños$/ }).first().click();
    await settle(page, 1200);
    const sheet = page.getByRole("dialog");
    await snap(page, "11-detalle", { el: sheet, padding: 0 });
    await sheet.getByRole("button", { name: "Se resolvió en sitio y se informó al contacto." }).click();
    await settle(page, 500);
    const form = sheet.locator("#inc-resolution").locator("xpath=ancestor::section[1]");
    await page.mouse.move(5, 890);
    await snap(page, "11-resolucion", { el: form, padding: 12 });
    await sheet.getByRole("button", { name: /Marcar como resuelta/ }).click();
    await settle(page, 2000);
    await waitToasts(page);
    await close();
  }

  /* ── phone: register flow and resolution ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/incidencias" });
    await settle(page, 1200);
    await page.getByRole("button", { name: "Registrar incidencia" }).click();
    await settle(page, 1000);
    await page.getByRole("dialog").getByText(/OS-24397/).first().click();
    await settle(page, 900);
    await page.getByRole("button", { name: /Faltante de material/ }).click();
    await settle(page, 400);
    await snap(page, "11-tel-tipo");
    await page.getByRole("button", { name: "Continuar" }).click();
    await settle(page, 900);
    await page.locator("#inc-desc").fill("Faltó desengrasante industrial para la segunda nave; se pidió reposición al almacén.");
    await page.getByRole("button", { name: /Simular/ }).click();
    await settle(page, 600);
    await page.getByRole("switch", { name: "Impide el cierre" }).click();
    await settle(page, 700);
    await waitToasts(page);
    await page.getByRole("switch", { name: "Impide el cierre" }).evaluate((el) => el.closest("label").scrollIntoView({ block: "center" }));
    await settle(page, 400);
    await snap(page, "11-tel-detalle");
    await page.getByRole("button", { name: "Registrar incidencia" }).last().click();
    await settle(page, 1800);
    await waitToasts(page);
    await snap(page, "11-tel-registrada");
    await page.getByRole("button", { name: "Ver incidencia" }).click();
    await settle(page, 1500);
    await page.getByRole("button", { name: "Se repuso el material faltante." }).click();
    await settle(page, 400);
    await page.getByRole("button", { name: /Marcar como resuelta/ }).click();
    await settle(page, 2000);
    await waitToasts(page);
    await settle(page, 800);
    await snap(page, "11-tel-resuelta");
    await close();
  }
  await done();
})();
