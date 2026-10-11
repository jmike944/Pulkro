import type { AuditEntry, Client, Order, Role, User, Worker } from "./types";

/**
 * Role × action matrix from doc §2. "Consulta" = read-only → false here.
 * PROPUESTO items are enabled and flagged in the Configuración screen.
 *
 * Product-owner decisions applied here (oct 2026):
 *  - Only Administración creates orders; Dirección consults; supervisors do not create (no "Nueva orden" for them).
 *  - Indicadores (screen + KPI exports) only for Dirección and Administración; supervisors keep their own figures on Hoy.
 *  - Field screens (Agenda, Jornada, Evidencias, Incidencias, Reportes, report sharing) are supervisor-only; Dirección and
 *    Administración see jornadas, evidence and incidents read-only inside the order detail and download its PDF there.
 *  - Reopening is its own action: the supervisor reopens their own orders; Administración and Dirección do not.
 *  - Rescheduling / confirming dates is the supervisor's (it moves the crew's agenda).
 */
export type Action =
  | "order.create"
  | "order.edit"
  | "order.editOperational"
  | "order.reschedule" // move pending jornadas, flag/confirm "Reprogramada"
  | "order.reopen" // reopen a closed order (new report version after re-validation)
  | "order.archive" // close the post-sale cycle
  | "crew.assign"
  | "field.capture" // check-in/out, GPS, photos, incidents
  | "closure.authorize"
  | "report.share" // generate report versions and open the share/send workspace
  | "postventa.manage"
  | "export.pdf" // the order's own PDF ("PDF propio": order detail / service report)
  | "export.excel"
  | "export.kpis" // Indicadores exports (Excel / print-PDF of the dashboard)
  | "export.backup" // JSON backup of the device data
  | "users.admin"
  | "catalogs.admin"
  | "view.allUnits"
  | "view.kpis";

export const PERMISSIONS: Record<Action, Record<Role, boolean>> = {
  "order.create": { direccion: false, administracion: true, supervisor: false },
  "order.edit": { direccion: false, administracion: true, supervisor: false },
  "order.editOperational": { direccion: false, administracion: true, supervisor: true },
  "order.reschedule": { direccion: false, administracion: false, supervisor: true },
  "order.reopen": { direccion: false, administracion: false, supervisor: true },
  "order.archive": { direccion: false, administracion: true, supervisor: true },
  "crew.assign": { direccion: false, administracion: false, supervisor: true },
  "field.capture": { direccion: false, administracion: false, supervisor: true },
  "closure.authorize": { direccion: false, administracion: false, supervisor: true },
  "report.share": { direccion: false, administracion: false, supervisor: true },
  "postventa.manage": { direccion: false, administracion: true, supervisor: true },
  "export.pdf": { direccion: true, administracion: true, supervisor: true },
  "export.excel": { direccion: true, administracion: true, supervisor: false },
  "export.kpis": { direccion: true, administracion: true, supervisor: false },
  "export.backup": { direccion: true, administracion: true, supervisor: false },
  "users.admin": { direccion: true, administracion: false, supervisor: false },
  "catalogs.admin": { direccion: true, administracion: true, supervisor: false },
  "view.allUnits": { direccion: true, administracion: false, supervisor: false },
  "view.kpis": { direccion: true, administracion: true, supervisor: false },
};

export type DocStatus = "confirmado" | "propuesto" | "pendiente";

export type PermissionRow = {
  action: Action;
  label: string;
  /** Status of the row as a whole in the doc (kept for the existing matrix UI). */
  status: DocStatus;
  /** Per-cell status where a role's cell differs from the row (e.g. a decision taken for one role only). */
  cells?: Partial<Record<Role, DocStatus>>;
  /** Qualifier shown instead of a plain ✓ / — ("Consulta", "Solo propias", "Su unidad"…). */
  scope?: Partial<Record<Role, string>>;
  /** Where the rule comes from / what is still open. */
  note?: string;
};

/** Every Action, in doc order, with honest per-role qualifiers for the permission matrix and "Mis permisos". */
export const PERMISSION_ROWS: PermissionRow[] = [
  {
    action: "order.create",
    label: "Crear orden",
    status: "confirmado",
    scope: { direccion: "Consulta" },
    note: "Solo Administración da de alta órdenes (decisión de Pulkro sobre §2 y §10).",
  },
  { action: "order.edit", label: "Editar orden", status: "confirmado", scope: { direccion: "Consulta", administracion: "Su unidad" } },
  {
    action: "order.editOperational",
    label: "Editar datos operativos",
    status: "propuesto",
    scope: { direccion: "Consulta", administracion: "Su unidad", supervisor: "Solo propias" },
  },
  {
    action: "order.reschedule",
    label: "Reprogramar y confirmar fechas",
    status: "propuesto",
    scope: { direccion: "Consulta", administracion: "Consulta", supervisor: "Solo propias" },
    note: "Mueve la agenda de la cuadrilla: lo decide el supervisor (§4.1).",
  },
  {
    action: "order.reopen",
    label: "Reabrir orden cerrada",
    status: "pendiente",
    cells: { supervisor: "propuesto" },
    scope: { supervisor: "Solo propias" },
    note: "Reabrir exige motivo, una nueva validación de cierre y genera una nueva versión del reporte.",
  },
  {
    action: "order.archive",
    label: "Archivar orden",
    status: "propuesto",
    scope: { administracion: "Su unidad", supervisor: "Solo propias" },
    note: "Cierra el ciclo postventa de una orden con reporte enviado.",
  },
  { action: "crew.assign", label: "Asignar cuadrilla", status: "confirmado", scope: { direccion: "Consulta", administracion: "Consulta", supervisor: "Solo propias" } },
  {
    action: "field.capture",
    label: "Capturar GPS, fotos e incidencias",
    status: "confirmado",
    scope: { direccion: "Consulta en la orden", administracion: "Consulta en la orden", supervisor: "Solo propias" },
  },
  {
    action: "closure.authorize",
    label: "Autorizar cierre",
    status: "confirmado",
    scope: { direccion: "Consulta", administracion: "Consulta", supervisor: "Solo propias" },
  },
  {
    action: "report.share",
    label: "Generar y compartir reporte al cliente",
    status: "confirmado",
    scope: { supervisor: "Solo propias" },
    note: "Dirección y Administración descargan el PDF desde el detalle de la orden.",
  },
  {
    action: "postventa.manage",
    label: "Gestionar quejas y encuestas",
    status: "propuesto",
    scope: { direccion: "Consulta", administracion: "Su unidad", supervisor: "Solo propias" },
  },
  {
    action: "export.pdf",
    label: "Exportar PDF de la orden",
    status: "confirmado",
    scope: { administracion: "Su unidad", supervisor: "Solo propias" },
  },
  { action: "export.excel", label: "Exportar Excel", status: "confirmado", scope: { administracion: "Su unidad" } },
  {
    action: "view.kpis",
    label: "Consultar indicadores",
    status: "confirmado",
    scope: { administracion: "Su unidad" },
    note: "El supervisor ve sus propias cifras en Hoy.",
  },
  { action: "export.kpis", label: "Exportar indicadores", status: "confirmado", scope: { administracion: "Su unidad" } },
  {
    action: "export.backup",
    label: "Exportar respaldo de datos",
    status: "propuesto",
    scope: { direccion: "Unidad seleccionada", administracion: "Su unidad" },
  },
  {
    action: "users.admin",
    label: "Administrar usuarios y permisos",
    status: "pendiente",
    note: "Pendiente de decisión (§2): en el prototipo solo Dirección da de alta, edita y desactiva usuarios. Cada quien edita su propio teléfono.",
  },
  {
    action: "catalogs.admin",
    label: "Administrar catálogos",
    status: "pendiente",
    scope: { administracion: "Su unidad" },
    note: "Pendiente de decisión (§2): clientes, sitios y personal por unidad; tipos de servicio y materiales son de toda la empresa.",
  },
  {
    action: "view.allUnits",
    label: "Ver todas las unidades",
    status: "pendiente",
    scope: { administracion: "Su unidad", supervisor: "Sus asignaciones" },
    note: "§2 no define aún quién ve información de otras unidades; el prototipo asume que solo Dirección.",
  },
];

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action]?.[role] ?? false;
}

/** Doc status of one cell of the matrix (per-cell override, else the row's). */
export function cellStatus(row: PermissionRow, role: Role): DocStatus {
  return row.cells?.[role] ?? row.status;
}

/* ───────────── data scope (doc §2) — shared by the UI, the store guards and a future backend ───────────── */

/** Data scoping (doc §2): supervisor → own assignments; administración → own unit; dirección → all / selected unit. */
export function canSeeOrder(user: User, order: Order, unitFilter: string | "all"): boolean {
  if (user.role === "supervisor") return order.supervisorId === user.id;
  if (user.role === "administracion") return order.unitId === user.unitId;
  return unitFilter === "all" || order.unitId === unitFilter;
}

/** Units in scope: null = every unit (Dirección with "Todas las unidades"). */
export function scopedUnitIds(user: Pick<User, "role" | "unitId">, unitFilter: string | "all"): Set<string> | null {
  if (user.role === "direccion") return unitFilter === "all" ? null : new Set([unitFilter]);
  return new Set([user.unitId]);
}

export function canSeeUnit(user: Pick<User, "role" | "unitId">, unitId: string, unitFilter: string | "all"): boolean {
  const units = scopedUnitIds(user, unitFilter);
  return !units || units.has(unitId);
}

/**
 * Clients: supervisor → only clients of their own (visible) orders; administración → own unit; dirección → selected unit(s).
 * `visibleOrders` are the orders the user may see (useScopedData().orders).
 */
export function canSeeClient(user: User, client: Client, unitFilter: string | "all", visibleOrders: Pick<Order, "clientId">[]): boolean {
  if (user.role === "supervisor") return visibleOrders.some((o) => o.clientId === client.id);
  return canSeeUnit(user, client.unitId, unitFilter);
}

/** Workers: the crews of the units in scope (supervisors plan with their unit's pool). */
export function canSeeWorker(user: User, worker: Worker, unitFilter: string | "all"): boolean {
  return canSeeUnit(user, worker.unitId, unitFilter);
}

/**
 * Audit entries (Bitácora): entries of visible orders; entries without an order follow the unit of the touched record
 * (`entityUnit`: a catalog / user record) and only fall back to the actor's unit when the record's unit is unknown
 * (company-wide catalogs). A Dirección actor belongs to one unit, so deciding by the actor first would leak or hide
 * other units' catalog and user edits. Supervisors only see their own actions.
 */
export function canSeeAuditEntry(
  user: User,
  entry: AuditEntry,
  ctx: { unitFilter: string | "all"; orderIds: Set<string>; users: Map<string, User>; entityUnit?: (entry: AuditEntry) => string | undefined },
): boolean {
  if (entry.orderId) return ctx.orderIds.has(entry.orderId);
  if (user.role === "supervisor") return entry.by === user.id;
  const units = scopedUnitIds(user, ctx.unitFilter);
  if (!units) return true;
  const recordUnit = ctx.entityUnit?.(entry);
  if (recordUnit) return units.has(recordUnit);
  const actorUnit = ctx.users.get(entry.by)?.unitId;
  return !!actorUnit && units.has(actorUnit);
}
