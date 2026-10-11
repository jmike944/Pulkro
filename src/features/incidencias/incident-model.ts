"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppStore, useCan, useLookups, useOrderBundle } from "@/lib/hooks";
import { closureBlockers } from "@/lib/domain";
import { plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { useUi } from "@/lib/ui-store";
import type { OrderStatus } from "@/lib/types";

export type ResolveOutcome = {
  before: OrderStatus;
  after: OrderStatus;
  /** the order left "Con incidencia" */
  freed: boolean;
  /** open incidents still blocking the same order */
  stillBlocking: number;
  /** the order can now be validated */
  ready: boolean;
  message: string;
};

/** Live incident + its order bundle, and the resolve action (doc §4.2 resolución · §8). */
export function useIncidentModel(incidentId: string) {
  const incident = useAppStore((s) => s.incidents.find((i) => i.id === incidentId));
  const bundle = useOrderBundle(incident?.orderId ?? "");
  const resolveIncident = useAppStore((s) => s.resolveIncident);
  const canCapture = useCan("field.capture");
  const canClose = useCan("closure.authorize");
  const lk = useLookups();
  const router = useRouter();

  const resolve = (text: string): ResolveOutcome | null => {
    const resolution = text.trim();
    if (!incident || !bundle || resolution.length < 6) {
      toast.error("Describa cómo se resolvió (mínimo 6 caracteres)");
      return null;
    }
    const { order } = bundle;
    const before = order.status;
    resolveIncident(incident.id, resolution);

    const st = useAppStore.getState();
    const updated = st.orders.find((o) => o.id === order.id) ?? order;
    const after = updated.status;
    const stillBlocking = st.incidents.filter((i) => i.orderId === order.id && i.status === "abierta" && i.blocksClosure).length;
    const blocks = closureBlockers(updated, st.jornadas, st.photos, st.incidents).filter((b) => b.severity === "block");
    const ready = !updated.closure && (after === "pendiente_validacion" || after === "reabierta") && blocks.length === 0;
    const freed = before === "con_incidencia" && after !== "con_incidencia";

    const message =
      before !== after
        ? `${order.folio} pasó de “${ORDER_STATUS[before].label}” a “${ORDER_STATUS[after].label}”.`
        : stillBlocking
          ? `${order.folio} sigue “Con incidencia”: ${plural(stillBlocking, "incidencia más impide", "incidencias más impiden")} el cierre.`
          : `${order.folio} sigue en “${ORDER_STATUS[after].label}”.`;

    if (freed) useUi.getState().fireCelebrate();
    toast.success(`Incidencia ${incident.folio} resuelta`, {
      description: message,
      action: ready && canClose ? { label: "Validar cierre", onClick: () => router.push(`/ordenes/${order.folio}?cerrar=1`) } : undefined,
    });
    return { before, after, freed, stillBlocking, ready, message };
  };

  const jornada = incident?.jornadaId ? bundle?.jornadas.find((j) => j.id === incident.jornadaId) : undefined;
  const photos = incident && bundle ? bundle.photos.filter((p) => p.incidentId === incident.id || incident.photoIds.includes(p.id)) : [];

  return {
    incident,
    bundle,
    jornada,
    photos,
    createdBy: incident ? lk.users.get(incident.createdBy) : undefined,
    resolvedBy: incident?.resolvedBy ? lk.users.get(incident.resolvedBy) : undefined,
    resolve,
    canCapture,
    canClose,
  };
}
