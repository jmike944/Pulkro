import {
  Building2,
  CalendarDays,
  Camera,
  ChartColumn,
  CircleHelp,
  ClipboardList,
  FileText,
  Handshake,
  HardHat,
  House,
  Inbox,
  LayoutGrid,
  MessageSquareHeart,
  Settings,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export type NavKey =
  | "inicio"
  | "pendientes"
  | "ordenes"
  | "agenda"
  | "evidencias"
  | "incidencias"
  | "reportes"
  | "postventa"
  | "clientes"
  | "indicadores"
  | "equipo"
  | "configuracion"
  | "ayuda"
  | "perfil";

export type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "ordenes" | "evidencias" | "incidencias" | "postventa" | "pendientes";
  /** Roles that may open the section (doc §7 + product decisions). Omitted = every role. */
  roles?: Role[];
};

/** Field screens are the supervisor's: Dirección and Administración see jornadas, evidence and incidents inside the order. */
const FIELD: Role[] = ["supervisor"];
/** Indicadores (and their exports) are for Dirección and Administración; supervisors see their own figures on Hoy. */
const MANAGEMENT: Role[] = ["direccion", "administracion"];

export type NavBadgeKey = NonNullable<NavItem["badge"]>;

/** A labeled block of the sidebar / phone Menú sheet. The icon stands for the whole group where only one icon fits (collapsed sidebar, group header). */
export type NavGroup = { key: "operacion" | "seguimiento" | "gestion"; label: string; icon: LucideIcon; items: NavItem[] };

/** Top of the nav, no heading: the two "where do I start" destinations. */
export const NAV_HOME: NavItem[] = [
  { key: "inicio", href: "/", label: "Inicio", icon: LayoutGrid },
  { key: "pendientes", href: "/pendientes", label: "Pendientes", icon: Inbox, badge: "pendientes" },
];

/** Sections grouped by what the user is doing: running the work, following it up, managing the business. */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "operacion",
    label: "Operación",
    icon: HardHat,
    items: [
      { key: "ordenes", href: "/ordenes", label: "Órdenes", icon: ClipboardList, badge: "ordenes" },
      { key: "agenda", href: "/agenda", label: "Agenda", icon: CalendarDays, roles: FIELD },
      { key: "evidencias", href: "/evidencias", label: "Evidencias", icon: Camera, badge: "evidencias", roles: FIELD },
      { key: "incidencias", href: "/incidencias", label: "Incidencias", icon: TriangleAlert, badge: "incidencias", roles: FIELD },
    ],
  },
  {
    key: "seguimiento",
    label: "Seguimiento",
    icon: Handshake,
    items: [
      { key: "reportes", href: "/reportes", label: "Reportes", icon: FileText, roles: FIELD },
      { key: "postventa", href: "/postventa", label: "Postventa", icon: MessageSquareHeart, badge: "postventa" },
      { key: "clientes", href: "/clientes", label: "Clientes", icon: Building2 },
    ],
  },
  {
    key: "gestion",
    label: "Gestión",
    icon: ChartColumn,
    items: [
      { key: "indicadores", href: "/indicadores", label: "Indicadores", icon: ChartColumn, roles: MANAGEMENT },
      { key: "equipo", href: "/equipo", label: "Equipo", icon: Users },
    ],
  },
];

/** Pinned at the bottom of the sidebar (and as list rows at the end of the phone Menú sheet). */
export const NAV_FOOT: NavItem[] = [
  { key: "configuracion", href: "/configuracion", label: "Configuración", icon: Settings },
  { key: "ayuda", href: "/ayuda", label: "Centro de ayuda", icon: CircleHelp },
];

/** Every section in display order, for consumers that do not care about grouping. */
export const NAV_ALL: NavItem[] = [...NAV_HOME, ...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOT];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ───────────── role access ───────────── */

export const navItemVisible = (item: NavItem, role: Role) => !item.roles || item.roles.includes(role);

/** Routes that are not nav sections, most specific first. `null` roles = every role. */
const ROUTE_RULES: { match: (pathname: string) => boolean; allows: (role: Role) => boolean }[] = [
  { match: (p) => p === "/ordenes/nueva" || p.startsWith("/ordenes/nueva/"), allows: (r) => can(r, "order.create") },
  // The report share/send workspace; Dirección and Administración download the order PDF from the order detail.
  { match: (p) => /^\/ordenes\/[^/]+\/reporte(\/|$)/.test(p), allows: (r) => FIELD.includes(r) },
  { match: (p) => isActive(p, "/jornada"), allows: (r) => FIELD.includes(r) },
];

/** Whether `role` may open `pathname` (dynamic segments included: /jornada/[id], /ordenes/[folio]/reporte…). Unknown routes → true. */
export function canSeeRoute(role: Role, pathname: string): boolean {
  const rule = ROUTE_RULES.find((r) => r.match(pathname));
  if (rule) return rule.allows(role);
  const item = [...NAV_ALL].filter((n) => n.href !== "/" && isActive(pathname, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return item ? navItemVisible(item, role) : true;
}

/** The nav model filtered for one role: groups without visible pages disappear. */
export function navFor(role: Role) {
  const keep = (items: NavItem[]) => items.filter((i) => navItemVisible(i, role));
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: keep(g.items) })).filter((g) => g.items.length > 0);
  const home = keep(NAV_HOME);
  const foot = keep(NAV_FOOT);
  return { home, groups, foot, all: [...home, ...groups.flatMap((g) => g.items), ...foot] };
}

/* ───────────── phone tab bar ───────────── */

export type PhoneTab = { href: string; label: string; icon: LucideIcon };

/** Route tabs of the phone bar per role (the 5th tab, Menú, opens a sheet). Supervisors get Agenda; the other roles Indicadores. */
export function phoneTabsFor(role: Role): PhoneTab[] {
  const third: PhoneTab = role === "supervisor" ? { href: "/agenda", label: "Agenda", icon: CalendarDays } : { href: "/indicadores", label: "Indicadores", icon: ChartColumn };
  return [{ href: "/", label: "Hoy", icon: House }, { href: "/ordenes", label: "Órdenes", icon: ClipboardList }, third, { href: "/pendientes", label: "Pendientes", icon: Inbox }];
}

/** Sections of `role` that are not a phone tab: they live in the Menú sheet. */
function secondaryFor(role: Role) {
  const tabs = phoneTabsFor(role).map((t) => t.href);
  return navFor(role).all.filter((n) => !tabs.includes(n.href));
}

/** Badge kinds shown by the role's secondary sections only — the phone Menú tab carries a dot when any of them has a count. */
export function secondaryBadgesFor(role: Role): NavBadgeKey[] {
  return secondaryFor(role).flatMap((n) => (n.badge ? [n.badge] : []));
}

/** True inside a section that is not one of the role's phone tabs (incl. /perfil, reached from the Menú sheet) — the Menú tab lights up there. */
export function isSecondaryRoute(pathname: string, role: Role = "supervisor") {
  return isActive(pathname, "/perfil") || secondaryFor(role).some((n) => isActive(pathname, n.href));
}
