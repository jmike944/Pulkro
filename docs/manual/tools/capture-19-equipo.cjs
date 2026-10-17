// Capítulo 19 · Equipo — capturas (Dirección y Administración).
const { open, snap, settle, url, done } = require("./shoot.cjs");

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

async function boxOfText(page, text, stop) {
  return page.evaluate(
    ({ text, stop }) => {
      const el0 = [...document.querySelectorAll("#main-scroll *")].find((el) => el.childElementCount === 0 && el.textContent.trim() === text);
      let el = el0;
      const re = new RegExp(stop);
      while (el && !re.test(el.className?.toString?.() ?? "")) el = el.parentElement;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { text, stop },
  );
}

(async () => {
  /* ── Dirección, escritorio ── */
  {
    const { page, close } = await open({ role: "direccion", device: "desktop", start: "/equipo" });
    await settle(page, 2000);
    await page.mouse.move(2, 600);
    await snap(page, "19-equipo-escritorio");
    const vp = page.viewportSize();
    for (const [k, loc] of [
      ["activo", page.getByText("Personal activo", { exact: true })],
      ["barras", page.getByText(/^Personas asignadas/)],
      ["tabs", page.getByRole("tab", { name: /Personal/ })],
    ]) {
      const b = await loc.boundingBox().catch(() => null);
      if (b) console.log("mark", k, "left", pct(b.x - 14, vp.width), "top", pct(b.y + b.height / 2, vp.height), JSON.stringify(b));
    }

    await page.setViewportSize({ width: 1440, height: 1400 });
    await settle(page, 500);
    // list: toolbar + first rows
    await page.locator("#main-scroll").evaluate((el) => {
      const t = [...el.querySelectorAll("input")].find((i) => i.placeholder?.startsWith("Buscar por nombre"));
      el.scrollBy(0, t.getBoundingClientRect().top - 140);
    });
    await page.waitForTimeout(600);
    const search = await page.getByPlaceholder("Buscar por nombre, especialidad o teléfono").boundingBox();
    const tabs = await page.getByRole("tablist").last().boundingBox();
    await page.mouse.move(2, 600);
    await snap(page, "19-personal-lista", { clip: { x: tabs.x - 16, y: tabs.y - 16, width: 1100, height: 760 } });
    console.log("search", JSON.stringify(search), "tabs", JSON.stringify(tabs));

    // worker profile (desktop right sheet)
    await page.getByRole("button", { name: "Ver perfil de Ana Mendoza Ortiz" }).click();
    await settle(page, 1200);
    const dlg = page.getByRole("dialog");
    const db = await dlg.boundingBox();
    console.log("sheet", JSON.stringify(db));

    // edit inside the sheet: deactivate with open jornadas
    await page.getByRole("button", { name: "Editar datos" }).click();
    await settle(page, 800);
    await page.getByRole("switch", { name: "Activo" }).click();
    await settle(page, 800);
    await snap(page, "19-editar-trabajador", { clip: { x: db.x, y: 0, width: db.width, height: 700 } });
    await page.goto(url("/equipo"));
    await settle(page, 1500);

    // supervisors tab
    await page.getByRole("tab", { name: /Supervisores/ }).click();
    await settle(page, 1500);
    const t2 = await page.getByRole("tablist").last().boundingBox();
    await page.locator("#main-scroll").evaluate((el, y) => el.scrollBy(0, y - 120), t2.y);
    await page.waitForTimeout(600);
    const t3 = await page.getByRole("tablist").last().boundingBox();
    await page.mouse.move(2, 600);
    await snap(page, "19-supervisores", { clip: { x: t3.x - 16, y: t3.y + t3.height + 8, width: 1100, height: 500 } });
    await close();
  }

  /* ── Administración, teléfono ── */
  {
    const { page, close } = await open({ role: "administracion", device: "phone", start: "/equipo" });
    await settle(page, 2000);
    const s = await page.getByRole("tablist").last().boundingBox();
    await page.evaluate((y) => window.scrollBy(0, y - 24), s.y);
    await settle(page, 600);
    await snap(page, "19-telefono-lista");
    const first = page.getByRole("button", { name: /^Ver perfil de / }).nth(2);
    await first.click();
    await settle(page, 1500);
    await snap(page, "19-telefono-ficha");
    await close();
  }
  await done();
})();
