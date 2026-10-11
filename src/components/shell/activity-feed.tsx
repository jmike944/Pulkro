"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import {
  Bell,
  CalendarClock,
  ClipboardPlus,
  FileCheck2,
  MessageSquareWarning,
  RotateCcw,
  Star,
  TriangleAlert,
  UserRoundCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AuditEntry, Incident, Order, PostSaleCase, Role, Survey, User } from "@/lib/types";
import { useCurrentUser, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { fmtAgo } from "@/lib/format";
import { INCIDENT_TYPE, toneDot, toneSoftBg, toneText, type Tone } from "@/lib/status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BottomSheet } from "./bottom-sheet";
import { useCanSeeRoute } from "./use-can-see-route";

/* ─────────────────────────── Model ─────────────────────────── */

/** A notice: something another person did that concerns you, written as a message with the screen it opens. */
export type Notice = {
  id: string;
  at: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
  reason?: string;
  href: string;
  unread: boolean;
};

type Ctx = {
  me: User;
  role: Role;
  actor: string;
  order?: Order;
  client?: string;
  incidents: Map<string, Incident>;
  cases: Map<string, PostSaleCase>;
  /** Orders that already have a survey link (no "send the survey" nudge then). */
  surveyed: Set<string>;
  surveys: Map<string, Survey>;
  /** Orders / cases reassigned at some point: their creation entry no longer says who it was assigned to. */
  reassignedOrders: Set<string>;
  reassignedCases: Set<string>;
};

const WINDOW_DAYS = 30;
const LIMIT = 30;
/** Never opened on this device: notices from the last 3 days count as new, not the whole month. */
const FIRST_LOOK_HOURS = 72;

/**
 * Turn one audit entry (made by someone else, already role-scoped) into a notice for the current role, or nothing.
 * Routine field work (entradas, fotos, notas) and catalog edits never notify: the Bitácora page keeps the full record.
 */
function toNotice(a: AuditEntry, c: Ctx): Omit<Notice, "unread" | "id" | "at" | "reason"> | null {
  const { role, actor, order } = c;
  const ref = order ? `${order.folio}${c.client ? `, ${c.client}` : ""}` : "";
  const orderHref = order ? `/ordenes/${order.folio}` : "/ordenes";
  const t = a.action;
  const mine = order?.supervisorId === c.me.id;

  if (a.entity === "orden") {
    if (t === "Alta manual de orden de servicio" && role === "supervisor" && mine && !c.reassignedOrders.has(order.id))
      return {
        icon: ClipboardPlus,
        tone: "navy",
        title: "Nueva orden asignada",
        body: order?.status === "borrador" ? `${actor} te asignó ${ref}. Programa las jornadas.` : `${actor} te asignó ${ref}.`,
        href: orderHref,
      };
    if (t.startsWith("Reasignó la orden") && t.endsWith(`a ${c.me.name}`))
      return { icon: UserRoundCheck, tone: "navy", title: "Te pasaron una orden", body: `${actor} te asignó ${ref}.`, href: orderHref };
    if ((t === "Cambió estado a Reprogramada" || /^Programó \d+ jornada/.test(t)) && role !== "direccion")
      return { icon: CalendarClock, tone: "amber", title: "Cambiaron las fechas", body: `${actor} reprogramó ${ref}.`, href: `${orderHref}?tab=jornadas` };
    if (t === "Cambió estado a Cancelada")
      return { icon: XCircle, tone: "red", title: "Orden cancelada", body: `${actor} canceló ${ref}.`, href: orderHref };
    // Only the assigned supervisor can act on a reopened order (re-validate the closure).
    if (t === "Cambió estado a Reabierta" && role === "supervisor" && mine)
      return { icon: RotateCcw, tone: "amber", title: "Orden reabierta", body: `${actor} reabrió ${ref}. Valida el cierre de nuevo.`, href: orderHref };
    return null;
  }

  if (a.entity === "incidencia" && t.startsWith("Registró incidencia") && role !== "supervisor") {
    const inc = c.incidents.get(a.entityId);
    // Blocking incidents for both management roles; non-blocking high severity only for Administración.
    if (!inc || !(inc.blocksClosure || (inc.severity === "alta" && role === "administracion"))) return null;
    const what = INCIDENT_TYPE[inc.type]?.label.toLowerCase() ?? "incidencia";
    return {
      icon: TriangleAlert,
      tone: "red",
      title: inc.blocksClosure ? "Incidencia que detiene el cierre" : "Incidencia de severidad alta",
      body: `${actor} registró ${inc.folio} (${what}) en ${ref}.`,
      href: `${orderHref}?tab=incidencias`,
    };
  }

  // A PDF download ("Inició envío por descarga") is not a delivery to the client.
  if (a.entity === "reporte" && /^Inició envío por (WhatsApp|correo)$/.test(t) && role === "administracion" && !(order && c.surveyed.has(order.id)))
    return {
      icon: FileCheck2,
      tone: "teal",
      title: "Reporte enviado al cliente",
      body: `${actor} envió el reporte de ${ref}. Ya puedes enviar la encuesta.`,
      href: order ? `/postventa?orden=${order.folio}` : "/postventa",
    };

  if (a.entity === "caso" && t.startsWith("Abrió caso postventa")) {
    const cs = c.cases.get(a.entityId);
    const folio = cs?.folio ?? t.replace("Abrió caso postventa ", "");
    const href = cs ? `/postventa/${cs.folio}` : "/postventa";
    if (cs?.ownerId === c.me.id && !c.reassignedCases.has(cs.id))
      return { icon: MessageSquareWarning, tone: "violet", title: "Te asignaron un caso", body: `${actor} abrió ${folio} en ${ref} y te lo asignó.`, href };
    if (role === "supervisor" && !mine) return null;
    return { icon: MessageSquareWarning, tone: "violet", title: "Nuevo caso postventa", body: `${actor} abrió ${folio} en ${ref}.`, href };
  }

  if (a.entity === "caso") {
    const to = t.match(/^Reasignó el caso a (.+?)\.?$/)?.[1];
    const cs = c.cases.get(a.entityId);
    if (to && to === c.me.name && cs)
      return { icon: MessageSquareWarning, tone: "violet", title: "Te asignaron un caso", body: `${actor} te pasó ${cs.folio} de ${ref}.`, href: `/postventa/${cs.folio}` };
    return null;
  }

  if (a.entity === "encuesta") {
    // Client answers by link and answers captured manually by staff both notify; the score comes from the survey record.
    const byLink = t.match(/^Cliente respondió encuesta \((\d)\/5\)$/);
    if (!byLink && t !== "Registró respuesta de encuesta manualmente") return null;
    const score = c.surveys.get(a.entityId)?.answers?.overall ?? (byLink ? Number(byLink[1]) : NaN);
    if (!Number.isFinite(score)) return null;
    if (role === "direccion" && score > 3) return null;
    if (role === "supervisor" && !mine) return null;
    const low = score <= 3;
    return {
      icon: Star,
      tone: low ? "red" : "amber",
      title: low ? "Calificación baja" : "Encuesta respondida",
      body: `El cliente calificó ${ref} con ${score} de 5.`,
      href: order ? `/postventa?orden=${order.folio}` : "/postventa",
    };
  }

  return null;
}

const SEEN_KEY = (userId: string) => `pk.notificaciones.vistas.${userId}`;
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
/** Per-user "read up to" cursor, shared by the desktop bell and the phone button. */
function useSeenCursor(userId: string) {
  const subscribe = useCallback((cb: () => void) => {
    seenListeners.add(cb);
    return () => void seenListeners.delete(cb);
  }, []);
  const seen = useSyncExternalStore(subscribe, () => readSeen(userId), () => "");
  const markSeen = useCallback(() => writeSeen(userId, new Date().toISOString()), [userId]);
  return { seen, markSeen };
}

/** Role-scoped notices from the last 30 days, newest first, never the current user's own actions. */
function useNotifications() {
  const { audit, orders, incidents, cases, surveys } = useScopedData();
  const me = useCurrentUser();
  const lk = useLookups();
  const now = useNow(60_000);
  const canSee = useCanSeeRoute();
  const { seen, markSeen } = useSeenCursor(me.id);

  const notices = useMemo<Notice[]>(() => {
    const nowMs = now.getTime();
    const from = new Date(nowMs - WINDOW_DAYS * 86_400_000).toISOString();
    const until = new Date(nowMs + 60_000).toISOString();
    const since = seen || new Date(nowMs - FIRST_LOOK_HOURS * 3_600_000).toISOString();
    const byOrder = new Map(orders.map((o) => [o.id, o]));
    const incById = new Map(incidents.map((i) => [i.id, i]));
    const caseById = new Map(cases.map((x) => [x.id, x]));
    const surveyed = new Set(surveys.map((x) => x.orderId));
    const surveyById = new Map(surveys.map((x) => [x.id, x]));
    const reassignedOrders = new Set(audit.filter((x) => x.entity === "orden" && x.action.startsWith("Reasignó la orden")).map((x) => x.entityId));
    const reassignedCases = new Set(audit.filter((x) => x.entity === "caso" && x.action.startsWith("Reasignó el caso")).map((x) => x.entityId));
    const seenKeys = new Set<string>();
    const out: Notice[] = [];
    for (const a of [...audit].sort((x, y) => (x.at < y.at ? 1 : -1))) {
      if (out.length >= LIMIT) break;
      if (a.at > until || a.at < from || a.by === me.id) continue;
      const order = a.orderId ? byOrder.get(a.orderId) : undefined;
      const actor = a.by === "cliente" ? "El cliente" : (lk.users.get(a.by)?.name.split(" ")[0] ?? "Alguien");
      const n = toNotice(a, {
        me,
        role: me.role,
        actor,
        order,
        client: order ? lk.clients.get(order.clientId)?.shortName : undefined,
        incidents: incById,
        cases: caseById,
        surveyed,
        surveys: surveyById,
        reassignedOrders,
        reassignedCases,
      });
      if (!n) continue;
      // One notice per kind per order (a report sent by WhatsApp and by email is one "Reporte enviado").
      const key = `${n.title}|${a.orderId ?? a.entityId}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      // A screen this role can't open falls back to the order (always readable in scope).
      const href = canSee(n.href) ? n.href : order ? `/ordenes/${order.folio}` : "/";
      const explains = a.entity === "orden" && explainsChange(a.action);
      out.push({ ...n, href, id: a.id, at: a.at, reason: explains ? a.reason : undefined, unread: a.at > since });
    }
    return out;
  }, [audit, orders, incidents, cases, surveys, now, seen, me, lk, canSee]);

  const unread = notices.filter((n) => n.unread).length;
  return { notices, unread, markSeen };
}

/** Status changes whose recorded reason is worth showing under the notice. */
const explainsChange = (action: string) => /^(Cambió estado a (Cancelada|Reprogramada|Reabierta)|Programó \d+ jornada)/.test(action);

/* ─────────────────────────── View ─────────────────────────── */

function summary(unread: number) {
  return unread > 0 ? `${unread} ${unread === 1 ? "nueva" : "nuevas"} sobre tu trabajo` : "Estás al día";
}

/**
 * Notification center: "Nuevas" then "Anteriores". Each notice is an icon bead (solid category colour + sky halo while
 * new, soft tint once read), a short title, a one-sentence body and the screen it opens.
 * `header={false}` where the container already titles it (the phone bottom sheet).
 */
export function NotificationPanel({ onNavigate, header = true, className }: { onNavigate?: () => void; header?: boolean; className?: string }) {
  const { notices, unread, markSeen } = useNotifications();
  const canSee = useCanSeeRoute();
  const fresh = notices.filter((n) => n.unread);
  const earlier = notices.filter((n) => !n.unread);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {header && (
        <div className="flex items-end justify-between gap-3 border-b border-hairline px-5 pb-3.5 pt-4">
          <div className="min-w-0">
            <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em] text-ink">Notificaciones</h2>
            <p className="mt-1.5 text-[13px] text-subtle">{summary(unread)}</p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markSeen}
              className="shrink-0 rounded-[10px] px-2 py-1 text-[13px] font-semibold text-link outline-none hover:bg-tile focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              Marcar como leídas
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        {notices.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-serif text-[19px] text-ink">Estás al día</p>
            <p className="mx-auto mt-1 max-w-[30ch] text-[13.5px] text-subtle">Aquí aparecerá lo que otras personas cambien en tu trabajo.</p>
          </div>
        ) : (
          <>
            {fresh.length > 0 && <NoticeSection label="Nuevas" notices={fresh} onNavigate={onNavigate} />}
            {earlier.length > 0 && <NoticeSection label="Anteriores" notices={earlier} onNavigate={onNavigate} />}
          </>
        )}
      </div>

      <div className="flex border-t border-hairline">
        <FooterLink href="/pendientes" onNavigate={onNavigate}>
          Ver pendientes
        </FooterLink>
        {canSee("/bitacora") && (
          <FooterLink href="/bitacora" onNavigate={onNavigate} className="border-l border-hairline">
            Abrir bitácora
          </FooterLink>
        )}
      </div>
    </div>
  );
}

function FooterLink({ href, onNavigate, className, children }: { href: string; onNavigate?: () => void; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn("flex-1 px-4 py-3 text-center text-[13.5px] font-semibold text-link outline-none hover:bg-wash focus-visible:bg-wash", className)}
    >
      {children}
    </Link>
  );
}

function NoticeSection({ label, notices, onNavigate }: { label: string; notices: Notice[]; onNavigate?: () => void }) {
  return (
    <section aria-label={label}>
      <h3 className="sticky top-0 z-10 -mx-5 bg-popover/95 px-5 pb-1.5 pt-4 font-serif text-[15px] text-ink-muted backdrop-blur-sm">{label}</h3>
      <ul className="space-y-0.5">
        {notices.map((n) => (
          <NoticeRow key={n.id} notice={n} onNavigate={onNavigate} />
        ))}
      </ul>
    </section>
  );
}

function NoticeRow({ notice: n, onNavigate }: { notice: Notice; onNavigate?: () => void }) {
  const Icon = n.icon;
  return (
    <li>
      <Link href={n.href} onClick={onNavigate} className="-mx-2 flex gap-3 rounded-[14px] px-2 py-2.5 outline-none hover:bg-wash focus-visible:bg-wash">
        <span className="relative mt-0.5 grid size-[34px] shrink-0 place-items-center">
          {n.unread && <span aria-hidden className="absolute -inset-[5px] rounded-full bg-sky/45" />}
          <span className={cn("relative grid size-[34px] place-items-center rounded-full ring-2 ring-popover", n.unread ? toneDot[n.tone] : toneSoftBg[n.tone])}>
            <Icon className={cn("size-[16px]", n.unread ? (n.tone === "sky" ? "text-on-light" : "text-white") : toneText[n.tone])} strokeWidth={2.2} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 text-[14px] font-semibold leading-snug", n.unread ? "text-ink" : "text-ink-soft")}>
              {n.title}
              {n.unread && <span className="sr-only"> (nueva)</span>}
            </span>
            <time dateTime={n.at} className="shrink-0 text-[12px] tabular-nums text-faint">
              {fmtAgo(n.at)}
            </time>
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-subtle">{n.body}</span>
          {n.reason && <span className="mt-1 block border-l-2 border-line pl-2 text-[12.5px] italic text-subtle">{n.reason}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Kept for callers that only need the panel body (re-exported by header-tools). */
export function ActivityList({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  return <NotificationPanel onNavigate={onNavigate} className={className} />;
}

/* ─────────────────────────── Triggers ─────────────────────────── */

/** Count badge: navy pill with the number of new notices (9+). Nothing when caught up. */
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

/** One short swing of the bell when a new notice arrives (motion that answers a change, not decoration). */
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
  return unread > 0 ? `Notificaciones: ${unread} ${unread === 1 ? "nueva" : "nuevas"}` : "Notificaciones";
}

/** Desktop: bell in the card header; notifications open in a popover and are marked as read when it closes. */
export function ActivityBell({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { unread, markSeen } = useNotifications();
  const swing = useBellSwing(unread);
  const [open, setOpen] = useState(false);
  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) markSeen();
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
        <NotificationPanel onNavigate={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Phone/tablet: round sand bell with the count badge, opening notifications in a bottom sheet (marked as read on close). */
export function MobileActivityButton({ className }: { className?: string }) {
  const { unread, markSeen } = useNotifications();
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
      <BottomSheet open={open} onOpenChange={onOpenChange} title="Notificaciones" description={summary(unread)}>
        <NotificationPanel header={false} onNavigate={() => onOpenChange(false)} className="-mx-3" />
      </BottomSheet>
    </>
  );
}
