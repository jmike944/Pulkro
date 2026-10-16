// Capítulo 16 · Clientes. Run from docs/manual: node tools/capture-16-clientes.cjs
const { open, snap, settle, url, done } = require("./shoot.cjs");

const only = process.argv[2] ? process.argv[2].split(",") : null;
const want = (k) => !only || only.includes(k);

async function mark(page, n, loc, { dx = 0, dy = 0, side = "left" } = {}) {
  const b = await loc.boundingBox();
  const vp = page.viewportSize();
  if (!b) return console.log(`mark ${n}: not visible`);
  const x = side === "left" ? b.x - 14 + dx : side === "right" ? b.x + b.width + 14 + dx : b.x + b.width / 2 + dx;
  const y = side === "top" ? b.y - 14 + dy : b.y + b.height / 2 + dy;
  console.log(`mark ${n}: left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%`);
}

const scrollTo = (loc, offset = 0) =>
  loc.evaluate((n, off) => {
    const r = n.getBoundingClientRect();
    const sc = document.getElementById("main-scroll");
    const target = sc && sc.scrollHeight > sc.clientHeight + 4 ? sc : window;
    target.scrollBy(0, r.top - off);
  }, offset);

const CLIENT = "/clientes/cli_03"; // Hospital San Rafael del Norte: services, surveys and complaints

(async () => {
  /* ───────── Administración · escritorio ───────── */
  {
    const { page, close } = await open({ role: "administracion", device: "desktop" });
    await page.goto(url("/clientes"));
    await settle(page, 1300);
    // At 1440 px the client column is too narrow with the full sidebar: collapse it (logo button «Contraer menú»).
    await page.getByRole("button", { name: "Contraer menú" }).click();
    await settle(page, 900);
    await page.mouse.move(700, 5);
    await page.waitForTimeout(300);
    if (want("lista")) {
      // a taller viewport: header, the most active clients and the first rows of the table in one shot
      await page.setViewportSize({ width: 1440, height: 1180 });
      await page.waitForTimeout(700);
      await snap(page, "16-clientes");
      await mark(page, 1, page.getByText("Clientes más activos"), { side: "left" });
      await mark(page, 2, page.getByRole("button", { name: "Servicios", exact: true }).first(), { side: "left" });
      await mark(page, 3, page.getByPlaceholder("Buscar cliente, contacto o municipio"), { side: "left", dx: -30 });
      await mark(page, 4, page.getByRole("button", { name: /Ordenar por servicios/ }), { side: "top" });
      await mark(page, 5, page.getByText("Por qué se quejan", { exact: true }), { side: "left" });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);
    }
    await page.goto(url(CLIENT));
    await settle(page, 1500);
    await page.mouse.move(700, 5);
    if (want("detalle")) {
      // header + hero only (the sites map below needs map tiles from the internet)
      const H = 690;
      await snap(page, "16-cliente-detalle", { clip: { x: 0, y: 0, width: 1440, height: H } });
      const pct = async (n, loc, side, dx = 0) => {
        const b = await loc.boundingBox();
        const x = side === "left" ? b.x - 14 + dx : b.x + b.width / 2 + dx;
        const y = side === "top" ? b.y - 14 : b.y + b.height / 2;
        console.log(`mark ${n}: left:${((x / 1440) * 100).toFixed(1)}%;top:${((y / H) * 100).toFixed(1)}%`);
      };
      await pct(1, page.getByRole("button", { name: "WhatsApp" }), "left");
      await pct(2, page.getByText(/^Servicios para /), "top");
      await pct(3, page.getByText(/^Servicios por mes/), "left");
    }
    if (want("historial")) {
      await page.setViewportSize({ width: 1440, height: 2400 });
      await page.waitForTimeout(700);
      const h = page.getByText("Historial de servicios", { exact: true });
      const hb = await h.boundingBox();
      // left column only (history), the first four services
      const sec = page.locator("section").filter({ has: h }).last();
      const col = await sec.boundingBox();
      const fourth = await sec.locator("li").nth(3).boundingBox();
      await snap(page, "16-historial", { clip: { x: col.x - 16, y: hb.y - 16, width: col.width + 32, height: fourth.y + fourth.height - hb.y + 24 } });
    }
    await close();
  }

  /* ───────── Supervisor · teléfono ───────── */
  {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.goto(url("/clientes"));
    await settle(page, 1300);
    if (want("tel-lista")) {
      await scrollTo(page.getByText("Todos los clientes", { exact: true }), 22);
      await page.waitForTimeout(600);
      await snap(page, "16-tel-clientes");
    }
    await close();
  }
  await done();
})();
