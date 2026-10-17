// Chapter 03 · La pantalla y la navegación — desktop shell anatomy (with marker positions), collapsed sidebar, unit picker,
// ⌘K search, notifications, user menu, phone tab bar / Menú sheet / search / notifications, Perfil and dark theme.
const { open, snap, settle, url, done } = require("./shoot.cjs");

/** Prints a marker position (center of the box, nudged by dx/dy CSS px) in % of the viewport. */
async function mark(page, n, locator, { dx = 0, dy = 0, at = "center" } = {}) {
  const box = await locator.first().boundingBox();
  const vp = page.viewportSize();
  if (!box) return console.log(`mark ${n}: not visible`);
  const x = (at === "right" ? box.x + box.width : at === "left" ? box.x : box.x + box.width / 2) + dx;
  const y = box.y + box.height / 2 + dy;
  console.log(`<span class="mark" style="left:${((x / vp.width) * 100).toFixed(1)}%;top:${((y / vp.height) * 100).toFixed(1)}%">${n}</span>`);
}

(async () => {
  // 1 · Anatomy: Administración on Clientes (Seguimiento open, Operación closed with its count).
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/clientes" });
    await page.mouse.move(1000, 600);
    await settle(page, 600);
    const aside = page.locator("aside");
    await snap(page, "03-escritorio-anatomia");
    await mark(page, 1, aside.getByRole("button", { name: "Contraer menú" }), { at: "right", dx: -110 });
    await mark(page, 2, aside.getByText("Matriz Monterrey"), { at: "right", dx: 40 });
    await mark(page, 3, aside.getByRole("link", { name: "Nueva orden" }), { at: "right", dx: -50 });
    await mark(page, 4, aside.getByRole("link", { name: "Inicio" }), { at: "right", dx: -120 });
    await mark(page, 5, aside.getByRole("button", { name: /^Operación/ }), { at: "right", dx: -110 });
    await mark(page, 6, aside.getByRole("button", { name: /^Seguimiento/ }), { at: "right", dx: -70 });
    await mark(page, 7, aside.getByRole("link", { name: "Centro de ayuda" }), { at: "right", dx: -50 });
    await mark(page, 8, aside.getByText("Sincronizado"), { at: "left", dx: -16 });
    await mark(page, 9, aside.getByRole("button", { name: "Menú de usuario" }), { dx: 0, dy: -30 });
    await mark(page, 10, page.locator('nav[aria-label="Ruta"]'), { at: "left", dx: -26 });
    await mark(page, 11, page.locator('[data-search-origin="pill"]'), { at: "left", dx: -26 });
    await mark(page, 12, page.getByRole("button", { name: /^Notificaciones/ }), { at: "left", dx: -26 });
    await mark(page, 13, page.getByRole("heading", { level: 1, name: "Clientes" }), { at: "right", dx: 30 });
    // Hand-tuned so no marker covers a label (left % / top % of the image; the chapter converts them to the .frame box, which adds 7pt of padding around the image):
    // 1 15.3/4.2 · 2 16.0/10.1 · 3 16.0/16.9 · 4 16.0/22.2 · 5 18.9/31.6 · 6 13.3/36.2 · 7 15.5/84.8 · 8 18.4/91.4 · 9 18.4/96.8 ·
    // 10 20.6/4.8 · 11 46.2/4.8 · 12 91.1/4.8 · 13 33.9/14.8 (left % / top % of the image; the chapter converts them to the .frame box, which adds 7pt of padding around the image).

    // User menu (crop around the menu and the user row).
    await aside.getByRole("button", { name: "Menú de usuario" }).click();
    await settle(page, 600);
    const menu = page.getByRole("menu");
    const mb = await menu.boundingBox();
    await snap(page, "03-menu-usuario", { clip: { x: 0, y: mb.y - 16, width: 290, height: 900 - (mb.y - 16) } });
    await page.keyboard.press("Escape");
    await settle(page, 400);

    // ⌘K search with a query.
    await page.keyboard.press("Control+k");
    await settle(page, 900);
    await page.keyboard.type("hilton");
    await settle(page, 800);
    await snap(page, "03-buscar", { el: page.getByRole("dialog"), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 700);
    await close();
  }
  // 2 · Notifications (Administración: a blocking incident and reports sent).
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/ordenes" });
    await page.getByRole("button", { name: /^Notificaciones/ }).first().click();
    await settle(page, 800);
    await snap(page, "03-notificaciones", { el: page.locator('[data-slot="popover-content"]'), padding: 0 });
    await page.keyboard.press("Escape");
    await settle(page, 400);
    await close();
  }
  // 3 · Collapsed sidebar with the Operación flyout (Administración on Órdenes).
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/ordenes" });
    await page.getByRole("button", { name: "Contraer menú" }).click();
    await settle(page, 900);
    await page.mouse.move(1000, 600);
    await page.locator("aside nav li button").first().click();
    await settle(page, 700);
    await snap(page, "03-menu-contraido", { clip: { x: 0, y: 0, width: 470, height: 560 } });
    await close();
  }
  // 4 · Unit picker (Dirección).
  {
    const { page, close } = await open({ role: "direccion", device: "desktop" });
    await page.locator("aside").getByRole("button").filter({ hasText: "Pulkro" }).first().click();
    await settle(page, 600);
    await snap(page, "03-unidad", { clip: { x: 0, y: 60, width: 290, height: 240 } });
    await close();
  }
  // 5 · Phone: Menú sheet for Supervisor and Dirección.
  for (const role of ["supervisor", "direccion"]) {
    const { page, close } = await open({ role, device: "phone" });
    await page.getByRole("button", { name: /^Menú/ }).click();
    await settle(page, 900);
    await snap(page, `03-menu-telefono-${role}`);
    await close();
  }
  // 6 · Phone: notifications (supervisor, on Hoy).
  {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await page.getByRole("button", { name: /^Notificaciones/ }).first().click();
    await settle(page, 900);
    await snap(page, "03-notificaciones-telefono");
    await close();
  }
  // 7 · Phone: Perfil (Dirección, with the unit card).
  {
    const { page, close } = await open({ role: "direccion", device: "phone", start: "/perfil" });
    await snap(page, "03-perfil-telefono");
    await close();
  }
  // 8 · Theme: Perfil › Apariencia in light and dark (Sistema follows the phone), and a dark desktop.
  for (const theme of ["light", "dark"]) {
    const { page, close } = await open({ role: "supervisor", device: "phone", theme, start: "/perfil" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settle(page, 600);
    await snap(page, `03-apariencia-${theme}`);
    await close();
  }
  {
    const { page, close } = await open({ role: "supervisor", device: "desktop", theme: "dark" });
    await page.mouse.move(1000, 600);
    await settle(page, 400);
    await snap(page, "03-oscuro-escritorio");
    await close();
  }
  await done();
})();
