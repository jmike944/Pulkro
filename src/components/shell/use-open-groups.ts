"use client";

import { useCallback, useEffect, useState } from "react";
import { NAV_GROUPS, isActive, type NavGroup } from "./nav";

export type GroupKey = NavGroup["key"];
type OpenGroups = Partial<Record<GroupKey, boolean>>;

const GROUPS_KEY = "pk.sidebar.groups";

/** The group the current route lives in (null on Inicio, Pendientes, Configuración…). */
export function activeGroupKey(pathname: string): GroupKey | null {
  return NAV_GROUPS.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.key ?? null;
}

/** Saved open/closed state. Only runs in the browser: the sidebar mounts after the store hydrates, never in server HTML. */
function readSaved(): OpenGroups {
  if (typeof window === "undefined") return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return {};
    const saved: OpenGroups = {};
    for (const g of NAV_GROUPS) {
      const v = (raw as Record<string, unknown>)[g.key];
      if (typeof v === "boolean") saved[g.key] = v;
    }
    return saved;
  } catch {
    return {};
  }
}

/**
 * Which sidebar groups are expanded, remembered across visits. The group of the current route is always open on arrival and
 * whenever navigation moves into it; the others keep whatever the person left them at (first visit: closed).
 */
export function useOpenGroups(pathname: string) {
  const active = activeGroupKey(pathname);
  const [open, setOpen] = useState<OpenGroups>(() => {
    const saved = readSaved();
    return active ? { ...saved, [active]: true } : saved;
  });

  // Moving into another group opens it. Adjusted during render (not in an effect) so there is no closed-then-open flash.
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    if (active && !open[active]) setOpen({ ...open, [active]: true });
  }

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(open));
    } catch {}
  }, [open]);

  const isOpen = useCallback((key: GroupKey) => open[key] === true, [open]);
  const setGroupOpen = useCallback((key: GroupKey, value: boolean) => setOpen((o) => ({ ...o, [key]: value })), []);
  return { isOpen, setGroupOpen };
}
