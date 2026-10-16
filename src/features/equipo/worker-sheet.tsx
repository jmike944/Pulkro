"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { MessageCircle, Pencil, Phone, Sprout, TriangleAlert } from "lucide-react";
import { addDays, format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useLookups, useNow } from "@/lib/hooks";
import { whatsappLink } from "@/lib/domain";
import { firstName, fmtDay, fmtHours, fmtTime } from "@/lib/format";
import type { Jornada } from "@/lib/types";
import { DateBadge, Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { SoftBadge, StatusDot, TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { ModalShell, useDiscardGuard, type ModalShellProps } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { Gate } from "@/features/agenda/gate";
import { dayKey, jornadaSpanMinutes, jornadaVisual, timeRange, weekStartOf } from "@/features/agenda/agenda-model";
import { REASON_CATALOG } from "./personal-tab";
import type { TeamData, WorkerStat } from "./use-team";
import { WORKER_NOTE, ScrollToTopOnMount, WorkerAvatarPreview, WorkerFields, useWorkerDraft } from "./worker-editor";

/** Max bar height (px) of the weekly assigned-hours chart; the rest of the plot is room for the value label. */
const WEEK_BAR_MAX = 90;

/**
 * Worker profile (?w=<workerId>): contact, upcoming assignments, history and preliminary productivity. Right sheet on desktop,
 * bottom sheet on phones. "Editar datos" swaps the content of this same sheet for the worker editor (no second modal stacked on
 * top); saving or "Cancelar" brings the profile back.
 */
export function WorkerSheet({
  workerId,
  open,
  data,
  canCatalog,
  onOpenChange,
}: {
  workerId: string | null;
  open: boolean;
  data: TeamData;
  canCatalog: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stat = workerId ? data.stats.find((s) => s.worker.id === workerId) : undefined;
  const draft = useWorkerDraft(workerId);
  const [editing, setEditing] = useState(false);
  // Every opening starts on the profile (reset on the way in, so the closing animation keeps showing what was on screen).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setEditing(false);
  }
  const editMode = editing && !!stat && canCatalog;
  const back = useDiscardGuard(editMode && draft.dirty, (o) => {
    if (!o) setEditing(false);
  });

  const startEdit = () => {
    draft.reset();
    setEditing(true);
  };
  const submit = () => {
    if (draft.save()) setEditing(false);
  };

  // One ModalShell for every state, so "Editar datos" swaps the content of the sheet that is already open.
  let shell: Omit<ModalShellProps, "open" | "onOpenChange" | "desktop">;
  if (editMode) {
    shell = {
      title: "Editar trabajador",
      description: WORKER_NOTE,
      icon: <WorkerAvatarPreview draft={draft} />,
      dirty: draft.dirty,
      onSubmit: submit,
      footerHint: draft.hint,
      footer: (
        <>
          <Button type="button" variant="outline" onClick={back.requestClose} className="h-11 rounded-[12px] border-line px-5 text-[14px] font-semibold">
            Cancelar
          </Button>
          <Button type="submit" disabled={!draft.valid} className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
            Guardar cambios
          </Button>
        </>
      ),
      children: (
        <ScrollToTopOnMount>
          <WorkerFields draft={draft} />
        </ScrollToTopOnMount>
      ),
    };
  } else if (!stat) {
    shell = {
      title: workerId ? "Perfil no disponible" : "Perfil",
      description: workerId ? "Esta persona no pertenece a las unidades de su alcance." : undefined,
      children: null,
    };
  } else {
    const { worker: w, unit, today } = stat;
    shell = {
      title: w.name,
      icon: (
        <motion.span className="inline-flex" initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 22 }}>
          <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={56} />
        </motion.span>
      ),
      description: (
        <>
          {w.specialty} · {unit?.name}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TonePill tone={today.tone} live={today.live}>
              {today.label}
            </TonePill>
            {!w.active && <SoftBadge tone="slate">Inactivo</SoftBadge>}
            {today.detail && <span className="text-[12.5px] text-subtle">{today.detail}</span>}
          </div>
        </>
      ),
      footerHint: canCatalog ? undefined : REASON_CATALOG,
      footer: (
        <Gate allowed={canCatalog} reason={REASON_CATALOG}>
          <Button type="button" variant="outline" disabled={!canCatalog} onClick={startEdit} className="h-11 rounded-[12px] border-line px-5 text-[14px] font-semibold">
            <Pencil className="size-4" /> Editar datos
          </Button>
        </Gate>
      ),
      children: <ProfileBody key={w.id} stat={stat} data={data} onClose={() => onOpenChange(false)} />,
    };
  }

  return (
    <>
      <ModalShell open={open} onOpenChange={onOpenChange} desktop="sheet" {...shell} />
      {back.prompt}
    </>
  );
}

function ProfileBody({ stat, data, onClose }: { stat: WorkerStat; data: TeamData; onClose: () => void }) {
  const workerId = stat.worker.id;
  const lk = useLookups();
  const now = useNow(60_000);
  const jornadas = data.byWorker.get(workerId);

  const view = useMemo(() => {
    const js = jornadas ?? [];
    const todayK = dayKey(now);
    const upcoming = js
      .filter((j) => j.status === "en_curso" || (j.status === "pendiente" && j.date >= todayK))
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
      .slice(0, 6);
    const history = js
      .filter((j) => j.status === "cerrada")
      .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart))
      .slice(0, 10);
    const from30 = dayKey(subDays(now, 30));
    const last30 = js.filter((j) => j.date >= from30 && j.date <= todayK && j.status !== "pendiente");
    const minutes30 = last30.reduce((s, j) => s + jornadaSpanMinutes(j, now), 0);
    const orders30 = new Set(last30.map((j) => j.orderId)).size;
    // last 8 weeks of assigned jornada hours
    const thisWeek = weekStartOf(now);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(thisWeek, -7 * (7 - i));
      const end = addDays(start, 7);
      const a = dayKey(start);
      const b = dayKey(end);
      const minutes = js.filter((j) => j.date >= a && j.date < b).reduce((s, j) => s + jornadaSpanMinutes(j, now), 0);
      const month = format(start, "MMM", { locale: es }).replace(".", "");
      return { key: a, label: format(start, "d MMM", { locale: es }).replace(".", ""), day: String(start.getDate()), month, minutes };
    });
    return { upcoming, history, last30: last30.length, minutes30, orders30, weeks };
  }, [jornadas, now]);

  const { worker: w, unit } = stat;
  const maxWeek = Math.max(1, ...view.weeks.map((x) => x.minutes));
  const tel = w.phone.replace(/\s/g, "");

  const orderLine = (j: Jornada) => {
    const o = data.orderById.get(j.orderId);
    const client = o ? lk.clients.get(o.clientId) : undefined;
    return { o, client };
  };

  return (
    <div className="space-y-7 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-11 rounded-[12px] font-semibold">
          <a href={`tel:${tel}`}>
            <Phone className="size-4" /> Llamar
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-[12px] font-semibold">
          <a href={whatsappLink(w.phone, `Hola ${firstName(w.name)}, le escribo de Pulkro sobre su próxima jornada.`)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        </Button>
      </div>
      <p className="-mt-4 text-[12px] text-subtle">El personal no usa la app: el supervisor captura por la cuadrilla y coordina por teléfono o WhatsApp.</p>

      <KeyValues
        title="Datos"
        rows={[
          { k: "Teléfono", v: <span className="tabular">{w.phone}</span> },
          { k: "Especialidad", v: w.specialty },
          { k: "Unidad", v: unit?.name ?? "—" },
          { k: "Estado", v: w.active ? "Activo" : "Inactivo" },
          { k: "Clave", v: <span className="font-mono text-[13px] text-subtle">{w.id}</span> },
        ]}
      />

      {/* upcoming */}
      <section>
        <Eyebrow className="mb-3">Próximas asignaciones · {view.upcoming.length}</Eyebrow>
        {view.upcoming.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-5 text-center text-[13.5px] text-subtle">Sin jornadas programadas.</p>
        ) : (
          <ul>
            {view.upcoming.map((j) => {
              const { o, client } = orderLine(j);
              if (!o) return null;
              const v = jornadaVisual(j, o, now);
              const sameDay = view.upcoming.filter((x) => x.date === j.date && x.id !== j.id).length > 0;
              return (
                <li key={j.id}>
                  <Link href={`/jornada/${j.id}`} onClick={onClose} className="group flex items-center gap-3 border-b border-hairline py-3 last:border-0">
                    <DateBadge date={j.date} tone={j.date === dayKey(now) ? "today" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink group-hover:text-link">{client?.shortName ?? o.title}</span>
                      <span className="flex items-center gap-1.5 truncate text-[12.5px] text-subtle tabular">
                        <StatusDot tone={v.tone} live={v.live} />
                        {timeRange(parseISO(j.plannedStart), parseISO(j.plannedEnd))} · {o.folio} · J{j.dayIndex}
                      </span>
                    </span>
                    {sameDay && (
                      <SoftBadge tone="amber" className="shrink-0">
                        <TriangleAlert className="size-3" />
                        Doble<span className="sr-only"> asignación ese día</span>
                      </SoftBadge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* history */}
      <section>
        <Eyebrow className="mb-3">Historial</Eyebrow>
        {view.history.length === 0 ? (
          <p className="text-[13.5px] text-subtle">Sin jornadas cerradas en su alcance.</p>
        ) : (
          <ul>
            {view.history.map((j) => {
              const { o, client } = orderLine(j);
              if (!o) return null;
              return (
                <li key={j.id}>
                  <Link href={`/jornada/${j.id}`} onClick={onClose} className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-3 last:border-0">
                    <span className="text-[13px] text-subtle tabular">{fmtDay(j.date)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink group-hover:text-link">{client?.shortName}</span>
                      <span className="block truncate text-[12.5px] text-subtle">
                        {o.folio} · J{j.dayIndex} · {j.checkIn ? fmtTime(j.checkIn.deviceAt) : ""}
                      </span>
                    </span>
                    <span className="text-[14px] font-semibold text-ink tabular">{fmtHours(jornadaSpanMinutes(j, now))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* productivity: preliminary, only the crew assignment is recorded */}
      <section className="rounded-[20px] border border-dashed border-violet-line bg-violet-soft p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <Sprout className="size-4 text-violet-fg" /> Productividad
          </h3>
          <SoftBadge tone="violet">Preliminar · Fase 2</SoftBadge>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink/75">
          Hoy solo se registra la <b className="font-semibold text-ink">asignación a la cuadrilla</b>, no los tiempos individuales. Estos valores son{" "}
          <b className="font-semibold text-ink">horas de jornada asignada</b>, no productividad individual.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Jornadas", value: String(view.last30), sub: "30 días" },
            { label: "Horas asig.", value: fmtHours(view.minutes30), sub: "30 días" },
            { label: "Órdenes", value: String(view.orders30), sub: "distintas" },
          ].map((m) => (
            <div key={m.label} className="rounded-[14px] bg-surface p-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
              <p className="text-[12px] text-subtle">{m.label}</p>
              <p className="mt-0.5 text-[20px] font-medium tracking-[-0.02em] text-ink tabular">{m.value}</p>
              <p className="text-[11.5px] text-subtle">{m.sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <p className="mb-2 text-[12px] text-subtle">Horas de jornada asignada por semana</p>
          {/* values are printed on the bars: a title attribute never shows on touch */}
          <div className="flex h-[112px] items-end gap-1.5" role="img" aria-label={`Horas de jornada asignada en las últimas 8 semanas: ${view.weeks.map((wk) => `${wk.label} ${fmtHours(wk.minutes)}`).join(", ")}`}>
            {view.weeks.map((wk, i) => {
              const barPx = Math.max(4, (wk.minutes / maxWeek) * WEEK_BAR_MAX);
              const t = { type: "spring" as const, stiffness: 140, damping: 18, delay: 0.15 + i * 0.05 };
              return (
                <div key={wk.key} className="relative flex h-full flex-1 flex-col items-center justify-end" title={`${wk.label}: ${fmtHours(wk.minutes)}`}>
                  {wk.minutes > 0 && (
                    <motion.span
                      initial={{ bottom: 0, opacity: 0 }}
                      animate={{ bottom: barPx + 3, opacity: 1 }}
                      transition={t}
                      className="absolute whitespace-nowrap text-[10.5px] font-semibold leading-none text-ink/70 tabular"
                    >
                      {(wk.minutes / 60).toFixed(1).replace(/\.0$/, "")}
                    </motion.span>
                  )}
                  <motion.span
                    initial={{ height: 0 }}
                    animate={{ height: barPx }}
                    transition={t}
                    className={cn("w-full max-w-[26px] rounded-full", i === view.weeks.length - 1 ? "bg-st-violet" : wk.minutes ? "bg-violet-line" : "bg-violet-soft")}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {view.weeks.map((wk, i) => (
              <span key={wk.key} className="flex-1 text-center text-[10.5px] leading-tight text-subtle">
                {/* phones: 8 "d MMM" labels do not fit in a row, so the month goes below the day and only when it changes */}
                <span className="max-sm:hidden">{wk.label}</span>
                <span className="sm:hidden">
                  {wk.day}
                  <span className="block h-[11px] text-[9.5px]">{i === 0 || wk.month !== view.weeks[i - 1].month ? wk.month : ""}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, ease: EASE }} className="mt-3 text-[12px] text-subtle">
          Para medir la productividad individual haría falta registrar entrada y salida por persona, o un desglose por actividad.
        </motion.p>
      </section>
    </div>
  );
}
