"use client";

import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { forgetSignedUrl, getPhotoUrl, getStoragePhotoUrl, rememberStoragePhoto } from "@/lib/photo-store";
import { isOffline, useAppStore } from "@/lib/store";
import { fmtTime } from "@/lib/format";
import { PHOTO_KIND, toneDot } from "@/lib/status";
import type { Jornada, Photo, SceneKind } from "@/lib/types";
import { PhotoFlags } from "./photo-flags";

/* ───────────── procedural scenes (stand-ins for seed photos) ───────────── */

function rng(seed: number) {
  let a = seed * 9301 + 49297;
  return () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
}

function SceneArt({ scene, seed, g }: { scene: SceneKind; seed: number; g: string }) {
  const r = rng(seed + 1);
  const dx = Math.round(r() * 30 - 15);
  switch (scene) {
    case "oficina":
      return (
        <g>
          <rect width="400" height="300" fill="#e8edf2" />
          <rect x={40 + dx} y="40" width="150" height="110" rx="4" fill="#bcdcf3" />
          <rect x={40 + dx} y="40" width="150" height="110" rx="4" fill={`url(#${g}-sky)`} />
          <path d={`M${115 + dx} 40v110M${40 + dx} 95h150`} stroke="#f5f8fb" strokeWidth="5" />
          <rect x="230" y="70" width="120" height="80" rx="6" fill="#d6dee6" />
          <rect x="0" y="185" width="400" height="115" fill="#cfd6dd" />
          {Array.from({ length: 8 }).map((_, i) => (
            <path key={i} d={`M${i * 60 - 40} 300 L${200 + (i - 3.5) * 22} 185`} stroke="#bfc8d1" strokeWidth="1.2" />
          ))}
          <path d="M0 225h400M0 265h400" stroke="#bfc8d1" strokeWidth="1.2" />
          <rect x={150 + dx} y="160" width="170" height="14" rx="3" fill="#7d8a97" />
          <rect x={160 + dx} y="174" width="8" height="60" fill="#5d6874" />
          <rect x={302 + dx} y="174" width="8" height="60" fill="#5d6874" />
          <rect x={205 + dx} y="128" width="58" height="34" rx="3" fill="#2f3b47" />
          <rect x={90 + dx} y="190" width="44" height="50" rx="10" fill="#3d5266" />
          <ellipse cx="360" cy="190" rx="22" ry="34" fill="#6fa36c" />
          <rect x="350" y="210" width="20" height="28" rx="3" fill="#b78a5d" />
        </g>
      );
    case "bano":
      return (
        <g>
          <rect width="400" height="300" fill="#e3edf3" />
          {Array.from({ length: 10 }).map((_, i) => (
            <path key={`v${i}`} d={`M${i * 42} 0v200`} stroke="#cfdde7" strokeWidth="2" />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <path key={`h${i}`} d={`M0 ${i * 42}h400`} stroke="#cfdde7" strokeWidth="2" />
          ))}
          <rect x={60 + dx} y="40" width="130" height="80" rx="6" fill="#cfe6f4" stroke="#b8c7d2" strokeWidth="4" />
          <path d={`M${80 + dx} 60l40 40M${120 + dx} 55l30 30`} stroke="#ffffff" strokeOpacity=".7" strokeWidth="4" />
          <rect x={50 + dx} y="140" width="160" height="20" rx="4" fill="#f4f7f9" />
          <ellipse cx={130 + dx} cy="150" rx="40" ry="7" fill="#d5dfe6" />
          <rect x="250" y="40" width="64" height="185" rx="3" fill="#8fa6b8" />
          <rect x="320" y="40" width="64" height="185" rx="3" fill="#8fa6b8" />
          <circle cx="304" cy="135" r="3" fill="#dfe7ee" />
          <circle cx="374" cy="135" r="3" fill="#dfe7ee" />
          <rect x="0" y="200" width="400" height="100" fill="#d9e2e9" />
          <path d="M0 240h400M0 275h400M80 200l-30 100M180 200l-10 100M280 200l10 100M360 200l40 100" stroke="#c4d0da" strokeWidth="1.5" />
        </g>
      );
    case "piso":
      return (
        <g>
          <rect width="400" height="300" fill="#dfe5ea" />
          <rect x="0" y="0" width="400" height="120" fill="#c9d3dc" />
          {[60, 170, 280].map((x, i) => (
            <rect key={i} x={x + dx / 2} y="0" width="26" height="140" fill="#aab7c3" />
          ))}
          <path d="M0 120h400" stroke="#9aa8b5" strokeWidth="3" />
          <path d={`M${120 + dx} 300L190 120M${280 + dx} 300L210 120`} stroke="#f0b429" strokeWidth="6" />
          <rect x="0" y="120" width="400" height="180" fill={`url(#${g}-gloss)`} />
          <rect x={300 + dx} y="150" width="60" height="40" rx="4" fill="#4c6175" />
          <rect x={295 + dx} y="190" width="70" height="8" rx="2" fill="#2f3b47" />
        </g>
      );
    case "ventanal":
      return (
        <g>
          <rect width="400" height="300" fill="#9fc8e6" />
          <rect width="400" height="300" fill={`url(#${g}-sky)`} />
          <ellipse cx={120 + dx} cy="80" rx="60" ry="18" fill="#ffffff" opacity=".7" />
          <ellipse cx={290 - dx} cy="120" rx="80" ry="20" fill="#ffffff" opacity=".55" />
          <path d="M0 230 L60 170 L110 200 L170 140 L240 210 L300 160 L400 220 V300 H0Z" fill="#7a95ab" opacity=".55" />
          {[0, 100, 200, 300, 400].map((x) => (
            <rect key={x} x={x - 5} y="0" width="10" height="300" fill="#56677a" />
          ))}
          {[0, 150, 300].map((y) => (
            <rect key={y} x="0" y={y - 5} width="400" height="10" fill="#56677a" />
          ))}
          <path d="M20 30l60 60M220 170l50 50M130 40l25 25" stroke="#ffffff" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case "cocina":
      return (
        <g>
          <rect width="400" height="300" fill="#e6e9ec" />
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x={(i % 7) * 58} y={110 + Math.floor(i / 7) * 28} width="56" height="26" fill="#f1f4f6" stroke="#d6dce1" />
          ))}
          <path d={`M${110 + dx} 20h180l-30 70h-120z`} fill="#b4bdc6" />
          <rect x={140 + dx} y="0" width="120" height="22" fill="#9aa5b0" />
          <rect x="0" y="170" width="400" height="30" fill="#aeb8c1" />
          <rect x="0" y="200" width="400" height="100" fill="#8d99a5" />
          {[30, 130, 230, 330].map((x) => (
            <rect key={x} x={x} y="215" width="80" height="70" rx="4" fill="#9ea9b4" stroke="#7f8b97" />
          ))}
          <circle cx={170 + dx} cy="182" r="10" fill="#2f3b47" />
          <circle cx={230 + dx} cy="182" r="10" fill="#2f3b47" />
        </g>
      );
    case "bodega":
      return (
        <g>
          <rect width="400" height="300" fill="#d8dee4" />
          <rect x={250 + dx} y="30" width="120" height="150" fill="#8f9ba7" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${250 + dx} ${50 + i * 22}h120`} stroke="#7a8794" strokeWidth="3" />
          ))}
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <g key={`${row}${col}`}>
                <rect x={20 + col * 70} y={30 + row * 50} width="60" height="40" fill="#c49a6c" />
                <path d={`M${20 + col * 70} ${50 + row * 50}h60`} stroke="#a77e52" strokeWidth="3" />
              </g>
            )),
          )}
          <path d="M10 25h220M10 75h220M10 125h220M10 175h220M15 20v160M225 20v160" stroke="#e76f2d" strokeWidth="5" />
          <rect x="0" y="190" width="400" height="110" fill="#c3cbd3" />
          <path d={`M0 250h400`} stroke="#f0b429" strokeWidth="8" strokeDasharray="40 20" />
          <rect x="0" y="190" width="400" height="110" fill={`url(#${g}-gloss)`} />
        </g>
      );
    case "lobby":
      return (
        <g>
          <rect width="400" height="300" fill="#efe9e1" />
          {[70, 200, 330].map((x) => (
            <g key={x}>
              <rect x={x - 25} y="0" width="50" height="6" fill="#fff6d8" />
              <ellipse cx={x} cy="10" rx="40" ry="10" fill="#fff6d8" opacity=".5" />
            </g>
          ))}
          <rect x={110 + dx} y="100" width="180" height="70" rx="8" fill="#5b4636" />
          <rect x={110 + dx} y="96" width="180" height="10" rx="3" fill="#cdb79d" />
          <rect x="0" y="175" width="400" height="125" fill="#ece7df" />
          {Array.from({ length: 6 }).map((_, i) =>
            Array.from({ length: 3 }).map((__, k) => (
              <path
                key={`${i}${k}`}
                d={`M${i * 70 - 20} ${175 + k * 42} l70 0 l12 42 l-70 0z`}
                fill={(i + k) % 2 ? "#ddd5ca" : "#f5f1ea"}
              />
            )),
          )}
          <rect x="0" y="175" width="400" height="125" fill={`url(#${g}-gloss)`} />
          <ellipse cx="350" cy="120" rx="26" ry="44" fill="#5f9a62" />
          <rect x="338" y="150" width="24" height="30" rx="4" fill="#3b3f46" />
        </g>
      );
    case "escalera":
    default:
      return (
        <g>
          <rect width="400" height="300" fill="#e2e7ec" />
          {Array.from({ length: 7 }).map((_, i) => (
            <g key={i}>
              <rect x={40 + i * 45} y={250 - i * 34} width="400" height="34" fill={i % 2 ? "#cdd5dd" : "#d7dee5"} />
              <rect x={40 + i * 45} y={250 - i * 34} width="400" height="5" fill="#b3bec8" />
            </g>
          ))}
          <path d="M30 210 L340 0" stroke="#566577" strokeWidth="6" />
          {Array.from({ length: 6 }).map((_, i) => (
            <path key={i} d={`M${60 + i * 50} ${190 - i * 34}v46`} stroke="#566577" strokeWidth="3" />
          ))}
        </g>
      );
  }
}

/** Procedural stand-in photo. `dirty` = ANTES look (grime, dust, dull); clean = DESPUÉS (gloss + sparkles). */
export function ScenePhoto({
  scene,
  seed,
  dirty,
  className,
  sparkle = true,
}: {
  scene: SceneKind;
  seed: number;
  dirty: boolean;
  className?: string;
  sparkle?: boolean;
}) {
  const uidRaw = useId().replace(/:/g, "");
  const id = `s${uidRaw}`;
  const r = rng(seed + 7);
  const smudges = Array.from({ length: 9 }, () => ({ x: r() * 400, y: 120 + r() * 180, rx: 14 + r() * 40, ry: 5 + r() * 14, o: 0.18 + r() * 0.25 }));
  const sparks = Array.from({ length: 5 }, () => ({ x: 30 + r() * 340, y: 30 + r() * 230, s: 6 + r() * 9, d: r() * 2 }));
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={cn("block h-full w-full", className)} role="img" aria-label={dirty ? "Foto antes" : "Foto después"}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe3fb" />
          <stop offset="1" stopColor="#e8f4fc" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={dirty ? 0 : 0.45} />
          <stop offset=".5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity={dirty ? 0 : 0.25} />
        </linearGradient>
        <filter id={`${id}-dull`}>
          <feColorMatrix type="saturate" values="0.45" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.92" intercept="0.03" />
            <feFuncG type="linear" slope="0.88" intercept="0.02" />
            <feFuncB type="linear" slope="0.78" intercept="0" />
          </feComponentTransfer>
        </filter>
        <filter id={`${id}-grime`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed={seed % 50} />
          <feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.27  0 0 0 0 0.16  0 0 0 -2.2 1.35" />
        </filter>
        <filter id={`${id}-dust`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={(seed % 30) + 3} />
          <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 -9 6.2" />
        </filter>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter={dirty ? `url(#${id}-dull)` : undefined}>
        <SceneArt scene={scene} seed={seed} g={id} />
      </g>
      {dirty ? (
        <g>
          <rect width="400" height="300" filter={`url(#${id}-grime)`} opacity=".55" />
          <g filter={`url(#${id}-blur)`}>
            {smudges.map((s, i) => (
              <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill="#5a4630" opacity={s.o} />
            ))}
          </g>
          <rect width="400" height="300" filter={`url(#${id}-dust)`} opacity=".5" />
          <rect width="400" height="300" fill="#6b5a3e" opacity=".08" />
        </g>
      ) : (
        <g>
          <rect width="400" height="300" fill="#ffffff" opacity=".06" />
          {sparkle &&
            sparks.map((s, i) => (
              <path
                key={i}
                d={`M${s.x} ${s.y - s.s} Q${s.x} ${s.y} ${s.x + s.s} ${s.y} Q${s.x} ${s.y} ${s.x} ${s.y + s.s} Q${s.x} ${s.y} ${s.x - s.s} ${s.y} Q${s.x} ${s.y} ${s.x} ${s.y - s.s}Z`}
                fill="#ffffff"
                className="origin-center animate-pulse motion-reduce:animate-none"
                style={{ animationDelay: `${s.d}s`, transformBox: "fill-box" }}
              />
            ))}
        </g>
      )}
    </svg>
  );
}

/* ───────────── photo renderer (scene, capture on the device, or evidence on the server) ───────────── */

export function PhotoImage({ photo, className }: { photo: Pick<Photo, "source" | "kind" | "area">; className?: string }) {
  const source = photo.source;
  if (source.type === "scene")
    return <ScenePhoto scene={source.scene} seed={source.seed} dirty={photo.kind === "antes" || photo.kind === "incidencia"} className={className} />;
  if (source.type === "storage") return <StorageImage path={source.path} alt={photo.area} className={className} />;
  return <DeviceImage idbKey={source.key} alt={photo.area} className={className} />;
}

/** A capture still on this device (IndexedDB blob). */
function DeviceImage({ idbKey, alt, className }: { idbKey: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    getPhotoUrl(idbKey).then((url) => alive && setLoaded({ key: idbKey, url }));
    return () => {
      alive = false;
    };
  }, [idbKey]);
  const url = loaded?.key === idbKey ? loaded.url : null;
  if (!url) return <div className={cn("h-full w-full shimmer", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("h-full w-full object-cover", className)} />;
}

/**
 * Evidence stored on the server (bucket `evidencias`): the copy kept on this device, else a signed URL. Once shown, a copy
 * stays on the device for offline viewing. Offline (or the server out of reach on a weak signal) and never shown here → a
 * placeholder that says so, asked again on reconnect, on focus and every so often; not readable for this account → said so.
 */
function StorageImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const offline = useAppStore((s) => isOffline(s));
  const [attempt, setAttempt] = useState(0);
  // Unanswered requests so far (the server out of reach while the browser says online).
  const [tries, setTries] = useState(0);
  const [resolved, setResolved] = useState<{ path: string; url: string | null; retry: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void getStoragePhotoUrl(path, !offline).then((r) => alive && setResolved({ path, url: r.url, retry: r.url === null && r.retry }));
    return () => {
      alive = false;
    };
  }, [path, offline, attempt, tries]);
  const current = resolved?.path === path ? resolved : undefined;
  const waiting = !!current && current.url === null && current.retry && !offline;
  // Ask again (backoff 10 s → 60 s), and as soon as the window gets focus.
  useEffect(() => {
    if (!waiting) return;
    const again = () => setTries((n) => n + 1);
    const timer = setTimeout(again, Math.min(60_000, 10_000 * 2 ** tries));
    window.addEventListener("focus", again);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", again);
    };
  }, [waiting, tries]);
  const url = current ? current.url : undefined;
  if (url === undefined) return <div className={cn("h-full w-full shimmer", className)} />;
  if (url === null) {
    const later = offline || current?.retry;
    return (
      <div className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-well px-2 text-center text-subtle", className)} role="img" aria-label={`${alt}: ${later ? "disponible con conexión" : "no disponible"}`}>
        <CloudOff className="size-5" aria-hidden />
        <span className="text-[11px] leading-tight">{later ? "Disponible con conexión" : "Foto no disponible"}</span>
      </div>
    );
  }
  const signed = !url.startsWith("blob:");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      onLoad={() => {
        if (signed) rememberStoragePhoto(path, url);
      }}
      onError={() => {
        // An expired or revoked link: sign once more, then give up.
        if (signed) forgetSignedUrl(path);
        if (signed && attempt < 1) setAttempt((n) => n + 1);
        else setResolved({ path, url: null, retry: false });
      }}
    />
  );
}

/**
 * Thumbnail card with kind badge, area and time. Shows a cloud-off chip when not yet synced and the evidence flags (picked from
 * the gallery · time outside the jornada) so a photo's provenance is visible wherever it is listed; `flags={false}` hides them.
 */
export function PhotoThumb({
  photo,
  className,
  meta = true,
  pending,
  selected,
  flags = true,
  jornada,
  onClick,
  children,
}: {
  photo: Photo;
  className?: string;
  meta?: boolean;
  pending?: boolean;
  selected?: boolean;
  flags?: boolean;
  /** Jornada to check the capture time against; defaults to the photo's own jornada from the store. */
  jornada?: Pick<Jornada, "checkIn" | "checkOut">;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const k = PHOTO_KIND[photo.kind];
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={onClick ? { y: -2 } : undefined}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-[16px] bg-well text-left ring-1 ring-edge",
        selected && "ring-2 ring-link ring-offset-2",
        className,
      )}
    >
      <PhotoImage photo={photo} />
      {meta && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-ink backdrop-blur dark:text-on-light">
            <span className={cn("size-1.5 rounded-full", toneDot[k.tone])} />
            {k.label.toUpperCase()}
          </span>
          <span className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-2 text-white">
            <span className="truncate text-[12px] font-medium">{photo.area}</span>
            <span className="shrink-0 text-[11px] opacity-80 tabular">{fmtTime(photo.takenAt)}</span>
          </span>
        </>
      )}
      {flags && <PhotoFlags photo={photo} jornada={jornada} compact={!meta} />}
      {pending && (
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-semibold text-amber-fg">
          <CloudOff className="size-3" /> Pendiente
        </span>
      )}
      {children}
    </Comp>
  );
}

/* ───────────── before / after squeegee slider ───────────── */

/**
 * Drag the squeegee to wipe from ANTES to DESPUÉS. On mount it performs one "wipe" pass.
 * Touch: the photo only claims horizontal drags (`touch-pan-y`), so a vertical swipe that starts
 * on it still scrolls the page; the handle claims every drag that starts on it (`touch-none`).
 */
export function BeforeAfter({ before, after, className }: { before: Photo; after: Photo; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMotionValue(100);
  const clip = useTransform(pos, (v) => `inset(0 0 0 ${v}%)`);
  const left = useTransform(pos, (v) => `${v}%`);

  useEffect(() => {
    const controls = animate(pos, [100, 18, 50], { duration: 2.2, ease: [0.65, 0, 0.35, 1], delay: 0.4 });
    return () => controls.stop();
  }, [pos]);

  // Screen readers get the live position without re-rendering on every animation frame.
  useEffect(() => pos.on("change", (v) => ref.current?.setAttribute("aria-valuenow", String(Math.round(v)))), [pos]);

  const setFromClient = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    pos.set(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className={cn("relative aspect-[4/3] w-full touch-pan-y select-none overflow-hidden rounded-[20px] ring-1 ring-edge", className)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        // touch waits for a horizontal drag or a tap: a vertical page scroll starting here must not move the slider
        if (e.pointerType !== "touch") setFromClient(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && setFromClient(e.clientX)}
      onPointerUp={(e) => e.pointerType === "touch" && setFromClient(e.clientX)}
      role="slider"
      aria-label="Comparar antes y después"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") pos.set(Math.max(0, pos.get() - 5));
        if (e.key === "ArrowRight") pos.set(Math.min(100, pos.get() + 5));
      }}
    >
      <div className="absolute inset-0">
        <PhotoImage photo={before} />
      </div>
      <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
        <PhotoImage photo={after} />
      </motion.div>
      {/* provenance of each side, mirroring the ANTES / DESPUÉS pills: left = ANTES, right = DESPUÉS */}
      <PhotoFlags photo={before} compact className="left-3 top-auto bottom-3" />
      <PhotoFlags photo={after} compact className="left-auto right-3 top-auto bottom-3" />
      <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] text-white backdrop-blur">ANTES</span>
      <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] text-ink backdrop-blur dark:text-on-light">DESPUÉS</span>
      {/* touch-none: dragging the handle never turns into a page scroll; 44px grab zone on touch screens */}
      <motion.div className="absolute inset-y-0 -ml-[3px] w-[6px] cursor-ew-resize touch-none pointer-coarse:-ml-[22px] pointer-coarse:w-11" style={{ left }}>
        <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_14px_rgb(122_209_244/0.9)]" />
        <div className="absolute left-1/2 top-1/2 flex h-14 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lift">
          <span className="h-7 w-[3px] rounded-full bg-brand" />
        </div>
      </motion.div>
    </div>
  );
}
