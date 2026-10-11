"use client";

import { useState } from "react";
import { Archive, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { fmtDateTime, plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { IconTile } from "@/components/pk/bits";
import { ModalCancel } from "@/components/pk/modal-shell";
import { useOpenSession } from "@/components/pk/use-open-session";
import { Button } from "@/components/ui/button";
import { useOrder } from "./order-context";
import { ConfirmCheck, DialogActions, OrderDialog, ReasonField, SummaryRows } from "./ui";

/*
 * Each dialog keys its form on the open session (a fresh form on every open, kept mounted while it animates out) and
 * passes `dirty` to the shell: a typed reason or a ticked confirmation makes Esc / outside tap / X / the secondary
 * button ask "¿Descartar cambios?" first.
 */

type DialogProps = { open: boolean; onOpenChange: (v: boolean) => void };

/** Cancelar orden — required reason (doc §3: every change records user, date and reason). */
export function CancelDialog({ open, onOpenChange }: DialogProps) {
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <CancelForm key={session} open={open} onOpenChange={onOpenChange} />;
}

function CancelForm({ open, onOpenChange }: DialogProps) {
  const onDone = () => onOpenChange(false);
  const { d } = useOrder();
  const { order, client, pendingJornadas, jornadas } = d;
  const cancelOrder = useAppStore((s) => s.cancelOrder);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const executed = jornadas.filter((j) => j.checkIn).length;
  const valid = reason.trim().length >= 5 && confirmed;

  const submit = () => {
    if (!valid) return;
    cancelOrder(order.id, reason.trim());
    toast.success(`${order.folio} cancelada`, { description: "El motivo quedó registrado en la actividad." });
    onDone();
  };

  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="red" className="size-11 rounded-[13px] [&_svg]:size-5">
          <Ban />
        </IconTile>
      }
      title={`Cancelar ${order.folio}`}
      description="La orden dejará de estar activa y sus jornadas pendientes no se ejecutarán. Los registros capturados se conservan en el historial."
      dirty={reason.trim().length > 0 || confirmed}
    >
      <div className="space-y-5">
        <SummaryRows
          rows={[
            { k: "Cliente", v: client.name },
            { k: "Estado actual", v: ORDER_STATUS[order.status].label },
            { k: "Jornadas pendientes", v: pendingJornadas.length, tone: pendingJornadas.length ? "warn" : "ok" },
            { k: "Jornadas ejecutadas", v: executed, tone: executed ? "warn" : "ok" },
          ]}
        />
        <ReasonField
          value={reason}
          onChange={setReason}
          id="cancel-reason"
          suggestions={["El cliente canceló el servicio", "Orden duplicada", "Fuera del alcance autorizado"]}
        />
        <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
          Entiendo que la orden quedará <b className="font-semibold">cancelada</b> y que no se ejecutarán las jornadas pendientes.
        </ConfirmCheck>
        <DialogActions hint={!reason.trim() ? "Indique el motivo" : !confirmed ? "Marque la casilla de confirmación" : undefined}>
          <ModalCancel>Volver</ModalCancel>
          <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] bg-st-red px-5 font-semibold text-white hover:bg-st-red/90">
            Cancelar orden
          </Button>
        </DialogActions>
      </div>
    </OrderDialog>
  );
}

/** Reabrir — edits after closure create a new report version (doc §8). */
export function ReopenDialog({ open, onOpenChange }: DialogProps) {
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <ReopenForm key={session} open={open} onOpenChange={onOpenChange} />;
}

function ReopenForm({ open, onOpenChange }: DialogProps) {
  const onDone = () => onOpenChange(false);
  const { d } = useOrder();
  const { order, reports, lk } = d;
  const reopenOrder = useAppStore((s) => s.reopenOrder);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const latest = reports[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  const shares = reports.reduce((s, r) => s + r.shares.length, 0);
  const valid = reason.trim().length >= 5 && confirmed;

  const submit = () => {
    if (!valid) return;
    // A refusal (e.g. the supervisor now belongs to another unit) is toasted by the store: keep the form open.
    if (!reopenOrder(order.id, reason.trim())) return;
    toast.success(`${order.folio} reabierta`, { description: `El cierre anterior ya no vale: valídelo de nuevo para emitir el reporte v${nextVersion}.` });
    onDone();
  };

  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="violet" className="size-11 rounded-[13px] [&_svg]:size-5">
          <RotateCcw />
        </IconTile>
      }
      title={`Reabrir ${order.folio}`}
      description={
        <>
          La orden vuelve a edición y <b>el cierre deberá validarse de nuevo</b> antes de generar el <b>reporte v{nextVersion}</b>; las versiones anteriores y sus envíos se
          conservan en el historial.
        </>
      }
      dirty={reason.trim().length > 0 || confirmed}
    >
      <div className="space-y-5">
        <SummaryRows
          rows={[
            {
              k: "Cierre validado",
              v: order.closure ? `${fmtDateTime(order.closure.validatedAt)} · ${lk.users.get(order.closure.validatedBy)?.name.split(" ")[0] ?? ""}` : "—",
            },
            { k: "Reporte vigente", v: latest ? `v${latest.version}` : "Sin generar" },
            { k: "Envíos registrados", v: shares ? plural(shares, "envío", "envíos") : "Ninguno" },
            { k: "Estado actual", v: ORDER_STATUS[order.status].label },
          ]}
        />
        <ReasonField
          value={reason}
          onChange={setReason}
          id="reopen-reason"
          suggestions={["Corrección de datos del reporte", "Queja del cliente: repaso de áreas", "Fotos adicionales solicitadas"]}
        />
        <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
          Entiendo que debo <b className="font-semibold">validar el cierre otra vez</b> para generar una nueva versión del reporte y que el cambio queda auditado.
        </ConfirmCheck>
        <DialogActions hint={!reason.trim() ? "Indique el motivo" : !confirmed ? "Marque la casilla de confirmación" : undefined}>
          <ModalCancel />
          <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
            <RotateCcw className="size-4" /> Reabrir orden
          </Button>
        </DialogActions>
      </div>
    </OrderDialog>
  );
}

/** Pre-filled archive reason: only a different reason (or the ticked confirmation) is work worth asking about. */
const ARCHIVE_REASON = "Ciclo postventa completo";

/** Archivar — closes the post-sale cycle of an order with its report sent (reporte enviado / seguimiento, no open cases). */
export function ArchiveDialog({ open, onOpenChange }: DialogProps) {
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <ArchiveForm key={session} open={open} onOpenChange={onOpenChange} />;
}

function ArchiveForm({ open, onOpenChange }: DialogProps) {
  const onDone = () => onOpenChange(false);
  const { d } = useOrder();
  const { order, client, reports, surveys, cases } = d;
  const archiveOrder = useAppStore((s) => s.archiveOrder);
  const [reason, setReason] = useState(ARCHIVE_REASON);
  const [confirmed, setConfirmed] = useState(false);
  const answered = surveys.filter((s) => s.respondedAt).length;
  const valid = reason.trim().length >= 5 && confirmed;

  const submit = () => {
    if (!valid) return;
    archiveOrder(order.id, reason.trim());
    toast.success(`${order.folio} archivada`, { description: "Se conserva en el historial; el motivo quedó en la actividad." });
    onDone();
  };

  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="navy" className="size-11 rounded-[13px] [&_svg]:size-5">
          <Archive />
        </IconTile>
      }
      title={`Archivar ${order.folio}`}
      description="El ciclo de la orden queda completo: ya no aparece entre las abiertas y se conserva en el historial con su reporte, evidencia y bitácora."
      dirty={reason.trim() !== ARCHIVE_REASON || confirmed}
    >
      <div className="space-y-5">
        <SummaryRows
          rows={[
            { k: "Cliente", v: client.name },
            { k: "Estado actual", v: ORDER_STATUS[order.status].label },
            { k: "Reporte vigente", v: reports[0] ? `v${reports[0].version}` : "Sin generar" },
            { k: "Encuestas respondidas", v: `${answered} de ${surveys.length}`, tone: surveys.length > answered ? "warn" : "ok" },
            { k: "Casos postventa", v: cases.length ? `${cases.length} · todos resueltos` : "Ninguno", tone: "ok" },
          ]}
        />
        <ReasonField value={reason} onChange={setReason} id="archive-reason" suggestions={[ARCHIVE_REASON, "Cliente conforme, sin seguimiento pendiente"]} />
        <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
          Entiendo que la orden <b className="font-semibold">sale de las abiertas</b>. Para hacer cambios deberá reabrirse.
        </ConfirmCheck>
        <DialogActions hint={!reason.trim() ? "Indique el motivo" : !confirmed ? "Marque la casilla de confirmación" : undefined}>
          <ModalCancel />
          <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
            <Archive className="size-4" /> Archivar orden
          </Button>
        </DialogActions>
      </div>
    </OrderDialog>
  );
}
