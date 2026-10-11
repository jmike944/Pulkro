"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as Cmdk } from "cmdk";
import { ArrowUpRight, ClipboardList, Map as MapIcon, Plus, Search, WifiOff, type LucideIcon } from "lucide-react";
import type { Client, Order, Worker } from "@/lib/types";
import { useCan, useLookups, useMediaQuery, useScopedCatalog, useScopedData } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { fmtDay, fmtLongDay } from "@/lib/format";
import { mapsLink } from "@/lib/domain";
import { ORDER_STATUS } from "@/lib/status";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { AvatarStack, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill, StatusDot } from "@/components/pk/status";
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
      // stable: equal best scores keep the order above (Órdenes first)
      .sort((a, b) => (best[b.label] ?? 0) - (best[a.label] ?? 0));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-[22px] p-0 shadow-lift",
          "top-[max(12px,env(safe-area-inset-top))] translate-y-0 max-sm:max-w-[calc(100%-1rem)] lg:top-[11vh]",
          "sm:max-w-[min(820px,calc(100%-2rem))]",
        )}
      >
        <DialogTitle className="sr-only">Buscar en Pulkro</DialogTitle>
        <DialogDescription className="sr-only">Órdenes, clientes, personal y secciones de tu alcance</DialogDescription>
        <Cmdk shouldFilter={false} loop value={current?.key ?? ""} onValueChange={setSelected} className="flex min-h-0 min-w-0 flex-col" label="Buscar en Pulkro">
          {/* query row */}
          <div className="flex items-center gap-3 border-b border-hairline px-4 lg:px-5">
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
                Cancelar
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
                <p className="mx-auto mt-1 max-w-[34ch] text-[13.5px] text-subtle">Prueba con un folio como OS-24404, el nombre corto del cliente o el municipio del sitio.</p>
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
                {tokens.length ? `${flat.length} ${flat.length === 1 ? "resultado" : "resultados"}` : `${orders.length} órdenes en tu alcance`}
              </span>
            </div>
          )}
        </Cmdk>
      </DialogContent>
    </Dialog>
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
      <p className="font-serif text-[19px] text-ink">Busca y revisa sin salir</p>
      <p className="mt-1 text-[13px] text-subtle">Muévete con las flechas: aquí verás el detalle de cada resultado.</p>
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
    const theirs = orders.filter((o) => o.clientId === c.id).sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
    const last = theirs[0];
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
          ["Órdenes", `${hit.orders} en tu alcance`],
          last && ["Último servicio", `${last.folio}, ${fmtDay(last.scheduledStart)}`],
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

