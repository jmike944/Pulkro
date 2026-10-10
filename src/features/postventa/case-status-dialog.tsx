"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { CASE_CATEGORY, CASE_STATUS } from "@/lib/status";
import type { CaseStatus, Client, PostSaleCase, User } from "@/lib/types";
import { KeyValues } from "@/components/pk/bits";
import { TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CASE_FLOW } from "./lib";
import { DialogPanel, FieldLabel, textareaCls } from "./ui";

export type CaseMove = { c: PostSaleCase; client?: Client; owner?: User; to: CaseStatus };

/** Which status changes need a confirmation step (resolution text, client agreement or a reason). */
export function moveNeedsDialog(c: PostSaleCase, to: CaseStatus) {
  if (to === "resuelto" || to === "cerrado") return true;
  // Going back from a resolved/closed case = reopening → reason required (doc §3).
  return CASE_FLOW.indexOf(to) < CASE_FLOW.indexOf(c.status) && (c.status === "resuelto" || c.status === "cerrado");
}

/** Apply a status change that needs no extra input. Returns the toast copy. */
export function quickMove(updateCase: (id: string, patch: Partial<PostSaleCase>, note?: string) => void, c: PostSaleCase, to: CaseStatus) {
  const note = to === "en_proceso" ? "Cambió el caso a En proceso." : `Regresó el caso a ${CASE_STATUS[to].label}.`;
  updateCase(c.id, { status: to }, note);
  toast.success(`${c.folio} · ${CASE_STATUS[to].label}`);
}

/**
 * Confirmation for resolving, closing (client agreement checkbox) or reopening a case.
 * Mounts its form only while open so every opening starts clean.
 */
export function CaseStatusDialog({ move, onOpenChange }: { move: CaseMove | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!move} onOpenChange={onOpenChange}>
      {move && <CaseStatusForm key={`${move.c.id}-${move.to}`} move={move} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function CaseStatusForm({ move, onDone }: { move: CaseMove; onDone: () => void }) {
  const { c, client, owner, to } = move;
  const updateCase = useAppStore((s) => s.updateCase);
  const [text, setText] = useState("");
  const [agreed, setAgreed] = useState(false);

  const reopening = to !== "resuelto" && to !== "cerrado";
  const needsResolution = to === "resuelto" || (to === "cerrado" && !c.resolution);
  const textOk = text.trim().length >= 10;
  const canSubmit = (needsResolution || reopening ? textOk : true) && (to === "cerrado" ? agreed : true);

  const submit = () => {
    if (!canSubmit) return;
    const t = text.trim();
    if (to === "resuelto") {
      updateCase(c.id, { status: "resuelto", resolution: t }, `Resolución registrada: ${t}`);
      toast.success(`${c.folio} resuelto`, { description: "Falta confirmar la conformidad del cliente para cerrarlo." });
    } else if (to === "cerrado") {
      updateCase(c.id, { status: "cerrado", ...(needsResolution ? { resolution: t } : {}) }, "Cerró el caso: el cliente confirmó su conformidad.");
      useUi.getState().fireCelebrate();
      toast.success(`${c.folio} cerrado`, { description: "Caso concluido con conformidad del cliente." });
    } else {
      updateCase(c.id, { status: to }, `Reabrió el caso: ${t}`);
      toast.success(`${c.folio} reabierto`, { description: `Estado: ${CASE_STATUS[to].label}` });
    }
    onDone();
  };

  const title = to === "resuelto" ? "Marcar como resuelto" : to === "cerrado" ? "Cerrar caso" : "Reabrir caso";
  const description =
    to === "resuelto"
      ? "Describa qué se hizo para atender la queja. Quedará en el historial del caso."
      : to === "cerrado"
        ? "Cierre el caso solo cuando el cliente haya confirmado que la resolución le satisface."
        : "Indique por qué se reabre. El cambio queda registrado con su usuario y fecha.";

  return (
    <DialogPanel
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] px-5">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit} className="h-11 rounded-[12px] px-5 font-semibold">
            {title}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-[18px] border border-hairline bg-wash p-4">
          <KeyValues
            rows={[
              { k: "Caso", v: <span className="tabular">{c.folio}</span> },
              { k: "Cliente", v: client?.shortName ?? "—" },
              { k: "Categoría", v: CASE_CATEGORY[c.category] },
              { k: "Responsable", v: owner?.name ?? "—" },
              {
                k: "Cambio",
                v: (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <TonePill tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</TonePill>
                    <span className="text-subtle">→</span>
                    <TonePill tone={CASE_STATUS[to].tone}>{CASE_STATUS[to].label}</TonePill>
                  </span>
                ),
              },
              ...(to === "cerrado" && c.resolution ? [{ k: "Resolución", v: <span className="line-clamp-3 text-left font-normal">{c.resolution}</span> }] : []),
            ]}
          />
        </div>

        {(needsResolution || reopening) && (
          <div>
            <FieldLabel htmlFor="case-move-text" hint={textOk ? undefined : "Mínimo 10 caracteres"}>
              {reopening ? "Motivo" : "Resolución"}
            </FieldLabel>
            <Textarea
              id="case-move-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reopening ? "El cliente reporta que el problema persiste…" : "Se programó un repaso sin costo y el cliente quedó conforme…"}
              className={textareaCls}
            />
          </div>
        )}

        {to === "cerrado" && (
          <motion.label
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-blue-wash p-4 text-[14px]"
          >
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5 size-5 rounded-[6px]" />
            <span>
              <span className="block font-semibold text-ink">El cliente confirmó su conformidad</span>
              <span className="text-subtle">Por teléfono, WhatsApp, correo o en sitio. Quedará registrado en el historial.</span>
            </span>
          </motion.label>
        )}
      </div>
    </DialogPanel>
  );
}
