"use client";

import { useMemo } from "react";
import { addMonths, format, getMonth, getYear, isWithinInterval, parseISO, startOfMonth, startOfYear, subMonths } from "date-fns";
import { useAppStore } from "@/lib/store";
import { useLookups, useNow, useScopedData } from "@/lib/hooks";
import { jornadaMinutes } from "@/lib/domain";
import { OPEN_STATUSES } from "@/lib/status";
import type { Client, Jornada, Order, PostSaleCase, Site, Survey, User } from "@/lib/types";
import { MONTHS_SHORT, csatOf, isCaseOpen } from "@/features/postventa/lib";

export type ClientPeriod = "12m" | "year";

export type ClientStats = {
  client: Client;
  sites: Site[];
  orders: Order[];
  /** services = orders with a validated closure in the period (doc §5) */
  services: Order[];
  programmed: number;
  minutes: number;
  csat: number;
  csatCount: number;
  surveyed: number;
  cases: PostSaleCase[];
  openCases: number;
  openOrders: Order[];
  lastService?: string;
};

/** Clients the current role may see (doc §2): supervisor → clients of own orders; administración → own unit. */
export function visibleClients(clients: Client[], user: User, unitFilter: string, orders: Order[]) {
  if (user.role === "supervisor") {
    const ids = new Set(orders.map((o) => o.clientId));
    return clients.filter((c) => ids.has(c.id));
  }
  if (user.role === "administracion") return clients.filter((c) => c.unitId === user.unitId);
  return unitFilter === "all" ? clients : clients.filter((c) => c.unitId === unitFilter);
}

export function periodRange(period: ClientPeriod, now: Date) {
  return { start: period === "year" ? startOfYear(now) : subMonths(now, 12), end: now };
}

const within = (iso: string | undefined, r: { start: Date; end: Date }) => !!iso && isWithinInterval(parseISO(iso), r);

/** Per-client indicators computed from scoped data only, so numbers match what the role can open. */
export function computeClientStats(
  client: Client,
  ctx: { orders: Order[]; jornadas: Jornada[]; surveys: Survey[]; cases: PostSaleCase[]; sites: Map<string, Site> },
  range: { start: Date; end: Date },
): ClientStats {
  const orders = ctx.orders.filter((o) => o.clientId === client.id);
  const ids = new Set(orders.map((o) => o.id));
  const services = orders.filter((o) => within(o.closure?.validatedAt, range));
  const serviceIds = new Set(services.map((o) => o.id));
  const minutes = ctx.jornadas.filter((j) => serviceIds.has(j.orderId) && j.checkOut).reduce((s, j) => s + jornadaMinutes(j), 0);
  const surveys = ctx.surveys.filter((s) => ids.has(s.orderId));
  const answered = surveys.filter((s) => s.answers && within(s.respondedAt, range));
  const cases = ctx.cases.filter((c) => ids.has(c.orderId));
  const closedDates = orders.map((o) => o.closure?.validatedAt).filter((x): x is string => !!x).sort();
  return {
    client,
    sites: client.siteIds.map((id) => ctx.sites.get(id)).filter((s): s is Site => !!s),
    orders,
    services,
    programmed: orders.filter((o) => o.status !== "cancelada" && within(o.scheduledStart, range)).length,
    minutes,
    csat: csatOf(answered),
    csatCount: answered.length,
    surveyed: services.filter((o) => surveys.some((s) => s.orderId === o.id)).length,
    cases: cases.filter((c) => within(c.createdAt, range)),
    openCases: cases.filter(isCaseOpen).length,
    openOrders: orders.filter((o) => OPEN_STATUSES.includes(o.status)),
    lastService: closedDates.at(-1),
  };
}

/** Directory of visible clients with 12-month indicators. */
export function useClientDirectory() {
  const scoped = useScopedData();
  const clients = useAppStore((s) => s.clients);
  const lk = useLookups();
  const now = useNow(5 * 60_000);
  const { orders, jornadas, surveys, cases, user, unitFilter } = scoped;

  return useMemo(() => {
    const range = periodRange("12m", now);
    const ctx = { orders, jornadas, surveys, cases, sites: lk.sites };
    const rows = visibleClients(clients, user, unitFilter, orders).map((c) => computeClientStats(c, ctx, range));
    const yearCases = cases.filter((c) => within(c.createdAt, range));
    return { rows, cases: yearCases, user, now };
  }, [clients, orders, jornadas, surveys, cases, user, unitFilter, lk, now]);
}

/** Services per month: rolling 12 months or Jan → now. */
export function servicesPerMonth(services: Order[], period: ClientPeriod, now: Date) {
  const first = period === "year" ? startOfYear(now) : startOfMonth(subMonths(now, 11));
  const months: { label: string; key: string; value: number }[] = [];
  for (let m = first; m <= now; m = addMonths(m, 1)) {
    const y = getYear(m);
    const mi = getMonth(m);
    months.push({
      label: MONTHS_SHORT[mi],
      key: format(m, "yyyy-MM"),
      value: services.filter((o) => {
        const d = parseISO(o.closure!.validatedAt);
        return getYear(d) === y && getMonth(d) === mi;
      }).length,
    });
  }
  return months;
}
