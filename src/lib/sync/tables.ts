import type { Database } from "@/lib/supabase/database.types";

/**
 * The tables the device pulls (architecture §3, §8), in the order a pull applies them: a parent always before the rows that
 * hang from it (orders → jornadas → checks…, incidents and cases → photos, reports → shares, surveys → tokens).
 */
export const SYNC_TABLES = [
  "units",
  "profiles",
  "workers",
  "clients",
  "sites",
  "service_types",
  "materials",
  "orders",
  "jornadas",
  "crew_changes",
  "jornada_checks",
  "jornada_notes",
  "incidents",
  "post_sale_cases",
  "case_events",
  "photos",
  "order_closures",
  "reports",
  "report_shares",
  "surveys",
  "survey_tokens",
  "audit_log",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** Catalog tables: small, read whole on the first load, then by cursor. */
export const CATALOG_TABLES = ["units", "profiles", "workers", "clients", "sites", "service_types", "materials"] as const satisfies readonly SyncTable[];

/** Tables whose rows carry `order_id` and are read by order on the first load and for scope gain (the order's subtree). */
export const ORDER_TABLES = [
  "jornadas",
  "crew_changes",
  "jornada_checks",
  "jornada_notes",
  "incidents",
  "post_sale_cases",
  "case_events",
  "photos",
  "order_closures",
  "reports",
  "report_shares",
  "surveys",
  "survey_tokens",
  "audit_log",
] as const satisfies readonly SyncTable[];

export type OrderTable = (typeof ORDER_TABLES)[number];

/** Tables whose lost rows are found with `sync_reconcile` (children of an order go with it; the audit is not reconciled). */
export const RECONCILED_TABLES = ["orders", "units", "profiles", "workers", "clients", "sites"] as const satisfies readonly SyncTable[];

/** Primary key column (keyset pagination and sync_reconcile). */
export const pkOf = (table: SyncTable): string => (table === "survey_tokens" ? "survey_id" : "id");

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];

/** A report row without its server-built `snapshot` (large, never needed on the device: the app rebuilds the PDF from its data). */
export type ReportRow = Omit<Row<"reports">, "snapshot">;

/** What the device reads of each table. */
export type RowOf<T extends SyncTable> = T extends "reports" ? ReportRow : Row<T>;

/** Select list per table: every column, except the report snapshot. */
export const COLUMNS: Record<SyncTable, string> = Object.fromEntries(
  SYNC_TABLES.map((t) => [
    t,
    t === "reports" ? "id, order_id, closure_id, version, summary, photo_ids, generated_by, generated_at, device_at, created_at, updated_at" : "*",
  ]),
) as Record<SyncTable, string>;

/** Rows of several tables, as one pull step brings them. */
export type RowsByTable = { [T in SyncTable]?: RowOf<T>[] };

/** The 8-4-4-4-12 shape of a database id. Ids made on this device before the push exists (`ord_…`) never go to the server. */
export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
