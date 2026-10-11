/**
 * The write path's requests (architecture §5, §8): every store action of an account session becomes ONE call to
 * `public.<rpc>(p_op_id uuid, …)`, built here with the exact named parameters of the function. The argument object is typed
 * from the generated `Database["public"]["Functions"]`, so a wrong or missing parameter name fails the type check, and it is
 * frozen into plain JSON when the action runs: a retry sends the very same object (the server binds the op id to a digest of
 * the arguments and answers `op_id_reused` to anything else).
 *
 * Encodings (the migrations and scripts/build-demo-seed.mjs are the reference):
 *  - timestamptz → ISO instants (`toISOString()`); `date` columns (case due date, client since) → the local calendar day
 *    "yyyy-MM-dd" (the app stores them as local 18:00 / local midnight, map.ts reads them back the same way);
 *  - jsonb: days `[{ id, date, planned_start, planned_end }]`, materials `[{ material_id, qty }]`, breakdown
 *    `[{ activity, hours }]`, patches with the column names as keys (only the keys that change);
 *  - uuid[] / text[] → JSON arrays; enums → their text (identical to the TS unions).
 */
import { format } from "date-fns";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Order, SyncOp } from "@/lib/types";

type Fns = Database["public"]["Functions"];

/** RPCs that change data: the ones whose first parameter is the operation id. */
export type MutationRpc = { [K in keyof Fns]: "p_op_id" extends keyof Fns[K]["Args"] ? K : never }[keyof Fns];

/** The parameters of `public.<rpc>` other than the op id. */
export type RpcArgs<N extends MutationRpc> = Omit<Fns[N]["Args"], "p_op_id">;

/** Plain JSON, without `undefined` keys (an omitted optional parameter takes the function's default). */
function frozen(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** The request of one action: `public.<rpc>` with `p_op_id` first. */
export function rpcOp<N extends MutationRpc>(rpc: N, opId: string, args: RpcArgs<N>, extra: Pick<SyncOp, "creates" | "upload"> = {}): SyncOp {
  return { rpc, args: frozen({ p_op_id: opId, ...args }), ...extra };
}

/* ───────────── field encodings ───────────── */

/** An app instant → the local calendar day it falls on ("yyyy-MM-dd"), for `date` parameters. */
export const localDay = (iso: string): string => format(new Date(iso), "yyyy-MM-dd");

/** Jornadas as create_order / schedule_jornadas take them. */
export const daysArg = (days: { id: string; date: string; plannedStart: string; plannedEnd: string }[]): Json =>
  days.map((d) => ({ id: d.id, date: d.date, planned_start: d.plannedStart, planned_end: d.plannedEnd }));

export const materialsArg = (materials: Order["materials"]): Json => materials.map((m) => ({ material_id: m.materialId, qty: m.qty }));

export const breakdownArg = (breakdown: { activity: string; hours: number }[]): Json => breakdown.map((b) => ({ activity: b.activity, hours: b.hours }));

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * update_order's patch: only the columns whose value changes (field-level patches: Administración and the supervisor never
 * overwrite each other's fields with stale form values). Empty when nothing changes.
 */
export function orderPatch(current: Order, next: Partial<Order>): Record<string, Json> {
  const out: Record<string, Json> = {};
  const put = (column: string, before: unknown, after: unknown, value: Json) => {
    if (after !== undefined && !same(before, after)) out[column] = value;
  };
  put("title", current.title, next.title, next.title ?? null);
  put("priority", current.priority, next.priority, next.priority ?? null);
  put("commercial_ref", current.commercialRef, next.commercialRef, next.commercialRef ?? null);
  put("service_type_id", current.serviceTypeId, next.serviceTypeId, next.serviceTypeId ?? null);
  put("site_id", current.siteId, next.siteId, next.siteId ?? null);
  put("supervisor_id", current.supervisorId, next.supervisorId, next.supervisorId ?? null);
  put("special_instructions", current.specialInstructions, next.specialInstructions, next.specialInstructions ?? null);
  if (next.siteContact) {
    put("site_contact_name", current.siteContact.name, next.siteContact.name, next.siteContact.name);
    put("site_contact_phone", current.siteContact.phone, next.siteContact.phone, next.siteContact.phone);
  }
  put("activities", current.activities, next.activities, next.activities ?? []);
  if (next.materials) put("materials", current.materials, next.materials, materialsArg(next.materials));
  return out;
}

/** The keys of `next` (mapped to columns) whose value differs from `current`. */
export function diffPatch<T extends object>(current: T, next: Partial<T>, columns: Partial<Record<keyof T, string>>, encode: Partial<Record<keyof T, (v: unknown) => Json>> = {}): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, column] of Object.entries(columns) as [keyof T, string][]) {
    if (!(key in next)) continue;
    const after = next[key];
    if (same(current[key], after)) continue;
    out[column] = encode[key] ? encode[key]!(after) : ((after ?? null) as Json);
  }
  return out;
}
