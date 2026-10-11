"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { isOffline, useAppStore } from "./store";
import { can, canSeeAuditEntry, canSeeOrder, scopedUnitIds, type Action } from "./permissions";
import { usePullStatus } from "./sync/status";
import type { AuditEntry, Client, Jornada, Order, ServiceType, Site, User, Worker, Material, Unit } from "./types";

export { useAppStore } from "./store";
export { useShallow } from "zustand/react/shallow";

export function useHydrated() {
  return useAppStore((s) => s.hydrated);
}

export function useCurrentUser(): User {
  const users = useAppStore((s) => s.users);
  const userId = useAppStore((s) => s.session.userId);
  return useMemo(
    () =>
      users.find((u) => u.id === userId) ?? {
        id: userId, name: "Usuario", initials: "U", role: "supervisor", title: "", unitId: "u_mty", email: "", phone: "", hue: 200, active: true,
      },
    [users, userId],
  );
}

export function useCan(action: Action) {
  const user = useCurrentUser();
  return can(user.role, action);
}

/**
 * Id → entity maps for fast joins. UNSCOPED: use it only to resolve names of ids that already come from scoped data
 * (useScopedData / useOrderBundle / useScopedCatalog). To list clients, sites, workers or users use useScopedCatalog().
 */
export function useLookups() {
  const { units, users, workers, clients, sites, serviceTypes, materials } = useAppStore(
    useShallow((s) => ({ units: s.units, users: s.users, workers: s.workers, clients: s.clients, sites: s.sites, serviceTypes: s.serviceTypes, materials: s.materials })),
  );
  return useMemo(() => {
    const map = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x] as const));
    return {
      units: map<Unit>(units),
      users: map<User>(users),
      workers: map<Worker>(workers),
      clients: map<Client>(clients),
      sites: map<Site>(sites),
      serviceTypes: map<ServiceType>(serviceTypes),
      materials: map<Material>(materials),
    };
  }, [units, users, workers, clients, sites, serviceTypes, materials]);
}

/**
 * Data scoped to what the current user may see (doc §2):
 * supervisor → own orders · administración → own unit · dirección → all or selected unit.
 * Related collections (jornadas, photos, incidents…) are filtered to the visible orders.
 */
export function useScopedData() {
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const raw = useAppStore(
    useShallow((s) => ({
      orders: s.orders, jornadas: s.jornadas, photos: s.photos, incidents: s.incidents, reports: s.reports,
      cases: s.cases, surveys: s.surveys, audit: s.audit,
    })),
  );
  return useMemo(() => {
    const orders = raw.orders.filter((o) => canSeeOrder(user, o, unitFilter));
    const ids = new Set(orders.map((o) => o.id));
    const by = <T extends { orderId?: string }>(xs: T[]) => xs.filter((x) => x.orderId && ids.has(x.orderId));
    return {
      user,
      unitFilter,
      orders,
      orderIds: ids,
      jornadas: by(raw.jornadas),
      photos: by(raw.photos),
      incidents: by(raw.incidents),
      reports: by(raw.reports),
      cases: by(raw.cases),
      surveys: by(raw.surveys),
      audit: by(raw.audit),
    };
  }, [raw, user, unitFilter]);
}

/**
 * Clients, sites, workers and users the current role may list (doc §2):
 * supervisor → clients/sites of own orders, own unit's crew, self + people on own orders · administración → own unit ·
 * dirección → all or the selected unit. Inactive records are included (callers filter `active` where it matters).
 */
export function useScopedCatalog() {
  const { user, unitFilter, orders, cases, audit } = useScopedData();
  const raw = useAppStore(useShallow((s) => ({ clients: s.clients, sites: s.sites, workers: s.workers, users: s.users, units: s.units })));
  return useMemo(() => {
    const units = scopedUnitIds(user, unitFilter);
    const inUnit = (unitId: string) => !units || units.has(unitId);
    const orderClientIds = new Set(orders.map((o) => o.clientId));
    const orderSiteIds = new Set(orders.map((o) => o.siteId));
    const clients = user.role === "supervisor" ? raw.clients.filter((c) => orderClientIds.has(c.id)) : raw.clients.filter((c) => inUnit(c.unitId));
    const clientIds = new Set(clients.map((c) => c.id));
    // Supervisors see the sites they work at; the other roles every site of a visible client.
    const sites = raw.sites.filter((x) => clientIds.has(x.clientId) && (user.role !== "supervisor" || orderSiteIds.has(x.id)));
    const workers = raw.workers.filter((w) => inUnit(w.unitId));
    let users: User[];
    if (user.role === "supervisor") {
      const ids = new Set<string>([user.id]);
      orders.forEach((o) => (ids.add(o.supervisorId), ids.add(o.createdBy)));
      cases.forEach((c) => (ids.add(c.ownerId), ids.add(c.createdBy)));
      audit.forEach((a) => ids.add(a.by));
      users = raw.users.filter((u) => ids.has(u.id));
    } else {
      // Dirección accounts span every unit; they stay visible to the units they oversee.
      users = raw.users.filter((u) => inUnit(u.unitId) || u.role === "direccion");
    }
    return {
      clients,
      sites,
      workers,
      users,
      units: units ? raw.units.filter((u) => units.has(u.id)) : raw.units,
      clientIds,
      workerIds: new Set(workers.map((w) => w.id)),
      userIds: new Set(users.map((u) => u.id)),
    };
  }, [raw, user, unitFilter, orders, cases, audit]);
}

/**
 * The Bitácora the current role may read (and export): entries of visible orders, plus entries without an order when the
 * touched catalog / user record is in scope (the actor's unit only decides when the record's unit is unknown; supervisor: only
 * their own). The single definition used by the Bitácora page and by Configuración (Sincronización, respaldo). Newest first, like the store.
 */
export function useScopedAudit(): AuditEntry[] {
  const { user, unitFilter, orderIds } = useScopedData();
  const raw = useAppStore(useShallow((s) => ({ audit: s.audit, users: s.users, clients: s.clients, sites: s.sites, workers: s.workers })));
  return useMemo(() => {
    const users = new Map(raw.users.map((u) => [u.id, u] as const));
    const clientUnit = new Map(raw.clients.map((c) => [c.id, c.unitId] as const));
    const recordUnit = new Map<string, string>([
      ...raw.clients.map((c) => [c.id, c.unitId] as const),
      ...raw.workers.map((w) => [w.id, w.unitId] as const),
      ...raw.users.map((u) => [u.id, u.unitId] as const),
      ...raw.sites.flatMap((x) => (clientUnit.has(x.clientId) ? [[x.id, clientUnit.get(x.clientId)!] as const] : [])),
    ]);
    const ctx = { unitFilter, orderIds, users, entityUnit: (a: AuditEntry) => recordUnit.get(a.entityId) };
    return raw.audit.filter((a) => canSeeAuditEntry(user, a, ctx));
  }, [raw, user, unitFilter, orderIds]);
}

/** Everything about one order, by folio ("OS-24817") or id. `null` = not found OR outside the current role's scope (doc §2). */
export function useOrderBundle(folioOrId: string) {
  const lk = useLookups();
  const user = useCurrentUser();
  const unitFilter = useAppStore((st) => st.session.unitFilter);
  const s = useAppStore(
    useShallow((st) => ({
      orders: st.orders, jornadas: st.jornadas, photos: st.photos, incidents: st.incidents, reports: st.reports,
      cases: st.cases, surveys: st.surveys, audit: st.audit, queue: st.sync.queue,
    })),
  );
  return useMemo(() => {
    const order = s.orders.find((o) => o.folio === folioOrId || o.id === folioOrId);
    if (!order || !canSeeOrder(user, order, unitFilter)) return null;
    const jornadas = s.jornadas.filter((j) => j.orderId === order.id).sort((a, b) => a.dayIndex - b.dayIndex);
    return {
      order,
      client: lk.clients.get(order.clientId)!,
      site: lk.sites.get(order.siteId)!,
      serviceType: lk.serviceTypes.get(order.serviceTypeId)!,
      supervisor: lk.users.get(order.supervisorId)!,
      unit: lk.units.get(order.unitId)!,
      jornadas,
      photos: s.photos.filter((p) => p.orderId === order.id),
      incidents: s.incidents.filter((i) => i.orderId === order.id),
      reports: s.reports.filter((r) => r.orderId === order.id).sort((a, b) => b.version - a.version),
      cases: s.cases.filter((c) => c.orderId === order.id),
      surveys: s.surveys.filter((x) => x.orderId === order.id),
      audit: s.audit.filter((a) => a.orderId === order.id),
      pendingSync: s.queue.filter((q) => q.orderId === order.id && q.state !== "sincronizado"),
      currentCrew: (jornadas.find((j) => j.status !== "cerrada") ?? jornadas.at(-1))?.workerIds.map((id) => lk.workers.get(id)!).filter(Boolean) ?? [],
    };
  }, [s, lk, folioOrId, user, unitFilter]);
}

export type OrderBundle = NonNullable<ReturnType<typeof useOrderBundle>>;

/** One jornada with its order bundle; `null` = not found or the order is outside the current role's scope. */
export function useJornadaBundle(jornadaId: string) {
  const jornada = useAppStore((s) => s.jornadas.find((j) => j.id === jornadaId));
  const orderId = jornada?.orderId ?? "";
  const bundle = useOrderBundle(orderId);
  return jornada && bundle ? { jornada: jornada as Jornada, ...bundle } : null;
}

/** Offline = browser offline OR "Simular sin conexión". */
export function useIsOffline() {
  return useAppStore((s) => isOffline(s));
}

/**
 * Sync status for the indicators. `lastSyncAt` is the last time the device heard from the server: the demo's simulated sends,
 * or an account's last successful pull (sync/pull.ts). Account sessions also report the pull itself: running (`pulling`,
 * `pullInitial` = first load / orders being completed), its last error, and a session that must be renewed (`needsReauth`).
 */
export function useSyncSummary() {
  const queue = useAppStore((s) => s.sync.queue);
  const queueSyncAt = useAppStore((s) => s.sync.lastSyncAt);
  const account = useAppStore((s) => s.session.mode === "supabase");
  const lastPullAt = useAppStore((s) => s.session.pull?.lastPullAt);
  const needsReauth = useAppStore((s) => s.session.mode === "supabase" && !!s.session.needsReauth);
  const pulling = usePullStatus((s) => s.running);
  const pullInitial = usePullStatus((s) => s.initial);
  const pullError = usePullStatus((s) => s.error);
  const offline = useIsOffline();
  return useMemo(() => {
    const pending = queue.filter((q) => q.state === "pendiente" || q.state === "error");
    const syncing = queue.filter((q) => q.state === "sincronizando");
    const lastSyncAt = account ? (lastPullAt ?? queueSyncAt) : queueSyncAt;
    return { offline, pending, syncing, lastSyncAt, queue, account, lastPullAt, pulling: account && pulling, pullInitial, pullError: account ? pullError : undefined, needsReauth };
  }, [queue, queueSyncAt, offline, account, lastPullAt, pulling, pullInitial, pullError, needsReauth]);
}

/** Re-renders every `ms` — for live timers and "hace X min" labels. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMediaQuery(query: string) {
  // Views render only after client hydration (AppShell gate), so reading window here is safe.
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export type { Order };
