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

export const NAV_MAIN: NavItem[] = [
  { key: "inicio", href: "/", label: "Inicio", icon: LayoutGrid },
  { key: "pendientes", href: "/pendientes", label: "Pendientes", icon: Inbox, badge: "pendientes" },
  { key: "ordenes", href: "/ordenes", label: "Órdenes", icon: ClipboardList, badge: "ordenes" },
  { key: "agenda", href: "/agenda", label: "Agenda", icon: CalendarDays },
  { key: "evidencias", href: "/evidencias", label: "Evidencias", icon: Camera, badge: "evidencias" },
  { key: "incidencias", href: "/incidencias", label: "Incidencias", icon: TriangleAlert, badge: "incidencias" },
  { key: "reportes", href: "/reportes", label: "Reportes", icon: FileText },
  { key: "postventa", href: "/postventa", label: "Postventa", icon: MessageSquareHeart, badge: "postventa" },
  { key: "clientes", href: "/clientes", label: "Clientes", icon: Building2 },
  { key: "indicadores", href: "/indicadores", label: "Indicadores", icon: ChartColumn },
  { key: "equipo", href: "/equipo", label: "Equipo", icon: Users },
];

export const NAV_FOOT: NavItem[] = [
  { key: "configuracion", href: "/configuracion", label: "Configuración", icon: Settings },
  { key: "ayuda", href: "/ayuda", label: "Centro de ayuda", icon: CircleHelp },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sections only reached from Perfil › Secciones (everything that is not one of the 4 phone tabs). */
const PHONE_TABS = ["/", "/ordenes", "/pendientes", "/perfil"];
const SECONDARY = [...NAV_MAIN, ...NAV_FOOT].filter((n) => !PHONE_TABS.includes(n.href));

/** True inside a secondary section — the phone tab bar lights the Perfil tab there ("you are in Más"). */
export function isSecondaryRoute(pathname: string) {
  return SECONDARY.some((n) => isActive(pathname, n.href));
}
