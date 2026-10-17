// Capítulo 17 · Bitácora. Run from docs/manual: node tools/capture-17-bitacora.cjs
const { open, snap, settle, url, done } = require("./shoot.cjs");

const only = process.argv[2] ? process.argv[2].split(",") : null;
const want = (k) => !only || only.includes(k);

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

async function mark(page, n, loc, { dx = 0, dy = 0, side = "left", clip } = {}) {
  const b = await loc.boundingBox();
  const vp = clip ?? { x: 0, y: 0, ...page.viewportSize() };
  if (!b) return console.log(`mark ${n}: not visible`);
  const x = (side === "left" ? b.x - 14 : side === "right" ? b.x + b.width + 14 : b.x + b.width / 2) + dx - vp.x;
  const y = (side === "top" ? b.y - 14 : b.y + b.height / 2) + dy - vp.y;
  console.log(`mark ${n}: left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%`);
}

const ORDER = "OS-24388"; // closed, report sent, no survey yet: Administración archives it below

(async () => {
  /* ───────── Administración · escritorio ───────── */
  {
    const { page, close } = await open({ role: "administracion", device: "desktop" });

    // A change with a reason, made today: archive an order whose post-sale cycle is complete.
    await page.goto(url(`/ordenes/${ORDER}`));
    await settle(page, 1300);
    await page.getByRole("button", { name: "Más acciones" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("menuitem", { name: /Archivar/ }).click();
    await settle(page, 700);
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Cliente conforme, sin seguimiento pendiente" }).click().catch(async () => {
      await dlg.locator("textarea").fill("Cliente conforme, sin seguimiento pendiente");
    });
    await dlg.getByRole("checkbox").click({ force: true });
    await page.waitForTimeout(300);
    await dlg.getByRole("button", { name: "Archivar orden" }).click();
    await settle(page, 900);
    await toasts(page, false);

    await page.goto(url("/bitacora"));
    await settle(page, 1500);
    await toasts(page, false);
    await page.mouse.move(700, 5);
    if (want("vista")) {
      await snap(page, "17-bitacora");
      await mark(page, 1, page.getByPlaceholder("Buscar acción, motivo, folio o persona").locator("xpath=.."), { side: "left", dx: 2 });
      await mark(page, 2, page.getByRole("combobox", { name: "Entidad" }), { side: "left", dx: 4 });
      await mark(page, 3, page.getByRole("button", { name: "Hoy", exact: true }), { side: "left", dx: 4 });
      await mark(page, 4, page.getByRole("button", { name: /Excel/ }), { side: "left" });
      await mark(page, 5, page.locator("ol li").filter({ has: page.locator("time") }).first(), { side: "left", dx: -26 });
      await mark(page, 6, page.getByText("Quién registra", { exact: true }), { side: "left" });
    }

    // The whole trail of one order: search its folio.
    await page.getByPlaceholder("Buscar acción, motivo, folio o persona").fill(ORDER);
    await page.getByRole("button", { name: "Todo", exact: true }).click();
    await settle(page, 900);
    await page.mouse.move(700, 5);
    // One entry, close up (the archive, with its reason).
    if (want("entrada")) {
      const entry = page.locator("ol li").filter({ hasText: "Archivada" }).first();
      await entry.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const b = await entry.boundingBox();
      const clip = { x: b.x - 40, y: b.y - 6, width: b.width + 56, height: b.height + 12 };
      await snap(page, "17-entrada", { clip });
      await mark(page, 1, entry.locator("span.font-semibold").first(), { side: "top", clip });
      await mark(page, 2, entry.locator("time"), { side: "top", clip });
      await mark(page, 3, entry.locator("blockquote"), { side: "right", clip });
      await mark(page, 4, entry.locator("a").first(), { side: "right", clip });
    }
    await close();
  }

  /* ───────── Supervisor · teléfono ───────── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.goto(url("/bitacora"));
    await settle(page, 1500);
    if (want("tel")) await snap(page, "17-tel-bitacora");
    await close();
  }
  await done();
})();
