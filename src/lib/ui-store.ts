"use client";

import { create } from "zustand";

/** Transient UI state shared across the shell (not persisted). */
type UiState = {
  commandOpen: boolean;
  syncOpen: boolean;
  mobileNavOpen: boolean;
  celebrate: number;
  setCommandOpen: (v: boolean) => void;
  setSyncOpen: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
  /** Fire the global bubble/sparkle burst (order closed, report sent…). */
  fireCelebrate: () => void;
};

export const useUi = create<UiState>()((set) => ({
  commandOpen: false,
  syncOpen: false,
  mobileNavOpen: false,
  celebrate: 0,
  setCommandOpen: (v) => set({ commandOpen: v }),
  setSyncOpen: (v) => set({ syncOpen: v }),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  fireCelebrate: () => set((s) => ({ celebrate: s.celebrate + 1 })),
}));
