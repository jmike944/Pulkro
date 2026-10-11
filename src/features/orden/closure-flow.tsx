"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMark } from "@/components/pk/client-mark";
import { ClockWarning } from "@/components/pk/clock-warning";
import { BigButton, FieldCaption, FlowScreen, SuccessHero } from "@/components/pk/mobile";
import { EASE } from "@/components/pk/motion";
import { useOrder } from "./order-context";
import { ConfirmCheck } from "./ui";
import type { ClosureDone, ClosureDraft } from "./closure-model";
import {
  ClosedOrderCard,
  ClosureChecklist,
  ConformityFields,
  ConformityPaper,
  ExceptionPanel,
  HardBlockNotice,
  OfflineNote,
  SummaryField,
  type NavigateHandler,
} from "./closure-parts";

type Step = 0 | 1 | 2;
const STEPS = 3;

/**
 * "Validar cierre" on phones and tablets: a FlowScreen in three steps — revisión (checklist + exception) →
 * conformidad y firma → confirmar (description, what the report will show, declaration) — ending in a success
 * screen whose primary action is "Generar reporte". The draft lives in the dialog session, so stepping back and
 * forth keeps the signature and the text.
 */
export function ClosureFlow({
  open,
  onOpenChange,
  draft,
  done,
  onValidate,
  onNavigate,
  onIncidents,
  onClose,
}: {
  open: boolean;
  /** guarded: asks "¿Descartar cambios?" while the draft holds work */
  onOpenChange: (v: boolean) => void;
  draft: ClosureDraft;
  done: ClosureDone | null;
  onValidate: () => void;
  onNavigate: NavigateHandler;
  onIncidents?: () => void;
  /** closes the success screen */
  onClose: () => void;
}) {
  const { d } = useOrder();
  const { order, user } = d;
  const [step, setStep] = useState<Step>(0);
  const [reached, setReached] = useState<Step>(0);
  const [moved, setMoved] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const screen = done ? "done" : step;

  const go = (s: Step) => {
    setStep(s);
    setReached((r) => (s > r ? s : r));
    setMoved(true);
  };

  // A new step starts at the top of the scroll body, with focus on its heading (the whole success screen once validated)
  // so screen readers announce what changed.
  useEffect(() => {
    bodyRef.current?.parentElement?.scrollTo({ top: 0 });
    if (screen === "done") bodyRef.current?.focus({ preventScroll: true });
    else if (moved) headingRef.current?.focus({ preventScroll: true });
  }, [screen, moved]);

  const eyebrow = (
    <>
      <ClientMark name={d.client.name} hue={d.client.hue} size={22} className="rounded-[6px]" />
      <span className="truncate tabular">
        {order.folio} · Paso {step + 1} de {STEPS}
      </span>
    </>
  );

  /* ── success ── */
  if (done)
    return (
      <FlowScreen
        open={open}
        onOpenChange={onOpenChange}
        description="Cierre validado"
        footer={
          <div className="grid gap-2.5">
            {d.perms.share && (
              <BigButton href={`/ordenes/${order.folio}/reporte`}>
                <FileText /> Generar reporte
              </BigButton>
            )}
            <BigButton variant="outline" onClick={onClose}>
              Volver a la orden
            </BigButton>
          </div>
        }
      >
        <div ref={bodyRef} tabIndex={-1} className="pb-2 outline-none">
          <SuccessHero title="Cierre validado">
            {order.folio} quedó Finalizada.{" "}
            {d.perms.share ? `Genere el reporte v${done.nextVersion} para enviarlo al cliente.` : "El supervisor genera el reporte para el cliente."}
            {done.offline && " Se guardó en este dispositivo y se sincroniza al volver la señal."}
          </SuccessHero>
          <ClosedOrderCard className="mt-8" d={d} done={done} />
        </div>
      </FlowScreen>
    );

  const warns = draft.rows.some((r) => r.state === "warn");
  const footer =
    step === 0 ? (
      <StepFooter hint={draft.reviewHint}>
        <BigButton onClick={() => go(1)} disabled={!draft.reviewOk}>
          Continuar
        </BigButton>
      </StepFooter>
    ) : step === 1 ? (
      <StepFooter hint={draft.conformityHint} onBack={() => go(0)}>
        <BigButton onClick={() => go(2)} disabled={!draft.conformityOk}>
          Continuar
        </BigButton>
      </StepFooter>
    ) : (
      <StepFooter hint={draft.missing} onBack={() => go(1)}>
        <BigButton onClick={onValidate} disabled={!draft.valid}>
          <Check /> Validar cierre
        </BigButton>
      </StepFooter>
    );

  return (
    <FlowScreen open={open} onOpenChange={onOpenChange} title="Validar cierre" description={`Validar cierre de ${order.folio}`} footer={footer}>
      <motion.div ref={bodyRef} key={step} initial={moved ? { opacity: 0, x: 14 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, ease: EASE }}>
        {step === 0 && (
          <>
            <StepHeading ref={headingRef} eyebrow={eyebrow} title="Revise la evidencia">
              {draft.hardBlock
                ? "Hay pendientes que impiden el cierre."
                : draft.photosMissing
                  ? "Faltan fotos obligatorias: solo puede cerrar con una excepción justificada."
                  : warns
                    ? "Nada impide el cierre. Revise los avisos antes de continuar."
                    : "Todo lo que exige el cierre está completo."}
            </StepHeading>
            <ClosureChecklist rows={draft.rows} intro={reached === 0} onNavigate={onNavigate} />
            {draft.hardBlock ? (
              <HardBlockNotice className="mt-5" onIncidents={onIncidents} />
            ) : (
              draft.photosMissing && <ExceptionPanel className="mt-5" draft={draft} userName={user.name} />
            )}
          </>
        )}

        {step === 1 && (
          <>
            <StepHeading ref={headingRef} eyebrow={eyebrow} title="Conformidad del cliente">
              Registre quién aceptó el servicio y cómo. Aparece en el reporte.
            </StepHeading>
            <ConformityFields draft={draft} />
          </>
        )}

        {step === 2 && (
          <>
            <StepHeading ref={headingRef} eyebrow={eyebrow} title="Confirme el cierre">
              Al validar, {order.folio} pasa a <b className="font-semibold text-ink">Finalizada</b> y queda lista para el reporte v{draft.nextVersion}.
            </StepHeading>
            <SummaryField draft={draft} />
            <div className="mt-6">
              <FieldCaption>Así aparece en el reporte</FieldCaption>
              <ConformityPaper
                conformity={draft}
                exception={draft.photosMissing ? { reason: draft.exception.trim(), by: user.name } : undefined}
              />
            </div>
            <ClockWarning className="mt-5" />
            {draft.offline && <OfflineNote className="mt-5" />}
            <div className="mt-5">
              <ConfirmCheck checked={draft.confirmed} onChange={draft.setConfirmed}>
                Confirmo que el servicio se ejecutó conforme a la orden y que la evidencia es correcta.
              </ConfirmCheck>
            </div>
          </>
        )}
      </motion.div>
    </FlowScreen>
  );
}

/** FlowHeading with a focusable title (focus moves here on every step). */
function StepHeading({
  ref,
  eyebrow,
  title,
  children,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center gap-2 text-[14px] text-subtle">{eyebrow}</div>
      <h2 ref={ref} tabIndex={-1} className="font-serif text-[30px] font-medium leading-[1.12] tracking-[-0.01em] text-ink outline-none">
        {title}
      </h2>
      {children && <div className="mt-2.5 text-[15.5px] leading-relaxed text-subtle">{children}</div>}
    </div>
  );
}

/** What is still missing (above the buttons, announced politely) + a square "Paso anterior" button + the primary. */
function StepFooter({ hint, onBack, children }: { hint?: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p aria-live="polite" className={cn("text-center text-[13.5px] leading-snug text-subtle", !hint && "sr-only")}>
        {hint}
      </p>
      <div className="flex gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver al paso anterior"
            className="inline-flex size-[54px] shrink-0 items-center justify-center rounded-[14px] border border-line-strong bg-surface text-ink outline-none transition hover:bg-sand/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
