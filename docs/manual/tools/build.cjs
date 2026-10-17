// Builds a Pulkro document — the user manual (L3) by default, or the SOP documents (L1, L2) — from chapters/*.html
// (files starting with "_" are skipped) → HTML → PDF (Paged.js in Chromium), with the shared design in docs/manual/assets.
//
//   node docs/manual/tools/build.cjs                      → the manual: manual.html + Pulkro_Cuadrillas_Manual_de_Usuario.pdf
//   node docs/manual/tools/build.cjs --doc docs/sop/L2    → the document in that folder (its doc.json names the PDF and labels)
//   node docs/manual/tools/build.cjs --html               → the HTML only
//   node docs/manual/tools/build.cjs --only 05,06         → a draft PDF (build/draft-05,06.pdf) with just the chapters whose file starts with 05 or 06
//   node docs/manual/tools/build.cjs --light              → the manual with screen-resolution screenshots (e-mail, WhatsApp)
//
// The table of contents, section ids and figure numbers are generated in the page before Paged.js paginates it.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const MANUAL = path.join(__dirname, ".."); // shared assets, fonts, tools and the manual's screenshots
const DOCS = path.join(MANUAL, ".."); // served root: every document's HTML and the shared assets are under it
const args = process.argv.slice(2);
const ROOT = args.includes("--doc") ? path.resolve(args[args.indexOf("--doc") + 1]) : MANUAL;
const CHAPTERS = path.join(ROOT, "chapters");
const CONF = {
  title: "Pulkro Cuadrillas · Manual de usuario",
  label: "Pulkro Cuadrillas · Manual de usuario", // running header, top left
  pdf: "Pulkro_Cuadrillas_Manual_de_Usuario.pdf",
  lightPdf: "Pulkro_Cuadrillas_Manual_de_Usuario_ligero.pdf",
  html: "manual.html",
  subject: "Control operativo y postventa de cuadrillas de limpieza: guía de uso para Supervisor, Administración y Dirección",
  keywords: "Pulkro, cuadrillas, órdenes, jornadas, evidencias, reportes, postventa, manual",
  chapterLabel: "Capítulo",
  dividers: true, // chapter openers become title pages
  ...(fs.existsSync(path.join(ROOT, "doc.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "doc.json"), "utf8")) : {}),
};
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const htmlOnly = args.includes("--html");
// --light: a smaller PDF for e-mail and WhatsApp, with screen-resolution screenshots (tools/light-shots.py).
const light = args.includes("--light");

const files = fs
  .readdirSync(CHAPTERS)
  .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
  .filter((f) => !only || only.split(",").some((p) => f.startsWith(p)) || f.startsWith("00-a"))
  .sort();

const svg = (f) => fs.readFileSync(path.join(MANUAL, "assets", f), "utf8").replace(/<\?xml[^>]*>/, "");
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
<title>${CONF.title}</title>
<link rel="stylesheet" href="assets/manual.css">
<style>:root { --pk-doc: ${JSON.stringify(CONF.label)}; }</style>
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
  const CHAPTER_LABEL = ${JSON.stringify(CONF.chapterLabel)};
  const TOC_SECTIONS = ${JSON.stringify(CONF.tocSections !== false)};
  const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const used = new Set();
  const uid = (base) => {
    base = /^[a-z]/.test(base || "") ? base : "s-" + (base || "");
    let id = base, n = 2;
    while (used.has(id)) id = base + "-" + n++;
    used.add(id);
    return id;
  };
  // A heading's text; a numbered SOP section ("<span class=no>1</span>Objetivo") reads "1. Objetivo".
  const headText = (h) => {
    if (h.dataset.toc) return h.dataset.toc;
    const no = h.querySelector(".no");
    const rest = [...h.childNodes].filter((n) => n !== no).map((n) => n.textContent).join("").trim();
    return no ? no.textContent.trim() + ". " + rest : rest;
  };
  document.querySelectorAll("[id]").forEach((el) => used.add(el.id));

  // Each chapter → .sec blocks (one per h2.section; the opener and intro form the first) → .sub blocks (one per h3).
  // Before paginating, build.cjs measures them: a block that fits on a page is never split (it moves whole to the next
  // page when it does not fit in what is left), a section longer than a page starts on a new page.
  document.querySelectorAll("section.chapter").forEach((ch) => {
    const groups = [];
    let sec = null;
    for (const k of [...ch.children]) {
      if (!sec || k.matches("h2.section")) {
        sec = document.createElement("div");
        sec.className = k.matches("h2.section") ? "sec" : "sec sec-intro";
        ch.insertBefore(sec, k);
        groups.push(sec);
      }
      sec.appendChild(k);
    }
    for (const g of groups) {
      let sub = null;
      for (const k of [...g.children]) {
        if (!sub || k.matches("h3")) {
          sub = document.createElement("div");
          sub.className = "sub";
          g.insertBefore(sub, k);
        }
        sub.appendChild(k);
      }
    }
  });

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
    const h1 = ch.querySelector(".opener h1, .sop-head h1, h1");
    const num = ch.querySelector(".opener .num");
    // A procedure carries its own code (data-code); chapters are numbered.
    const code = ch.dataset.code;
    if (num && !num.dataset.keep) num.textContent = (code || CHAPTER_LABEL + " " + n) + (num.textContent.trim() ? " · " + num.textContent.trim() : "");
    const secs = [];
    ch.querySelectorAll("h2.section").forEach((h) => {
      if (!h.id) h.id = uid(slug(headText(h)));
      if (!h.dataset.notoc && TOC_SECTIONS) secs.push({ id: h.id, t: headText(h) });
    });
    let f = 0;
    ch.querySelectorAll("figure.shot figcaption").forEach((c) => {
      f++;
      const s = document.createElement("span");
      s.className = "fig";
      s.textContent = "Figura " + n + "." + f;
      c.prepend(s);
    });
    items.push({ n: code || String(n).padStart(2, "0"), id: ch.id, t: (h1 && (h1.dataset.toc || h1.textContent.trim())) || "", secs });
  });
  if (toc) {
    toc.innerHTML =
      '<p class="eyebrow">Contenido</p><h1 class="front-title">Índice</h1><ol>' +
      items
        .map(
          (c) =>
            '<li><a class="ch" href="#' + c.id + '"><span class="n">' + c.n + '</span><span class="t">' + c.t + "</span></a>" +
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

const outHtml = path.join(ROOT, only ? `build/draft-${only}.html` : light ? "build/manual-ligero.html" : CONF.html || "build/document.html");
fs.mkdirSync(path.dirname(outHtml), { recursive: true });
fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
// Shared assets and the manual's screenshots, relative to where this HTML is written.
if (light) require("node:child_process").execFileSync("python3", [path.join(__dirname, "light-shots.py")], { stdio: "inherit" });
const rel = path.relative(path.dirname(outHtml), MANUAL).split(path.sep).join("/") || ".";
const page_ = html
  .replaceAll('href="assets/', `href="${rel}/assets/`)
  .replaceAll('src="assets/', `src="${rel}/assets/`)
  .replaceAll('src="shots/', light ? `src="${rel}/build/light/shots/` : `src="${rel}/shots/`);
fs.writeFileSync(outHtml, page_);
console.log(`html → ${path.relative(process.cwd(), outHtml)} (${files.length} files)`);
if (htmlOnly) process.exit(0);

// Paged.js fetches the stylesheets to read @page rules: serve the manual over http (file:// fetches are blocked).
const http = require("node:http");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const file = path.join(DOCS, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
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
  await page.goto(`http://127.0.0.1:${server.address().port}/${path.relative(DOCS, outHtml).split(path.sep).join("/")}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))));
    const missing = [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute("src"));
    if (missing.length) console.error("missing images: " + missing.join(", "));
  });
  const blocks = await page.evaluate((dividers) => {
    // Lay the content out at the page's text width (Letter 8.5in − 2 × 0.78in) to measure each block.
    const st = document.createElement("style");
    st.textContent = "body { width: 6.94in; }";
    document.head.append(st);
    const pageHeight = (11 - 0.95 - 0.85) * 96 - 4; // the page's content box (883 px), with a little slack
    const edge = (el, end) => {
      let e = el;
      while (e && e.matches(".sec, .sub")) e = end ? e.lastElementChild : e.firstElementChild;
      return e ? parseFloat(getComputedStyle(e)[end ? "marginBottom" : "marginTop"]) || 0 : 0;
    };
    // Paged.js keeps the first element's top margin at the top of a page; a trailing bottom margin may run past it.
    const height = (el) => el.getBoundingClientRect().height + edge(el, false);
    const n = { kept: 0, tight: 0, long: 0, ratios: [] };
    // A block that fits: kept whole. A little too tall (up to ~1.4 pages): try its "tight" layout (smaller screenshots and
    // spacing) and keep it whole if that fits. Otherwise it is long: it starts on a new page and its sub-blocks follow
    // the same rules.
    const place = (el, canStartPage) => {
      el.dataset.h = Math.round(height(el));
      if (height(el) <= pageHeight) return el.classList.add("keep"), "keep";
      if (height(el) <= pageHeight * 1.4) {
        el.classList.add("tight");
        el.dataset.h = Math.round(height(el));
        if (height(el) <= pageHeight) return el.classList.add("keep"), "tight";
        // Second step: smaller screenshots still.
        el.classList.add("tighter");
        el.dataset.h = Math.round(height(el));
        if (height(el) <= pageHeight) return el.classList.add("keep"), "tight";
        el.classList.remove("tight", "tighter");
      }
      if (canStartPage) el.classList.add("long");
      return "long";
    };
    for (const sec of document.querySelectorAll(".sec")) {
      const intro = sec.classList.contains("sec-intro");
      const r = place(sec, !intro);
      if (r === "keep") n.kept++;
      else if (r === "tight") n.tight++;
      else {
        n.long++;
        // Fewer pages in the tight layout (a shorter tail on its last page)? Keep it.
        const pages = Math.ceil(height(sec) / pageHeight);
        sec.classList.add("tight");
        if (Math.ceil(height(sec) / pageHeight) >= pages) sec.classList.remove("tight");
        const h = sec.querySelector("h2.section, .opener h1");
        n.ratios.push((height(sec) / pageHeight).toFixed(2) + " " + (h ? h.textContent.trim().slice(0, 40) : "?"));
        const subs = [...sec.querySelectorAll(":scope > .sub")];
        // The section's opening (heading and first paragraphs) never stays alone at the top of its page: it goes
        // with the next block when both fit on a page; otherwise that block flows right after it.
        if (subs.length > 1) {
          const pair = document.createElement("div");
          pair.className = "sub";
          sec.insertBefore(pair, subs[0]);
          pair.append(subs[0], subs[1]);
          pair.dataset.h = Math.round(height(pair));
          if (height(pair) <= pageHeight) pair.classList.add("keep");
          else place(subs[0], false);
          subs.slice(2).forEach((sub) => place(sub, true));
        } else if (subs[0]) subs[0].classList.remove("keep");
      }
      // The chapter opener becomes a title page of its own.
      if (dividers && intro && r !== "long" && sec.querySelector(".opener")) sec.classList.add("divider");
    }
    st.remove();
    return n;
  }, CONF.dividers);
  console.log(`sections: ${blocks.kept} kept whole, ${blocks.tight} kept whole in their tight layout, ${blocks.long} longer than a page`);
  if (process.env.PK_RATIOS) console.log(blocks.ratios.sort().join("\n"));
  const t0 = Date.now();
  const pages = await page.evaluate(async () => {
    const flow = await window.PagedPolyfill.preview();
    return flow.total;
  });
  console.log(`paginated: ${pages} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Check: no block that fits on a page was split (Paged.js gives the fragments of a split element the same data-ref).
  const split = await page.evaluate(() => {
    const pagesOf = new Map();
    document.querySelectorAll(".pagedjs_page").forEach((pg, i) =>
      pg.querySelectorAll(".keep[data-ref]").forEach((el) => pagesOf.set(el.dataset.ref, new Set([...(pagesOf.get(el.dataset.ref) || []), i + 1]))),
    );
    return [...pagesOf.entries()]
      .filter(([, s]) => s.size > 1)
      .map(([ref, s]) => {
        const el = document.querySelector(`.keep[data-ref="${ref}"]`);
        const h = el.querySelector("h2, h3, .opener h1");
        return `${[...s].join("-")} (${el.className}; ${el.dataset.h || "?"}px; «${h ? h.textContent.trim().slice(0, 30) : el.textContent.trim().slice(0, 30)}»)`;
      });
  });
  console.log(split.length ? `SPLIT keep blocks on pages: ${split.join(", ")}` : "no section that fits on a page was split");

  // A section that opens a page needs no divider line above it.
  await page.evaluate(() => {
    for (const area of document.querySelectorAll(".pagedjs_page_content")) {
      const top = area.getBoundingClientRect().top;
      const h = [...area.querySelectorAll("h2.section")].find((el) => el.getBoundingClientRect().top - top < 40);
      if (h) h.classList.add("page-top");
    }
  });

  // Running header (top right): the current chapter's title, set per page (Paged.js string-set mangles these values).
  await page.evaluate(() => {
    let current = "";
    for (const pg of document.querySelectorAll(".pagedjs_page")) {
      const h = pg.querySelector(".opener h1, .sop-head h1, h1.front-title");
      if (h) current = (h.dataset.toc || h.textContent).replace(/\s+/g, " ").trim();
      pg.style.setProperty("--pagedjs-string-first-chapter", JSON.stringify(current));
    }
  });

  // Bookmarks (chapters › sections) with their page numbers, for pdf-meta.py: the PDF's own outline needs a tagged PDF.
  const outline = await page.evaluate(() => {
    const pageOf = (el) => Number(el.closest(".pagedjs_page")?.dataset.pageNumber || 0);
    const text = (el) => {
      if (el.dataset.toc) return el.dataset.toc;
      const no = el.querySelector(".no");
      const rest = [...el.childNodes].filter((n) => n !== no).map((n) => n.textContent).join("");
      return ((no ? no.textContent.trim() + ". " : "") + rest).replace(/\s+/g, " ").trim();
    };
    const items = [];
    document.querySelectorAll(".front h1.front-title").forEach((h) => {
      if (!h.closest("#indice")) items.push({ title: text(h), page: pageOf(h), children: [] });
    });
    const toc = document.querySelector("#indice h1.front-title");
    if (toc) items.push({ title: text(toc), page: pageOf(toc), children: [] });
    // Paged.js splits each chapter section across pages: walk the headings in document order instead.
    document.querySelectorAll(".opener h1, .sop-head h1, h2.section").forEach((h) => {
      if (h.matches(".opener h1, .sop-head h1")) {
        const ch = h.closest("section.chapter");
        const num = ch?.dataset.code || h.closest(".opener")?.querySelector(".num")?.textContent.match(/\S+ (\d+)/)?.[1];
        items.push({ title: (num ? num + (ch?.dataset.code ? " · " : ". ") : "") + text(h), page: pageOf(h), children: [] });
      } else if (items.length && !h.closest(".front")) {
        items[items.length - 1].children.push({ title: text(h), page: pageOf(h) });
      }
    });
    return items;
  });
  fs.writeFileSync(path.join(ROOT, "build", "outline.json"), JSON.stringify(outline, null, 1));

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

  const outPdf = path.join(ROOT, only ? `build/draft-${only}.pdf` : light ? CONF.lightPdf : CONF.pdf);
  await page.pdf({ path: outPdf, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, outline: true, tagged: false });
  const meta = path.join(ROOT, "build", "meta.json");
  fs.writeFileSync(meta, JSON.stringify({ title: CONF.title, subject: CONF.subject, keywords: CONF.keywords }));
  if (!only) require("node:child_process").execFileSync("python3", [path.join(__dirname, "pdf-meta.py"), outPdf, path.join(ROOT, "build", "outline.json"), meta], { stdio: "inherit" });
  console.log(`pdf → ${path.relative(process.cwd(), outPdf)}`);
  await browser.close();
  server.close();
})();
