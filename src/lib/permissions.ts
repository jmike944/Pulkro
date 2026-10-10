import type { Order, Role, User } from "./types";

/**
 * Role × action matrix from doc §2. "Consulta" = read-only → false here.
 * PROPUESTO items are enabled and flagged in the Configuración screen.
 */
export type Action =
  | "order.create"
  | "order.edit"
  | "order.editOperational"
  | "crew.assign"
  | "field.capture" // check-in/out, GPS, photos, incidents
  | "closure.authorize"
  | "report.share"
  | "postventa.manage"
  | "export.pdf"
  | "export.excel"
  | "users.admin"
  | "catalogs.admin"
  | "view.allUnits"
  | "view.kpis";

export const PERMISSIONS: Record<Action, Record<Role, boolean>> = {
  "order.create": { direccion: false, administracion: true, supervisor: true },
  "order.edit": { direccion: false, administracion: true, supervisor: false },
  "order.editOperational": { direccion: false, administracion: true, supervisor: true },
  "crew.assign": { direccion: false, administracion: false, supervisor: true },
  "field.capture": { direccion: false, administracion: false, supervisor: true },
  "closure.authorize": { direccion: false, administracion: false, supervisor: true },
  "report.share": { direccion: false, administracion: false, supervisor: true },
  "postventa.manage": { direccion: false, administracion: true, supervisor: true },
  "export.pdf": { direccion: true, administracion: true, supervisor: true },
  "export.excel": { direccion: true, administracion: true, supervisor: false },
  "users.admin": { direccion: true, administracion: false, supervisor: false },
  "catalogs.admin": { direccion: true, administracion: true, supervisor: false },
  "view.allUnits": { direccion: true, administracion: false, supervisor: false },
  "view.kpis": { direccion: true, administracion: true, supervisor: true },
};

/** Row labels for the permission matrix screen, in doc order. */
export const PERMISSION_ROWS: { action: Action; label: string; status: "confirmado" | "propuesto" | "pendiente" }[] = [
  { action: "order.create", label: "Crear orden", status: "propuesto" },
  { action: "order.edit", label: "Editar orden", status: "confirmado" },
  { action: "order.editOperational", label: "Editar datos operativos", status: "propuesto" },
  { action: "crew.assign", label: "Asignar cuadrilla", status: "confirmado" },
  { action: "field.capture", label: "Capturar GPS, fotos e incidencias", status: "confirmado" },
  { action: "closure.authorize", label: "Autorizar cierre y envío", status: "confirmado" },
  { action: "postventa.manage", label: "Gestionar quejas y encuestas", status: "propuesto" },
  { action: "export.pdf", label: "Exportar PDF", status: "confirmado" },
  { action: "export.excel", label: "Exportar Excel", status: "confirmado" },
  { action: "users.admin", label: "Administrar usuarios y permisos", status: "pendiente" },
  { action: "catalogs.admin", label: "Administrar catálogos", status: "pendiente" },
  { action: "view.allUnits", label: "Ver todas las unidades", status: "propuesto" },
];

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action][role];
}

/** Data scoping (doc §2): supervisor → own assignments; administración → own unit; dirección → all / selected unit. */
export function canSeeOrder(user: User, order: Order, unitFilter: string | "all"): boolean {
  if (user.role === "supervisor") return order.supervisorId === user.id;
  if (user.role === "administracion") return order.unitId === user.unitId;
  return unitFilter === "all" || order.unitId === unitFilter;
}
