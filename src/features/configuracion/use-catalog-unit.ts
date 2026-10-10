"use client";

import { useAppStore, useCurrentUser } from "@/lib/hooks";

/**
 * Which unit's catalog records the current user manages:
 * Administración → its own unit · Dirección → the unit scope picked in the sidebar, the mobile header or Perfil (or all).
 */
export function useCatalogUnit(): string | "all" {
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  if (user.role === "direccion") return unitFilter;
  return user.unitId;
}
