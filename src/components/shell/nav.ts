import {
  Building2,
  CalendarDays,
  Camera,
  ChartColumn,
  CircleHelp,
  ClipboardList,
  FileText,
  Inbox,
  LayoutGrid,
  MessageSquareHeart,
  Settings,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

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

export type NavItem = { key: NavKey; href: string; label: string; icon: LucideIcon; badge?: "ordenes" | "evidencias" | "incidencias" | "postventa" | "pendientes" };

export type NavBadgeKey = NonNullable<NavItem["badge"]>;

/** A labeled block of the sidebar / phone Menú sheet. */
export type NavGroup = { key: "operacion" | "seguimiento" | "gestion"; label: string; items: NavItem[] };

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
    items: [
      { key: "ordenes", href: "/ordenes", label: "Órdenes", icon: ClipboardList, badge: "ordenes" },
      { key: "agenda", href: "/agenda", label: "Agenda", icon: CalendarDays },
      { key: "evidencias", href: "/evidencias", label: "Evidencias", icon: Camera, badge: "evidencias" },
      { key: "incidencias", href: "/incidencias", label: "Incidencias", icon: TriangleAlert, badge: "incidencias" },
    ],
  },
  {
    key: "seguimiento",
    label: "Seguimiento",
    items: [
      { key: "reportes", href: "/reportes", label: "Reportes", icon: FileText },
      { key: "postventa", href: "/postventa", label: "Postventa", icon: MessageSquareHeart, badge: "postventa" },
      { key: "clientes", href: "/clientes", label: "Clientes", icon: Building2 },
    ],
  },
  {
    key: "gestion",
    label: "Gestión",
    items: [
      { key: "indicadores", href: "/indicadores", label: "Indicadores", icon: ChartColumn },
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

/** The phone tab bar's route tabs (the 5th tab, Menú, opens a sheet instead of navigating). */
export const PHONE_TAB_ROUTES = ["/", "/ordenes", "/agenda", "/pendientes"] as const;

/** Sections that are not a phone tab: they live in the Menú sheet. */
const SECONDARY = NAV_ALL.filter((n) => !(PHONE_TAB_ROUTES as readonly string[]).includes(n.href));

/** Badge kinds shown by secondary sections only — the phone Menú tab carries a dot when any of them has a count. */
export const SECONDARY_BADGES: NavBadgeKey[] = SECONDARY.flatMap((n) => (n.badge ? [n.badge] : []));

/** True inside a section that is not a phone tab (incl. /perfil, reached from the Menú sheet) — the Menú tab lights up there. */
export function isSecondaryRoute(pathname: string) {
  return isActive(pathname, "/perfil") || SECONDARY.some((n) => isActive(pathname, n.href));
}
