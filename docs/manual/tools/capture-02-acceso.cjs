// Chapter 02 · Entrar a la app — sign-in screens of the account build (PK_BASE, default http://localhost:3200), the demo
// profile picker (http://localhost:3100) and the install card in Perfil.
const ACCOUNT = process.env.PK_BASE ?? "http://localhost:3200";
const DEMO = "http://localhost:3100";
process.env.PK_BASE = ACCOUNT;
const { open, snap, settle, done } = require("./shoot.cjs");

const CARD = 'div[class*="max-w-[440px]"]';

(async () => {
  // Desktop sign-in form, then the form with an error, then «¿Olvidó su contraseña?».
  {
    const { page, close } = await open({ role: null, device: "desktop" });
    await page.mouse.move(5, 5);
    await settle(page, 900);
    await snap(page, "02-entrar-escritorio");

    await page.getByLabel("Correo electrónico").fill("daniela.ortiz@pulkro.com.mx");
    await page.getByRole("button", { name: /^Entrar/ }).first().click();
    await page.mouse.move(5, 5);
    await settle(page, 700);
    // The card down to the «Entrar» button: the heading, both fields and the notice.
    const card = await page.locator(CARD).boundingBox();
    const btn = await page.getByRole("button", { name: /^Entrar/ }).first().boundingBox();
    await snap(page, "02-entrar-error", { clip: { x: card.x - 16, y: card.y - 16, width: card.width + 32, height: btn.y + btn.height - card.y + 40 } });

    await page.getByRole("button", { name: "¿Olvidó su contraseña?" }).click();
    await page.mouse.move(5, 5);
    await settle(page, 900);
    await snap(page, "02-recuperar", { el: page.locator(CARD) });
    await close();
  }
  // Phone: the password page opened without a complete link.
  {
    const { page, close } = await open({ role: null, device: "phone" });
    await page.goto(`${ACCOUNT}/acceso/definir-contrasena`);
    await settle(page, 1200);
    await snap(page, "02-enlace-incompleto-telefono");
    await close();
  }
  // Demo build: the profile picker.
  {
    const { page, close } = await open({ role: null, device: "desktop", start: "/" });
    await page.goto(`${DEMO}/login`);
    await settle(page, 1600);
    await page.mouse.move(5, 5);
    await snap(page, "02-demo-perfiles", { el: page.locator(CARD) });
    await close();
  }
  await done();

  // Demo build, phone: the «Instalar Pulkro» card of Perfil (a separate helper instance bound to the demo build).
  delete require.cache[require.resolve("./shoot.cjs")];
  process.env.PK_BASE = DEMO;
  const demo = require("./shoot.cjs");
  {
    const { page, close } = await demo.open({ role: "supervisor", device: "phone", start: "/perfil" });
    await settle(page, 900);
    await demo.snap(page, "02-instalar-tarjeta", { el: page.locator("section").filter({ hasText: "Instalar Pulkro" }).first(), padding: 12 });
    await close();
  }
  await demo.done();
})();
