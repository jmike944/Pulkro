"use client";

import { parseISO } from "date-fns";
import { exportToExcel, type SheetSpec } from "@/lib/export";
import { ORDER_STATUS } from "@/lib/status";
import type { OrderRow } from "./order-rows";

/** Excel of the list exactly as filtered on screen (doc §6 "exportaciones PDF y Excel"). */
export function exportOrders(rows: OrderRow[], filename: string) {
  const sheet: SheetSpec = {
    name: "Órdenes",
    columns: [
      { header: "Folio", key: "folio", width: 12 },
      { header: "Título", key: "title", width: 44 },
      { header: "Cliente", key: "client", width: 30 },
      { header: "Sitio", key: "site", width: 26 },
      { header: "Dirección", key: "address", width: 40 },
      { header: "Municipio", key: "municipality", width: 22 },
      { header: "Unidad", key: "unit", width: 18 },
      { header: "Servicio", key: "service", width: 30 },
      { header: "Supervisor", key: "supervisor", width: 26 },
      { header: "Estado", key: "status", width: 22 },
      { header: "Siguiente paso", key: "next", width: 22 },
      { header: "Prioridad", key: "priority", width: 11 },
      { header: "Inicio programado", key: "start", width: 18, numFmt: "dd/mm/yyyy hh:mm" },
      { header: "Fin programado", key: "end", width: 18, numFmt: "dd/mm/yyyy hh:mm" },
      { header: "Cierre validado", key: "closed", width: 18, numFmt: "dd/mm/yyyy hh:mm" },
      { header: "Jornadas cerradas", key: "jClosed", width: 10 },
      { header: "Jornadas totales", key: "jTotal", width: 10 },
      { header: "Cuadrilla actual", key: "crew", width: 8 },
      { header: "Horas reales", key: "hours", width: 10, numFmt: "0.0" },
      { header: "Fotos ANTES", key: "antes", width: 9 },
      { header: "Fotos DESPUÉS", key: "despues", width: 9 },
      { header: "Incidencias abiertas", key: "inc", width: 10 },
      { header: "Referencia comercial", key: "ref", width: 18 },
    ],
    rows: rows.map((r) => ({
      folio: r.order.folio,
      title: r.order.title,
      client: r.client?.name,
      site: r.site?.name,
      address: r.site?.address,
      municipality: r.site?.municipality,
      unit: r.unit?.name,
      service: r.service?.name,
      supervisor: r.supervisor?.name,
      status: ORDER_STATUS[r.order.status].label,
      next: r.action.status,
      priority: r.order.priority === "alta" ? "Alta" : "Normal",
      start: parseISO(r.order.scheduledStart),
      end: parseISO(r.order.scheduledEnd),
      closed: r.order.closure ? parseISO(r.order.closure.validatedAt) : null,
      jClosed: r.closedDays,
      jTotal: r.jornadas.length || r.order.plannedDays,
      crew: r.crew.length,
      hours: Math.round((r.minutes / 60) * 10) / 10,
      antes: r.antes,
      despues: r.despues,
      inc: r.openIncidents,
      ref: r.order.commercialRef,
    })),
  };
  return exportToExcel(filename, [sheet]);
}
