"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardList, Plus, Search, SearchX } from "lucide-react";
import { useCan, useLookups } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import type { Order, OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ClientMark } from "@/components/pk/client-mark";
import { IncidentSheet } from "@/components/pk/incident-sheet";
import { MobileRow, SandInput } from "@/components/pk/mobile";
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

const LIMIT = 40;

export const REGISTER_REASON = "Solo el supervisor asignado registra incidencias. Dirección y Administración tienen acceso de consulta.";

/**
 * "Registrar incidencia" from the incidents page: the shared IncidentSheet opens on an order step (active orders in
 * scope, searchable), then continues in the same flow with type, severity, description, photos and "Impide el cierre".
 * Phones: one full-screen flow ending in a success screen ("Ver incidencia" opens the new incident). Desktop: one right sheet.
 */
export function RegisterIncident({ orders, now, onCreated }: { orders: Order[]; now: Date; onCreated: (incidentId: string) => void }) {
  const canCapture = useCan("field.capture");
  const lk = useLookups();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

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

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return eligible;
    return eligible.filter((o) => {
      const c = lk.clients.get(o.clientId);
      const s = lk.sites.get(o.siteId);
      return [o.folio, o.title, c?.name, c?.shortName, s?.name].some((x) => x?.toLowerCase().includes(needle));
    });
  }, [eligible, q, lk.clients, lk.sites]);

  return (
    <>
      <Guarded reason={canCapture ? null : REGISTER_REASON}>
        <Button
          disabled={!canCapture}
          onClick={() => {
            setQ("");
            setOpen(true);
          }}
          className="h-11 rounded-[12px] px-4 text-[15px] font-semibold lg:h-10 lg:text-[14px]"
        >
          <Plus /> Registrar incidencia
        </Button>
      </Guarded>

      <IncidentSheet
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated}
        doneLabel="Ver incidencia"
        pickOrder={(pick, currentId) => (
          <OrderChoices query={q} onQuery={setQ} matches={matches} total={eligible.length} currentId={currentId} onPick={pick} />
        )}
      />
    </>
  );
}

/** Search + active orders; the order already chosen (when the user came back to change it) reads "Elegida". */
function OrderChoices({
  query,
  onQuery,
  matches,
  total,
  currentId,
  onPick,
}: {
  query: string;
  onQuery: (q: string) => void;
  matches: Order[];
  total: number;
  currentId: string | null;
  onPick: (orderId: string) => void;
}) {
  const lk = useLookups();
  const shown = matches.slice(0, LIMIT);

  if (total === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-[20px] bg-sand px-6 py-10 text-center">
        <ClipboardList className="size-6 text-subtle" aria-hidden />
        <p className="text-[15.5px] font-semibold text-ink">Sin órdenes activas en su alcance</p>
        <p className="max-w-[320px] text-[14px] leading-snug text-subtle">
          Las incidencias se registran en órdenes programadas, en ejecución o pendientes de cierre. Aparecerán aquí en cuanto haya una.
        </p>
      </div>
    );

  return (
    <div>
      <SandInput
        icon={<Search />}
        type="search"
        enterKeyHint="search"
        placeholder="Buscar folio, cliente o sitio"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label="Buscar orden"
      />
      <div className="mt-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <SearchX className="size-6 text-subtle" aria-hidden />
            <p className="text-[15.5px] font-semibold text-ink">Ninguna orden coincide con “{query.trim()}”</p>
            <p className="text-[14px] text-subtle">Busque por folio, cliente o sitio.</p>
            <Button type="button" variant="outline" onClick={() => onQuery("")} className="mt-2 h-11 rounded-[12px] border-line px-4 font-semibold">
              Borrar búsqueda
            </Button>
          </div>
        ) : (
          shown.map((o) => {
            const c = lk.clients.get(o.clientId);
            const st = ORDER_STATUS[o.status];
            const current = o.id === currentId;
            return (
              <MobileRow
                key={o.id}
                onClick={() => onPick(o.id)}
                leading={c ? <ClientMark name={c.name} hue={c.hue} size={44} /> : undefined}
                title={o.title}
                meta={
                  <span className="truncate tabular">
                    {o.folio} · {c?.shortName}
                  </span>
                }
                status={{ tone: st.tone, label: st.label, live: st.live }}
                trailing={
                  current ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-azure-fg">
                      <Check className="size-4" aria-hidden /> Elegida
                    </span>
                  ) : undefined
                }
              />
            );
          })
        )}
      </div>
      {matches.length > LIMIT && (
        <p className="mt-3 text-center text-[13px] text-subtle">
          Se muestran {LIMIT} de {plural(matches.length, "orden", "órdenes")}. Escriba el folio o el cliente para encontrar otra.
        </p>
      )}
    </div>
  );
}
