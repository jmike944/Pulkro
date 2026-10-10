"use client";

import { AnimatePresence, motion } from "motion/react";
import { Building, CalendarDays, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { fmtDay, fmtHours, plural } from "@/lib/format";
import type { Worker } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { AvatarStack, Eyebrow } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { STEPS, dayMinutes, willBeScheduled, type Draft } from "./draft";
import { CheckMark, ServiceIcon } from "./form-bits";

const swap = {
  initial: { opacity: 0, y: 6, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, filter: "blur(4px)" },
  transition: { duration: 0.28, ease: EASE },
};

/** Desktop right column: the order taking shape as the form is filled. */
export function LiveSummary({ draft, title, folio, canAssign, done, current }: { draft: Draft; title: string; folio: string; canAssign: boolean; done: boolean[]; current: number }) {
  const lk = useLookups();
  const client = lk.clients.get(draft.clientId);
  const site = lk.sites.get(draft.siteId);
  const service = lk.serviceTypes.get(draft.serviceTypeId);
  const crew = (canAssign ? draft.workerIds : []).map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w);
  const scheduled = willBeScheduled(draft, canAssign);
  const dates = draft.days.map((d) => d.date).filter(Boolean).sort();
  const minutes = draft.days.reduce((s, d) => s + dayMinutes(d), 0);

  return (
    <AuroraFrame innerClassName="p-5">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Vista previa · {folio}</Eyebrow>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={scheduled ? "p" : "b"} {...swap}>
            <OrderStatusPill status={scheduled ? "programada" : "borrador"} />
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-5 space-y-4">
        <Line icon={client ? <ClientMark name={client.name} hue={client.hue} size={38} /> : <Placeholder icon={<Building className="size-[17px]" />} />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={client?.id ?? "none"} {...swap} className="min-w-0">
              <p className={cn("truncate text-[14.5px] font-semibold", client ? "text-ink" : "text-subtle")}>{client?.shortName ?? "Cliente por elegir"}</p>
              <p className="truncate text-[12.5px] text-subtle">{site ? `${site.name} · ${site.municipality}` : client ? "Elija el sitio" : "Paso 1"}</p>
            </motion.div>
          </AnimatePresence>
        </Line>

        <Line icon={service ? <ServiceIcon id={service.id} hue={service.hue} size={38} /> : <Placeholder icon={<Sparkles className="size-[17px]" />} />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={service?.id ?? "none"} {...swap} className="min-w-0">
              <p className={cn("line-clamp-2 text-[14.5px] font-semibold leading-snug", service ? "text-ink" : "text-subtle")}>{service ? title : "Servicio por elegir"}</p>
              <p className="truncate text-[12.5px] text-subtle">{service ? plural(draft.activities.length, "actividad", "actividades") : "Paso 2"}</p>
            </motion.div>
          </AnimatePresence>
        </Line>

        <Line icon={<Placeholder icon={<CalendarDays className="size-[17px]" />} active={dates.length > 0} />}>
          <p className="text-[14.5px] font-semibold text-ink tabular">
            {plural(draft.days.length, "jornada", "jornadas")} · {fmtHours(minutes)}
          </p>
          <p className="truncate text-[12.5px] text-subtle">
            {dates.length ? (dates.length > 1 ? `${fmtDay(dates[0])} – ${fmtDay(dates[dates.length - 1])}` : fmtDay(dates[0])) : "Sin fecha"}
          </p>
        </Line>

        <Line icon={<Placeholder icon={<Users className="size-[17px]" />} active={crew.length > 0} />}>
          {crew.length ? (
            <div className="flex items-center gap-2">
              <AvatarStack people={crew} size={26} max={5} />
              <span className="text-[12.5px] text-subtle">{plural(crew.length, "persona", "personas")}</span>
            </div>
          ) : (
            <>
              <p className="text-[14.5px] font-semibold text-subtle">Cuadrilla por asignar</p>
              <p className="text-[12.5px] text-subtle">{canAssign ? "Paso 3" : "La asigna el supervisor"}</p>
            </>
          )}
        </Line>
      </div>

      <ol className="mt-6 space-y-2 border-t border-hairline pt-5">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-[13.5px]">
            <CheckMark on={done[i]} className="size-5 rounded-[6px]" />
            <span className={cn(i === current ? "font-semibold text-ink" : done[i] ? "text-ink" : "text-subtle")}>{s.label}</span>
            {i === current && <motion.span layoutId="summary-current" className="ml-auto h-1.5 w-1.5 rounded-full bg-sky" />}
          </li>
        ))}
      </ol>
    </AuroraFrame>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Placeholder({ icon, active }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-[38px] shrink-0 items-center justify-center rounded-[12px] transition-colors",
        active ? "bg-blue-tint text-azure-fg" : "border border-dashed border-line-heavy text-faint",
      )}
    >
      {icon}
    </span>
  );
}
