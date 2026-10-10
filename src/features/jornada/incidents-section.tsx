"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CircleCheck, Lock, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups } from "@/lib/hooks";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import type { Incident, Photo } from "@/lib/types";
import { INCIDENT_ICONS } from "@/components/pk/incident-sheet";
import { PhotoImage } from "@/components/pk/scene-photo";
import { SoftBadge, ToneText } from "@/components/pk/status";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldSectionTitle, Gate } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/** Incidents of this jornada (doc §4.2) with inline resolution. */
export function IncidentsSection({ f, onNew }: { f: FieldReady; onNew: () => void }) {
  const readOnly = !f.permissions.capture;
  const list = f.jIncidents;
  const photosById = new Map(f.photos.map((p) => [p.id, p] as const));

  return (
    <section id="incidencias" className="scroll-mt-24">
      <FieldSectionTitle
        title="Incidencias"
        addon={
          f.openIncidents.length > 0 ? (
            <SoftBadge tone="red">
              {f.openIncidents.length} {f.openIncidents.length === 1 ? "abierta" : "abiertas"}
            </SoftBadge>
          ) : list.length > 0 ? (
            <SoftBadge tone="teal">Sin pendientes</SoftBadge>
          ) : undefined
        }
        subtitle="Daños, faltantes de material o personal, trabajos adicionales, retrasos y quejas en sitio."
        action={
          !readOnly && (
            <Gate reason={f.recordBlock}>
              <Button variant="outline" onClick={onNew} disabled={!!f.recordBlock} className="h-10 rounded-[12px] border-line px-3.5 font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
                <Plus /> <span className="hidden min-[400px]:inline">Registrar</span>
                <span className="min-[400px]:hidden">Nueva</span>
              </Button>
            </Gate>
          )
        }
      />

      {list.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-line-strong px-5 py-5">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-teal-soft text-teal-fg">
            <CircleCheck className="size-5" />
          </span>
          <p className="text-[14px] text-subtle">
            <b className="font-semibold text-ink">Sin incidencias en esta jornada.</b> Si algo pasa en sitio, regístralo con fotos para que quede en el reporte.
          </p>
        </div>
      ) : (
        <motion.ul variants={staggerContainer(0.05, 0.05)} initial="hidden" animate="show" className="divide-y divide-hairline rounded-[22px] border border-hairline bg-surface shadow-soft">
          {list.map((inc) => (
            <IncidentRow key={inc.id} f={f} inc={inc} photos={inc.photoIds.map((id) => photosById.get(id)).filter((p): p is Photo => !!p)} />
          ))}
        </motion.ul>
      )}
    </section>
  );
}

function IncidentRow({ f, inc, photos }: { f: FieldReady; inc: Incident; photos: Photo[] }) {
  const resolveIncident = useAppStore((s) => s.resolveIncident);
  const { users } = useLookups();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const meta = INCIDENT_TYPE[inc.type];
  const Icon = INCIDENT_ICONS[inc.type];
  const isOpen = inc.status === "abierta";
  const canResolve = f.permissions.capture && !f.locked;

  const resolve = () => {
    if (text.trim().length < 6) {
      toast.error("Describe cómo se resolvió (mínimo 6 caracteres)");
      return;
    }
    resolveIncident(inc.id, text.trim());
    toast.success(`Incidencia ${inc.folio} resuelta`, { description: inc.blocksClosure ? "Ya no impide el cierre de la orden." : undefined });
    setOpen(false);
  };

  return (
    <motion.li variants={rowVariants} layout className="p-4 sm:p-5">
      <div className="flex gap-3.5">
        <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] [&_svg]:size-5", toneSoftBg[meta.tone], toneText[meta.tone])}>
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-[15px] font-semibold text-ink">{meta.label}</p>
            <SoftBadge tone={SEVERITY[inc.severity].tone}>{SEVERITY[inc.severity].label}</SoftBadge>
            {isOpen && inc.blocksClosure && (
              <SoftBadge tone="red">
                <ShieldAlert className="size-3.5" /> Impide cierre
              </SoftBadge>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-subtle tabular">
            {inc.folio} · {fmtTime(inc.createdAt)} · {users.get(inc.createdBy)?.name ?? "—"}
            {f.pendingIds.has(inc.id) && <span className="ml-1.5 font-semibold text-amber-fg">· pendiente de sincronizar</span>}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink">{inc.description}</p>

          {photos.length > 0 && (
            <div className="mt-3 flex gap-2">
              {photos.slice(0, 4).map((p) => (
                <span key={p.id} className="relative block size-14 overflow-hidden rounded-[10px] ring-1 ring-edge">
                  <PhotoImage photo={p} />
                </span>
              ))}
            </div>
          )}

          {!isOpen && inc.resolution && (
            <p className="mt-3 rounded-[14px] bg-teal-wash px-3.5 py-2.5 text-[13.5px] text-ink">
              <span className="font-semibold text-teal-fg">Resuelta</span>
              {inc.resolvedAt && <span className="text-subtle"> · {fmtDateTime(inc.resolvedAt)}</span>} — {inc.resolution}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ToneText tone={isOpen ? "red" : "teal"} className="mr-auto text-[13.5px] font-medium">
              {isOpen ? "Abierta" : "Resuelta"}
            </ToneText>
            <Button asChild variant="ghost" className="h-10 rounded-[12px] px-3 text-subtle">
              <Link href={`/incidencias?i=${inc.id}`}>
                Ver <ArrowUpRight />
              </Link>
            </Button>
            {isOpen && f.permissions.capture && (
              <Gate reason={canResolve ? null : f.locked}>
                <Button
                  variant={open ? "ghost" : "default"}
                  disabled={!canResolve}
                  onClick={() => setOpen((v) => !v)}
                  className="h-10 rounded-[12px] px-4 font-semibold"
                >
                  {open ? "Cancelar" : "Resolver"}
                </Button>
              </Gate>
            )}
            {isOpen && !f.permissions.capture && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-subtle">
                <Lock className="size-3.5" /> La resuelve el supervisor
              </span>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2.5 rounded-[16px] bg-soft p-3.5">
                  <label htmlFor={`res-${inc.id}`} className="block text-[13px] font-semibold text-ink">
                    ¿Cómo se resolvió?
                  </label>
                  <Textarea
                    id={`res-${inc.id}`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ej. Se repuso material con entrega urgente y se informó al contacto."
                    className="min-h-[76px] rounded-[14px] bg-surface text-[16px] sm:text-[15px]"
                  />
                  <div className="flex justify-end">
                    <Button onClick={resolve} disabled={text.trim().length < 6} className="h-10 rounded-[12px] px-4 font-semibold">
                      <CircleCheck /> Marcar resuelta
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
}
