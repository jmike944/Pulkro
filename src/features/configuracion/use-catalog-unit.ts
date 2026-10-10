"use client";

import { useAppStore, useCurrentUser } from "@/lib/hooks";

/**
 * Which unit's catalog records the current user manages:
 * Administración → its own unit · Dirección → the unit picked in the sidebar (or all).
 */
export function useCatalogUnit(): string | "all" {
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  if (user.role === "direccion") return unitFilter;
  return user.unitId;
}
