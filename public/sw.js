/* Pulkro Cuadrillas — service worker (offline app shell).
 * Data already lives on the device (IndexedDB); this worker makes the app itself load offline:
 *  - pages: network-first (with a timeout), else the last cached copy of that page, else — for the field screens
 *    (/jornada/[id], /ordenes/[folio], /ordenes/[folio]/reporte, /postventa/[folio], /clientes/[id]) — a precached
 *    template of the route with the requested id written in, so the client view renders that record from IndexedDB even
 *    if it was never opened online; else /offline
 *  - RSC payloads: network-first, else cache; a miss answers 503 so the router falls back to a full page load (above)
 *  - /_next/static: cache-first (content-hashed, immutable); the scripts of every precached page are precached too, and the
 *    hashed files no cached page references any more are dropped when a new build is precached
 *  - map tiles: cache-first with a size cap, so sites already viewed render without signal
 *  - build change: the worker fingerprints the build itself (the scripts of "/"), so the pages are re-precached once per deploy,
 *    whatever route the page that woke it was on
 */
const VERSION = "pk-v3";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 600;
const NAV_TIMEOUT_MS = 6000;

/** Placeholder id the templates are rendered with; replaced by the real id when a template is served. */
const TPL = "__pk-shell__";
const TEMPLATES = [
  { re: /^\/ordenes\/([^/]+)\/reporte\/?$/, url: `/ordenes/${TPL}/reporte` },
  { re: /^\/ordenes\/([^/]+)\/?$/, url: `/ordenes/${TPL}`, skip: ["nueva"] },
  { re: /^\/jornada\/([^/]+)\/?$/, url: `/jornada/${TPL}` },
  { re: /^\/postventa\/([^/]+)\/?$/, url: `/postventa/${TPL}` },
  { re: /^\/clientes\/([^/]+)\/?$/, url: `/clientes/${TPL}` },
];
const SAFE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

const PAGES = [
  "/", "/offline", "/login", "/pendientes", "/perfil", "/ordenes", "/ordenes/nueva", "/agenda", "/evidencias", "/incidencias",
  "/reportes", "/postventa", "/clientes", "/indicadores", "/equipo", "/configuracion", "/ayuda",
  ...TEMPLATES.map((t) => t.url),
];
// The logo is drawn with CSS masks of these two SVGs (brand.tsx): without them an installed app that goes offline before one
// controlled online load shows no logo at all.
const ASSETS = ["/manifest.webmanifest", "/icons/icon-192.png", "/brand/pulkro-emblem.svg", "/brand/pulkro-letters.svg"];

/** Script / style / font URLs a page needs to boot (from its HTML and its inline RSC payload). */
function assetsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) out.add(m[0]);
  for (const m of html.matchAll(/["'(]static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g)) out.add(`/_next/${m[0].slice(1)}`);
  return [...out];
}

/**
 * Fingerprint of a build: a hash of the hashed script/style URLs of its "/" page. The URLs are content-hashed, so they change
 * with every deploy, and the worker always reads the same page, so the key does not depend on the route that triggered the check.
 */
function buildKeyOf(html) {
  const assets = assetsOf(html).sort().join("|");
  if (!assets) return "";
  let h = 0;
  for (let i = 0; i < assets.length; i++) h = (Math.imul(31, h) + assets.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/**
 * Fetches every page (fresh) and the static assets it references, so a page that was never opened can still boot offline.
 * Returns the build key read from "/" ("" when it could not be fetched).
 */
async function precache() {
  const shell = await caches.open(SHELL);
  const statics = await caches.open(STATIC);
  let key = "";
  await Promise.allSettled(ASSETS.map((u) => statics.add(new Request(u, { cache: "reload" }))));
  await Promise.allSettled(
    PAGES.map(async (url) => {
      const res = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
      if (!res.ok) return;
      await shell.put(url, res.clone());
      const html = await res.text();
      if (url === "/") key = buildKeyOf(html);
      const assets = assetsOf(html);
      await Promise.allSettled(assets.map(async (a) => ((await statics.match(a)) ? undefined : statics.add(a))));
    }),
  );
  return key;
}

const META = `${VERSION}-meta`;
/** Hashed static files are only dropped once they are this old, so a chunk fetched lazily by the running build is never lost. */
const STATIC_MIN_AGE_MS = 24 * 60 * 60_000;
/** The page asks for a build check on every full load; the worker looks at most this often. */
const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Drops the content-hashed /_next/static files that no cached page or RSC payload references any more (left behind by earlier
 * deploys). Icons, brand SVGs and vendor files are never touched.
 */
async function pruneStatic() {
  const shell = await caches.open(SHELL);
  const statics = await caches.open(STATIC);
  const keep = new Set();
  for (const req of await shell.keys()) {
    const res = await shell.match(req);
    // Compare by pathname: the URLs found in a page may carry a query (?dpl=…) that the cache keys keep apart.
    if (res) assetsOf(await res.text()).forEach((a) => keep.add(new URL(a, self.location.origin).pathname));
  }
  const now = Date.now();
  for (const req of await statics.keys()) {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/_next/static/") || keep.has(pathname)) continue;
    const res = await statics.match(req);
    const at = Date.parse((res && res.headers.get("date")) || "");
    if (Number.isFinite(at) && now - at > STATIC_MIN_AGE_MS) await statics.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache()
      .then(async (key) => {
        const meta = await caches.open(META);
        // Remember the build these pages came from, so the first check after install does not precache them again.
        if (key) await meta.put("/__pk-build", new Response(key));
        await meta.put("/__pk-checked", new Response(String(Date.now())));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** A precached template of the dynamic route, with the requested id written in place of the placeholder. */
async function fromTemplate(pathname) {
  for (const t of TEMPLATES) {
    const m = t.re.exec(pathname);
    if (!m) continue;
    let id;
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    if (!SAFE_ID.test(id) || (t.skip && t.skip.includes(id))) return null;
    const cache = await caches.open(SHELL);
    const tpl = await cache.match(t.url, { ignoreVary: true });
    if (!tpl) return null;
    const html = (await tpl.text()).split(TPL).join(id);
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Pk-Offline": "template" } });
  }
  return null;
}

async function navigate(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const url = new URL(request.url);
    const cached =
      (await cache.match(request, { ignoreVary: true })) || (await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true }));
    if (cached) return cached;
    const templated = await fromTemplate(url.pathname);
    if (templated) return templated;
    const offline = await cache.match("/offline", { ignoreVary: true });
    if (offline) return offline;
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function rsc(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    // Prefetches only warm the router's in-memory cache; storing every one would grow the cache without helping offline.
    if (response.ok && !request.headers.get("Next-Router-Prefetch")) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    // Not an RSC response → the router does a full page load, which `navigate` answers from the cache or a template.
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function freshFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone());
    if (cacheName === TILES) trimCache(TILES, MAX_TILES);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "tiles.openfreemap.org") {
    // Styles and TileJSON point at weekly versioned tile sets: fetch them fresh, fall back to the cached copy offline.
    // Tiles and glyphs (.pbf) and the versioned /sprites/ are immutable per URL → cache first.
    const immutable = url.pathname.endsWith(".pbf") || url.pathname.startsWith("/sprites/");
    event.respondWith(immutable ? cacheFirst(request, TILES) : freshFirst(request, TILES));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.startsWith("/__nextjs")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/vendor/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }
  // Client-router RSC payloads
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(rsc(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  // The page asks for a build check after a full load (pwa.tsx). Its own `build` hint is ignored: the worker fingerprints the build.
  if (event.data && event.data.type === "WARM") event.waitUntil(warm());
});

/** Re-precaches the pages (and prunes old hashed files) once per deploy so the offline templates match the running build. */
async function warm() {
  const meta = await caches.open(META);
  const checked = await meta.match("/__pk-checked");
  if (checked && Date.now() - Number(await checked.text()) < CHECK_EVERY_MS) return;
  await meta.put("/__pk-checked", new Response(String(Date.now())));
  let key = "";
  try {
    key = buildKeyOf(await (await fetch(new Request("/", { cache: "reload", credentials: "same-origin" }))).text());
  } catch {
    return; // no signal: try again on a later load
  }
  if (!key) return;
  const last = await meta.match("/__pk-build");
  if (last && (await last.text()) === key) return;
  const precached = await precache();
  await meta.put("/__pk-build", new Response(precached || key));
  await pruneStatic();
}
