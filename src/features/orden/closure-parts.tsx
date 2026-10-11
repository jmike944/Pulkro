"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Eraser, Mail, MessageSquare, ShieldAlert, Signature, TriangleAlert, WifiOff, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import type { Conformity } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { ItemCard } from "@/components/pk/mobile";
import { OrderStatusPill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { OrderDetail } from "./order-context";
import { CONFORMITY_LABEL } from "./orden-format";
import { SignaturePad } from "./signature-pad";
import { Field, ReasonField, inputClass } from "./ui";
import { EXCEPTION_MIN, type CheckRow, type ClosureDone, type ClosureDraft } from "./closure-model";

/** Sections of "Validar cierre" shared by the desktop dialog and the phone flow. */

/** Link handler: the dialog decides whether to ask before leaving (unsaved signature or text). */
export type NavigateHandler = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;

/* ───────────── checklist ───────────── */

export function ClosureChecklist({ rows, intro = true, onNavigate }: { rows: CheckRow[]; intro?: boolean; onNavigate: NavigateHandler }) {
  return (
    <ul className="space-y-1" aria-label="Requisitos del cierre">
      {rows.map((r, i) => (
        <ChecklistRow key={r.id} row={r} index={i} intro={intro} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

const STATE_TONE = {
  ok: { bg: "bg-teal-soft", fg: "text-teal-fg", sr: "cumplido", icon: <Check className="size-3.5" strokeWidth={3} /> },
  block: { bg: "bg-red-soft", fg: "text-red-fg", sr: "bloquea", icon: <X className="size-3.5" strokeWidth={3} /> },
  warn: { bg: "bg-amber-soft", fg: "text-amber-fg", sr: "aviso", icon: <span className="text-[13px] font-bold leading-none">!</span> },
  excepted: { bg: "bg-amber-soft", fg: "text-amber-fg", sr: "con excepción", icon: <ShieldAlert className="size-3.5" /> },
} as const;

function ChecklistRow({ row, index, intro, onNavigate }: { row: CheckRow; index: number; intro: boolean; onNavigate: NavigateHandler }) {
  const tone = STATE_TONE[row.state];
  return (
    <motion.li
      initial={intro ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.07 }}
      className="flex gap-3 rounded-[14px] px-1 py-2"
    >
      <motion.span
        key={row.state}
        initial={intro ? { scale: 0.3, rotate: -45 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.12 + index * 0.07 }}
        className={cn("mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full", tone.bg, tone.fg)}
        aria-hidden
      >
        {tone.icon}
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] lg:text-[14.5px]", row.state === "ok" ? "text-ink" : "font-medium text-ink")}>
          {row.label}
          <span className="sr-only"> · {tone.sr}</span>
        </p>
        {row.detail && (
          <p className={cn("mt-0.5 text-[13.5px] lg:text-[13px]", row.state === "block" ? "text-red-fg" : "text-subtle")}>
            {row.state === "excepted" ? `${row.detail} · cubierto por la excepción` : row.detail}
          </p>
        )}
        {row.links && row.links.length > 0 && row.state !== "ok" && (
          <div className="mt-1 flex flex-wrap gap-x-4">
            {row.links.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                onClick={(e) => onNavigate(e, l.href)}
                className="group inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-link lg:min-h-8 lg:text-[13px]"
              >
                {l.label} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** Jornadas without check-out and blocking incidents have no exception (doc §8). */
export function HardBlockNotice({ onIncidents, className }: { onIncidents?: () => void; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-[18px] bg-red-soft p-4 text-[14px] leading-relaxed text-red-ink lg:text-[13.5px]", className)}>
      <TriangleAlert className="mt-1 size-4 shrink-0" />
      <div>
        <p>
          Las jornadas sin salida y las incidencias que impiden el cierre <b className="font-semibold">no admiten excepción</b>. Resuélvalas y vuelva a validar.
        </p>
        {onIncidents && (
          <button
            type="button"
            onClick={onIncidents}
            className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-1 font-semibold underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-8"
          >
            Ir a incidencias <ArrowRight className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Evidence exception — doc §8: only documented, authorized by the supervisor and visible in the report. */
export function ExceptionPanel({ draft, userName, className }: { draft: ClosureDraft; userName: string; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      aria-label="Excepción de evidencia"
      className={cn("rounded-[18px] border border-amber-line bg-amber-wash p-4", className)}
    >
      <p className="flex items-center gap-2 text-[14.5px] font-semibold text-amber-ink lg:text-[14px]">
        <ShieldAlert className="size-4" /> Excepción de evidencia
      </p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-amber-ink/90 lg:text-[13px]">
        Faltan fotografías obligatorias. Solo puede cerrar con una justificación documentada; quedará autorizada por <b className="font-semibold">{userName}</b> y visible en
        el reporte y la auditoría.
      </p>
      <ReasonField
        className="mt-3"
        id="closure-exception"
        label="Justificación de la excepción"
        value={draft.exception}
        onChange={draft.setException}
        min={EXCEPTION_MIN}
        placeholder="Ej. El cliente bloqueó el área al terminar; se envió confirmación por correo."
        hint={draft.exceptionOk ? "Justificación lista." : `Mínimo ${EXCEPTION_MIN} caracteres.`}
      />
    </motion.section>
  );
}

/* ───────────── conformity ───────────── */

const METHODS: { value: Conformity["method"]; icon: LucideIcon; hint: string }[] = [
  { value: "firma", icon: Signature, hint: "El cliente firma en este dispositivo" },
  { value: "verbal", icon: MessageSquare, hint: "Aceptó en sitio de palabra" },
  { value: "correo", icon: Mail, hint: "Confirmó por correo electrónico" },
];

export function ConformityFields({ draft }: { draft: ClosureDraft }) {
  const { method } = draft;
  return (
    <div>
      <RadioGroup value={method} onValueChange={(v) => draft.setMethod(v as Conformity["method"])} className="grid gap-2 sm:grid-cols-3" aria-label="Método de conformidad">
        {METHODS.map((m) => {
          const Icon = m.icon;
          const active = method === m.value;
          return (
            <label
              key={m.value}
              className={cn(
                "relative flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[16px] border p-3 transition sm:flex-col sm:items-start sm:gap-2",
                active ? "border-transparent bg-blue-wash ring-2 ring-azure" : "border-hairline hover:bg-muted",
                "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/60",
              )}
            >
              <RadioGroupItem value={m.value} className="sr-only" />
              <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] sm:size-8", active ? "bg-azure text-white" : "bg-tile text-ink")}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-tight text-ink lg:text-[13.5px]">{CONFORMITY_LABEL[m.value]}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-subtle lg:text-[12px]">{m.hint}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Nombre de quien acepta" htmlFor="conf-name">
          <input id="conf-name" value={draft.name} onChange={(e) => draft.setName(e.target.value)} className={inputClass} autoComplete="off" autoCapitalize="words" />
        </Field>
        <Field label="Puesto o relación" htmlFor="conf-role">
          <input id="conf-role" value={draft.role} onChange={(e) => draft.setRole(e.target.value)} className={inputClass} placeholder="Gerente de mantenimiento" autoComplete="off" />
        </Field>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {method === "firma" ? (
          <motion.div key="firma" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4">
            <SignatureField value={draft.signature} onChange={draft.setSignature} />
          </motion.div>
        ) : (
          <motion.div key="nota" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4">
            <Field label={method === "correo" ? "Referencia del correo (opcional)" : "Comentario (opcional)"} htmlFor="conf-comment">
              <input
                id="conf-comment"
                value={draft.comment}
                onChange={(e) => draft.setComment(e.target.value)}
                className={inputClass}
                placeholder={method === "correo" ? "Asunto o fecha del correo de conformidad" : "Ej. Recorrido final con el contacto"}
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The pad, or — when it mounts with a signature already captured (back from the next step, a method switch, a
 * rotation across the desktop breakpoint) — that signature on paper with "Firmar de nuevo", so a blank pad never
 * hides a signature that will still be saved.
 */
function SignatureField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [kept, setKept] = useState(() => !!value);
  if (!kept || !value) return <SignaturePad onChange={onChange} />;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">
          Firma del cliente <span className="text-red-fg">*</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setKept(false);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold text-subtle outline-none transition hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-9"
        >
          <Eraser className="size-4" /> Firmar de nuevo
        </button>
      </div>
      <div className="theme-light flex h-[170px] items-center justify-center rounded-[18px] border border-blue-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL from the pad */}
        <img src={value} alt="Firma capturada" className="max-h-[150px] max-w-[90%] object-contain" />
      </div>
    </div>
  );
}

/* ───────────── description + notes ───────────── */

export function SummaryField({ draft }: { draft: ClosureDraft }) {
  const short = !draft.summaryOk;
  return (
    <Field
      label="Descripción para el reporte"
      htmlFor="closure-summary"
      hint={
        <span id="closure-summary-hint" className={short ? "font-medium text-amber-fg" : undefined}>
          {short ? "Escriba al menos 10 caracteres." : "Aparece en el PDF que recibe el cliente."}
        </span>
      }
    >
      <textarea
        id="closure-summary"
        value={draft.summary}
        onChange={(e) => draft.setSummary(e.target.value)}
        rows={4}
        aria-invalid={short || undefined}
        aria-describedby="closure-summary-hint"
        className="block w-full resize-none rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-amber-line-strong lg:text-[15px]"
      />
    </Field>
  );
}

export function OfflineNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 rounded-[14px] bg-tile px-3.5 py-2.5 text-[13.5px] text-subtle lg:text-[13px]", className)}>
      <WifiOff className="size-4 shrink-0" /> Sin conexión: el cierre se guarda en el dispositivo y se sincroniza después.
    </p>
  );
}

/* ───────────── recap ───────────── */

type PaperConformity = { method: Conformity["method"]; name: string; role?: string; signature?: string | null; comment?: string };

/** The conformity (and the exception, if any) as the report prints it: a light "paper" card in both themes. */
export function ConformityPaper({
  conformity,
  exception,
  className,
}: {
  conformity: PaperConformity;
  exception?: { reason: string; by: string };
  className?: string;
}) {
  const c = conformity;
  return (
    <div className={cn("theme-light rounded-[18px] bg-white p-4 text-ink shadow-soft ring-1 ring-edge", className)}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{CONFORMITY_LABEL[c.method]}</p>
          <p className="mt-1 truncate text-[16px] font-semibold">{c.name.trim() || "Sin nombre"}</p>
          {c.role?.trim() && <p className="truncate text-[13px] text-subtle">{c.role.trim()}</p>}
          {c.comment?.trim() && <p className="mt-1.5 line-clamp-2 text-[13px] italic">“{c.comment.trim()}”</p>}
        </div>
        {c.method === "firma" && c.signature && (
          <div className="flex h-[76px] w-[132px] shrink-0 items-center justify-center rounded-[10px] bg-wash">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL from the pad */}
            <img src={c.signature} alt={`Firma de ${c.name.trim()}`} className="max-h-[66px] max-w-[120px] object-contain" />
          </div>
        )}
      </div>
      {exception && (
        <div className="mt-3 rounded-[10px] bg-amber-wash px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-fg">Excepción de evidencia autorizada</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-snug">{exception.reason}</p>
          <p className="mt-1 text-[12px] text-subtle">Autoriza {exception.by}</p>
        </div>
      )}
    </div>
  );
}

/** "Firmó Juan Pérez" · "Conformidad verbal de …" · "Conformidad por correo de …" */
const conformityLine = (done: ClosureDone) =>
  done.method === "firma" ? `Firmó ${done.name}` : done.method === "verbal" ? `Conformidad verbal de ${done.name}` : `Conformidad por correo de ${done.name}`;

/** The order as it stands after the validation (success screens). */
export function ClosedOrderCard({ d, done, className }: { d: OrderDetail; done: ClosureDone; className?: string }) {
  return (
    <ItemCard
      className={className}
      leading={<ClientMark name={d.client.name} hue={d.client.hue} size={44} />}
      title={d.order.title}
      sub={`${d.order.folio} · ${conformityLine(done)}`}
      value={<span className="tabular">{fmtTime(done.at)}</span>}
      status={<OrderStatusPill status={d.order.status} />}
    />
  );
}
