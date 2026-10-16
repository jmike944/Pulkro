// Capítulo 15 · Encuesta de satisfacción (lo que ve el cliente). Run from docs/manual: node tools/capture-15-encuesta.cjs
// One phone profile: the supervisor generates a survey link, opens it (staff-session screen), signs out and answers it as the
// client would, and opens the link again once answered.
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

/** Scroll the phone page (window or the app's scroller) so `loc` sits `offset` px from the top. */
const scrollTo = (loc, offset = 0) =>
  loc.evaluate((n, off) => {
    const r = n.getBoundingClientRect();
    const sc = document.getElementById("main-scroll");
    const target = sc && sc.scrollHeight > sc.clientHeight + 4 ? sc : window;
    target.scrollBy(0, r.top - off);
  }, offset);

(async () => {
  const { page, ctx, close } = await open({ role: "supervisor", device: "phone" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url("/").replace(/\/$/, "") });

  // 1 · Copy the link of a pending survey: Postventa → Encuestas → Pendientes → Acciones → Copiar enlace.
  await page.goto(url("/postventa"));
  await settle(page, 1300);
  await page.getByText(/^Encuestas/).first().click();
  await settle(page, 1000);
  await page.getByRole("button", { name: /^Pendientes/ }).click();
  await settle(page, 800);
  await page.getByRole("button", { name: "Acciones" }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: "Copiar enlace" }).click();
  await page.waitForTimeout(900);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  console.log("survey link:", link);

  // 2 · Opened on a device with a Pulkro session: the page asks to sign out first.
  await page.goto(link);
  await settle(page, 1600);
  if (want("sesion")) await snap(page, "15-sesion-abierta");
  await page.getByRole("button", { name: "Cerrar sesión y abrir como cliente" }).click();
  await settle(page, 1200);
  const confirm = page.getByRole("button", { name: /^Cerrar sesión$/ });
  if (await confirm.count()) {
    await confirm.click();
    await settle(page, 1200);
  }
  await page.goto(link);
  await settle(page, 2200);

  // 3 · The wizard, as the client sees it.
  if (want("inicio")) await snap(page, "15-inicio");
  await page.getByRole("radio", { name: /^5 de 5/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("radiogroup", { name: "Puntualidad" }).getByRole("radio", { name: /^4 de 5/ }).click();
  await page.waitForTimeout(900);
  if (want("paso2")) {
    await scrollTo(page.getByText(/^Paso 2 de 4/), 120);
    await page.waitForTimeout(500);
    await snap(page, "15-paso-2");
  }
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("radio", { name: "9 de 10" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(900);
  await page.getByLabel("Comentario").fill("Muy puntuales y el lobby quedó impecable. Gracias al equipo.");
  await page.locator("#sv-name").fill("Gabriela Ríos");
  await page.locator("#sv-name").blur();
  await page.waitForTimeout(600);
  if (want("paso4")) {
    await scrollTo(page.getByText(/^Paso 4 de 4/), 120);
    await page.waitForTimeout(500);
    await snap(page, "15-paso-4");
  }
  await page.getByRole("button", { name: "Enviar respuesta" }).click();
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (want("gracias")) await snap(page, "15-gracias");

  // 4 · The same link opened again.
  await page.reload();
  await settle(page, 2500);
  if (want("respondida")) await snap(page, "15-ya-respondida");

  await close();
  await done();
})();
