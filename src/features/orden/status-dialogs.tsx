"use client";

import { useState } from "react";
import { Archive, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { fmtDateTime, plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { IconTile } from "@/components/pk/bits";
import { Button } from "@/components/ui/button";
import { useOrder } from "./order-context";
import { ConfirmCheck, DialogActions, OrderDialog, ReasonField, SummaryRows } from "./ui";

/** Cancelar orden — required reason (doc §3: every change records user, date and reason). */
export function CancelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="red" className="size-11 rounded-[13px] [&_svg]:size-5">
          <Ban />
        </IconTile>
      }
      title={`Cancelar ${d.order.folio}`}
      description="La orden dejará de estar activa y sus jornadas pendientes no se ejecutarán. Los registros capturados se conservan en el historial."
    >
      <CancelForm onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function CancelForm({ onDone }: { onDone: () => void }) {
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
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-line px-5 font-semibold">
          Volver
        </Button>
        <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] bg-st-red px-5 font-semibold text-white hover:bg-st-red/90">
          Cancelar orden
        </Button>
      </DialogActions>
    </div>
  );
}

/** Reabrir — edits after closure create a new report version (doc §8). */
export function ReopenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  const nextVersion = (d.reports[0]?.version ?? 0) + 1;
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="violet" className="size-11 rounded-[13px] [&_svg]:size-5">
          <RotateCcw />
        </IconTile>
      }
      title={`Reabrir ${d.order.folio}`}
      description={
        <>
          La orden vuelve a edición y <b>el cierre deberá validarse de nuevo</b> antes de generar el <b>reporte v{nextVersion}</b>; las versiones anteriores y sus envíos se
          conservan en el historial.
        </>
      }
    >
      <ReopenForm onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function ReopenForm({ onDone }: { onDone: () => void }) {
  const { d } = useOrder();
  const { order, reports, lk } = d;
  const reopenOrder = useAppStore((s) => s.reopenOrder);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const latest = reports[0];
  const shares = reports.reduce((s, r) => s + r.shares.length, 0);
  const valid = reason.trim().length >= 5 && confirmed;

  const submit = () => {
    if (!valid) return;
    reopenOrder(order.id, reason.trim());
    toast.success(`${order.folio} reabierta`, { description: `El cierre anterior ya no vale: valídelo de nuevo para emitir el reporte v${(latest?.version ?? 0) + 1}.` });
    onDone();
  };

  return (
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
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-line px-5 font-semibold">
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          <RotateCcw className="size-4" /> Reabrir orden
        </Button>
      </DialogActions>
    </div>
  );
}

/** Archivar — closes the post-sale cycle of an order with its report sent (reporte enviado / seguimiento, no open cases). */
export function ArchiveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        <IconTile tone="navy" className="size-11 rounded-[13px] [&_svg]:size-5">
          <Archive />
        </IconTile>
      }
      title={`Archivar ${d.order.folio}`}
      description="El ciclo de la orden queda completo: ya no aparece entre las abiertas y se conserva en el historial con su reporte, evidencia y bitácora."
    >
      <ArchiveForm onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function ArchiveForm({ onDone }: { onDone: () => void }) {
  const { d } = useOrder();
  const { order, client, reports, surveys, cases } = d;
  const archiveOrder = useAppStore((s) => s.archiveOrder);
  const [reason, setReason] = useState("Ciclo postventa completo");
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
      <ReasonField value={reason} onChange={setReason} id="archive-reason" suggestions={["Ciclo postventa completo", "Cliente conforme, sin seguimiento pendiente"]} />
      <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
        Entiendo que la orden <b className="font-semibold">sale de las abiertas</b>. Para hacer cambios deberá reabrirse.
      </ConfirmCheck>
      <DialogActions hint={!reason.trim() ? "Indique el motivo" : !confirmed ? "Marque la casilla de confirmación" : undefined}>
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-line px-5 font-semibold">
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          <Archive className="size-4" /> Archivar orden
        </Button>
      </DialogActions>
    </div>
  );
}
