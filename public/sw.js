/* Pulkro Cuadrillas — service worker (offline app shell).
 * Data already lives on the device (IndexedDB); this worker makes the app itself load offline:
 *  - pages: network-first (with a timeout), else the last cached copy of that page, else — for the field screens
 *    (/jornada/[id], /ordenes/[folio], /ordenes/[folio]/reporte, /postventa/[folio], /clientes/[id]) — a precached
 *    template of the route with the requested id written in, so the client view renders that record from IndexedDB even
 *    if it was never opened online; else /offline
 *  - RSC payloads: network-first, else cache; a miss answers 503 so the router falls back to a full page load (above)
 *  - /_next/static: cache-first (content-hashed, immutable); the scripts of every precached page are precached too
 *  - map tiles: cache-first with a size cap, so sites already viewed render without signal
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
const ASSETS = ["/manifest.webmanifest", "/icons/icon-192.png"];

/** Script / style / font URLs a page needs to boot (from its HTML and its inline RSC payload). */
function assetsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) out.add(m[0]);
  for (const m of html.matchAll(/["'(]static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g)) out.add(`/_next/${m[0].slice(1)}`);
  return [...out];
}

/** Fetches every page (fresh) and the static assets it references, so a page that was never opened can still boot offline. */
async function precache() {
  const shell = await caches.open(SHELL);
  const statics = await caches.open(STATIC);
  await Promise.allSettled(ASSETS.map((u) => statics.add(new Request(u, { cache: "reload" }))));
  await Promise.allSettled(
    PAGES.map(async (url) => {
      const res = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
      if (!res.ok) return;
      await shell.put(url, res.clone());
      const assets = assetsOf(await res.text());
      await Promise.allSettled(assets.map(async (a) => ((await statics.match(a)) ? undefined : statics.add(a))));
    }),
  );
}

const META = `${VERSION}-meta`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache()
      .then(() => caches.open(META))
      .then((meta) => meta.put("/__pk-installed", new Response(String(Date.now()))))
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
  // The page asks for a refresh of the precached pages after a deploy (pwa.tsx), so templates match the running build.
  if (event.data && event.data.type === "WARM") event.waitUntil(warm(event.data.build));
});

async function warm(build) {
  if (!build) return;
  const meta = await caches.open(META);
  const last = await meta.match("/__pk-build");
  if (last && (await last.text()) === build) return;
  // Right after install the pages were just precached from this same build: only remember it.
  const installed = await meta.match("/__pk-installed");
  const fresh = !last && installed && Date.now() - Number(await installed.text()) < 5 * 60_000;
  if (!fresh) await precache();
  await meta.put("/__pk-build", new Response(build));
}
