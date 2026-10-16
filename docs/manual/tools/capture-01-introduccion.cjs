// Chapter 01 · Conozca Pulkro Cuadrillas — flow chart of the Centro de ayuda and the Órdenes list on the phone.
const { open, snap, settle, url, done } = require("./shoot.cjs");

(async () => {
  // The operational flow chart (Centro de ayuda › Flujo), with the detail of step 01 open beside it.
  {
    const { page, close } = await open({ role: "administracion", device: "desktop", start: "/ayuda" });
    await page.setViewportSize({ width: 1440, height: 1300 });
    await settle(page, 900);
    await page.mouse.move(5, 5);
    await snap(page, "01-flujo-operativo", { el: page.locator("section#flujo"), padding: 0 });
    await close();
  }
  // Órdenes on the phone, for the supervisor.
  {
    const { page, close } = await open({ role: "supervisor", device: "phone", start: "/ordenes" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 400);
    await snap(page, "01-ordenes-telefono");
    await close();
  }
  await done();
})();
