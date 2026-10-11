"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CircleCheck, Lock, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { fmtDateTime, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import type { Incident } from "@/lib/types";
import { INCIDENT_ICONS } from "@/components/pk/incident-sheet";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { compact } from "./orden-format";
import { useOrder } from "./order-context";
import { Gated } from "./ui";

/** Incidencias of this order: type, severity, photos, who/when, and inline resolution (doc §4.2). */
export function IncidentsTab() {
  const { d, ui } = useOrder();
  const { incidents, openIncidents } = d;
  const blocking = openIncidents.filter((i) => i.blocksClosure).length;
  const sorted = [...incidents].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "abierta" ? -1 : 1));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Incidencias · {incidents.length}</h2>
          <p className="mt-1 text-[13.5px] text-subtle">
            {plural(openIncidents.length, "abierta", "abiertas")}
            {blocking > 0 && (
              <>
                {" "}
                · <b className="font-semibold text-red-fg">{plural(blocking, "impide", "impiden")} el cierre</b>
              </>
            )}
          </p>
        </div>
        <Gated gate={d.gates.capture}>
          <Button disabled={!d.gates.capture.ok} onClick={() => ui.openIncident()} className="h-10 rounded-[12px] px-4 font-semibold">
            <Plus /> Registrar incidencia
          </Button>
        </Gated>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Sin incidencias">
          Nada que reportar en esta orden. Daños, faltantes, retrasos o trabajos adicionales se registran aquí con fotos.
        </EmptyState>
      ) : (
        <motion.ul variants={staggerContainer(0.06, 0.05)} initial="hidden" animate="show" className="space-y-4">
          {sorted.map((inc) => (
            <IncidentCard key={inc.id} inc={inc} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function IncidentCard({ inc }: { inc: Incident }) {
  const { d, ui } = useOrder();
  const { lk, photos, jornadas } = d;
  const resolveIncident = useAppStore((s) => s.resolveIncident);
  const canSee = useCanSeeRoute();
  const [resolving, setResolving] = useState(false);
  const [text, setText] = useState("");
  const meta = INCIDENT_TYPE[inc.type];
  const Icon = INCIDENT_ICONS[inc.type];
  const sev = SEVERITY[inc.severity];
  const open = inc.status === "abierta";
  const j = jornadas.find((x) => x.id === inc.jornadaId);
  const incPhotos = compact(inc.photoIds.map((id) => photos.find((p) => p.id === id)));
  const by = lk.users.get(inc.createdBy);
  const resolvedBy = inc.resolvedBy ? lk.users.get(inc.resolvedBy) : undefined;

  const save = () => {
    const value = text.trim();
    if (value.length < 6) {
      toast.error("Describa la resolución (mínimo 6 caracteres)");
      return;
    }
    resolveIncident(inc.id, value);
    setResolving(false);
    toast.success(`Incidencia ${inc.folio} resuelta`, { description: inc.blocksClosure ? "Ya no impide el cierre de la orden." : undefined });
  };

  return (
    <motion.li
      layout
      variants={rowVariants}
      className={cn("rounded-[22px] border bg-surface p-4 shadow-soft sm:p-6", open && inc.blocksClosure ? "border-red-line" : "border-hairline")}
    >
      <div className="flex gap-3 sm:gap-4">
        <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-[14px]", toneSoftBg[meta.tone], toneText[meta.tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h3 className="text-[16px] font-semibold text-ink">{meta.label}</h3>
            <span className="text-[13px] text-subtle tabular">{inc.folio}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TonePill tone={open ? "red" : "teal"} live={open}>
              {open ? "Abierta" : "Resuelta"}
            </TonePill>
            <SoftBadge tone={sev.tone}>Severidad {sev.label.toLowerCase()}</SoftBadge>
            {inc.blocksClosure && (
              <SoftBadge tone={open ? "red" : "slate"}>
                <Lock className="size-3" /> {open ? "Impide el cierre" : "Impedía el cierre"}
              </SoftBadge>
            )}
          </div>
        </div>
        {/* /incidencias is the supervisor's screen: Dirección and Administración read the incident here, so no link */}
        {canSee("/incidencias") && (
          <Link
            href={`/incidencias?i=${inc.id}`}
            aria-label={`Ver ${inc.folio} en incidencias`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-tile text-ink transition hover:bg-brand-deep hover:text-white"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>

      <p className="mt-4 text-[14.5px] leading-relaxed text-ink">{inc.description}</p>

      {incPhotos.length > 0 && (
        <div className="mt-4 grid max-w-[420px] grid-cols-3 gap-2">
          {incPhotos.map((p) => (
            <PhotoThumb key={p.id} photo={p} meta={false} pending={d.pendingIds.has(p.id)} onClick={() => ui.openPhoto(p.id)} className="rounded-[12px]" />
          ))}
        </div>
      )}

      <p className="mt-4 text-[13px] text-subtle">
        Registró <span className="font-medium text-ink">{by?.name ?? "Usuario"}</span> · {fmtDateTime(inc.createdAt)}
        {j ? ` · Jornada ${j.dayIndex}` : ""}
      </p>

      {!open && inc.resolution && (
        <div className="mt-4 flex gap-3 rounded-[16px] bg-teal-soft p-4 text-[14px]">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-teal-fg" />
          <div>
            <p className="text-ink">{inc.resolution}</p>
            <p className="mt-1 text-[12.5px] text-subtle">
              {resolvedBy?.name ?? "Usuario"}
              {inc.resolvedAt ? ` · ${fmtDateTime(inc.resolvedAt)}` : ""}
            </p>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4">
          <AnimatePresence initial={false} mode="popLayout">
            {resolving ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                <label htmlFor={`res-${inc.id}`} className="mb-2 block text-[13px] font-medium text-ink">
                  ¿Cómo se resolvió?
                </label>
                <textarea
                  id={`res-${inc.id}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ej. Se repuso el material con entrega urgente y se informó al contacto."
                  className="w-full resize-none rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => setResolving(false)} className="h-10 rounded-[12px] px-4">
                    Cancelar
                  </Button>
                  <Button onClick={save} disabled={text.trim().length < 6} className="h-10 rounded-[12px] px-4 font-semibold">
                    Guardar resolución
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex">
                <Gated gate={d.gates.resolve}>
                  <Button
                    variant="outline"
                    disabled={!d.gates.resolve.ok}
                    onClick={() => setResolving(true)}
                    className="h-10 rounded-[12px] border-line px-4 font-semibold"
                  >
                    <CircleCheck className="size-4" /> Resolver
                  </Button>
                </Gated>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}
