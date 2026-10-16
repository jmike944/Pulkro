// Builds the user manual: chapters/*.html (files starting with "_" are skipped) → manual.html → PDF (Paged.js in Chromium).
//
//   node docs/manual/tools/build.cjs            → manual.html + Pulkro_Cuadrillas_Manual_de_Usuario.pdf
//   node docs/manual/tools/build.cjs --html     → manual.html only
//   node docs/manual/tools/build.cjs --only 05,06  → a draft PDF (build/draft-05,06.pdf) with just the chapters whose file starts with 05 or 06
//
// The table of contents, section ids and figure numbers are generated in the page before Paged.js paginates it.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ROOT = path.join(__dirname, "..");
const CHAPTERS = path.join(ROOT, "chapters");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const htmlOnly = args.includes("--html");

const files = fs
  .readdirSync(CHAPTERS)
  .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
  .filter((f) => !only || only.split(",").some((p) => f.startsWith(p)) || f.startsWith("00-a"))
  .sort();

const svg = (f) => fs.readFileSync(path.join(ROOT, "assets", f), "utf8").replace(/<\?xml[^>]*>/, "");
// <!--emblem--> / <!--letters--> → the brand SVGs inline (they paint with currentColor).
const read = (f) =>
  fs
    .readFileSync(path.join(CHAPTERS, f), "utf8")
    .replaceAll("<!--emblem-->", svg("pulkro-emblem.svg").replace("<svg ", '<svg class="emblem" '))
    .replaceAll("<!--letters-->", svg("pulkro-letters.svg").replace("<svg ", '<svg class="letters" '));
const front = files.filter((f) => f.startsWith("00"));
const body = files.filter((f) => !f.startsWith("00") && !f.startsWith("99"));
const back = files.filter((f) => f.startsWith("99"));

const html = `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<title>Pulkro Cuadrillas · Manual de usuario</title>
<link rel="stylesheet" href="assets/manual.css">
<script>window.PagedConfig = { auto: false };</script>
<script src="assets/paged.polyfill.js"></script>
</head>
<body>
${front.map(read).join("\n")}
${only ? "" : '<nav class="toc front" id="indice"></nav>'}
${body.map(read).join("\n")}
${back.map(read).join("\n")}
<script>
(function () {
  const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const used = new Set();
  const uid = (base) => { let id = base || "s", n = 2; while (used.has(id)) id = base + "-" + n++; used.add(id); return id; };
  document.querySelectorAll("[id]").forEach((el) => used.add(el.id));

  // Markers are placed in % of the screenshot: wrap the image and its markers so the frame's padding does not shift them.
  document.querySelectorAll(".frame").forEach((fr) => {
    const marks = fr.querySelectorAll(":scope > .mark");
    const img = fr.querySelector(":scope > img");
    if (!marks.length || !img) return;
    const pin = document.createElement("span");
    pin.className = "pin";
    fr.insertBefore(pin, img);
    pin.append(img, ...marks);
  });

  // Chapters and their sections → TOC; figures → "Figura <chapter>.<n>".
  const toc = document.getElementById("indice");
  const items = [];
  document.querySelectorAll("section.chapter").forEach((ch, i) => {
    const n = i + 1;
    if (!ch.id) ch.id = uid("cap-" + n);
    const h1 = ch.querySelector(".opener h1, h1");
    const num = ch.querySelector(".opener .num");
    if (num && !num.dataset.keep) num.textContent = "Capítulo " + n + (num.textContent.trim() ? " · " + num.textContent.trim() : "");
    const secs = [];
    ch.querySelectorAll("h2.section").forEach((h) => {
      if (!h.id) h.id = uid(slug(h.textContent));
      if (!h.dataset.notoc) secs.push({ id: h.id, t: h.dataset.toc || h.textContent.trim() });
    });
    let f = 0;
    ch.querySelectorAll("figure.shot figcaption").forEach((c) => {
      f++;
      const s = document.createElement("span");
      s.className = "fig";
      s.textContent = "Figura " + n + "." + f;
      c.prepend(s);
    });
    items.push({ n, id: ch.id, t: (h1 && (h1.dataset.toc || h1.textContent.trim())) || "", secs });
  });
  if (toc) {
    toc.innerHTML =
      '<p class="eyebrow">Contenido</p><h1 class="front-title">Índice</h1><ol>' +
      items
        .map(
          (c) =>
            '<li><a class="ch" href="#' + c.id + '"><span class="n">' + String(c.n).padStart(2, "0") + '</span><span class="t">' + c.t + "</span></a>" +
            (c.secs.length ? "<ol>" + c.secs.map((s) => '<li><a href="#' + s.id + '"><span class="t">' + s.t + "</span></a></li>").join("") + "</ol>" : "") +
            "</li>",
        )
        .join("") +
      "</ol>";
  }
})();
</script>
</body>
</html>`;

const outHtml = path.join(ROOT, only ? `build/draft-${only}.html` : "manual.html");
fs.mkdirSync(path.dirname(outHtml), { recursive: true });
// Draft files live one level down: point their relative URLs back at the manual root.
fs.writeFileSync(outHtml, only ? html.replace("<head>", '<head>\n<base href="../">') : html);
console.log(`html → ${path.relative(process.cwd(), outHtml)} (${files.length} files)`);
if (htmlOnly) process.exit(0);

// Paged.js fetches the stylesheets to read @page rules: serve the manual over http (file:// fetches are blocked).
const http = require("node:http");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${path.relative(ROOT, outHtml)}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))));
    const missing = [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute("src"));
    if (missing.length) console.error("missing images: " + missing.join(", "));
  });
  const t0 = Date.now();
  const pages = await page.evaluate(async () => {
    const flow = await window.PagedPolyfill.preview();
    return flow.total;
  });
  console.log(`paginated: ${pages} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Running header (top right): the current chapter's title, set per page (Paged.js string-set mangles these values).
  await page.evaluate(() => {
    let current = "";
    for (const pg of document.querySelectorAll(".pagedjs_page")) {
      const h = pg.querySelector(".opener h1, h1.front-title");
      if (h) current = (h.dataset.toc || h.textContent).replace(/\s+/g, " ").trim();
      pg.style.setProperty("--pagedjs-string-first-chapter", JSON.stringify(current));
    }
  });

  // Overflow check: content that runs past a page box is clipped in the PDF.
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll(".pagedjs_page")]
      .map((p, i) => {
        const area = p.querySelector(".pagedjs_page_content");
        if (!area) return null;
        const limit = area.getBoundingClientRect().bottom + 2;
        const over = [...area.querySelectorAll("figure, img, table, .note, .duo, .phones, .opener")].find((el) => el.getBoundingClientRect().bottom > limit);
        return over ? `page ${i + 1}: ${over.tagName.toLowerCase()}.${[...over.classList].join(".")} ${(over.querySelector("img") || over).getAttribute?.("src") || ""}` : null;
      })
      .filter(Boolean),
  );
  if (overflow.length) console.log("OVERFLOW:\n  " + overflow.join("\n  "));

  const outPdf = only ? path.join(ROOT, `build/draft-${only}.pdf`) : path.join(ROOT, "Pulkro_Cuadrillas_Manual_de_Usuario.pdf");
  await page.pdf({ path: outPdf, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, outline: true, tagged: true });
  console.log(`pdf → ${path.relative(process.cwd(), outPdf)}`);
  await browser.close();
  server.close();
})();
