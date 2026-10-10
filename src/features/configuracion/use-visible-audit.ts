"use client";

import { useMemo } from "react";
import { useAppStore, useCurrentUser, useScopedData } from "@/lib/hooks";

/**
 * Audit entries the current user may read (doc §2 + §3):
 * supervisor → entries on their own orders plus anything they did themselves; others → the full log.
 */
export function useVisibleAudit() {
  const user = useCurrentUser();
  const all = useAppStore((s) => s.audit);
  const { orderIds } = useScopedData();
  return useMemo(() => {
    if (user.role !== "supervisor") return all;
    return all.filter((a) => (a.orderId ? orderIds.has(a.orderId) : a.by === user.id));
  }, [all, orderIds, user.id, user.role]);
}
