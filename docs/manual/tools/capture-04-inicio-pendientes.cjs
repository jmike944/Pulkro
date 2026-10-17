// Chapter 04 · Inicio y Pendientes — desktop Inicio per role (with marker positions), its sections, phone Hoy and Pendientes.
const { open, snap, settle, done } = require("./shoot.cjs");

async function mark(page, n, locator, { dx = 0, dy = 0, at = "center" } = {}) {
  const box = await locator.first().boundingBox();
  const vp = page.viewportSize();
  if (!box) return console.log(`mark ${n}: not visible`);
  const x = (at === "right" ? box.x + box.width : at === "left" ? box.x : box.x + box.width / 2) + dx;
  const y = box.y + box.height / 2 + dy;
  console.log(`<span class="mark" style="left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%">${n}</span>`);
}

/** Lets the work panel grow to its full height (the shell scrolls inside #main-scroll), so a section below the fold can be cropped. */
async function tall(page) {
  const h = await page.evaluate(() => document.getElementById("main-scroll")?.scrollHeight ?? 900);
  await page.setViewportSize({ width: 1440, height: Math.min(h + 140, 6000) });
  await settle(page, 700);
}

const section = (page, title) => page.locator("section").filter({ has: page.getByRole("heading", { name: title }) }).first();

(async () => {
  // 1 · Inicio de Dirección (top of the page, markers).
  {
    const { page, close } = await open({ role: "direccion", device: "desktop" });
    await page.mouse.move(1430, 890);
    await settle(page, 600);
    await snap(page, "04-inicio-direccion");
    await mark(page, 1, page.getByRole("heading", { level: 1 }), { at: "right", dx: 30 });
    await mark(page, 2, page.getByRole("button", { name: /^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)$/ }), { at: "left", dx: -30 });
    await mark(page, 3, page.getByText("En proceso", { exact: true }), { at: "right", dx: 26 });
    await mark(page, 4, page.getByText(/^Terminados en \d{4}$/), { at: "right", dx: 30 });
    await mark(page, 5, page.getByText("Hoy en campo", { exact: true }), { at: "right", dx: 30 });
    // The chapter uses these positions, nudged by hand so no marker covers a label (left % / top % of the image; the chapter converts them to the .frame box, which adds 7pt of padding around the image):
    // 1 53.1/14.8 · 2 44.2/33.4 · 3 54.0/64.6 · 4 70.0/29.3 · 5 60.5/45.0 (month bars) · 6 42.0/80.0 (Hoy en campo).
    await close();
  }
  // 2 · Inicio del supervisor: Hoy en campo and the attention list with its action buttons.
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop" });
    await page.mouse.move(1430, 10);
    await tall(page);
    await snap(page, "04-hoy-en-campo", { el: section(page, "Hoy en campo"), padding: 12 });
    await snap(page, "04-atencion-supervisor", { el: page.locator("section").filter({ has: page.getByText(/^Requieren atención/) }).last(), padding: 12 });
    await close();
  }
  // 3 · Hoy on the phone: supervisor (jornada en curso), Administración (its next step) and Dirección's figures further down.
  {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.mouse.move(1, 1);
    await settle(page, 400);
    await snap(page, "04-hoy-telefono-supervisor");
    await close();
  }
  {
    const { page, close } = await open({ role: "administracion", device: "phone" });
    await page.mouse.move(1, 1);
    await settle(page, 400);
    await snap(page, "04-hoy-telefono-administracion");
    await close();
  }
  {
    const { page, close } = await open({ role: "direccion", device: "phone" });
    const y = await page.getByText("Servicios terminados", { exact: true }).boundingBox();
    await page.evaluate((top) => window.scrollBy(0, top - 90), y.y);
    await settle(page, 600);
    await snap(page, "04-hoy-telefono-direccion-cifras");
    await close();
  }
  // 4 · Pendientes on desktop: supervisor (hero) and Administración (list with «Todo»).
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", start: "/pendientes" });
    await page.mouse.move(1430, 890);
    await settle(page, 400);
    await snap(page, "04-pendientes-supervisor");
    await mark(page, 1, page.getByRole("heading", { level: 1 }), { at: "right", dx: 30 });
    await close();
  }
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/pendientes" });
    await page.getByRole("radio", { name: /^Todo/ }).click().catch(() => page.getByRole("button", { name: /^Todo/ }).click());
    await page.mouse.move(1430, 10);
    await tall(page);
    const list = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Todo lo pendiente/ }) }).first();
    const box = await list.boundingBox();
    await snap(page, "04-pendientes-lista", { clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: 860 } });
    await close();
  }
  // 5 · Pendientes on the phone (supervisor).
  for (const role of ["supervisor"]) {
    const { page, close } = await open({ role, device: "phone", start: "/pendientes" });
    // The pointer left over from signing in would highlight one legend chip and dim the others.
    await page.mouse.move(1, 1);
    await settle(page, 600);
    await snap(page, `04-pendientes-telefono-${role}`);
    await close();
  }
  await done();
})();
