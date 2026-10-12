/**
 * Folios of records created on the device in an account session. The server assigns the real folio (`OS-00042`,
 * `INC-0007`, `PV-0003`) when the RPC runs; until then the record shows a provisional one, `OS-PEND-1A2B3C`, built from the
 * first characters of its id: unmistakable as "not on the server yet", never equal to a real folio, and resolvable to the
 * record without any extra state. Routes take a folio, an id or a provisional folio (findByRef) and the views move the address
 * to the record's current folio, so a page opened before the push keeps working after the folio changes.
 */

const PENDING = /^(OS|INC|PV)-PEND-([0-9A-F]{6})$/i;

/** "OS-PEND-1A2B3C" for the record `id` (a UUID). */
export const provisionalFolio = (prefix: "OS" | "INC" | "PV", id: string) => `${prefix}-PEND-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** A folio the device made up while the record waits for the server. */
export const isProvisionalFolio = (folio: string) => PENDING.test(folio);

/**
 * The record a route segment names: its folio, its id, or the provisional folio it had before the server assigned the real
 * one (a page opened, bookmarked or left in the history before the push).
 */
export function findByRef<T extends { id: string; folio: string }>(items: readonly T[], ref: string): T | undefined {
  const direct = items.find((x) => x.folio === ref || x.id === ref);
  if (direct) return direct;
  const m = PENDING.exec(ref);
  if (!m) return undefined;
  const head = m[2].toLowerCase();
  const prefix = m[1].toUpperCase();
  const hits = items.filter((x) => x.folio.toUpperCase().startsWith(`${prefix}-`) && x.id.replace(/-/g, "").slice(0, 6).toLowerCase() === head);
  // Two records sharing the first 24 bits of their id: ambiguous, name neither.
  return hits.length === 1 ? hits[0] : undefined;
}
