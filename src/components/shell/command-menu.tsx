"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as Cmdk } from "cmdk";
import { AnimatePresence, animate, motion, usePresence, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowUpRight, ClipboardList, Map as MapIcon, Plus, Search, WifiOff, type LucideIcon } from "lucide-react";
import type { Client, Order, Worker } from "@/lib/types";
import { useCan, useLookups, useMediaQuery, useScopedCatalog, useScopedData } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { fmtDay, fmtLongDay } from "@/lib/format";
import { mapsLink } from "@/lib/domain";
import { ORDER_STATUS } from "@/lib/status";
import { Kbd } from "@/components/ui/kbd";
import { AvatarStack, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill, StatusDot } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { SearchButtonFace, SearchPillFace } from "./header-tools";
import { canSeeRoute, navFor, type NavItem } from "./nav";

/**
 * Phones: expose the *visual* viewport height (it shrinks when the on-screen keyboard opens, unlike dvh) as --pk-vvh
 * so the palette list can size itself to the space above the keyboard.
 */
function useVisualViewportHeight(active: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--pk-vvh", `${Math.round(vv.height)}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      root.style.removeProperty("--pk-vvh");
    };
  }, [active]);
}

/* ─────────────────────────── Search model ─────────────────────────── */

type Hit =
  | { key: string; kind: "orden"; order: Order }
  | { key: string; kind: "cliente"; client: Client; orders: number }
  | { key: string; kind: "persona"; worker: Worker }
  | { key: string; kind: "seccion"; item: NavItem }
  | { key: string; kind: "accion"; id: "nueva" | "mapa" | "sync"; label: string; icon: LucideIcon; hint?: string };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const tokensOf = (q: string) => fold(q).split(/\s+/).filter(Boolean);

/**
 * Score a record: every token must appear in some field; earlier fields weigh more (folio/name > client > place/title).
 * Returns 0 when a token is missing.
 */
function score(tokens: string[], fields: string[]) {
  const folded = fields.map(fold);
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    folded.forEach((f, i) => {
      if (!f) return;
      const w = Math.max(1, 6 - i * 1.5);
      if (f.startsWith(t) || f.includes(` ${t}`) || f.includes(`-${t}`)) best = Math.max(best, w * 2);
      else if (f.includes(t)) best = Math.max(best, w);
    });
    if (!best) return 0;
    total += best;
  }
  return total;
}

/** Wrap the query's tokens in <mark> (accent-insensitive). */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length || !text) return <>{text}</>;
  const folded = fold(text);
  const marks: [number, number][] = [];
  for (const t of tokens) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      marks.push([i, i + t.length]);
      i = folded.indexOf(t, i + t.length);
    }
  }
  if (!marks.length) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <mark key={s} className="rounded-[3px] bg-sky/45 px-px text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}

/* ─────────────────────────── Palette ─────────────────────────── */

/**
 * Global ⌘K search: a dispatch console. Results on the left (ranked, highlighted, grouped with counts), a live
 * preview of the highlighted order / client / person on the right (desktop). Empty query = recent orders, quick
 * actions and every section the role may open. Everything is scoped to the current role (doc §2).
 */
export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const setSyncOpen = useUi((s) => s.setSyncOpen);
  const router = useRouter();
  const { orders, user } = useScopedData();
  const lk = useLookups();
  const catalog = useScopedCatalog();
  const canCreate = useCan("order.create");
  const wide = useMediaQuery("(min-width: 1024px)");
  const nav = navFor(user.role);
  const showCrew = canSeeRoute(user.role, "/equipo");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");

  useVisualViewportHeight(open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const wasOpen = useUi.getState().commandOpen;
        setOpen(!wasOpen);
        // Closing with the shortcut must reset like every other close path (Esc, Cancelar, a result).
        if (wasOpen) {
          setQuery("");
          setSelected("");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setQuery("");
      setSelected("");
    }
  };

  const tokens = useMemo(() => tokensOf(query), [query]);
  const sections = useMemo(() => [...nav.home, ...nav.groups.flatMap((g) => g.items), ...nav.foot], [nav]);

  const groups = useMemo(() => {
    const byRecent = [...orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const ordersPerClient = new Map<string, number>();
    for (const o of orders) ordersPerClient.set(o.clientId, (ordersPerClient.get(o.clientId) ?? 0) + 1);
    const actions: Hit[] = [
      ...(canCreate ? [{ key: "accion:nueva", kind: "accion" as const, id: "nueva" as const, label: "Nueva orden de servicio", icon: Plus, hint: "Alta manual" }] : []),
      { key: "accion:mapa", kind: "accion", id: "mapa", label: "Mapa del día", icon: MapIcon, hint: "Servicios en curso y terminados" },
      { key: "accion:sync", kind: "accion", id: "sync", label: "Estado de sincronización", icon: WifiOff, hint: "Cola y conexión" },
    ];

    if (!tokens.length) {
      return [
        { label: "Recientes", hits: byRecent.slice(0, 5).map((o): Hit => ({ key: `orden:${o.id}`, kind: "orden", order: o })) },
        { label: "Acciones", hits: actions },
        { label: "Ir a", hits: sections.map((item): Hit => ({ key: `seccion:${item.key}`, kind: "seccion", item })), grid: true },
      ];
    }

    // Best score per group decides group order (a query that names a client shows "Clientes" first).
    const best: Record<string, number> = {};
    const rank = <T,>(group: string, rows: T[], fields: (r: T) => string[], limit: number) => {
      const scored = rows
        .map((r) => ({ r, s: score(tokens, fields(r)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit);
      best[group] = scored[0]?.s ?? 0;
      return scored.map((x) => x.r);
    };

    const orderHits = rank(
      "Órdenes",
      byRecent,
      (o) => {
        const c = lk.clients.get(o.clientId);
        const site = lk.sites.get(o.siteId);
        return [o.folio, `${c?.shortName ?? ""} ${c?.name ?? ""}`, `${site?.name ?? ""} ${site?.municipality ?? ""}`, o.title, `${site?.address ?? ""} ${lk.users.get(o.supervisorId)?.name ?? ""}`];
      },
      8,
    );
    const clientHits = rank("Clientes", catalog.clients, (c) => [c.shortName, c.name, c.contactName, String(c.segment)], 5);
    const workerHits = showCrew ? rank("Personal", catalog.workers.filter((w) => w.active), (w) => [w.name, w.specialty], 5) : [];
    const sectionHits = rank("Secciones", sections, (s) => [s.label], 6);
    const actionHits = rank("Acciones", actions, (a) => [a.kind === "accion" ? a.label : ""], 3);

    return [
      { label: "Órdenes", hits: orderHits.map((o): Hit => ({ key: `orden:${o.id}`, kind: "orden", order: o })) },
      { label: "Clientes", hits: clientHits.map((c): Hit => ({ key: `cliente:${c.id}`, kind: "cliente", client: c, orders: ordersPerClient.get(c.id) ?? 0 })) },
      { label: "Personal", hits: workerHits.map((w): Hit => ({ key: `persona:${w.id}`, kind: "persona", worker: w })) },
      { label: "Secciones", hits: sectionHits.map((item): Hit => ({ key: `seccion:${item.key}`, kind: "seccion", item })), grid: false },
      { label: "Acciones", hits: actionHits },
    ]
      .filter((g) => g.hits.length > 0)
      // Best match first; on a tie a client beats its orders (a client's full name also feeds its orders' score).
      .sort((a, b) => (best[b.label] ?? 0) + (b.label === "Clientes" ? 0.5 : 0) - ((best[a.label] ?? 0) + (a.label === "Clientes" ? 0.5 : 0)));
  }, [tokens, orders, lk, catalog, showCrew, sections, canCreate]);

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const current = flat.find((h) => h.key === selected) ?? flat[0];

  const run = (h: Hit) => {
    onOpenChange(false);
    switch (h.kind) {
      case "orden":
        return router.push(`/ordenes/${h.order.folio}`);
      case "cliente":
        return router.push(`/clientes/${h.client.id}`);
      case "persona":
        return router.push(`/equipo?w=${h.worker.id}`);
      case "seccion":
        return router.push(h.item.href);
      case "accion":
        if (h.id === "sync") return setSyncOpen(true);
        return router.push(h.id === "nueva" ? "/ordenes/nueva" : "/mapa");
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.22, delay: 0.08 } }}
                className="fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/55"
              />
            </DialogPrimitive.Overlay>
            <PalettePanel wide={wide}>
        <DialogPrimitive.Title className="sr-only">Buscar en Pulkro</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">Órdenes, clientes, personal y secciones de su alcance</DialogPrimitive.Description>
        <Cmdk shouldFilter={false} loop value={current?.key ?? ""} onValueChange={setSelected} className="flex min-h-0 min-w-0 flex-col" label="Buscar en Pulkro">
          {/* query row */}
          <div data-palette-row="" className="flex items-center gap-3 border-b border-hairline px-4 lg:px-5">
            <Search className="size-5 shrink-0 text-subtle" aria-hidden />
            <Cmdk.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Folio, cliente, sitio o persona"
              // 16px on phones: smaller input text makes iOS zoom the page on focus
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint lg:h-16 lg:text-[17px]"
            />
            {wide ? (
              <Kbd className="bg-tile text-[11px]">Esc</Kbd>
            ) : (
              <button type="button" onClick={() => onOpenChange(false)} className="inline-flex h-11 shrink-0 items-center px-1 text-[15px] font-semibold text-link">
                Cerrar
              </button>
            )}
          </div>

          <div className="flex min-h-0">
            <Cmdk.List
              className={cn(
                "min-w-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3",
                "max-h-[min(calc(var(--pk-vvh,100dvh)-6rem),36rem)] lg:h-[440px] lg:max-h-none",
              )}
            >
              <Cmdk.Empty className="px-4 py-12 text-center">
                <p className="font-serif text-[19px] text-ink">Nada con “{query}”</p>
                <p className="mx-auto mt-1 max-w-[34ch] text-[13.5px] text-subtle">Pruebe con un folio como OS-24404, el nombre corto del cliente o el municipio del sitio.</p>
              </Cmdk.Empty>
              {groups.map((g) => (
                <Cmdk.Group
                  key={g.label}
                  heading={
                    <span className="flex items-baseline justify-between font-serif text-[14.5px] text-ink-muted">
                      {g.label}
                      {tokens.length > 0 && <span className="font-sans text-[12px] tabular-nums text-faint">{g.hits.length}</span>}
                    </span>
                  }
                  className={cn(g.grid && "[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 [&_[cmdk-group-items]]:gap-1 sm:[&_[cmdk-group-items]]:grid-cols-3")}
                >
                  {g.hits.map((h) => (
                    <ResultRow key={h.key} hit={h} tokens={tokens} compact={!!g.grid} onSelect={() => run(h)} />
                  ))}
                </Cmdk.Group>
              ))}
            </Cmdk.List>

            {wide && (
              <aside aria-label="Vista previa" className="hidden w-[320px] shrink-0 border-l border-hairline bg-wash lg:block">
                {current ? <Preview hit={current} onRun={run} /> : <PreviewHint />}
              </aside>
            )}
          </div>

          {wide && (
            <div className="flex items-center gap-4 border-t border-hairline px-5 py-2.5 text-[12px] text-subtle">
              <span className="flex items-center gap-1.5">
                <Kbd className="bg-tile">↑</Kbd>
                <Kbd className="bg-tile">↓</Kbd> moverse
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd className="bg-tile">↵</Kbd> abrir
              </span>
              <span className="ml-auto tabular-nums">
                {tokens.length ? `${flat.length} ${flat.length === 1 ? "resultado" : "resultados"}` : `${orders.length} órdenes en su alcance`}
              </span>
            </div>
          )}
        </Cmdk>
            </PalettePanel>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/* ─────────────────────────── Opening morph ─────────────────────────── */

type Origin = { rect: DOMRect; radius: number; kind: "pill" | "button" };

/** The search control the palette grows out of: the header pill (lg) or the round phone button — only if it is on screen. */
function findOrigin(): Origin | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-search-origin]")) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    // `rounded-full` computes to a huge radius (≈1.7e7px): cap it at the shape's own half-size, which draws the same circle
    // and keeps the clip interpolable.
    const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2);
    return { rect, radius, kind: el.dataset.searchOrigin === "button" ? "button" : "pill" };
  }
  return null;
}

/**
 * The clip once open: it stays, with room around the panel for its lift shadow (--sh-lift reaches ~52px below, ~28px aside and
 * ~4px above), so the open palette looks exactly unclipped and closing starts from a known value.
 */
const SHADOW_ROOM = "inset(-24px -40px -64px -40px round 22px)";

/**
 * The palette's panel. It opens out of the search control that launched it (or the one on screen, for ⌘K): a copy of the
 * control's face sits where the control was, the panel is clipped to that shape and grows into place while the copy fades
 * into the query row; closing runs it backwards into the control. On wide screens the panel is centered under the pill.
 * Without an origin on screen, or with reduced motion, it just fades.
 *
 * Only transform, clip-path and opacity animate (no layout); the row, list and preview keep their final layout throughout.
 */
function PalettePanel({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [isPresent, safeToRemove] = usePresence();
  // Read once, when the palette mounts: the control it opens from decides the copy drawn in its place.
  const [origin] = useState(findOrigin);
  /** Where the panel starts (offset and clip window), so closing can run the opening backwards. */
  const from = useRef<{ x: number; y: number; clip: string } | null>(null);
  const closing = useRef(false);
  const running = useRef<AnimationPlaybackControls[]>([]);
  /** Bumped on every run, so a stopped closing never removes a palette that was reopened meanwhile. */
  const run = useRef(0);

  const stop = () => {
    run.current++;
    running.current.forEach((a) => a.stop());
    running.current = [];
  };

  /** Into place: offset and clip to the open state, the copy out, the content in. */
  const grow = (panel: HTMLElement, ghost: HTMLElement, body: HTMLElement, start?: { x: number; y: number; clip: string }) => {
    running.current = [
      animate(panel, start ? { x: [start.x, 0], y: [start.y, 0], clipPath: [start.clip, SHADOW_ROOM] } : { x: 0, y: 0, clipPath: SHADOW_ROOM }, { duration: 0.46, ease: EASE }),
      animate(ghost, { opacity: 0 }, { duration: 0.16, ease: "easeOut", delay: 0.04 }),
      animate(body, { opacity: 1 }, { duration: 0.24, ease: "easeOut", delay: 0.08 }),
    ];
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const ghost = ghostRef.current;
    const body = bodyRef.current;
    if (!panel || !ghost || !body) return;
    if (!origin || reduced) {
      ghost.style.display = "none";
      running.current = [animate(panel, { opacity: [0, 1], y: [-6, 0] }, { duration: 0.18, ease: EASE })];
      return stop;
    }
    // Measure the resting panel (an effect that runs twice in development finds the first run's offset and clip).
    panel.style.transform = "";
    panel.style.clipPath = "";
    const p = origin.rect;
    if (wide && origin.kind === "pill") {
      const w = panel.offsetWidth;
      panel.style.left = `${Math.min(Math.max(p.left + p.width / 2, 16 + w / 2), window.innerWidth - 16 - w / 2)}px`;
    }
    const d = panel.getBoundingClientRect();
    const row = panel.querySelector<HTMLElement>("[data-palette-row]");
    // The window covers the left end of the query row, vertically centred on it, so the copy's icon lands on the row's icon.
    const top = Math.max(0, ((row?.offsetHeight ?? p.height) - p.height) / 2);
    const px = (n: number) => `${Math.round(Math.max(0, n) * 10) / 10}px`;
    const start = {
      x: p.left - d.left,
      y: p.top - d.top - top,
      clip: `inset(${px(top)} ${px(d.width - p.width)} ${px(d.height - top - p.height)} 0px round ${px(origin.radius)})`,
    };
    from.current = start;
    Object.assign(ghost.style, { top: `${top}px`, width: `${p.width}px`, height: `${p.height}px`, borderRadius: `${origin.radius}px`, opacity: "1" });
    // First frame by hand, before paint: the panel shows exactly the control it replaces.
    panel.style.transform = `translateX(${start.x}px) translateY(${start.y}px)`;
    panel.style.clipPath = start.clip;
    body.style.opacity = "0";
    try {
      grow(panel, ghost, body, start);
    } catch {
      // Never leave the search stuck in the control's shape: show it in place.
      Object.assign(panel.style, { transform: "", clipPath: "" });
      body.style.opacity = "1";
      ghost.style.opacity = "0";
      from.current = null;
    }
    return stop;
    // Mount-only: the palette is remounted on every opening (a reopening while it closes is handled below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const ghost = ghostRef.current;
    const body = bodyRef.current;
    if (isPresent) {
      // Reopened while it was closing (⌘K twice quickly): grow back from where it got to.
      if (!closing.current) return;
      closing.current = false;
      stop();
      if (panel && ghost && body && from.current && !reduced) grow(panel, ghost, body);
      else if (panel) running.current = [animate(panel, { opacity: 1, y: 0 }, { duration: 0.14 })];
      return;
    }
    closing.current = true;
    stop();
    const mine = run.current;
    const done = () => {
      if (mine === run.current && closing.current) safeToRemove();
    };
    if (!panel) return safeToRemove();
    if (!ghost || !body || !from.current || reduced) {
      const fade = animate(panel, { opacity: 0, y: -4 }, { duration: 0.14 });
      running.current = [fade];
      void fade.finished.then(done);
      return;
    }
    // Back into the control, from wherever the opening got to.
    const shrunk = animate(panel, { x: from.current.x, y: from.current.y, clipPath: from.current.clip }, { duration: 0.3, ease: [0.4, 0, 0.2, 1] });
    running.current = [shrunk, animate(body, { opacity: 0 }, { duration: 0.12, ease: "easeIn" }), animate(ghost, { opacity: 1 }, { duration: 0.14, ease: "easeOut", delay: 0.06 })];
    void shrunk.finished.then(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  return (
    <DialogPrimitive.Content
      ref={panelRef}
      forceMount
      className={cn(
        "fixed left-1/2 z-50 flex w-full -translate-x-1/2 flex-col overflow-hidden rounded-[22px] bg-popover text-sm text-popover-foreground shadow-lift ring-1 ring-foreground/10 outline-none",
        "top-[max(12px,env(safe-area-inset-top))] max-w-[calc(100%-1rem)] sm:max-w-[min(820px,calc(100%-2rem))] lg:top-[11vh]",
      )}
    >
      <div ref={bodyRef} className="flex min-h-0 min-w-0 flex-col">
        {children}
      </div>
      {/* the control's face, drawn where it was: visible only while the panel grows out of it or shrinks back into it */}
      <div
        ref={ghostRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 flex items-center opacity-0",
          origin?.kind === "button" ? "justify-center bg-sand text-ink" : "gap-2.5 border border-hairline bg-surface px-3.5 text-[14px] text-faint",
        )}
      >
        {origin?.kind === "button" ? <SearchButtonFace /> : <SearchPillFace />}
      </div>
    </DialogPrimitive.Content>
  );
}

/* ─────────────────────────── Rows ─────────────────────────── */

const ROW =
  "group flex cursor-pointer select-none items-center gap-3 rounded-[12px] px-3 py-2 text-ink outline-none data-[selected=true]:bg-tile max-lg:min-h-11";

function ResultRow({ hit, tokens, compact, onSelect }: { hit: Hit; tokens: string[]; compact: boolean; onSelect: () => void }) {
  const lk = useLookups();

  if (hit.kind === "orden") {
    const o = hit.order;
    const c = lk.clients.get(o.clientId);
    const site = lk.sites.get(o.siteId);
    const st = ORDER_STATUS[o.status];
    return (
      <Cmdk.Item value={hit.key} onSelect={onSelect} className={ROW}>
        {c ? <ClientMark name={c.shortName} hue={c.hue} size={32} /> : <IconTile icon={ClipboardList} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
              <Highlight text={o.folio} tokens={tokens} />
            </span>
            <span className="truncate text-[14px] text-ink-soft">
              <Highlight text={o.title} tokens={tokens} />
            </span>
          </span>
          <span className="block truncate text-[12.5px] text-subtle">
            <Highlight text={`${c?.shortName ?? ""}${site ? `, ${site.name}` : ""}`} tokens={tokens} />
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <StatusDot tone={st.tone} /> {st.label}
          </span>
          <span className="text-[11.5px] tabular-nums text-faint">{fmtDay(o.scheduledStart)}</span>
        </span>
      </Cmdk.Item>
    );
  }

  if (hit.kind === "cliente") {
    const c = hit.client;
    return (
      <Cmdk.Item value={hit.key} onSelect={onSelect} className={ROW}>
        <ClientMark name={c.shortName} hue={c.hue} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            <Highlight text={c.name} tokens={tokens} />
          </span>
          <span className="block truncate text-[12.5px] text-subtle">
            <Highlight text={c.contactName} tokens={tokens} />
          </span>
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-faint">
          {hit.orders} {hit.orders === 1 ? "orden" : "órdenes"}
        </span>
      </Cmdk.Item>
    );
  }

  if (hit.kind === "persona") {
    const w = hit.worker;
    return (
      <Cmdk.Item value={hit.key} onSelect={onSelect} className={ROW}>
        <PersonAvatar initials={w.initials} hue={w.hue} size={32} name={w.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            <Highlight text={w.name} tokens={tokens} />
          </span>
          <span className="block truncate text-[12.5px] text-subtle">
            <Highlight text={w.specialty} tokens={tokens} />
          </span>
        </span>
      </Cmdk.Item>
    );
  }

  if (hit.kind === "seccion") {
    const Icon = hit.item.icon;
    return (
      <Cmdk.Item value={hit.key} onSelect={onSelect} className={cn(ROW, compact && "py-2")}>
        <IconTile icon={Icon} />
        <span className="truncate text-[14px] font-medium">
          <Highlight text={hit.item.label} tokens={tokens} />
        </span>
      </Cmdk.Item>
    );
  }

  const Icon = hit.icon;
  return (
    <Cmdk.Item value={hit.key} onSelect={onSelect} className={ROW}>
      <IconTile icon={Icon} accent={hit.id === "nueva"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">
          <Highlight text={hit.label} tokens={tokens} />
        </span>
        {hit.hint && <span className="block truncate text-[12.5px] text-subtle">{hit.hint}</span>}
      </span>
    </Cmdk.Item>
  );
}

function IconTile({ icon: Icon, accent }: { icon: LucideIcon; accent?: boolean }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", accent ? "bg-brand-deep text-white" : "bg-tile text-ink-muted group-data-[selected=true]:bg-surface")}>
      <Icon className="size-[16px]" />
    </span>
  );
}

/* ─────────────────────────── Preview ─────────────────────────── */

function PreviewHint() {
  return (
    <div className="flex h-full flex-col justify-center px-6 text-center">
      <p className="font-serif text-[19px] text-ink">Busque y revise sin salir</p>
      <p className="mt-1 text-[13px] text-subtle">Recorra los resultados con las flechas: aquí verá el detalle de cada uno.</p>
    </div>
  );
}

function Preview({ hit, onRun }: { hit: Hit; onRun: (h: Hit) => void }) {
  const lk = useLookups();
  const { jornadas, orders } = useScopedData();

  if (hit.kind === "orden") {
    const o = hit.order;
    const c = lk.clients.get(o.clientId);
    const site = lk.sites.get(o.siteId);
    const sup = lk.users.get(o.supervisorId);
    const js = jornadas.filter((j) => j.orderId === o.id).sort((a, b) => a.dayIndex - b.dayIndex);
    const next = js.find((j) => j.status !== "cerrada") ?? js.at(-1);
    const crew = (next?.workerIds ?? []).map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w);
    const day = fmtLongDay(o.scheduledStart);
    return (
      <PreviewFrame
        top={
          <>
            {c && <ClientMark name={c.shortName} hue={c.hue} size={44} />}
            <p className="mt-3 text-[12.5px] font-semibold tabular-nums text-subtle">
              {o.folio}
              {c ? `, ${c.shortName}` : ""}
            </p>
            <h3 className="mt-1 font-serif text-[22px] leading-[1.15] text-ink">{o.title}</h3>
            <OrderStatusPill status={o.status} className="mt-3" />
          </>
        }
        rows={[
          site && ["Sitio", `${site.name}, ${site.municipality}`],
          ["Programada", day.charAt(0).toUpperCase() + day.slice(1)],
          js.length > 1 && ["Jornadas", `${js.length} jornadas`],
        ]}
        people={
          <>
            {sup && (
              <div className="flex items-center gap-2.5">
                <PersonAvatar initials={sup.initials} hue={sup.hue} size={28} name={sup.name} />
                <span className="min-w-0 text-[13px]">
                  <span className="block truncate font-medium text-ink">{sup.name}</span>
                  <span className="block text-[12px] text-subtle">Supervisor</span>
                </span>
              </div>
            )}
            {crew.length > 0 && (
              <div className="mt-3 flex items-center gap-2.5">
                <AvatarStack people={crew} size={26} max={5} interactive={false} />
                <span className="text-[12.5px] text-subtle">
                  {crew.length} en la cuadrilla
                </span>
              </div>
            )}
          </>
        }
        actions={
          <>
            <PrimaryAction onClick={() => onRun(hit)}>Abrir orden</PrimaryAction>
            {site && (
              <a
                href={mapsLink(site.lat, site.lng)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] border border-line px-3 text-[13.5px] font-semibold text-ink transition hover:bg-surface"
              >
                Abrir en Maps <ArrowUpRight className="size-4" />
              </a>
            )}
          </>
        }
      />
    );
  }

  if (hit.kind === "cliente") {
    const c = hit.client;
    // A service counts once its closure is validated (same criterion as the client metrics).
    const last = orders
      .filter((o) => o.clientId === c.id && o.closure?.validatedAt)
      .sort((a, b) => (b.closure?.validatedAt ?? "").localeCompare(a.closure?.validatedAt ?? ""))[0];
    return (
      <PreviewFrame
        top={
          <>
            <ClientMark name={c.shortName} hue={c.hue} size={44} />
            <h3 className="mt-3 font-serif text-[22px] leading-[1.15] text-ink">{c.name}</h3>
            <p className="mt-1 text-[13px] text-subtle">{String(c.segment)}</p>
          </>
        }
        rows={[
          ["Contacto", c.contactName],
          ["Órdenes", `${hit.orders} en su alcance`],
          last?.closure && ["Último servicio", `${last.folio}, ${fmtDay(last.closure.validatedAt)}`],
        ]}
        actions={<PrimaryAction onClick={() => onRun(hit)}>Abrir cliente</PrimaryAction>}
      />
    );
  }

  if (hit.kind === "persona") {
    const w = hit.worker;
    return (
      <PreviewFrame
        top={
          <>
            <PersonAvatar initials={w.initials} hue={w.hue} size={44} name={w.name} />
            <h3 className="mt-3 font-serif text-[22px] leading-[1.15] text-ink">{w.name}</h3>
            <p className="mt-1 text-[13px] text-subtle">{w.specialty}</p>
          </>
        }
        actions={<PrimaryAction onClick={() => onRun(hit)}>Ver en Equipo</PrimaryAction>}
      />
    );
  }

  const Icon = hit.kind === "seccion" ? hit.item.icon : hit.icon;
  const label = hit.kind === "seccion" ? hit.item.label : hit.label;
  return (
    <PreviewFrame
      top={
        <>
          <span className="grid size-11 place-items-center rounded-[14px] bg-surface text-ink ring-1 ring-edge">
            <Icon className="size-5" />
          </span>
          <h3 className="mt-3 font-serif text-[22px] leading-[1.15] text-ink">{label}</h3>
          {hit.kind === "accion" && hit.hint && <p className="mt-1 text-[13px] text-subtle">{hit.hint}</p>}
        </>
      }
      actions={<PrimaryAction onClick={() => onRun(hit)}>{hit.kind === "seccion" ? `Ir a ${label}` : label}</PrimaryAction>}
    />
  );
}

function PreviewFrame({
  top,
  rows = [],
  people,
  actions,
}: {
  top: React.ReactNode;
  rows?: (readonly [string, string] | false | undefined | null | "")[];
  people?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const shown = rows.filter((r): r is readonly [string, string] => Array.isArray(r));
  return (
    <div className="flex h-full flex-col p-5">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {top}
        {shown.length > 0 && (
          <dl className="mt-5 space-y-2.5 border-t border-hairline pt-4 text-[13px]">
            {shown.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                <dt className="text-subtle">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {people && <div className="mt-4 border-t border-hairline pt-4">{people}</div>}
      </div>
      <div className="mt-4 flex flex-col gap-2">{actions}</div>
    </div>
  );
}

function PrimaryAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-brand-deep px-3 text-[13.5px] font-semibold text-white outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-azure/60"
    >
      {children}
      <Kbd className="border-white/25 bg-white/15 text-white">↵</Kbd>
    </button>
  );
}

