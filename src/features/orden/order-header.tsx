"use client";

import { useRef } from "react";
import Link from "next/link";
import { isSameDay, parseISO } from "date-fns";
import { Archive, Ban, CalendarClock, Ellipsis, FileDown, FileText, Flame, Loader2, MapPin, Navigation, Pencil, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHours, fmtTime, plural } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { PageHeader } from "@/components/pk/page";
import { ClientMark } from "@/components/pk/client-mark";
import { PersonAvatar } from "@/components/pk/bits";
import { OrderStatusPill, SoftBadge } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOrderPdf } from "./order-pdf";
import { REOPENABLE, useOrder, type Gate, type OrderDetail } from "./order-context";

const Dot = () => <span className="hidden text-ghost sm:inline" aria-hidden>·</span>;

/** One-line narrative with bold numbers (reference header style). */
function narrative(d: OrderDetail) {
  const { jornadas, live, realMinutes, plannedMinutes, evidence, openIncidents, order } = d;
  const n = jornadas.length;
  const closed = jornadas.filter((j) => j.status === "cerrada").length;
  const parts: React.ReactNode[] = [];
  if (order.status === "cancelada") parts.push(<>Orden <b>cancelada</b></>);
  else if (live?.checkIn)
    parts.push(
      <>
        Jornada <b>{live.dayIndex} de {n}</b> en curso desde las <b>{fmtTime(live.checkIn.deviceAt)}</b>
      </>,
    );
  else if (n) parts.push(<><b>{closed} de {plural(n, "jornada", "jornadas")}</b> {n === 1 ? "cerrada" : "cerradas"}</>);
  else parts.push(<>Sin jornadas programadas</>);
  if (realMinutes > 0) parts.push(<><b>{fmtHours(realMinutes)}</b> reales de {fmtHours(plannedMinutes)} plan</>);
  if (evidence.required > 0) parts.push(<>evidencia <b>{evidence.present} de {evidence.required}</b></>);
  if (openIncidents.length) parts.push(<b>{plural(openIncidents.length, "incidencia abierta", "incidencias abiertas")}</b>);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {p}
        </span>
      ))}
      .
    </>
  );
}

export function OrderHeader() {
  const { d } = useOrder();
  const { order, client, site, serviceType, supervisor, active, now } = d;
  // sm+: actions sit at the top right. Phones: "⋯" shares a row with "Abrir jornada", or with the status pill when there is none.
  const wide = useMediaQuery("(min-width: 640px)");
  // The field screen opens for every role; without capture it is read-only, so the shortcut says "Ver jornada".
  const showJornada = !!active && (active.status === "en_curso" || (active.status === "pendiente" && isSameDay(parseISO(active.plannedStart), now)));

  const meta = (
    <>
      <Link href={`/clientes/${client.id}`} className="group inline-flex min-h-8 items-center gap-2">
        <ClientMark name={client.name} hue={client.hue} size={24} className="rounded-[8px]" />
        <span className="font-medium text-ink group-hover:text-link">{client.name}</span>
      </Link>
      <Dot />
      <span>{serviceType.name}</span>
      <Dot />
      <span className="inline-flex items-center gap-1">
        <MapPin className="size-3.5" /> {site.municipality}
      </span>
      <Dot />
      <span className="tabular">Ref. {order.commercialRef}</span>
      <Dot />
      <span className="inline-flex items-center gap-1.5">
        <PersonAvatar name={supervisor?.name} initials={supervisor?.initials ?? "?"} hue={supervisor?.hue} size={22} />
        {supervisor?.name ?? "Sin supervisor"}
      </span>
      {order.priority === "alta" && (
        <SoftBadge tone="red">
          <Flame className="size-3" /> Alta
        </SoftBadge>
      )}
    </>
  );

  const menuInActions = wide || showJornada;
  const actions = menuInActions ? (
    <>
      {showJornada && active && (
        <Button asChild variant="outline" className="h-10 rounded-[12px] border-line px-4 font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
          <Link href={`/jornada/${active.id}`}>
            <Navigation className="size-4" /> {d.perms.capture ? "Abrir jornada" : "Ver jornada"} <span className="font-normal text-subtle">J{active.dayIndex}</span>
          </Link>
        </Button>
      )}
      <OrderMoreMenu />
    </>
  ) : undefined;

  return (
    <PageHeader
      breadcrumb={[{ label: "Órdenes", href: "/ordenes" }, { label: order.folio }]}
      title={order.title}
      titleAddon={
        menuInActions ? (
          <OrderStatusPill status={order.status} />
        ) : (
          <span className="flex items-center gap-2.5">
            <OrderStatusPill status={order.status} />
            <OrderMoreMenu />
          </span>
        )
      }
      meta={meta}
      description={narrative(d)}
      actions={actions}
    />
  );
}

/** "⋯" menu; owns the focus bookkeeping for the dialogs it opens, so it can sit in either header slot. */
function OrderMoreMenu() {
  const { d, ui } = useOrder();
  const { order, perms, gates } = d;
  // When a menu action opens a dialog, don't hand focus back to the "⋯" trigger.
  const openedDialog = useRef(false);
  const pick = (fn: () => void) => () => {
    openedDialog.current = true;
    fn();
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Más acciones" className="size-10 rounded-[12px] border-line shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
          <Ellipsis className="size-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[min(300px,calc(100vw-2rem))] rounded-[16px] p-1.5"
        onCloseAutoFocus={(e) => {
          if (openedDialog.current) e.preventDefault();
          openedDialog.current = false;
        }}
      >
        <MenuAction icon={Archive} label="Archivar" hint="Cerrar el ciclo postventa" gate={gates.archive} onSelect={pick(ui.openArchive)} />
        <MenuAction icon={Pencil} label="Editar datos" hint={perms.edit ? "Todos los campos" : "Datos operativos"} gate={gates.edit} onSelect={pick(ui.openEdit)} />
        <MenuAction icon={CalendarClock} label="Reprogramar" hint="Mover jornadas pendientes" gate={gates.reschedule} onSelect={pick(() => ui.openSchedule("reprogramar"))} />
        {REOPENABLE.includes(order.status) && (
          <MenuAction icon={RotateCcw} label="Reabrir" hint="Exige validar el cierre otra vez y genera una nueva versión del reporte" gate={gates.reopen} onSelect={pick(ui.openReopen)} />
        )}
        {perms.share ? (
          <DropdownMenuItem asChild className="min-h-11 gap-3 rounded-[10px] px-2.5">
            <Link href={`/ordenes/${order.folio}/reporte`}><FileText className="size-4 text-subtle" />Ver reporte</Link>
          </DropdownMenuItem>
        ) : (
          <PdfMenuAction />
        )}
        {order.status !== "cancelada" && (
          <>
            <DropdownMenuSeparator />
            <MenuAction icon={Ban} label="Cancelar orden" destructive gate={gates.cancel} onSelect={pick(ui.openCancel)} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Descargar PDF · vN" as a real menu item (roving focus, closes the menu): the order PDF is how Dirección and Administración
 * get the report, since the share workspace is the supervisor's. Blocked with its reason until a report has been generated.
 */
function PdfMenuAction() {
  const pdf = useOrderPdf();
  const gate: Gate = pdf.ready ? { ok: true } : { ok: false, reason: pdf.reason ?? undefined };
  const label = `Descargar PDF${pdf.report ? ` · v${pdf.report.version}` : ""}`;
  return (
    <DropdownMenuItem
      aria-disabled={!gate.ok || pdf.busy || undefined}
      onSelect={(e) => {
        if (!gate.ok || pdf.busy) {
          e.preventDefault();
          return;
        }
        void pdf.download();
      }}
      className={cn("min-h-11 items-start gap-3 rounded-[10px] px-2.5 py-2", !gate.ok && "cursor-not-allowed focus:bg-muted")}
    >
      {pdf.busy ? (
        <Loader2 className="mt-0.5 size-4 animate-spin text-subtle" />
      ) : (
        <FileDown className={cn("mt-0.5 size-4", gate.ok ? "text-subtle" : "text-ghost")} />
      )}
      <span className="min-w-0">
        <span className={cn("block text-[14px] font-medium", gate.ok ? "text-ink" : "text-subtle")}>{label}</span>
        {!gate.ok && gate.reason && <span className="block text-[12px] leading-snug text-subtle">{gate.reason}</span>}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * Menu row that stays focusable when blocked and explains who can do it
 * (Radix disabled items swallow hover/focus, so tooltips wouldn't show).
 */
function MenuAction({
  icon: Icon,
  label,
  hint,
  gate,
  onSelect,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  gate: Gate;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      aria-disabled={!gate.ok || undefined}
      onSelect={(e) => {
        if (!gate.ok) {
          e.preventDefault();
          return;
        }
        onSelect();
      }}
      className={cn("min-h-11 items-start gap-3 rounded-[10px] px-2.5 py-2", !gate.ok && "cursor-not-allowed focus:bg-muted")}
    >
      <Icon className={cn("mt-0.5 size-4", !gate.ok ? "text-ghost" : destructive ? "text-red-fg" : "text-subtle")} />
      <span className="min-w-0">
        <span className={cn("block text-[14px] font-medium", !gate.ok ? "text-subtle" : destructive ? "text-red-fg" : "text-ink")}>{label}</span>
        {(gate.ok ? hint : gate.reason) && <span className="block text-[12px] leading-snug text-subtle">{gate.ok ? hint : gate.reason}</span>}
      </span>
    </DropdownMenuItem>
  );
}
