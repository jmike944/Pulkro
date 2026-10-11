"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  Bell,
  BookMarked,
  Camera,
  ClipboardList,
  Clock3,
  FileCheck2,
  LogIn,
  LogOut,
  MessageSquareWarning,
  NotebookPen,
  Send,
  Star,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { AuditEntry, Order } from "@/lib/types";
import { useCurrentUser, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { fmtLongDay, fmtTime, d as toDate } from "@/lib/format";
import { toneDot, toneSoftBg, toneText, type Tone } from "@/lib/status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BottomSheet } from "./bottom-sheet";
import { useCanSeeRoute } from "./use-can-see-route";

/* ─────────────────────────── Model ─────────────────────────── */

type Category = "campo" | "ordenes" | "postventa" | "otros";
const FILTERS: { value: Category | "todo"; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "campo", label: "Campo" },
  { value: "ordenes", label: "Órdenes" },
  { value: "postventa", label: "Postventa" },
];

type Glyph = { icon: LucideIcon; tone: Tone; category: Category };

/** Icon, tone and filter group for an entry: what happened, at a glance. */
function glyphFor(a: AuditEntry): Glyph {
  const t = a.action;
  switch (a.entity) {
    case "jornada":
      if (/^Registro de entrada/.test(t)) return { icon: LogIn, tone: "blue", category: "campo" };
      if (/^Registro de salida/.test(t)) return { icon: LogOut, tone: "teal", category: "campo" };
      if (/desglose de horas/.test(t)) return { icon: Clock3, tone: "slate", category: "campo" };
      return { icon: NotebookPen, tone: "slate", category: "campo" };
    case "foto":
      return { icon: Camera, tone: "sky", category: "campo" };
    case "incidencia":
      return { icon: TriangleAlert, tone: /^Resolvió/.test(t) ? "teal" : "red", category: "campo" };
    case "reporte":
      return /^Inició envío/.test(t) ? { icon: Send, tone: "navy", category: "ordenes" } : { icon: FileCheck2, tone: "navy", category: "ordenes" };
    case "orden":
      if (/cierre/i.test(t)) return { icon: BadgeCheck, tone: "teal", category: "ordenes" };
      return { icon: ClipboardList, tone: "navy", category: "ordenes" };
    case "caso":
      return { icon: MessageSquareWarning, tone: "violet", category: "postventa" };
    case "encuesta":
      return { icon: Star, tone: "amber", category: "postventa" };
    case "usuario":
      return { icon: UserRound, tone: "slate", category: "otros" };
    default:
      return { icon: BookMarked, tone: "slate", category: "otros" };
  }
}

/**
 * Audit actions are written as headlines ("Registro de salida · Jornada 2 (GPS ±6 m)", "Alta manual de orden…").
 * Turn them into a sentence predicate for "<actor> <predicate>" and keep the part after " · " as detail.
 */
function phrase(action: string): { actor?: "cliente"; predicate: string; detail?: string } {
  const [head, ...rest] = action.split(" · ");
  const detail = rest.join(" · ") || undefined;
  const rules: [RegExp, string][] = [
    [/^Alta manual de orden de servicio$/, "dio de alta la orden"],
    [/^Registro de entrada$/, "registró la entrada"],
    [/^Registro de salida$/, "registró la salida"],
  ];
  for (const [re, out] of rules) if (re.test(head)) return { predicate: out, detail };
  const client = head.match(/^Cliente respondió encuesta \((\d)\/5\)$/);
  if (client) return { actor: "cliente", predicate: `respondió la encuesta con ${client[1]} de 5`, detail };
  return { predicate: head.charAt(0).toLowerCase() + head.slice(1), detail };
}

/** "registró la salida" → "registraste la salida" for the current user's own entries (regular -ó / -ió preterites). */
function toSecondPerson(predicate: string) {
  if (predicate.startsWith("dio ")) return `diste ${predicate.slice(4)}`;
  return predicate.replace(/^(\S+?)(ió|ó)(?=\s|$)/, (_, stem: string, end: string) => `${stem}${end === "ió" ? "iste" : "aste"}`);
}

const SEEN_KEY = (userId: string) => `pk.bitacora.visto.${userId}`;
const seenListeners = new Set<() => void>();
function readSeen(userId: string) {
  try {
    return localStorage.getItem(SEEN_KEY(userId)) ?? "";
  } catch {
    return "";
  }
}
function writeSeen(userId: string, iso: string) {
  try {
    localStorage.setItem(SEEN_KEY(userId), iso);
  } catch {}
  seenListeners.forEach((l) => l());
}
/** Per-user "seen up to" cursor, shared by the desktop bell and the phone button. */
function useSeenCursor(userId: string) {
  const subscribe = useCallback((cb: () => void) => {
    seenListeners.add(cb);
    return () => void seenListeners.delete(cb);
  }, []);
  const seen = useSyncExternalStore(subscribe, () => readSeen(userId), () => "");
  const markSeen = useCallback(() => writeSeen(userId, new Date().toISOString()), [userId]);
  return { seen, markSeen };
}

export type ActivityItem = {
  entry: AuditEntry;
  glyph: Glyph;
  actor: string;
  self: boolean;
  predicate: string;
  detail?: string;
  folio?: string;
  client?: string;
  unread: boolean;
};

/** Newest-first, past-only, role-scoped entries with their glyph, sentence parts, order context and unread flag. */
function useActivity(limit = 40) {
  const { audit, orders } = useScopedData();
  const me = useCurrentUser();
  const lk = useLookups();
  const now = useNow(60_000);
  const { seen, markSeen } = useSeenCursor(me.id);

  const items = useMemo<ActivityItem[]>(() => {
    const byId = new Map<string, Order>(orders.map((o) => [o.id, o]));
    const nowMs = now.getTime();
    // Never opened on this device: only the last 24 h count as new, not the whole history.
    const since = seen || new Date(nowMs - 24 * 60 * 60_000).toISOString();
    return audit
      .filter((a) => toDate(a.at).getTime() <= nowMs + 60_000)
      .sort((x, y) => (x.at < y.at ? 1 : -1))
      .slice(0, limit)
      .map((a) => {
        const p = phrase(a.action);
        const order = a.orderId ? byId.get(a.orderId) : undefined;
        const self = a.by === me.id;
        const user = lk.users.get(a.by);
        const actor = p.actor === "cliente" ? "El cliente" : self ? "Tú" : (user?.name.split(" ")[0] ?? "Alguien");
        return {
          entry: a,
          glyph: glyphFor(a),
          actor,
          self,
          predicate: self && !p.actor ? toSecondPerson(p.predicate) : p.predicate,
          detail: p.detail,
          folio: order?.folio,
          client: order ? lk.clients.get(order.clientId)?.shortName : undefined,
          unread: !self && a.at > since,
        };
      });
  }, [audit, orders, now, limit, me.id, lk, seen]);

  const unread = items.filter((i) => i.unread).length;
  return { items, unread, markSeen };
}

/* ─────────────────────────── View ─────────────────────────── */

function dayLabel(iso: string) {
  const date = toDate(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  const s = fmtLongDay(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupByDay(items: ActivityItem[]) {
  const out: { label: string; items: ActivityItem[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.entry.at);
    const last = out.at(-1);
    if (last?.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}

/**
 * The bitácora: a logbook spine (one hairline rail) with a glyph node per event, grouped under serif day headings.
 * Unread events (by others, since you last looked) carry a sky halo on their node and full-strength text.
 * `header={false}` where the container already titles it (the phone bottom sheet).
 */
export function ActivityPanel({ onNavigate, header = true, className }: { onNavigate?: () => void; header?: boolean; className?: string }) {
  const { items, unread, markSeen } = useActivity();
  const [filter, setFilter] = useState<Category | "todo">("todo");
  const canSeeSettings = useCanSeeRoute()("/configuracion");
  const counts = useMemo(() => {
    const c: Record<string, number> = { todo: items.length };
    for (const i of items) c[i.glyph.category] = (c[i.glyph.category] ?? 0) + 1;
    return c;
  }, [items]);
  const shown = filter === "todo" ? items : items.filter((i) => i.glyph.category === filter);
  const days = groupByDay(shown);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {header && (
        <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em] text-ink">Bitácora</h2>
            <p className="mt-1.5 text-[13px] text-subtle">
              {unread > 0 ? (
                <>
                  <b className="font-semibold tabular-nums text-ink">{unread}</b> {unread === 1 ? "cambio nuevo" : "cambios nuevos"} de tu equipo
                </>
              ) : (
                "Al día: nada nuevo de tu equipo"
              )}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markSeen}
              className="shrink-0 rounded-[10px] px-2 py-1 text-[13px] font-semibold text-link outline-none hover:bg-tile focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              Marcar como visto
            </button>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Filtrar bitácora" className="flex gap-1 px-5 pb-3">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const n = counts[f.value] ?? 0;
          return (
            <button
              key={f.value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setFilter(f.value)}
              disabled={f.value !== "todo" && n === 0}
              className={cn(
                "inline-flex h-8 min-w-0 flex-auto items-center justify-center gap-1 rounded-full px-2 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-azure/60 disabled:opacity-40",
                active ? "bg-brand-deep text-white" : "bg-tile text-ink-soft hover:bg-well",
              )}
            >
              <span className="truncate">{f.label}</span>
              <span className={cn("shrink-0 tabular-nums", active ? "text-white/70" : "text-faint")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-5 pb-2">
        {days.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-subtle">Sin movimientos en esta categoría.</p>
        ) : (
          days.map((day) => (
            <section key={day.label} aria-label={day.label}>
              <h3 className="sticky top-0 z-10 -mx-5 bg-popover/95 px-5 pb-1.5 pt-4 font-serif text-[15px] text-ink-muted backdrop-blur-sm">{day.label}</h3>
              <ol className="relative">
                {/* the spine */}
                <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
                {day.items.map((it) => (
                  <ActivityRow key={it.entry.id} item={it} onNavigate={onNavigate} />
                ))}
              </ol>
            </section>
          ))
        )}
      </div>

      {canSeeSettings && (
        <Link
          href="/configuracion?tab=auditoria"
          onClick={onNavigate}
          className="border-t border-hairline px-5 py-3 text-center text-[13.5px] font-semibold text-link outline-none hover:bg-wash focus-visible:bg-wash"
        >
          Abrir la bitácora completa
        </Link>
      )}
    </div>
  );
}

function ActivityRow({ item, onNavigate }: { item: ActivityItem; onNavigate?: () => void }) {
  const { glyph, unread } = item;
  const Icon = glyph.icon;
  const href = item.folio ? `/ordenes/${item.folio}` : undefined;
  const context = [item.folio && `${item.folio}${item.client ? ` ${item.client}` : ""}`, item.detail].filter(Boolean).join(" — ");
  const body = (
    <>
      {/* bead on the spine: soft tint once seen, solid category colour + sky halo while new */}
      <span className="relative z-[1] mt-0.5 grid size-[31px] shrink-0 place-items-center">
        {unread && <span aria-hidden className="absolute -inset-[5px] rounded-full bg-sky/45" />}
        <span
          className={cn(
            "relative grid size-[31px] place-items-center rounded-full ring-2 ring-popover",
            unread ? toneDot[glyph.tone] : toneSoftBg[glyph.tone],
          )}
        >
          <Icon
            className={cn("size-[15px]", unread ? (glyph.tone === "sky" ? "text-on-light" : "text-white") : toneText[glyph.tone])}
            strokeWidth={2.2}
          />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 text-[14px] leading-snug", unread ? "text-ink" : "text-ink-soft")}>
            <b className="font-semibold text-ink">{item.actor}</b> {item.predicate}
            {unread && <span className="sr-only"> (nuevo)</span>}
          </span>
          <time dateTime={item.entry.at} className="shrink-0 text-[12.5px] tabular-nums text-faint">
            {fmtTime(item.entry.at)}
          </time>
        </span>
        {context && <span className="mt-0.5 block truncate text-[12.5px] text-subtle">{context}</span>}
        {item.entry.reason && <span className="mt-1 block border-l-2 border-line pl-2 text-[12.5px] italic text-subtle">{item.entry.reason}</span>}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} onClick={onNavigate} className="-mx-2 flex gap-3 rounded-[12px] px-2 py-2.5 outline-none hover:bg-wash focus-visible:bg-wash">
          {body}
        </Link>
      ) : (
        <div className="-mx-2 flex gap-3 px-2 py-2.5">{body}</div>
      )}
    </li>
  );
}

/** Kept for callers that only need the feed (re-exported by header-tools). */
export function ActivityList({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  return <ActivityPanel onNavigate={onNavigate} className={className} />;
}

/* ─────────────────────────── Triggers ─────────────────────────── */

/** Count badge: navy pill with the number of unread changes (9+). Nothing when caught up. */
function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-deep px-1 text-[10.5px] font-bold leading-none tabular-nums text-white ring-2 ring-surface",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** One short swing of the bell when new changes arrive (motion that answers a change, not decoration). */
function useBellSwing(unread: number) {
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  const prev = useRef(unread);
  useEffect(() => {
    if (unread > prev.current && !reduced) void controls.start({ rotate: [0, 16, -12, 8, -4, 0], transition: { duration: 0.7, ease: "easeInOut" } });
    prev.current = unread;
  }, [unread, reduced, controls]);
  return controls;
}

function bellLabel(unread: number) {
  return unread > 0 ? `Bitácora · ${unread} ${unread === 1 ? "cambio nuevo" : "cambios nuevos"}` : "Bitácora";
}

/** Desktop: bell in the card header; the bitácora opens in a popover and is marked as seen when it closes. */
export function ActivityBell({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { unread, markSeen } = useActivity();
  const swing = useBellSwing(unread);
  return (
    <Popover onOpenChange={(open) => !open && markSeen()}>
      <PopoverTrigger
        aria-label={bellLabel(unread)}
        className={cn(
          "relative inline-flex items-center justify-center border border-hairline bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.03)] outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-azure/60 data-[state=open]:border-line-strong data-[state=open]:bg-tile",
          compact ? "size-10 rounded-[14px]" : "size-12 rounded-[16px] max-md:size-11 max-md:rounded-[14px]",
          className,
        )}
      >
        <motion.span animate={swing} style={{ originY: 0.15 }} className="grid place-items-center">
          <Bell className={cn("text-ink", compact ? "size-[18px]" : "size-[19px]")} />
        </motion.span>
        <UnreadBadge count={unread} className={compact ? "-right-1.5 -top-1.5" : "-right-1 -top-1"} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex max-h-[min(620px,calc(100dvh-96px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] p-0"
      >
        <ActivityPanel />
      </PopoverContent>
    </Popover>
  );
}

/** Phone/tablet: round sand bell with the count badge, opening the bitácora in a bottom sheet (marked as seen on close). */
export function MobileActivityButton({ className }: { className?: string }) {
  const { unread, markSeen } = useActivity();
  const swing = useBellSwing(unread);
  const [open, setOpen] = useState(false);
  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) markSeen();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={bellLabel(unread)}
        aria-haspopup="dialog"
        className={cn("relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink transition active:scale-95 lg:hidden", className)}
      >
        <motion.span animate={swing} style={{ originY: 0.15 }} className="grid place-items-center">
          <Bell className="size-[18px]" />
        </motion.span>
        <UnreadBadge count={unread} className="-right-0.5 -top-0.5 ring-sand" />
      </button>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Bitácora"
        description={unread > 0 ? `${unread} ${unread === 1 ? "cambio nuevo" : "cambios nuevos"} de tu equipo` : "Al día: nada nuevo de tu equipo"}
      >
        <ActivityPanel header={false} onNavigate={() => onOpenChange(false)} className="-mx-3" />
      </BottomSheet>
    </>
  );
}
