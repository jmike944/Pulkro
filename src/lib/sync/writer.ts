/**
 * Whether this tab may still send and read for the device. One tab per device holds the data (lib/device-storage: the
 * writer); a tab that hands the device over, or finds it was taken over while it was frozen in the background, stops here:
 *  - `haltSync`: no new push burst, RPC or pull cycle starts in this tab (a handover in progress, or the device given up);
 *  - `stillWriter`: checked before every RPC and every pull cycle — the device's writer epoch is still this tab's. A tab that
 *    lost it (another tab took over while it was frozen) never sends what it still holds in memory: an item the new writer
 *    discarded meanwhile would reach the server otherwise.
 * Pure state, no import: the push and pull engines read it, device-storage registers the check.
 */

let halted = false;
let check: () => Promise<boolean> = async () => true;

/** No push or pull starts in this tab while `on` (a handover in progress, or the device given up). */
export function haltSync(on: boolean) {
  halted = on;
}

export const syncHalted = () => halted;

/** device-storage's check of the writer epoch (the default allows: no device storage, as in the demo's tests). */
export function setWriterCheck(fn: () => Promise<boolean>) {
  check = fn;
}

/** This tab is still the device's writer and may send / read now. Never throws. */
export async function stillWriter(): Promise<boolean> {
  if (halted) return false;
  try {
    return await check();
  } catch {
    return true; // the write's own check (same transaction as the write) still holds
  }
}
