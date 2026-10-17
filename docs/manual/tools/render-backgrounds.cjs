// Renders the aurora gradients (app tokens) once to JPEG: CSS gradients get rasterized per use in a Chromium PDF, an
// image is embedded once and reused by every chapter opener.  node tools/render-backgrounds.cjs → assets/bg-*.jpg
const path = require("node:path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const OUT = path.join(__dirname, "..", "assets");
const aurora = (lin) => `background-color:#dcecff;background-image:
  radial-gradient(60% 80% at 0% 0%, #e7e1ff 0%, transparent 60%),
  radial-gradient(55% 70% at 0% 100%, #c8f1ef 0%, transparent 62%),
  radial-gradient(70% 90% at 100% 100%, #6fb3ff 0%, transparent 60%),
  radial-gradient(60% 70% at 70% 20%, #d7ecff 0%, transparent 65%),
  linear-gradient(${lin}, #eceeff 0%, #d6ebff 48%, #93c6ff 100%);`;
const cover = `background-color:#dcecff;background-image:
  radial-gradient(60% 55% at 0% 0%, #e7e1ff 0%, transparent 60%),
  radial-gradient(55% 50% at 0% 100%, #c8f1ef 0%, transparent 62%),
  radial-gradient(70% 60% at 100% 100%, #6fb3ff 0%, transparent 60%),
  radial-gradient(60% 50% at 70% 20%, #d7ecff 0%, transparent 65%),
  linear-gradient(160deg, #eceeff 0%, #d6ebff 48%, #93c6ff 100%);`;
const back = `background:#07243f;background-image:
  radial-gradient(50% 40% at 100% 0%, rgb(122 209 244 / 0.28) 0%, transparent 70%),
  radial-gradient(60% 45% at 0% 100%, rgb(124 92 252 / 0.22) 0%, transparent 70%);`;
const jobs = [
  ["bg-aurora.jpg", 1500, 900, aurora("135deg")],
  ["bg-cover.jpg", 1275, 1650, cover],
  ["bg-back.jpg", 1275, 1650, back],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [name, w, h, css] of jobs) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<body style="margin:0"><div style="width:${w}px;height:${h}px;${css}"></div></body>`);
    await p.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 90 });
    console.log(name);
  }
  await b.close();
})();
