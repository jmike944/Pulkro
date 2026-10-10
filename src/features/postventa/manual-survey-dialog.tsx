"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import type { Client, Order, Survey, SurveyAnswers } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NpsPicker, StarInput } from "./rating";
import { DialogPanel, FieldLabel, inputCls, textareaCls } from "./ui";

export type ManualTarget = { order: Order; client?: Client };

/**
 * "Registro manual de comentarios" (doc §4.4): staff capture a survey answered by phone,
 * WhatsApp or in person. Reuses the pending survey of the order when there is one.
 */
export function ManualSurveyDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: ManualTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (survey: Survey, target: ManualTarget) => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      {target && (
        <ManualForm
          key={target.order.id}
          target={target}
          onDone={(sv) => {
            onOpenChange(false);
            if (sv) onSaved?.(sv, target);
          }}
        />
      )}
    </Dialog>
  );
}

const DETAIL: { key: "quality" | "punctuality" | "staff"; label: string }[] = [
  { key: "quality", label: "Calidad de la limpieza" },
  { key: "punctuality", label: "Puntualidad" },
  { key: "staff", label: "Trato del personal" },
];

function ManualForm({ target, onDone }: { target: ManualTarget; onDone: (sv?: Survey) => void }) {
  const { order, client } = target;
  const recordManualSurvey = useAppStore((s) => s.recordManualSurvey);
  const [overall, setOverall] = useState(0);
  const [detail, setDetail] = useState({ quality: 0, punctuality: 0, staff: 0 });
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(order.siteContact.name || client?.contactName || "");

  const missing = [!overall && "calificación general", nps === null && "recomendación", !name.trim() && "nombre de quien responde"].filter(Boolean) as string[];

  const save = () => {
    if (missing.length) {
      toast.error(`Falta: ${missing.join(", ")}`);
      return;
    }
    const answers: SurveyAnswers = {
      overall,
      quality: detail.quality || overall,
      punctuality: detail.punctuality || overall,
      staff: detail.staff || overall,
      nps: nps!,
      comment: comment.trim() || undefined,
    };
    const sv = recordManualSurvey(order.id, answers, name.trim());
    toast.success("Respuesta registrada", { description: `${order.folio} · ${overall}/5 · capturada manualmente` });
    onDone(sv);
  };

  return (
    <DialogPanel
      wide
      title="Registrar respuesta manual"
      description={`${order.folio} · ${client?.shortName ?? ""} — para respuestas recibidas por teléfono, WhatsApp o en sitio.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onDone()} className="h-11 rounded-[12px] px-5">
            Cancelar
          </Button>
          <Button onClick={save} className="h-11 rounded-[12px] px-5 font-semibold">
            Guardar respuesta
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-[20px] bg-soft px-4 py-5">
          <p className="text-center text-[14px] font-medium text-ink">¿Cómo calificó el servicio en general?</p>
          <StarInput value={overall} onChange={setOverall} size="md" label="Calificación general" showLabel className="mt-2" />
        </div>

        <AnimatePresence initial={false}>
          {overall > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-1 overflow-hidden">
              {DETAIL.map((d) => (
                <div key={d.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline py-2 last:border-0">
                  <span className="text-[14px] text-ink">{d.label}</span>
                  <StarInput value={detail[d.key]} onChange={(v) => setDetail((x) => ({ ...x, [d.key]: v }))} size="sm" label={d.label} />
                </div>
              ))}
              <p className="pt-1 text-[12.5px] text-subtle">Si no se preguntó un aspecto, se usa la calificación general.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <FieldLabel>¿Qué tan probable es que nos recomiende?</FieldLabel>
          <NpsPicker value={nps} onChange={setNps} />
        </div>

        <div>
          <FieldLabel htmlFor="ms-comment" hint="Opcional">
            Comentario del cliente
          </FieldLabel>
          <Textarea id="ms-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escriba lo que comentó el cliente, con sus palabras…" className={textareaCls} />
        </div>

        <div>
          <FieldLabel htmlFor="ms-name">Respondió</FieldLabel>
          <Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de quien respondió" className={inputCls} />
        </div>
      </div>
    </DialogPanel>
  );
}
