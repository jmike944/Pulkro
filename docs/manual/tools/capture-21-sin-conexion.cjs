// Capítulo 21 · Trabajo sin conexión y sincronización — capturas (Supervisor).
// The connection is cut with context.setOffline(true) after the pages are loaded; captures are then made without signal.
const { open, snap, settle, url, done } = require("./shoot.cjs");

const X = process.env.PK_DEBUG ? "/tmp/claude-0/-home-user-Pulkro/49332940-e632-5f5e-907e-ccb3000c838a/scratchpad/x/" : null;

/** Adds a note and two DESPUÉS photos to the jornada on screen (works without connection). */
async function captureSomething(page) {
  // bitácora note (quick chip fills the text)
  await page.getByRole("button", { name: "Retiro de residuos completado" }).click();
  await page.waitForTimeout(300);
  const add = page.getByRole("button", { name: "Agregar", exact: true });
  if (await add.isEnabled()) await add.click();
  await settle(page, 600);
  // photos DESPUÉS: the second capture block on the page
  const sample = page.getByRole("button", { name: /foto de ejemplo/ });
  const n = await sample.count();
  await sample.nth(n - 1).click();
  await settle(page, 1200);
  await page.getByRole("button", { name: /^Piso de producción/ }).last().click().catch(() => {});
  await page.waitForTimeout(300);
  await sample.nth(n - 1).click();
  await settle(page, 1200);
  // let the confirmation toasts go away
  await page.mouse.move(2, 400);
  await page.waitForTimeout(6000);
}

(async () => {
  /* ── Teléfono ── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "phone", start: "/jornada/jor_00387" });
    await settle(page, 1500);
    // load Hoy and the report page once online so the offline navigation has them
    await ctx.setOffline(true);
    await page.waitForTimeout(1500);
    await captureSomething(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 800);
    await snap(page, "21-telefono-jornada");
    if (X) await page.screenshot({ path: X + "21-j-full.jpg", fullPage: true, type: "jpeg", quality: 50 });

    // Hoy: pill above the tab bar and dot on the avatar
    await page.getByRole("link", { name: "Hoy" }).click();
    await settle(page, 2500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, "21-telefono-hoy");

    // the queue sheet
    await page.getByRole("button", { name: /Abrir la cola de sincronización/ }).click();
    await settle(page, 1200);
    await snap(page, "21-telefono-cola");
    await page.keyboard.press("Escape");
    await settle(page, 600);

    // report of a finished order, generated offline: sharing waits for the sync
    await page.goto(url("/ordenes/OS-24395/reporte")).catch(() => {});
    await settle(page, 2500);
    await page.getByRole("button", { name: /^Generar PDF/ }).first().click();
    await settle(page, 4000);
    await page.mouse.move(2, 400);
    await page.waitForTimeout(5000);
    if (X) await page.screenshot({ path: X + "21-rep.jpg", type: "jpeg", quality: 50, fullPage: true });
    const gate = page.getByText(/aún no (llega|llegan) al servidor/).first();
    const gb = await gate.boundingBox().catch(() => null);
    console.log("gate", JSON.stringify(gb));
    if (gb) {
      await page.evaluate((y) => window.scrollBy(0, y - 330), gb.y);
      await settle(page, 600);
      await snap(page, "21-telefono-reporte");
    }
    await close();
  }

  /* ── Escritorio ── */
  {
    const { page, ctx, close } = await open({ role: "supervisor", device: "desktop", start: "/jornada/jor_00387" });
    await settle(page, 1500);
    await page.mouse.move(2, 400);
    const chip = page.getByRole("button", { name: /^Sincronizado/ }).first();
    console.log("chip", JSON.stringify(await chip.boundingBox().catch(() => null)));
    await ctx.setOffline(true);
    await page.waitForTimeout(1500);
    await captureSomething(page);
    await page.locator("#main-scroll").evaluate((el) => el.scrollTo(0, 0));
    await page.mouse.move(2, 400);
    await settle(page, 800);
    await snap(page, "21-escritorio-sin-conexion");

    // the sync sheet
    await page.getByRole("button", { name: /^Sin conexión/ }).first().click();
    await settle(page, 1200);
    const sh = await page.getByRole("dialog").boundingBox();
    await snap(page, "21-cola-escritorio", { clip: { x: sh.x, y: 0, width: sh.width, height: 450 } });
    await page.keyboard.press("Escape");
    await settle(page, 600);

    await close();
  }
  await done();
})();
