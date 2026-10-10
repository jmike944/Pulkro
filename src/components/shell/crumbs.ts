"use client";

import { useId, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { isActive, NAV_ALL, NAV_GROUPS, type NavGroup, type NavKey } from "./nav";

/**
 * Breadcrumbs of the desktop card header (`card-header.tsx`).
 *
 * The trail is derived from the nav model for every section ("Operación › Órdenes"). Detail pages add their own tail by passing
 * `breadcrumb` to `PageHeader` (or `usePublishCrumbs` where there is no PageHeader): the page publishes it here and the card
 * header shows it, prefixed with the section's group. Below `lg` the card header does not exist and PageHeader keeps drawing its
 * own back-chevron trail.
 */
export type Crumb = { label: string; href?: string };

type Published = { owner: string; pathname: string; items: Crumb[] };

type CrumbState = {
  published: Published | null;
  publish: (p: Published) => void;
  /** Only the owner can clear its trail, so a page that unmounts after its successor published does not wipe it. */
  retract: (owner: string) => void;
};

export const useCrumbs = create<CrumbState>()((set) => ({
  published: null,
  publish: (published) => set({ published }),
  retract: (owner) => set((s) => (s.published?.owner === owner ? { published: null } : s)),
}));

/**
 * Publishes `items` as the page's trail while the calling component is on screen. Layout effect: the card header shows the full
 * trail in the same frame as the page, and Cache Components' hidden pages (Activity) retract theirs when they are hidden.
 * Pass `undefined` for "nothing to publish".
 */
export function usePublishCrumbs(items: Crumb[] | undefined) {
  const owner = useId();
  const pathname = usePathname();
  // A string key: pages build their array inline on every render.
  const key = items?.length ? JSON.stringify(items) : "";
  useLayoutEffect(() => {
    if (!key) return;
    const { publish, retract } = useCrumbs.getState();
    publish({ owner, pathname, items: JSON.parse(key) as Crumb[] });
    return () => retract(owner);
  }, [owner, pathname, key]);
}

/** Routes that belong to a section without being one of its pages. */
const ROUTE_ALIASES: { prefix: string; key: NavKey }[] = [{ prefix: "/jornada", key: "ordenes" }];

type Section = { label: string; href: string; group: NavGroup | null };

/** The section a route belongs to (nav model), with its group when it has one; Perfil is not in the nav but is a section too. */
function findSection(pathname: string): Section | null {
  const alias = ROUTE_ALIASES.find((a) => isActive(pathname, a.prefix));
  const item = alias ? NAV_ALL.find((n) => n.key === alias.key) : NAV_ALL.find((n) => n.href !== "/" && isActive(pathname, n.href));
  if (item) return { label: item.label, href: item.href, group: NAV_GROUPS.find((g) => g.items.some((i) => i.key === item.key)) ?? null };
  if (isActive(pathname, "/perfil")) return { label: "Perfil", href: "/perfil", group: null };
  const home = NAV_ALL.find((n) => n.href === "/");
  return home && isActive(pathname, "/") ? { label: home.label, href: home.href, group: null } : null;
}

/** The trail for `pathname`: group › section from the nav model, plus the page's own tail when it published one. */
export function buildTrail(pathname: string, published: Published | null): Crumb[] {
  const section = findSection(pathname);
  const group: Crumb[] = section?.group ? [{ label: section.group.label }] : [];
  if (published && published.pathname === pathname && published.items.length > 0) {
    const [first] = published.items;
    // Pages usually start with their section ("Órdenes"); when one does not, the section opens the trail as a link.
    const lead: Crumb[] = section && first.href !== section.href && first.label !== section.label ? [{ label: section.label, href: section.href }] : [];
    return [...group, ...lead, ...published.items];
  }
  return section ? [...group, { label: section.label }] : [];
}

/** The trail shown in the card header for the current route. */
export function useTrail(): Crumb[] {
  const pathname = usePathname();
  const published = useCrumbs((s) => s.published);
  return buildTrail(pathname, published);
}
