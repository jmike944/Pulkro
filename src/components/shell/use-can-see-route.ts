"use client";

import { useCallback } from "react";
import { useCurrentUser } from "@/lib/hooks";
import { canSeeRoute } from "./nav";

/**
 * `(href) => boolean` for the current role: hide or re-point links to screens of another role (e.g. a Dirección incident
 * row must link to /ordenes/[folio]?tab=incidencias, not /incidencias). Query strings and hashes are ignored.
 */
export function useCanSeeRoute() {
  const role = useCurrentUser().role;
  return useCallback((href: string) => canSeeRoute(role, href.split(/[?#]/)[0] || "/"), [role]);
}
