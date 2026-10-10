"use client";

import { useMemo, useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { useCan, useLookups } from "@/lib/hooks";
import { ORDER_STATUS } from "@/lib/status";
import type { Order, OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ClientMark } from "@/components/pk/client-mark";
import { IncidentSheet } from "@/components/pk/incident-sheet";
import { FlowHeading, FlowScreen, MobileRow, SandInput } from "@/components/pk/mobile";
import { Guarded } from "@/features/evidencias/guarded";

/** Orders where something can still happen in the field, most relevant first. */
const RANK: Partial<Record<OrderStatus, number>> = {
  en_ejecucion: 0,
  con_incidencia: 1,
  pendiente_validacion: 2,
  jornada_cerrada: 3,
  reabierta: 4,
  programada: 5,
  reprogramada: 6,
};

export const REGISTER_REASON = "Solo el supervisor asignado registra incidencias. Dirección y Administración tienen acceso de consulta.";

/**
 * "Registrar incidencia": pick an active order (full-screen flow on phones, centered dialog on desktop),
 * then the shared IncidentSheet captures type, severity, description, photos and "Impide el cierre".
 */
export function RegisterIncident({ orders, now, onCreated }: { orders: Order[]; now: Date; onCreated: (incidentId: string) => void }) {
  const canCapture = useCan("field.capture");
  const lk = useLookups();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const eligible = useMemo(() => {
    const t = now.getTime();
    return orders
      .filter((o) => RANK[o.status] !== undefined)
      .sort(
        (a, b) =>
          RANK[a.status]! - RANK[b.status]! ||
          Math.abs(new Date(a.scheduledStart).getTime() - t) - Math.abs(new Date(b.scheduledStart).getTime() - t),
      );
  }, [orders, now]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return eligible.slice(0, 40);
    return eligible
      .filter((o) => {
        const c = lk.clients.get(o.clientId);
        const s = lk.sites.get(o.siteId);
        return [o.folio, o.title, c?.name, c?.shortName, s?.name].some((x) => x?.toLowerCase().includes(needle));
      })
      .slice(0, 40);
  }, [eligible, q, lk.clients, lk.sites]);

  const pick = (id: string) => {
    setOrderId(id);
    setPickerOpen(false);
    // let the picker animate out before the capture sheet slides in
    setTimeout(() => setSheetOpen(true), 220);
  };

  return (
    <>
      <Guarded reason={canCapture ? null : REGISTER_REASON}>
        <Button
          disabled={!canCapture}
          onClick={() => {
            setQ("");
            setPickerOpen(true);
          }}
          className="h-11 rounded-[12px] px-4 text-[15px] font-semibold lg:h-10 lg:text-[14px]"
        >
          <Plus /> Registrar incidencia
        </Button>
      </Guarded>

      <FlowScreen open={pickerOpen} onOpenChange={setPickerOpen} title="Registrar incidencia" description="Elegir la orden de la incidencia">
        <FlowHeading title="¿En qué orden ocurrió?">Elige una orden activa; después indicas tipo, severidad, fotos y si impide el cierre.</FlowHeading>
        <SandInput icon={<Search />} placeholder="Buscar folio, cliente o sitio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar orden" />
        <div className="mt-3">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-[14px] text-subtle">
              <SearchX className="size-6" />
              {eligible.length ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes activas en tu alcance."}
            </div>
          ) : (
            list.map((o) => {
              const c = lk.clients.get(o.clientId);
              const st = ORDER_STATUS[o.status];
              return (
                <MobileRow
                  key={o.id}
                  onClick={() => pick(o.id)}
                  leading={c ? <ClientMark name={c.name} hue={c.hue} size={44} /> : undefined}
                  title={o.title}
                  meta={
                    <span className="truncate tabular">
                      {o.folio} · {c?.shortName}
                    </span>
                  }
                  status={{ tone: st.tone, label: st.label, live: st.live }}
                />
              );
            })
          )}
        </div>
      </FlowScreen>

      <IncidentSheet
        orderId={orderId ?? ""}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={(id) => onCreated(id)}
      />
    </>
  );
}
