"use client";

import { useMemo } from "react";
import { useLookups, useScopedData } from "@/lib/hooks";
import type { Incident, Worker } from "@/lib/types";
import { compareServices, isOnDay, serviceStatus, type MapaService } from "./mapa-model";

/**
 * The day's services (one per jornada) the current role may see — supervisor: own assignments · administración: own unit ·
 * dirección: all or the selected unit (useScopedData) — joined with order, site, client, supervisor and crew. Cancelled orders
 * are left out. Sorted by status, then planned start. `now` is not an input: status comes from the stamps, so a ticking clock
 * never rebuilds the list.
 */
export function useMapaData(key: string, todayKey: string) {
  const { user, unitFilter, orders, jornadas, incidents, photos } = useScopedData();
  const lk = useLookups();

  const services = useMemo(() => {
    const orderById = new Map(orders.map((o) => [o.id, o] as const));
    const day = jornadas.filter((j) => isOnDay(j, key, todayKey));
    const ids = new Set(day.map((j) => j.id));
    const orderIds = new Set(day.map((j) => j.orderId));

    // ANTES / DESPUÉS per jornada and open incidents per order, in one pass each
    const photoCount = new Map<string, { antes: number; despues: number }>();
    for (const p of photos) {
      if (!p.jornadaId || !ids.has(p.jornadaId) || (p.kind !== "antes" && p.kind !== "despues")) continue;
      const c = photoCount.get(p.jornadaId) ?? { antes: 0, despues: 0 };
      c[p.kind]++;
      photoCount.set(p.jornadaId, c);
    }
    const openByOrder = new Map<string, Incident[]>();
    for (const i of incidents) {
      if (i.status !== "abierta" || !orderIds.has(i.orderId)) continue;
      openByOrder.set(i.orderId, [...(openByOrder.get(i.orderId) ?? []), i]);
    }

    const out: MapaService[] = [];
    for (const j of day) {
      const order = orderById.get(j.orderId);
      if (!order || order.status === "cancelada") continue;
      const open = openByOrder.get(order.id) ?? [];
      out.push({
        id: j.id,
        j,
        order,
        client: lk.clients.get(order.clientId),
        site: lk.sites.get(order.siteId),
        serviceType: lk.serviceTypes.get(order.serviceTypeId),
        supervisor: lk.users.get(order.supervisorId),
        crew: j.workerIds.map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w),
        status: serviceStatus(j),
        openIncidents: [...open].sort((a, b) => Number(b.jornadaId === j.id) - Number(a.jornadaId === j.id) || b.createdAt.localeCompare(a.createdAt)),
        photos: photoCount.get(j.id) ?? { antes: 0, despues: 0 },
      });
    }
    return out.sort(compareServices);
  }, [orders, jornadas, incidents, photos, lk, key, todayKey]);

  // Supervisors of the day's services (Dirección / Administración filter), by first name
  const supervisors = useMemo(() => {
    const m = new Map<string, { id: string; name: string; initials: string; hue: number; count: number }>();
    for (const s of services) {
      const u = s.supervisor;
      if (!u) continue;
      const cur = m.get(u.id) ?? { id: u.id, name: u.name, initials: u.initials, hue: u.hue, count: 0 };
      cur.count++;
      m.set(u.id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [services]);

  const scopeLabel =
    user.role === "supervisor"
      ? "Sus servicios"
      : user.role === "administracion"
        ? (lk.units.get(user.unitId)?.name ?? "Su unidad")
        : unitFilter === "all"
          ? "Todas las unidades"
          : (lk.units.get(unitFilter)?.name ?? "Unidad seleccionada");

  return { user, services, supervisors, scopeLabel };
}
