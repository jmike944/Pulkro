"use client";

import { create } from "zustand";

/**
 * What the pull engine is doing right now (sync indicator, Configuración › Sincronización). Not persisted: the last
 * successful pull time lives with the account session (`session.pull.lastPullAt`) and survives reloads.
 */
export type PullStatus = {
  /** A pull is running. */
  running: boolean;
  /** The running pull is the first load of this account (or a full re-sync), or orders are still being completed. */
  initial: boolean;
  /** Why the last pull failed (user-facing Spanish), cleared by the next successful one. */
  error?: string;
  errorAt?: string;
  /** Consecutive failures and the earliest automatic retry (manual and reconnect triggers ignore it). */
  failures: number;
  retryAt: number;
};

export const usePullStatus = create<PullStatus>(() => ({ running: false, initial: false, failures: 0, retryAt: 0 }));
