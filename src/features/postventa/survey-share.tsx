"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "motion/react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { mailtoLink, whatsappLink } from "@/lib/domain";
import type { Client, Order, Survey } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { contactFor, surveyMessage, surveyUrl } from "./lib";
import { DialogPanel, outlineBtnCls } from "./ui";

export type SurveyTarget = { s: Survey; order: Order; client?: Client };

/** Manual sharing (doc §4.3/§8): we open the app on the device and never claim delivery. */
const NO_DELIVERY = "El envío es manual: no se confirma la entrega ni la lectura.";

export async function copySurveyLink(token: string) {
  const url = surveyUrl(token);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace de encuesta copiado", { description: url.replace(/^https?:\/\//, "") });
  } catch {
    toast.error("No se pudo copiar el enlace", { description: url });
  }
}

export function shareSurveyWhatsapp({ s, order, client }: SurveyTarget) {
  const contact = contactFor(order, client);
  if (!contact.phone) {
    toast.error("La orden no tiene teléfono de contacto");
    return;
  }
  const text = surveyMessage({ contactName: contact.name, folio: order.folio, title: order.title, url: surveyUrl(s.token) });
  window.open(whatsappLink(contact.phone, text), "_blank", "noopener,noreferrer");
  toast("Se abrió WhatsApp", { description: NO_DELIVERY });
}

export function shareSurveyEmail({ s, order, client }: SurveyTarget) {
  if (!client?.contactEmail) {
    toast.error("El cliente no tiene correo registrado");
    return;
  }
  const body = surveyMessage({ contactName: client.contactName, folio: order.folio, title: order.title, url: surveyUrl(s.token) });
  window.location.href = mailtoLink(client.contactEmail, `¿Cómo quedó su servicio ${order.folio}? · Pulkro`, body);
  toast("Se abrió su app de correo", { description: NO_DELIVERY });
}

/** QR to show on the supervisor's phone so the client answers on site. */
export function SurveyQrDialog({ target, onOpenChange }: { target: SurveyTarget | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      {target && <QrBody key={target.s.id} target={target} />}
    </Dialog>
  );
}

function QrBody({ target }: { target: SurveyTarget }) {
  const { s, order, client } = target;
  const url = surveyUrl(s.token);
  const [copied, setCopied] = useState(false);
  return (
    <DialogPanel title="Encuesta por QR" description={`${order.folio} · ${client?.shortName ?? order.title}`}>
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, rotate: -2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-aurora-frame grain rounded-[28px] p-2.5 shadow-lift"
        >
          {/* the code stays dark-on-light (with its quiet zone) in both themes: scanners need the contrast */}
          <div className="theme-light relative z-[2] rounded-[22px] bg-surface p-5">
            <QRCodeSVG value={url} size={220} level="H" marginSize={0} fgColor="#07243f" bgColor="#ffffff" title={`Encuesta ${order.folio}`} className="size-[200px] sm:size-[220px]" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-surface p-1.5">
              <PulkroMark className="size-9" />
            </span>
          </div>
        </motion.div>
        <p className="mt-5 max-w-xs text-center text-[14px] text-subtle">
          Pida al cliente que escanee el código con la cámara de su teléfono. No necesita instalar nada ni iniciar sesión.
        </p>
        <p className="mt-3 max-w-full truncate rounded-[10px] bg-soft px-3 py-1.5 text-[12.5px] text-ink/70 tabular">{url.replace(/^https?:\/\//, "")}</p>
        <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            className={outlineBtnCls}
            onClick={() => {
              void copySurveyLink(s.token).then(() => setCopied(true));
            }}
          >
            {copied ? <Check className="text-teal-fg" /> : <Copy />} {copied ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button variant="outline" className={outlineBtnCls} onClick={() => shareSurveyWhatsapp(target)}>
            <MessageCircle /> WhatsApp
          </Button>
          <Button variant="outline" className={outlineBtnCls} onClick={() => shareSurveyEmail(target)}>
            <Mail /> Correo
          </Button>
        </div>
      </div>
    </DialogPanel>
  );
}
