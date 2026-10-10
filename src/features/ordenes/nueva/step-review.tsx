"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck, CircleDashed, Flame, Pencil, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { fmtDuration, fmtHours, fmtLongDay, plural } from "@/lib/format";
import type { Worker } from "@/lib/types";
import { AvatarStack, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { PulkroMark } from "@/components/pk/brand";
import { OrderStatusPill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { dayMinutes, normalizeRef, willBeScheduled } from "./draft";
import { CheckMark, FieldMessage, ServiceIcon } from "./form-bits";
import type { StepProps } from "./step-types";

export function StepReview({
  draft,
  setDraft,
  errorOf,
  touch,
  title,
  folio,
  canAssign,
  offline,
  onEdit,
}: StepProps & { title: string; folio: string; canAssign: boolean; offline: boolean; onEdit: (step: number) => void }) {
  const lk = useLookups();
  const client = lk.clients.get(draft.clientId);
  const site = lk.sites.get(draft.siteId);
  const service = lk.serviceTypes.get(draft.serviceTypeId);
  const supervisor = lk.users.get(draft.supervisorId);
  const crew = (canAssign ? draft.workerIds : []).map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w);
  const scheduled = willBeScheduled(draft, canAssign);
  const minutes = draft.days.reduce((s, d) => s + dayMinutes(d), 0);
  const days = [...draft.days].sort((a, b) => a.date.localeCompare(b.date));
  const mats = Object.entries(draft.materials)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ m: lk.materials.get(id), qty }))
    .filter((x) => x.m);
  const ref = normalizeRef(draft.commercialRef);

  return (
    <div className="space-y-6">
      {/* status preview */}
      <motion.div
        layout
        className={cn("flex gap-4 rounded-[20px] p-5", scheduled ? "bg-blue-soft" : "bg-soft")}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-[12px]", scheduled ? "bg-blue-mid text-azure-fg" : "bg-surface text-subtle")}>
          {scheduled ? <CalendarCheck className="size-5" /> : <CircleDashed className="size-5" />}
        </span>
        <div className="min-w-0 text-[14px] leading-relaxed">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            Se guardará como
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={scheduled ? "p" : "b"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <OrderStatusPill status={scheduled ? "programada" : "borrador"} className="bg-surface" />
              </motion.span>
            </AnimatePresence>
          </p>
          <p className="mt-1 text-subtle">
            {scheduled
              ? `${plural(draft.days.length, "jornada", "jornadas")} con cuadrilla de ${plural(crew.length, "persona", "personas")}. Aparecerá en la agenda y ${supervisor?.name.split(" ")[0] ?? "el supervisor"} podrá registrar la entrada el día programado.`
              : canAssign
                ? "No eligió cuadrilla. Podrá asignarla desde la orden y entonces pasará a Programada."
                : `La cuadrilla la asigna ${supervisor ? supervisor.name.split(" ")[0] : "el supervisor"}; al hacerlo, la orden pasará a Programada.`}
          </p>
        </div>
      </motion.div>

      {/* receipt */}
      <div className="rounded-[28px] bg-soft p-2 sm:p-3">
        <div className="relative overflow-hidden rounded-[22px] bg-surface shadow-soft">
          <SqueegeeWipe />
          <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-7">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-subtle">
                <PulkroMark className="size-5 rounded-[6px]" />
                Orden de servicio
              </p>
              <p className="mt-2.5 font-serif text-[34px] font-medium leading-none tracking-[-0.01em] text-ink tabular">{folio}</p>
              <p className="mt-1.5 text-[12.5px] text-subtle">Folio provisional · se confirma al guardar</p>
            </div>
            {draft.priority === "alta" && (
              <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] bg-red-soft px-2 text-[12px] font-semibold text-red-fg">
                <Flame className="size-3.5" /> Alta
              </span>
            )}
          </header>

          <Perforation />

          <ReceiptSection title="Cliente y sitio" onEdit={() => onEdit(0)}>
            {client && (
              <div className="mb-4 flex items-center gap-3">
                <ClientMark name={client.name} hue={client.hue} size={42} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{client.name}</p>
                  <p className="line-clamp-2 text-[13px] leading-snug text-subtle">{site ? `${site.name} · ${site.address}, ${site.municipality}` : "Sin sitio"}</p>
                </div>
              </div>
            )}
            <KeyValues
              rows={[
                { k: "Contacto en sitio", v: draft.contactName || "—" },
                { k: "Teléfono", v: <span className="tabular">{draft.contactPhone || "—"}</span> },
                { k: "Referencia comercial", v: <span className="font-mono text-[13.5px] tracking-wide">{ref || "—"}</span> },
              ]}
            />
          </ReceiptSection>

          <ReceiptSection title="Servicio" onEdit={() => onEdit(1)}>
            {service && (
              <div className="mb-4 flex items-center gap-3">
                <ServiceIcon id={service.id} hue={service.hue} size={42} />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug text-ink">{title}</p>
                  <p className="text-[13px] text-subtle">{service.name}</p>
                </div>
              </div>
            )}
            <ul className="space-y-1.5">
              {draft.activities.map((a) => (
                <li key={a} className="flex items-start gap-2.5 text-[14px] text-ink">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-azure" />
                  {a}
                </li>
              ))}
            </ul>
            {mats.length > 0 && (
              <div className="mt-4 rounded-[14px] bg-soft px-3.5 py-3">
                <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Materiales</p>
                <ul className="space-y-1.5">
                  {mats.map(({ m, qty }) => (
                    <li key={m!.id} className="flex items-baseline justify-between gap-4 text-[13.5px]">
                      <span className="min-w-0 truncate text-ink">{m!.name}</span>
                      <span className="shrink-0 border-b border-dotted border-line-heavy font-semibold text-ink tabular">
                        {qty} {m!.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draft.specialInstructions.trim() && (
              <p className="mt-4 whitespace-pre-line rounded-[14px] border-l-[3px] border-sky bg-sky-soft/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                {draft.specialInstructions.trim()}
              </p>
            )}
          </ReceiptSection>

          <ReceiptSection title="Programación y cuadrilla" onEdit={() => onEdit(2)}>
            <ul className="divide-y divide-dashed divide-line">
              {days.map((d, i) => (
                <li key={d.id} className="flex items-baseline justify-between gap-4 py-2 text-[14px] first:pt-0">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-[12px] font-semibold text-subtle tabular">J{i + 1}</span>
                    <span className="text-ink first-letter:uppercase">{d.date ? fmtLongDay(d.date) : "Sin fecha"}</span>
                  </span>
                  <span className="shrink-0 text-ink tabular">
                    {d.start}–{d.end} <span className="text-subtle">· {fmtDuration(dayMinutes(d))}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                {supervisor && <PersonAvatar name={supervisor.name} initials={supervisor.initials} hue={supervisor.hue} size={34} />}
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Supervisor</p>
                  <p className="truncate text-[14px] font-medium text-ink">{supervisor?.name ?? "Sin asignar"}</p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Cuadrilla</p>
                {crew.length ? (
                  <div className="mt-1 flex items-center gap-2">
                    <AvatarStack people={crew} size={26} max={5} />
                    <span className="truncate text-[13px] text-subtle">{plural(crew.length, "persona", "personas")}</span>
                  </div>
                ) : (
                  <p className="text-[14px] font-medium text-amber-fg">Por asignar</p>
                )}
              </div>
            </div>
          </ReceiptSection>

          <Perforation />

          <footer className="flex items-end justify-between gap-4 px-5 pb-6 pt-2 sm:px-7">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Total planeado</p>
              <p className="mt-1 text-[30px] font-medium leading-none tracking-[-0.03em] text-ink tabular">{fmtHours(minutes)}</p>
              <p className="mt-1 text-[12.5px] text-subtle">{plural(draft.days.length, "jornada", "jornadas")}</p>
            </div>
            <Barcode seed={`${folio}${ref}`} />
          </footer>
        </div>
      </div>

      {/* explicit confirmation */}
      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={draft.authorized}
          onClick={() => {
            setDraft((d) => ({ ...d, authorized: !d.authorized }));
            touch("authorized");
          }}
          className={cn(
            "flex min-h-14 w-full items-start gap-3 rounded-[18px] border p-4 text-left transition-colors",
            draft.authorized ? "border-blue-line bg-blue-wash" : "border-hairline bg-surface hover:border-line-strong",
          )}
        >
          <CheckMark on={draft.authorized} className="mt-0.5" />
          <span className="text-[14px] leading-relaxed text-ink">
            Confirmo que el trabajo está autorizado en el sistema comercial con la referencia <b className="font-mono font-semibold tracking-wide">{ref || "—"}</b> y que los
            datos de la orden son correctos.
          </span>
        </button>
        <FieldMessage error={errorOf("authorized")} />
      </div>

      {offline && (
        <div className="flex items-center gap-3 rounded-[16px] bg-amber-soft px-4 py-3 text-[13.5px] text-amber-ink">
          <WifiOff className="size-4 shrink-0" />
          <span>
            <b className="font-semibold">Sin conexión.</b> La orden se guarda en este dispositivo y se sincroniza al reconectar.
          </span>
        </div>
      )}
    </div>
  );
}

function ReceiptSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline px-5 py-5 last-of-type:border-b-0 sm:px-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="-mr-2 inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-medium text-link transition hover:bg-blue-wash"
          aria-label={`Editar ${title.toLowerCase()}`}
        >
          <Pencil className="size-3.5" />
          Editar
        </button>
      </div>
      {children}
    </section>
  );
}

/** Ticket perforation with side notches. */
function Perforation() {
  return (
    <div aria-hidden className="relative h-6">
      <span className="absolute left-0 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-soft" />
      <span className="absolute right-0 top-1/2 size-6 -translate-y-1/2 translate-x-1/2 rounded-full bg-soft" />
      <span className="absolute inset-x-6 top-1/2 border-t-2 border-dashed border-line" />
    </div>
  );
}

/** Decorative barcode derived from the folio; bars grow in. */
function Barcode({ seed }: { seed: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < seed.length && x < 108; i++) {
    const c = seed.charCodeAt(i);
    for (const w of [1 + (c % 3), 1 + ((c >> 2) % 2), 2 + ((c >> 1) % 2)]) {
      bars.push({ x, w });
      x += w + 1 + ((c + w) % 2);
    }
  }
  return (
    <svg viewBox="0 0 112 40" className="h-10 w-28 shrink-0 text-ink/80" aria-hidden>
      {bars
        .filter((b) => b.x + b.w <= 112)
        .map((b, i) => (
          <motion.rect
            key={i}
            x={b.x}
            y={0}
            width={b.w}
            height={40}
            fill="currentColor"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            style={{ originY: 1 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.5 + i * 0.012 }}
          />
        ))}
    </svg>
  );
}

/** A light fog wiped clean by a squeegee blade as the receipt appears. */
function SqueegeeWipe() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-blue-soft/80"
        initial={{ clipPath: "inset(0 0 0 0%)" }}
        animate={{ clipPath: "inset(0 0 0 100%)" }}
        transition={{ duration: 0.95, ease: EASE, delay: 0.2 }}
      />
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10" initial={{ x: "0%", opacity: 1 }} animate={{ x: "100%", opacity: 0 }} transition={{ duration: 0.95, ease: EASE, delay: 0.2, opacity: { delay: 1.05, duration: 0.2 } }}>
        <span className="absolute inset-y-3 left-0 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-sky to-transparent shadow-[0_0_18px_rgb(122_209_244/0.9)]" />
      </motion.div>
    </>
  );
}
