"use client";

import { motion } from "motion/react";
import { Bell, Check, CheckCircle2, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtDay, fmtHours, fmtRelativeDay, plural } from "@/lib/format";
import { toneDot } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { OrderStatusPill, ToneText } from "@/components/pk/status";
import { BeforeAfter, PhotoThumb } from "@/components/pk/scene-photo";
import { EASE } from "@/components/pk/motion";
import { dueLabel } from "./evidence-data";
import { SparkleBurst, SqueegeeWipe } from "./squeegee";
import { listEs, type RequestModel } from "./request-model";

/* Sections shared by the desktop sheet and the phone flow of an evidence request. */

export function PersonCard({ m }: { m: RequestModel }) {
  const sup = m.supervisor;
  if (!sup) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="flex items-center gap-3.5 rounded-[18px] border border-hairline p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]"
    >
      <PersonAvatar name={sup.name} initials={sup.initials} hue={sup.hue} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">
          {sup.name}
          {m.isMine && <span className="ml-1.5 text-[12.5px] font-medium text-subtle">(usted)</span>}
        </p>
        <p className="truncate text-[13px] text-subtle">
          {m.roleWord} · {m.unit.name} · captura en la app
        </p>
      </div>
      {sup.phone && !m.isMine && (
        <a
          href={`tel:${sup.phone.replace(/\s/g, "")}`}
          aria-label={`Llamar a ${sup.name}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-tile text-ink transition hover:bg-press"
        >
          <Phone className="size-4" />
        </a>
      )}
    </motion.div>
  );
}

export function RequestFacts({ m }: { m: RequestModel }) {
  const { request, order } = m;
  return (
    <KeyValues
      title="Solicitud"
      rows={[
        {
          k: "Estado",
          v: (
            <ToneText tone={m.statusTone} className="font-semibold">
              {m.resolved ? `Recibida ${fmtDateTime(m.received[0].takenAt)}` : dueLabel(request)}
            </ToneText>
          ),
        },
        { k: "Vence", v: <span className="tabular">{fmtRelativeDay(request.due)}, 23:59</span> },
        {
          k: "Cierre de la orden",
          v: (
            <span className="flex flex-col items-end gap-1">
              <OrderStatusPill status={order.status} />
              <span className="text-[12px] font-normal text-subtle">
                {order.closure
                  ? `Validado ${fmtDay(order.closure.validatedAt)}`
                  : m.blocks.length
                    ? plural(m.blocks.length, "requisito pendiente", "requisitos pendientes")
                    : "Sin bloqueos"}
              </span>
            </span>
          ),
        },
        {
          k: "Horas reales",
          v: <span className="tabular">{m.realMinutes ? `${fmtHours(m.realMinutes)} · ${plural(m.executed, "jornada", "jornadas")}` : "—"}</span>,
        },
      ]}
    />
  );
}

export function NeededBox({
  m,
  wipe = 0,
  onPreview,
  children,
}: {
  m: RequestModel;
  wipe?: number;
  onPreview: (photos: Photo[], i: number) => void;
  children?: React.ReactNode;
}) {
  const { request, jornada, reference, refAreas } = m;
  const areasText = refAreas.length ? listEs(refAreas.slice(0, 3)) : "las áreas trabajadas";
  return (
    <section>
      <Eyebrow className="mb-3">Qué se necesita</Eyebrow>
      <div className="relative overflow-hidden rounded-[18px] bg-soft p-4 sm:p-5">
        {wipe > 0 && <SqueegeeWipe key={wipe} />}
        <p className="text-[14px] leading-relaxed text-ink [&_b]:font-semibold">
          {request.kind === "despues" ? (
            <>
              Una foto <b>DESPUÉS</b> de {areasText} con el <b>mismo encuadre</b> que la foto ANTES. Con una basta para liberar el cierre; lo
              ideal es una por área.
            </>
          ) : (
            <>
              Una foto <b>ANTES</b> del área tal como se encontró al iniciar la jornada {jornada.dayIndex}.
              {jornada.checkOut && <> Si el área ya se limpió, no la recree: documente el motivo y solicite una excepción autorizada al validar el cierre.</>}
            </>
          )}
        </p>
        {reference.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[12.5px] font-medium text-subtle">
              {request.kind === "despues" ? "Referencia: fotos ANTES de esta jornada" : "Referencia: fotos ANTES de otras jornadas"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {reference.slice(0, 3).map((p, i) => (
                <PhotoThumb key={p.id} photo={p} className="rounded-[12px]" onClick={() => onPreview(reference, i)} />
              ))}
            </div>
            {reference.length > 3 && (
              <button type="button" onClick={() => onPreview(reference, 3)} className="mt-2 min-h-10 text-[13px] font-medium text-link">
                Ver {reference.length - 3} más
              </button>
            )}
          </div>
        )}
        <ul className="mt-4 space-y-1.5 text-[13px] text-subtle">
          {[
            request.kind === "despues" ? "Misma área y ángulo que la foto ANTES" : "Vista general del área antes de intervenir",
            "Con buena luz y sin personas en primer plano",
            "Se guarda con hora y usuario; se sincroniza al recuperar señal",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-teal-fg" strokeWidth={2.6} />
              {t}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}

export function AreaChips({ choices, value, onChange }: { choices: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-subtle">Área de la foto</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((a) => (
          <motion.button
            key={a}
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(a)}
            aria-pressed={value === a}
            className={cn(
              "min-h-11 rounded-[12px] border px-3.5 text-[13.5px] transition md:min-h-10",
              value === a ? "border-ink bg-ink font-medium text-on-ink" : "border-hairline bg-surface text-ink hover:bg-muted",
            )}
          >
            {a}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function ReceivedCard({ m, onPreview }: { m: RequestModel; onPreview: (photos: Photo[], i: number) => void }) {
  const latest = m.latest!;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="relative overflow-hidden rounded-[20px] bg-teal-soft p-4"
    >
      <SparkleBurst delay={0.2} />
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-surface text-teal-fg">
          <CheckCircle2 className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-ink">Evidencia recibida</p>
          <p className="truncate text-[12.5px] text-subtle">
            {latest.area} · {fmtDateTime(latest.takenAt)}
          </p>
        </div>
      </div>
      {m.pair ? (
        <BeforeAfter before={m.pair.before} after={m.pair.after} className="rounded-[14px]" />
      ) : (
        <PhotoThumb photo={latest} className="rounded-[14px]" onClick={() => onPreview(m.received, m.received.length - 1)} />
      )}
    </motion.section>
  );
}

export function History({ m }: { m: RequestModel }) {
  return (
    <section>
      <Eyebrow className="mb-4">Historial</Eyebrow>
      <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-hairline">
        {m.history.map((h, i) => (
          <motion.li
            key={h.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.05 * i }}
            className="relative flex gap-4"
          >
            <span className={cn("relative z-[1] mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", toneDot[h.tone])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-semibold text-ink">{h.title}</p>
                <span className="shrink-0 text-[12.5px] text-subtle tabular">{fmtDateTime(h.at)}</span>
              </div>
              {h.detail && <p className="mt-0.5 text-[13px] text-subtle">{h.detail}</p>}
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

export function RingingBell({ rings }: { rings: number }) {
  return (
    <motion.span
      key={rings}
      className="inline-flex"
      initial={false}
      animate={rings ? { rotate: [0, -18, 16, -10, 6, 0] } : undefined}
      transition={{ duration: 0.7 }}
    >
      <Bell />
    </motion.span>
  );
}
