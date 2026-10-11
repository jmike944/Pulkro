/**
 * The phone's clock against the server's (architecture §8 "Device time"). The server refuses a device time more than
 * 5 minutes ahead of its clock (`device_time_future`, retried until the server's clock passes it) or older than 45 days
 * (`device_time_stale`). Device times are evidence and are never rewritten: the app only estimates how far the phone's
 * clock is from the server's, from server times it already receives, and the capture screens warn while they differ by
 * more than 5 minutes (ClockWarning).
 *
 *  - A server time stamped while a request was under way — `server_at` of check_in / check_out, `reopened_at` of
 *    reopen_order, the `iat` of an access token the Auth server just issued (sign-in, refresh: supabase/client.ts) — puts
 *    the offset within half the round trip: it replaces the estimate (the clock may have been corrected since).
 *  - The newest `updated_at` a pull reads (server clock, set by trigger) only says the server's clock is at least there:
 *    it raises an estimate that is lower (a clock set right after a sample), never lowers one.
 *  - The estimate was measured against the phone's clock as it was: once the person corrects the clock (as the warning
 *    asks), it is wrong. `checkClock` notices a clock set by hand and drops it, and re-measures while the warning shows.
 *
 * No React and no store import at run time: supabase/client.ts reports through `reportServerTime`, the store registers the
 * writer (`setClockSink`), the engines call `noteServerTime` with the store.
 */
import type { AppState } from "@/lib/store";

/** Server clock minus device clock (ms), and when the device measured it (device time). */
export type ClockOffset = { ms: number; at: string };

/** Beyond this the server refuses a time ahead of its clock; the capture screens warn either way. */
export const CLOCK_SKEW_MS = 5 * 60_000;

/** Below this a new estimate is noise (round trip, whole seconds): the stored one stays and nothing is written. */
const NOISE_MS = 1000;

export type ClockSample =
  /** `server` (ms) was stamped by the server between `sent` and `got` (device ms); `resolution`: the server value is floored (iat: 1000). */
  | { kind: "between"; server: number; sent: number; got: number; resolution?: number }
  /** The server's clock was at least `server` (ms) when the answer arrived at `got` (device ms). */
  | { kind: "floor"; server: number; got: number };

/** The estimate after `sample` (the same object when nothing changes). */
export function nextOffset(prev: ClockOffset | undefined, sample: ClockSample): ClockOffset | undefined {
  if (!Number.isFinite(sample.server) || !Number.isFinite(sample.got)) return prev;
  const at = new Date(sample.got).toISOString();
  if (sample.kind === "between") {
    if (!Number.isFinite(sample.sent) || sample.got < sample.sent) return prev;
    const ms = Math.round(sample.server + (sample.resolution ?? 0) / 2 - (sample.sent + sample.got) / 2);
    return prev && Math.abs(ms - prev.ms) < NOISE_MS ? prev : { ms, at };
  }
  const floor = Math.round(sample.server - sample.got);
  // No estimate yet: a floor only tells something when it shows the phone's clock behind.
  return floor - (prev?.ms ?? 0) >= NOISE_MS ? { ms: floor, at } : prev;
}

/** The offset when it is beyond what the server tolerates (± CLOCK_SKEW_MS), else undefined. */
export const clockSkewMs = (offset: ClockOffset | undefined): number | undefined =>
  offset && Math.abs(offset.ms) > CLOCK_SKEW_MS ? offset.ms : undefined;

/** `iat` (seconds) of a JWT, unverified: only a clock reading. */
export function jwtIssuedAt(token: unknown): number | undefined {
  if (typeof token !== "string") return undefined;
  try {
    const part = token.split(".")[1];
    if (!part) return undefined;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const iat = (JSON.parse(json) as { iat?: unknown }).iat;
    return typeof iat === "number" && Number.isFinite(iat) ? iat : undefined;
  } catch {
    return undefined;
  }
}

type ClockStore = { getState: () => AppState; setState: (fn: (st: AppState) => Partial<AppState>) => void };

/** Applies a sample to the store's estimate (persisted with the sync slice). Writes only when it changes. */
export function noteServerTime(store: ClockStore, sample: ClockSample) {
  const now = store.getState().sync.clock;
  if (nextOffset(now, sample) === now) return;
  store.setState((st) => {
    const clock = nextOffset(st.sync.clock, sample);
    return clock === st.sync.clock ? st : { sync: { ...st.sync, clock } };
  });
}

/* ───────────── a clock set by hand ───────────── */

/** The wall clock moved this much more than the time that passed: someone set it (or the device slept). */
const JUMP_MS = 5_000;
/** A fresh reading (a token refresh) at most this often. */
const REMEASURE_MS = 2 * 60_000;
/** The wall clock and the monotonic one at the last check (in memory: a reload starts over). */
let anchor: { wall: number; mono: number } | undefined;
let remeasuredAt = -Infinity;

/**
 * When the app comes back to the screen, and every minute while it shows (sync/use-pull-scheduler.ts):
 *  - a wall clock that moved by more than the time that passed (performance.now(), which no clock setting touches) was set
 *    by hand: the estimate measured against the old clock is dropped — no warning on a clock that may be right now; a
 *    floor alone never says the phone is ahead, so the next pull cannot bring a false one back;
 *  - while the warning shows, or after such a jump, a fresh reading is taken (`remeasure`: a token refresh, whose `iat` is
 *    a "between" sample that replaces the estimate), at most every 2 minutes and only `online`. After a reload there is no
 *    earlier reading of the two clocks to compare: the reading while the warning shows covers a clock fixed meanwhile.
 * Some devices pause performance.now() while asleep, so waking up can look like a jump: it only costs a re-measure.
 */
export function checkClock(store: ClockStore, remeasure: () => Promise<unknown>, online: boolean) {
  const wall = Date.now();
  const mono = typeof performance !== "undefined" ? performance.now() : NaN;
  const jumped = !!anchor && Number.isFinite(mono) && Math.abs(wall - anchor.wall - (mono - anchor.mono)) > JUMP_MS;
  anchor = { wall, mono };
  if (jumped && store.getState().sync.clock) store.setState((st) => ({ sync: { ...st.sync, clock: undefined } }));
  const showing = clockSkewMs(store.getState().sync.clock) !== undefined;
  const t = Number.isFinite(mono) ? mono : wall;
  if (!online || !(jumped || showing) || t - remeasuredAt < REMEASURE_MS) return;
  remeasuredAt = t;
  void remeasure().catch(() => undefined);
}

let sink: ((sample: ClockSample) => void) | undefined;

/** The store's writer for samples taken where the store is out of reach (the Auth client's fetch). */
export function setClockSink(fn: (sample: ClockSample) => void) {
  sink = fn;
}

/** A server time seen outside the sync engines. Never throws. */
export function reportServerTime(sample: ClockSample) {
  try {
    sink?.(sample);
  } catch {
    // a clock reading is never worth an error
  }
}
