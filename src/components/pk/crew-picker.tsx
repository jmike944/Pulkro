"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "./bits";

/**
 * Variable crew selection (doc §4.1: "cuadrillas variables por servicio").
 * Flags workers already booked on the same dates in another open jornada.
 */
export function CrewPicker({
  unitId,
  dates,
  value,
  onChange,
  excludeOrderId,
  className,
}: {
  unitId: string;
  /** yyyy-MM-dd dates the crew would work */
  dates: string[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeOrderId?: string;
  className?: string;
}) {
  const workers = useAppStore((s) => s.workers);
  const jornadas = useAppStore((s) => s.jornadas);
  const orders = useAppStore((s) => s.orders);
  const [q, setQ] = useState("");

  const busy = useMemo(() => {
    const dateSet = new Set(dates);
    const folios = new Map(orders.map((o) => [o.id, o.folio]));
    const m = new Map<string, string>();
    jornadas
      .filter((j) => j.orderId !== excludeOrderId && j.status !== "cerrada" && dateSet.has(j.date))
      .forEach((j) => j.workerIds.forEach((w) => m.set(w, `${folios.get(j.orderId)} · ${j.date.slice(8)}/${j.date.slice(5, 7)}`)));
    return m;
  }, [jornadas, orders, dates, excludeOrderId]);

  const list = useMemo(
    () =>
      workers
        .filter((w) => w.unitId === unitId && w.active)
        .filter((w) => !q || `${w.name} ${w.specialty}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)) || a.name.localeCompare(b.name)),
    [workers, unitId, q, busy],
  );

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o especialidad" className="h-10 rounded-[12px] pl-9" />
      </div>
      <p className="mb-2 text-[12.5px] text-subtle">
        <b className="font-semibold text-ink">{value.length}</b> seleccionados · {list.filter((w) => !busy.has(w.id)).length} disponibles
      </p>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {list.map((w) => {
          const on = value.includes(w.id);
          const conflict = busy.get(w.id);
          return (
            <li key={w.id}>
              <motion.button
                type="button"
                layout
                whileTap={{ scale: 0.985 }}
                onClick={() => toggle(w.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition",
                  on ? "bg-[#f2f8fe] ring-1 ring-[#bcd8fb]" : "hover:bg-muted",
                )}
              >
                <PersonAvatar initials={w.initials} hue={w.hue} size={34} name={w.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{w.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-subtle">
                    {w.specialty}
                    {conflict && (
                      <span className="inline-flex items-center gap-1 text-[#b86e00]">
                        <TriangleAlert className="size-3" /> {conflict}
                      </span>
                    )}
                  </span>
                </span>
                <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition", on ? "border-[#1667e0] bg-[#1667e0] text-white" : "border-[#d0d6de]")}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
