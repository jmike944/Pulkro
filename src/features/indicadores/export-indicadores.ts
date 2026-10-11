"use client";

/**
 * "Exportar" on /indicadores → one workbook with the period's indicators (doc §6 / §10:
 * "Excel de indicadores habilitados"). Only roles with `export.excel` reach this.
 */
import { eachDayOfInterval, endOfDay, format, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { exportToExcel, fmtBusinessDateTime, type SheetSpec } from "@/lib/export";
import { orderEvidence, orderMinutes, plannedMinutes } from "@/lib/domain";
import { INCIDENT_TYPE, ORDER_STATUS, SEVERITY, SHARE_CHANNEL } from "@/lib/status";
import type { Client, Incident, Jornada, Order, Photo, PostSaleCase, Report, ServiceType, Site, Survey, Unit, User } from "@/lib/types";
import type { Indicators } from "./compute";
import { periodKey, type PeriodWindow } from "./period";

type Lookups = {
  units: Map<string, Unit>;
  users: Map<string, User>;
  clients: Map<string, Client>;
  sites: Map<string, Site>;
  serviceTypes: Map<string, ServiceType>;
};

type Related = { orders: Order[]; jornadas: Jornada[]; photos: Photo[]; incidents: Incident[]; reports: Report[]; surveys: Survey[]; cases: PostSaleCase[] };

const DATE = "dd/mm/yyyy";
const DATETIME = "dd/mm/yyyy hh:mm";
const HOURS = "0.0";
const dt = (iso?: string) => (iso ? parseISO(iso) : null);
const h = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export async function exportIndicadores({
  ind,
  win,
  lk,
  related,
  scopeLabel,
  generatedBy,
}: {
  ind: Indicators;
  win: PeriodWindow;
  lk: Lookups;
  related: Related;
  scopeLabel: string;
  generatedBy: string;
}) {
  const sheets: SheetSpec[] = [
    resumen(ind, win, scopeLabel, generatedBy),
    serviciosPorDia(ind, win, related.orders),
    ordenes(ind, lk, related),
    incidencias(ind, lk, related.orders),
    productividad(ind, lk),
    encuestas(ind, lk, related.orders),
  ];
  const scope = scopeLabel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  await exportToExcel(`pulkro-indicadores-${periodKey(win.period)}-${scope}`, sheets);
  return sheets.reduce((n, s) => n + s.rows.length, 0);
}

function resumen(ind: Indicators, win: PeriodWindow, scopeLabel: string, generatedBy: string): SheetSpec {
  const f = ind.funnel;
  const rows: { indicador: string; valor: string | number; detalle: string }[] = [
    { indicador: "Periodo", valor: win.label, detalle: `${format(win.start, "dd/MM/yyyy")} – ${format(win.until, "dd/MM/yyyy")}${win.isCurrent ? " (en curso)" : ""}` },
    { indicador: "Alcance", valor: scopeLabel, detalle: `Generado por ${generatedBy} el ${fmtBusinessDateTime(new Date())} (hora de Monterrey)` },
    ...f.map((s) => ({ indicador: `Embudo · ${s.label}`, valor: s.count, detalle: f[0].count ? `${Math.round((s.count / f[0].count) * 100)}% de programadas` : "" })),
    ...ind.split.map((s) => ({ indicador: `Estado · ${s.label}`, valor: s.orders.length, detalle: s.sub })),
    { indicador: "Servicios terminados (cierre validado)", valor: ind.closed.length, detalle: `${ind.prevClosed} en ${win.prev.short} al mismo punto` },
    { indicador: "Horas reales totales", valor: h(ind.hours.totalMinutes), detalle: `${ind.hours.services} servicios con entrada y salida` },
    { indicador: "Horas reales por servicio (promedio)", valor: h(ind.hours.avgMinutes), detalle: `Plan ${h(ind.hours.avgPlannedMinutes)} h` },
    { indicador: "Incidencias registradas", valor: ind.periodIncidents.length, detalle: `${ind.incidentsOpen} abiertas · ${ind.ordersWithIncident} órdenes afectadas` },
    ...ind.stages.stages.map((s) => ({ indicador: `Tiempo · ${s.label}`, valor: Math.round(s.days * 10) / 10, detalle: "días promedio" })),
    { indicador: "Tiempo · Del alta al reporte enviado", valor: Math.round(ind.stages.totalDays * 10) / 10, detalle: "días promedio" },
    { indicador: "Satisfacción general (1–5)", valor: Math.round(ind.sat.overall * 100) / 100, detalle: `${ind.sat.answered} respuestas de ${ind.sat.sent} encuestas` },
    { indicador: "NPS", valor: ind.sat.nps, detalle: `${ind.sat.promoters} promotores · ${ind.sat.detractors} detractores` },
    { indicador: "Tasa de respuesta de encuestas", valor: `${Math.round(ind.sat.responseRate * 100)}%`, detalle: "" },
    { indicador: "Cumplimiento fotográfico", valor: `${Math.round(ind.compliance.rate * 100)}%`, detalle: `${ind.compliance.compliant} de ${ind.compliance.total} cierres · ${ind.compliance.withException} con excepción` },
    { indicador: "Servicios con quejas", valor: ind.complaints.servicesWithComplaints, detalle: `${Math.round(ind.complaints.rate * 100)}% de servicios terminados · ${ind.complaints.open} casos abiertos` },
    { indicador: "Costos y rentabilidad", valor: "Fase 2", detalle: "Requiere captura de mano de obra, materiales, traslados e ingreso (doc §5)" },
    { indicador: "Consumo de materiales", valor: "Fase 2", detalle: "Requiere captura de cantidades entregadas y usadas por orden (doc §5)" },
    { indicador: "Productividad por trabajador", valor: "Fase 2", detalle: "Requiere horas individuales y definición del indicador (doc §5, §11)" },
  ];
  return {
    name: "Resumen KPIs",
    columns: [
      { header: "Indicador", key: "indicador", width: 44 },
      { header: "Valor", key: "valor", width: 20 },
      { header: "Detalle", key: "detalle", width: 70 },
    ],
    rows,
  };
}

function serviciosPorDia(ind: Indicators, win: PeriodWindow, orders: Order[]): SheetSpec {
  const closed = orders.filter((o) => o.closure);
  const rows = eachDayOfInterval({ start: win.start, end: startOfDay(win.until) }).map((day) => {
    const s = day.getTime();
    const e = endOfDay(day).getTime();
    const xs = closed.filter((o) => {
      const t = Date.parse(o.closure!.validatedAt);
      return t >= s && t <= e;
    });
    return {
      fecha: day,
      dia: format(day, "EEEE", { locale: es }),
      servicios: xs.length,
      horas: h(xs.reduce((a, o) => a + (ind.hours.realByOrder.get(o.id) ?? 0), 0)),
      folios: xs.map((o) => o.folio).join(", "),
    };
  });
  return {
    name: "Servicios por día",
    columns: [
      { header: "Fecha", key: "fecha", width: 14, numFmt: DATE },
      { header: "Día", key: "dia", width: 12 },
      { header: "Servicios terminados", key: "servicios", width: 20 },
      { header: "Horas reales", key: "horas", width: 14, numFmt: HOURS },
      { header: "Folios", key: "folios", width: 60 },
    ],
    rows,
  };
}

function ordenes(ind: Indicators, lk: Lookups, r: Related): SheetSpec {
  // Work scheduled in the period plus anything closed in it (a multi-day job may straddle the edge).
  const map = new Map<string, Order>();
  [...ind.periodOrders, ...ind.closed].forEach((o) => map.set(o.id, o));
  const firstShare = new Map<string, string>();
  r.reports.forEach((rep) =>
    rep.shares.forEach((s) => {
      const cur = firstShare.get(rep.orderId);
      if (!cur || s.at < cur) firstShare.set(rep.orderId, s.at);
    }),
  );
  const rows = [...map.values()]
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .map((o) => {
      const js = r.jornadas.filter((j) => j.orderId === o.id);
      const ev = orderEvidence(o, r.jornadas, r.photos);
      const sv = r.surveys.find((x) => x.orderId === o.id && x.answers);
      return {
        folio: o.folio,
        cliente: lk.clients.get(o.clientId)?.name ?? "",
        sitio: lk.sites.get(o.siteId)?.name ?? "",
        unidad: lk.units.get(o.unitId)?.code ?? "",
        servicio: lk.serviceTypes.get(o.serviceTypeId)?.name ?? "",
        supervisor: lk.users.get(o.supervisorId)?.name ?? "",
        estado: ORDER_STATUS[o.status].label,
        inicio: dt(o.scheduledStart),
        fin: dt(o.scheduledEnd),
        jornadas: o.plannedDays,
        ejecutadas: js.filter((j) => j.checkOut).length,
        horasPlan: h(plannedMinutes(o.id, r.jornadas)),
        horasReales: h(orderMinutes(o.id, r.jornadas)),
        cierre: dt(o.closure?.validatedAt),
        envio: dt(firstShare.get(o.id)),
        incidencias: r.incidents.filter((i) => i.orderId === o.id).length,
        fotos: o.closure ? (o.closure.exception ? "Excepción autorizada" : ev.complete ? "Completas" : "Incompletas") : ev.executed ? `${ev.present}/${ev.required}` : "—",
        encuesta: sv?.answers?.overall ?? null,
        casos: r.cases.filter((c) => c.orderId === o.id).length,
        referencia: o.commercialRef,
      };
    });
  return {
    name: "Órdenes del periodo",
    columns: [
      { header: "Folio", key: "folio", width: 12 },
      { header: "Cliente", key: "cliente", width: 32 },
      { header: "Sitio", key: "sitio", width: 26 },
      { header: "Unidad", key: "unidad", width: 9 },
      { header: "Tipo de servicio", key: "servicio", width: 30 },
      { header: "Supervisor", key: "supervisor", width: 26 },
      { header: "Estado", key: "estado", width: 22 },
      { header: "Inicio programado", key: "inicio", width: 18, numFmt: DATETIME },
      { header: "Fin programado", key: "fin", width: 18, numFmt: DATETIME },
      { header: "Jornadas", key: "jornadas", width: 10 },
      { header: "Jornadas ejecutadas", key: "ejecutadas", width: 12 },
      { header: "Horas planeadas", key: "horasPlan", width: 14, numFmt: HOURS },
      { header: "Horas reales", key: "horasReales", width: 13, numFmt: HOURS },
      { header: "Cierre validado", key: "cierre", width: 18, numFmt: DATETIME },
      { header: "Primer envío de reporte", key: "envio", width: 18, numFmt: DATETIME },
      { header: "Incidencias", key: "incidencias", width: 12 },
      { header: "Fotos ANTES/DESPUÉS", key: "fotos", width: 20 },
      { header: "Calificación (1–5)", key: "encuesta", width: 14 },
      { header: "Casos postventa", key: "casos", width: 12 },
      { header: "Referencia comercial", key: "referencia", width: 18 },
    ],
    rows,
  };
}

function incidencias(ind: Indicators, lk: Lookups, orders: Order[]): SheetSpec {
  const byId = new Map(orders.map((o) => [o.id, o] as const));
  const rows = [...ind.periodIncidents]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((i) => {
      const o = byId.get(i.orderId);
      return {
        folio: i.folio,
        orden: o?.folio ?? "",
        cliente: o ? (lk.clients.get(o.clientId)?.shortName ?? "") : "",
        tipo: INCIDENT_TYPE[i.type].label,
        severidad: SEVERITY[i.severity].label,
        estado: i.status === "abierta" ? "Abierta" : "Resuelta",
        bloquea: i.blocksClosure ? "Sí" : "No",
        fecha: dt(i.createdAt),
        registro: lk.users.get(i.createdBy)?.name ?? "",
        descripcion: i.description,
        resolucion: i.resolution ?? "",
      };
    });
  return {
    name: "Incidencias",
    columns: [
      { header: "Folio", key: "folio", width: 11 },
      { header: "Orden", key: "orden", width: 11 },
      { header: "Cliente", key: "cliente", width: 22 },
      { header: "Tipo", key: "tipo", width: 26 },
      { header: "Severidad", key: "severidad", width: 11 },
      { header: "Estado", key: "estado", width: 10 },
      { header: "Bloquea cierre", key: "bloquea", width: 13 },
      { header: "Fecha", key: "fecha", width: 18, numFmt: DATETIME },
      { header: "Registró", key: "registro", width: 24 },
      { header: "Descripción", key: "descripcion", width: 60 },
      { header: "Resolución", key: "resolucion", width: 46 },
    ],
    rows,
  };
}

function productividad(ind: Indicators, lk: Lookups): SheetSpec {
  return {
    name: "Productividad por supervisor",
    columns: [
      { header: "Supervisor", key: "supervisor", width: 28 },
      { header: "Unidad", key: "unidad", width: 18 },
      { header: "Órdenes cerradas", key: "cerradas", width: 16 },
      { header: "Órdenes abiertas", key: "abiertas", width: 16 },
      { header: "Horas reales", key: "horas", width: 13, numFmt: HOURS },
      { header: "Horas por servicio cerrado", key: "hps", width: 22, numFmt: HOURS },
      { header: "Satisfacción (1–5)", key: "csat", width: 16, numFmt: "0.00" },
      { header: "Encuestas respondidas", key: "encuestas", width: 18 },
      { header: "Nota", key: "nota", width: 50 },
    ],
    rows: ind.productivity.map((p, i) => ({
      supervisor: p.user.name,
      unidad: lk.units.get(p.user.unitId)?.name ?? "",
      cerradas: p.closed,
      abiertas: p.open,
      horas: Math.round(p.hours * 10) / 10,
      hps: Math.round(p.hoursPerService * 10) / 10,
      csat: p.csat ? Math.round(p.csat * 100) / 100 : null,
      encuestas: p.surveys,
      nota: i === 0 ? "Denominador provisional: órdenes con cierre validado (PENDIENTE §5)" : "",
    })),
  };
}

function encuestas(ind: Indicators, lk: Lookups, orders: Order[]): SheetSpec {
  const byId = new Map(orders.map((o) => [o.id, o] as const));
  const rows = [...ind.periodSurveys]
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .map((s) => ({
      orden: byId.get(s.orderId)?.folio ?? "",
      cliente: lk.clients.get(s.clientId)?.name ?? "",
      enviada: dt(s.sentAt),
      canal: SHARE_CHANNEL[s.channel],
      respondida: dt(s.respondedAt),
      captura: s.respondedAt ? (s.manual ? "Manual" : "Enlace") : "",
      general: s.answers?.overall ?? null,
      calidad: s.answers?.quality ?? null,
      puntualidad: s.answers?.punctuality ?? null,
      personal: s.answers?.staff ?? null,
      nps: s.answers?.nps ?? null,
      comentario: s.answers?.comment ?? "",
    }));
  return {
    name: "Encuestas",
    columns: [
      { header: "Orden", key: "orden", width: 11 },
      { header: "Cliente", key: "cliente", width: 30 },
      { header: "Enviada", key: "enviada", width: 18, numFmt: DATETIME },
      { header: "Canal", key: "canal", width: 11 },
      { header: "Respondida", key: "respondida", width: 18, numFmt: DATETIME },
      { header: "Captura", key: "captura", width: 10 },
      { header: "General", key: "general", width: 9 },
      { header: "Calidad", key: "calidad", width: 9 },
      { header: "Puntualidad", key: "puntualidad", width: 11 },
      { header: "Personal", key: "personal", width: 9 },
      { header: "NPS (0–10)", key: "nps", width: 10 },
      { header: "Comentario", key: "comentario", width: 60 },
    ],
    rows,
  };
}
