"use client";

import { useMemo } from "react";
import { useLookups, useScopedData } from "@/lib/hooks";
import type { Client, Order, PostSaleCase, Report, Survey, User } from "@/lib/types";
import { CASE_FLOW } from "./lib";

export type CaseRow = { c: PostSaleCase; order?: Order; client?: Client; owner?: User };
export type SurveyRow = { s: Survey; order: Order; client?: Client };
export type FollowUpRow = { order: Order; client?: Client; report?: Report; sharedAt?: string; closedAt: string; survey?: Survey };

/**
 * Everything /postventa needs, joined and scoped to what the current role may see (doc §2).
 */
export function usePostventaData() {
  const scoped = useScopedData();
  const lk = useLookups();
  const { orders, cases, surveys, reports } = scoped;

  return useMemo(() => {
    const orderById = new Map(orders.map((o) => [o.id, o] as const));

    const caseRows: CaseRow[] = cases
      .map((c) => ({ c, order: orderById.get(c.orderId), client: lk.clients.get(c.clientId), owner: lk.users.get(c.ownerId) }))
      .sort((a, b) => CASE_FLOW.indexOf(a.c.status) - CASE_FLOW.indexOf(b.c.status) || a.c.dueDate.localeCompare(b.c.dueDate));

    const surveyRows: SurveyRow[] = surveys
      .flatMap((s) => {
        const order = orderById.get(s.orderId);
        return order ? [{ s, order, client: lk.clients.get(s.clientId) }] : [];
      })
      .sort((a, b) => b.s.sentAt.localeCompare(a.s.sentAt));

    const surveyByOrder = new Map<string, Survey>();
    surveys.forEach((s) => {
      const cur = surveyByOrder.get(s.orderId);
      if (!cur || s.sentAt > cur.sentAt) surveyByOrder.set(s.orderId, s);
    });

    /** Closed orders (validated) — candidates for a survey or a complaint. */
    const followUps: FollowUpRow[] = orders
      .filter((o) => o.closure && o.status !== "cancelada")
      .map((o) => {
        const shared = reports
          .filter((r) => r.orderId === o.id && r.shares.length)
          .map((r) => ({ r, at: r.shares.reduce((m, s) => (s.at > m ? s.at : m), r.shares[0].at) }))
          .sort((a, b) => b.at.localeCompare(a.at))[0];
        return {
          order: o,
          client: lk.clients.get(o.clientId),
          report: shared?.r,
          sharedAt: shared?.at,
          closedAt: o.closure!.validatedAt,
          survey: surveyByOrder.get(o.id),
        };
      })
      .sort((a, b) => (b.sharedAt ?? b.closedAt).localeCompare(a.sharedAt ?? a.closedAt));

    return { ...scoped, caseRows, surveyRows, followUps, surveyByOrder, orderById };
  }, [scoped, orders, cases, surveys, reports, lk]);
}

export type PostventaData = ReturnType<typeof usePostventaData>;
