// Copies MapLibre's web worker (and the shared chunk it imports) into public/, versioned by package version.
// MapLibre 6 spawns `new Worker(url, { type: "module" })`, which the Next bundler does not emit; the app points
// MapLibre at this copy with setWorkerUrl() (src/components/pk/basemap.tsx). Runs before `dev` and `build`.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const out = join(root, "public", "vendor", "maplibre", version);
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(pkg, "dist", file), join(out, file));
console.log(`maplibre-gl ${version} worker → public/vendor/maplibre/${version}/`);
