// Capítulo 20 · Configuración — capturas (Dirección en escritorio, Supervisor en teléfono).
const { open, snap, settle, url, done } = require("./shoot.cjs");

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

/** Scrolls the work panel so `loc` sits `offset` px below the top and returns its box. */
async function scrollTo(page, loc, offset = 110) {
  const b = await loc.boundingBox();
  await page.locator("#main-scroll").evaluate((el, d) => el.scrollBy(0, d), b.y - offset);
  await page.waitForTimeout(500);
  return loc.boundingBox();
}

async function region(page, text, stop, tag = "*") {
  return page.evaluate(
    ({ text, stop, tag }) => {
      const el0 = [...document.querySelectorAll(`#main-scroll ${tag}`)].find((el) => el.textContent.trim() === text);
      let el = el0;
      const re = new RegExp(stop);
      while (el && !(re.test(el.className?.toString?.() ?? "") || re.test(el.tagName))) el = el.parentElement;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { text, stop, tag },
  );
}

const clip = (b, pad = 16, maxH = 99999) => ({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: Math.min(maxH, b.height + pad * 2) });

(async () => {
  /* ── Dirección, escritorio ── */
  {
    const { page, close } = await open({ role: "direccion", device: "desktop", start: "/configuracion" });
    await settle(page, 2000);
    await page.mouse.move(2, 600);
    await snap(page, "20-configuracion-escritorio");
    const vp = page.viewportSize();
    for (const [k, loc] of [
      ["perfil", page.getByText("Mi perfil", { exact: true })],
      ["permisos", page.getByRole("button", { name: /Mis permisos/ })],
      ["datos", page.getByRole("button", { name: "Mis datos" })],
      ["tabs", page.getByRole("tab", { name: /Usuarios y permisos/ })],
      ["nuevo", page.getByRole("button", { name: /Nuevo usuario/ })],
      ["filtro", page.getByRole("button", { name: /^Todos · / })],
      ["switch", page.getByRole("switch", { name: /Fernanda/ })],
      ["editar", page.getByRole("listitem").filter({ hasText: "Fernanda Ramos" }).getByRole("button", { name: "Editar" })],
    ]) {
      const b = await loc.first().boundingBox().catch(() => null);
      if (b) console.log("mark", k, "left", pct(b.x - 14, vp.width), "top", pct(b.y + b.height / 2, vp.height), JSON.stringify(b));
    }

    await page.setViewportSize({ width: 1440, height: 1400 });
    await settle(page, 500);

    // Mis permisos
    await page.getByRole("button", { name: /Mis permisos/ }).click();
    await settle(page, 1200);
    await snap(page, "20-mis-permisos", { el: page.getByRole("dialog"), padding: 8 });
    await page.keyboard.press("Escape");
    await settle(page, 500);

    // Mis datos
    await page.getByRole("button", { name: "Mis datos" }).click();
    await settle(page, 900);
    await snap(page, "20-mis-datos", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Editar usuario
    await page.getByRole("listitem").filter({ hasText: "Emilio Saucedo" }).getByRole("button", { name: "Editar" }).click();
    await settle(page, 1000);
    await snap(page, "20-editar-usuario", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Desactivar usuario (supervisor with open orders)
    await page.getByRole("switch", { name: /Daniela Ortiz/ }).click();
    await settle(page, 900);
    await snap(page, "20-desactivar-usuario", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Matriz de permisos (top rows)
    const mt = page.getByText("Matriz de permisos", { exact: true });
    const mb = await scrollTo(page, mt, 120);
    await page.mouse.move(2, 600);
    const rowBottom = await page.evaluate(() => {
      const h = [...document.querySelectorAll("#main-scroll *")].find((el) => el.childElementCount === 0 && el.textContent.trim() === "Matriz de permisos");
      let sec = h;
      while (sec && sec.tagName !== "SECTION") sec = sec.parentElement;
      const lis = sec.querySelectorAll("ul > li");
      return lis[8].getBoundingClientRect().bottom;
    });
    await snap(page, "20-matriz", { clip: { x: mb.x - 16, y: mb.y - 16, width: 1092, height: rowBottom - mb.y + 24 } });
    // pending decisions box
    const pd = page.getByText("Decisiones pendientes de permisos");
    const legend = page.getByText("Permitido", { exact: true }).first();
    const lb = await scrollTo(page, legend, 120);
    await snap(page, "20-matriz-leyenda", { clip: { x: lb.x - 40, y: lb.y - 16, width: 1092, height: 84 } });
    void pd;

    // Catálogos · Clientes y sitios (list), then the first client expanded (left column: the site map needs tiles)
    await page.getByRole("tab", { name: /Catálogos/ }).click();
    await settle(page, 1500);
    await page.locator("#main-scroll").evaluate((el) => el.scrollTo(0, 0));
    const seg = page.getByRole("button", { name: /^Clientes y sitios/ });
    const sb = await scrollTo(page, seg, 120);
    await page.mouse.move(2, 600);
    await snap(page, "20-catalogo-clientes", { clip: { x: sb.x - 16, y: sb.y - 16, width: 1092, height: 548 } });
    const firstClient = page.locator("#main-scroll ul li button[aria-expanded]").first();
    await firstClient.click();
    await settle(page, 1800);
    const left = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("#main-scroll button")].find((x) => x.textContent.trim() === "Agregar sitio");
      let el = btn;
      while (el && !/rounded-\[20px\] bg-soft/.test(el.className)) el = el.parentElement;
      const grid = el.getBoundingClientRect();
      const col = el.firstElementChild.getBoundingClientRect();
      return { x: grid.x, y: grid.y, width: col.right - grid.x + 20, height: grid.height };
    });
    await page.mouse.move(2, 600);
    await snap(page, "20-cliente-detalle", { clip: { x: left.x, y: left.y, width: left.width, height: left.height } });

    // Editar sitio (fields; the map below needs tiles)
    const pen = page.getByRole("button", { name: /^Editar sitio / }).first();
    await pen.click();
    await settle(page, 1500);
    const dlg = await page.getByRole("dialog").boundingBox();
    const loc = await page.getByRole("button", { name: "Usar mi ubicación" }).boundingBox();
    await snap(page, "20-sitio", { clip: { x: dlg.x, y: dlg.y, width: dlg.width, height: loc.y + loc.height + 20 - dlg.y } });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // Tipos de servicio
    await page.getByRole("button", { name: /^Tipos de servicio/ }).click();
    await settle(page, 1500);
    const tb = await scrollTo(page, page.getByRole("button", { name: /^Clientes y sitios/ }), 120);
    await snap(page, "20-catalogo-servicios", { clip: { x: tb.x - 16, y: tb.y - 16, width: 1092, height: 560 } });

    // Privacidad
    // (a tab click right after changing the catalog section leaves the panel blank with reduced motion: load the tab by URL)
    await page.goto(url("/configuracion?tab=privacidad"));
    await settle(page, 2000);
    const ph = page.getByText("Aviso de privacidad", { exact: true }).first();
    const pb = await scrollTo(page, ph, 150);
    await page.mouse.move(2, 600);
    await snap(page, "20-privacidad", { clip: { x: 306, y: pb.y - 76, width: 1092, height: 740 } });

    // Sincronización y datos
    await page.goto(url("/configuracion?tab=sincronizacion"));
    await settle(page, 2500);
    const qh = page.getByText("Cola de sincronización", { exact: true }).first();
    const qb = await scrollTo(page, qh, 150);
    await page.mouse.move(2, 600);
    await snap(page, "20-sincronizacion", { clip: { x: 306, y: qb.y - 90, width: 1092, height: 560 } });
    const dd = page.getByText("Almacenamiento local", { exact: true });
    const db = await scrollTo(page, dd, 100);
    const bk = await page.getByRole("button", { name: "Exportar respaldo (JSON)" }).boundingBox();
    await snap(page, "20-datos-dispositivo", { clip: { x: db.x - 16, y: db.y - 16, width: 1384 - db.x + 16, height: bk.y + bk.height + 76 - db.y } });
    // Restablecer datos de demostración (confirmation)
    await page.getByRole("button", { name: "Restablecer datos de demostración" }).click();
    await settle(page, 900);
    await snap(page, "20-restablecer", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await close();
  }

  /* ── Supervisor, teléfono ── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/configuracion" });
    await settle(page, 2000);
    await snap(page, "20-telefono-supervisor");
    await close();
  }
  await done();
})();
