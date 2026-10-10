"use client";

import { useCallback, useState } from "react";
import { ClientMark } from "@/components/pk/client-mark";
import type { FieldReady } from "./use-field-state";

/**
 * Open/close state for a FlowScreen whose content must start fresh every time it opens.
 * Render `{flow.session > 0 && <XFlow key={flow.session} open={flow.open} onOpenChange={flow.setOpen} />}`:
 * a new session remounts the flow (clean state) while closing keeps it mounted for the exit animation.
 */
export function useFlowState<T = undefined>() {
  const [s, setS] = useState<{ open: boolean; session: number; data?: T }>({ open: false, session: 0 });
  const show = useCallback((data?: T) => setS((x) => ({ open: true, session: x.session + 1, data })), []);
  const setOpen = useCallback((v: boolean) => setS((x) => ({ ...x, open: v })), []);
  return { open: s.open, session: s.session, data: s.data, show, setOpen };
}

/** FlowHeading eyebrow: client mark + "OS-24817 · Jornada 2 de 3". */
export function FlowEyebrow({ f }: { f: FieldReady }) {
  return (
    <>
      <ClientMark name={f.client.name} hue={f.client.hue} size={22} className="rounded-[6px]" />
      <span className="truncate">
        {f.order.folio} · Jornada {f.index} de {f.total}
      </span>
    </>
  );
}
