"use client";
import { useMemo } from "react";
import { useAppStore, useScopedData, useLookups } from "@/lib/hooks";
import { canSeeAuditEntry } from "@/lib/permissions";

/** Audit entries follow the same order and unit scope as the rest of the app. */
export function useVisibleAudit() {
  const all = useAppStore((s) => s.audit);
  const { user, unitFilter, orderIds } = useScopedData();
  const { users } = useLookups();
  return useMemo(() => all.filter((entry) => canSeeAuditEntry(user, entry, { unitFilter, orderIds, users })), [all, user, unitFilter, orderIds, users]);
}
