"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, FileText } from "lucide-react";
import { useMediaQuery } from "@/lib/hooks";
import { PulkroMark } from "@/components/pk/brand";
import { IconTile } from "@/components/pk/bits";
import { ClockWarning } from "@/components/pk/clock-warning";
import { MODAL_DESKTOP_QUERY, ModalCancel, ModalShell, useDiscardGuard } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { useOrder } from "./order-context";
import { ConfirmCheck } from "./ui";
import { useClosureDraft, type ClosureDone, type ClosureDraft } from "./closure-model";
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
import { ClosureFlow } from "./closure-flow";

/**
 * "Validar cierre" ("Submit claim" reference). Only the supervisor authorizes (doc §2); the rules live in
 * domain.closureBlockers() and store.validateClosure (doc §8).
 *
 *   desktop (≥ lg)  one ModalShell dialog: checklist, exception, conformity + signature, description, declaration
 *   phone / tablet  FlowScreen in three steps (closure-flow.tsx)
 *
 * Both end on a success state with "Generar reporte" as the next step, and both ask "¿Descartar cambios?" before an
 * Esc, an outside tap, the X or a checklist link throws away the signature or the text.
 */
export function ClosureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // Every opening starts from a clean draft: a new session remounts it, closing keeps it mounted for the exit animation.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return <ClosureSession key={session} open={open} onOpenChange={onOpenChange} />;
}

type SurfaceProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: ClosureDraft;
  done: ClosureDone | null;
  onValidate: () => void;
  onNavigate: NavigateHandler;
  onIncidents?: () => void;
};

/** One opening of the dialog: the draft, the success state and the discard guard survive a rotation across lg. */
function ClosureSession({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { d, ui } = useOrder();
  const router = useRouter();
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const draft = useClosureDraft(d);
  const [done, setDone] = useState<ClosureDone | null>(null);
  // Validating closes the gate (the order is Finalizada), so the page's `open` drops to false: hold the success screen up.
  const [hold, setHold] = useState(false);
  // Where to go once the dialog is closed (a checklist link), run after the discard prompt if there is one.
  const after = useRef<(() => void) | null>(null);

  const close = (v: boolean) => {
    if (v) return onOpenChange(true);
    const then = after.current;
    after.current = null;
    setHold(false);
    onOpenChange(false);
    then?.();
  };
  const guard = useDiscardGuard(!done && draft.dirty, close);
  /** Esc, outside tap, X, Cancelar: never carries a pending navigation. */
  const onRootChange = (v: boolean) => {
    if (!v) after.current = null;
    guard.onOpenChange(v);
  };
  const leave = (then: () => void) => {
    after.current = then;
    guard.requestClose();
  };
  const onNavigate: NavigateHandler = (e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opens elsewhere: the dialog stays
    e.preventDefault();
    leave(() => router.push(href));
  };
  const onIncidents = d.openIncidents.some((i) => i.blocksClosure) ? () => leave(() => ui.setTab("incidencias", { scroll: true })) : undefined;

  const validate = () => {
    after.current = null; // a link the user decided not to follow ("Seguir editando") must not run when the success screen closes
    setHold(true);
    const result = draft.submit();
    setDone(result);
    if (!result) setHold(false);
  };

  const props: SurfaceProps = { open: open || hold, onOpenChange: onRootChange, draft, done, onValidate: validate, onNavigate, onIncidents };
  return (
    <>
      {isDesktop ? <ClosureModal {...props} /> : <ClosureFlow {...props} onClose={() => close(false)} />}
      {guard.prompt}
    </>
  );
}

/* ───────────── desktop ───────────── */

function ClosureModal({ open, onOpenChange, draft, done, onValidate, onNavigate, onIncidents }: SurfaceProps) {
  const { d } = useOrder();
  const { order, user, reports } = d;
  const reportHref = `/ordenes/${order.folio}/reporte`;
  const nextRef = useRef<HTMLAnchorElement>(null);
  // The "Validar cierre" button is gone once validated: hand focus to the next step instead of dropping it on the page.
  useEffect(() => {
    if (done) nextRef.current?.focus();
  }, [done]);

  if (done)
    return (
      <ModalShell
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        icon={
          <IconTile tone="teal" className="size-11 rounded-[13px] [&_svg]:size-5">
            <CircleCheck />
          </IconTile>
        }
        title="Cierre validado"
        description={
          <>
            {order.folio} quedó <b>Finalizada</b>.{" "}
            {d.perms.share ? (
              <>
                El siguiente paso es generar el <b>reporte v{done.nextVersion}</b> para el cliente.
              </>
            ) : (
              "El supervisor genera el reporte para el cliente."
            )}
            {done.offline && " Se guardó en este dispositivo y se sincroniza al reconectar."}
          </>
        }
        footer={
          <>
            <ModalCancel>Cerrar</ModalCancel>
            {d.perms.share && (
              <Button asChild className="h-11 rounded-[12px] px-5 font-semibold">
                <Link ref={nextRef} href={reportHref}>
                  <FileText className="size-4" /> Generar reporte
                </Link>
              </Button>
            )}
          </>
        }
      >
        <ClosedOrderCard d={d} done={done} />
        <ConformityPaper className="mt-4" conformity={done} />
      </ModalShell>
    );

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<PulkroMark className="size-11 rounded-[13px]" />}
      title={`Validar cierre de ${order.folio}`}
      description={
        <>
          Revise la evidencia y registre la conformidad del cliente. Al validar, la orden pasa a <b>Finalizada</b> y queda lista para generar el <b>reporte único</b> del
          servicio{reports.length ? ` (v${draft.nextVersion})` : ""}.
        </>
      }
      footerHint={draft.missing}
      footer={
        <>
          <ModalCancel>{draft.hardBlock ? "Cerrar" : "Cancelar"}</ModalCancel>
          <Button onClick={onValidate} disabled={!draft.valid} className="h-11 rounded-[12px] px-5 font-semibold">
            <Check className="size-4" /> Validar cierre
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <SectionCaption>Revisión</SectionCaption>
          <ClosureChecklist rows={draft.rows} onNavigate={onNavigate} />
        </section>

        {draft.hardBlock ? (
          <HardBlockNotice onIncidents={onIncidents} />
        ) : (
          <>
            {draft.photosMissing && <ExceptionPanel draft={draft} userName={user.name} />}
            <section>
              <SectionCaption>Conformidad del cliente</SectionCaption>
              <ConformityFields draft={draft} />
            </section>
            <SummaryField draft={draft} />
            <ClockWarning />
            {draft.offline && <OfflineNote />}
            <ConfirmCheck checked={draft.confirmed} onChange={draft.setConfirmed}>
              Confirmo que el servicio se ejecutó conforme a la orden y que la evidencia es correcta.
            </ConfirmCheck>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function SectionCaption({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{children}</p>;
}
