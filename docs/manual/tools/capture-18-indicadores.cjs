// Capítulo 18 · Indicadores — capturas (Dirección y Administración).
const { open, snap, settle, url, done } = require("./shoot.cjs");

/** Bounding box (CSS px) of the closest ancestor of the element whose own text is `text` that matches `stop`. */
async function regionOf(page, text, stop, nth = 0) {
  return page.evaluate(
    ({ text, stop, nth }) => {
      const all = [...document.querySelectorAll("#main-scroll *, [role=dialog] *")].filter(
        (el) => el.childElementCount === 0 && el.textContent.trim() === text,
      );
      let el = all[nth];
      if (!el) return null;
      const re = new RegExp(stop);
      while (el && !(re.test(el.className?.toString?.() ?? "") || re.test(el.tagName))) el = el.parentElement;
      if (!el) return null;
      el.scrollIntoView({ block: "start" });
      const sc = document.getElementById("main-scroll");
      if (sc && sc.scrollTop > 0) sc.scrollBy(0, -96);
      else window.scrollBy(0, -96);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { text, stop, nth },
  );
}

async function clipShot(page, name, box, pad = 16, maxH) {
  await page.mouse.move(2, 600);
  await page.waitForTimeout(700);
  const vp = page.viewportSize();
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const height = Math.min(maxH ?? 99999, box.height + pad * 2, vp.height - y);
  await snap(page, name, { clip: { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height } });
}

/** The export buttons overflow the panel at desktop widths: give them their natural width for the picture. */
async function fixExport(page) {
  await page.evaluate(() => {
    for (const label of ["Exportar", "Imprimir / PDF"]) {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
      if (b) b.style.width = "auto";
    }
  });
  await page.waitForTimeout(300);
}

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

(async () => {
  /* ── Dirección, escritorio ── */
  {
    const { page, close } = await open({ role: "direccion", device: "desktop", start: "/indicadores" });
    await settle(page, 2200);
    await fixExport(page);
    await page.mouse.move(2, 600);
    await page.waitForTimeout(500);
    await snap(page, "18-indicadores-escritorio");
    // markers (left of / above the control they point at)
    const vp = page.viewportSize();
    const marks = [
      ["tabs", page.getByRole("tab", { name: /Operación/ })],
      ["granularidad", page.getByRole("radio", { name: "Mes" }).or(page.getByRole("button", { name: "Mes", exact: true })).first()],
      ["periodo", page.getByRole("button", { name: "Elegir periodo" })],
      ["unidad", page.getByRole("button", { name: "Elegir unidad" })],
      ["exportar", page.getByRole("button", { name: "Exportar" })],
      ["embudo", page.getByText("Del plan al cliente")],
      ["ciclo", page.getByText("Ciclo completo")],
    ];
    for (const [k, loc] of marks) {
      const b = await loc.boundingBox().catch(() => null);
      if (b) console.log("mark", k, "left", pct(b.x - 14, vp.width), "top", pct(b.y + b.height / 2, vp.height), JSON.stringify(b));
    }

    // taller viewport for the section crops
    await page.setViewportSize({ width: 1440, height: 1500 });
    await settle(page, 600);
    // where the work is + how it advances
    let box = await regionOf(page, "Cómo avanza el trabajo", "^SECTION$");
    await clipShot(page, "18-donde-avanza", box, 20);
    // services chart
    box = await regionOf(page, "Servicios por día", "rounded-\\[22px\\]");
    await clipShot(page, "18-servicios", box);
    // hours + incidents (one row of two cards)
    const hb = await regionOf(page, "Horas reales por servicio", "rounded-\\[22px\\]");
    const ib = await page.evaluate(() => {
      const el = [...document.querySelectorAll("#main-scroll h2")].find((x) => x.textContent.trim() === "Incidencias por tipo");
      let p = el;
      while (p && !/rounded-\[22px\]/.test(p.className)) p = p.parentElement;
      const r = p.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await clipShot(page, "18-horas-incidencias", { x: hb.x, y: hb.y, width: ib.x + ib.width - hb.x, height: Math.max(hb.height, ib.height) });

    // Fase 2
    box = await regionOf(page, "Requiere captura adicional", "^SECTION$");
    await clipShot(page, "18-fase2", box, 20);

    // drill-down sheet from the funnel
    await page.locator("#main-scroll").evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^En ejecución: / }).click();
    await settle(page, 1000);
    const sheet = page.getByRole("dialog");
    const sb = await sheet.boundingBox();
    await snap(page, "18-detalle", { clip: { x: sb.x, y: 0, width: sb.width, height: 470 } });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Calidad
    await page.getByRole("tab", { name: /Calidad/ }).click();
    await settle(page, 1800);
    box = await regionOf(page, "Satisfacción del cliente", "bg-aurora-frame|rounded-\\[28px\\]|aurora");
    console.log("sat box", JSON.stringify(box));
    if (box) await clipShot(page, "18-satisfaccion", box);
    box = await regionOf(page, "Cumplimiento fotográfico", "^SECTION$");
    await clipShot(page, "18-calidad-bloques", box, 20);

    // Personal
    await page.getByRole("tab", { name: /Personal/ }).click();
    await settle(page, 1800);
    box = await regionOf(page, "Productividad por supervisor", "^SECTION$");
    await clipShot(page, "18-personal", box, 20);
    await close();
  }

  /* ── Administración, teléfono ── */
  {
    const { page, close } = await open({ role: "administracion", device: "phone", start: "/indicadores" });
    await settle(page, 2200);
    await snap(page, "18-telefono");
    await close();
  }
  await done();
})();
