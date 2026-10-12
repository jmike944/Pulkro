"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "motion/react";
import { Check, CloudOff, Copy, Mail, MessageCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mailtoLink, whatsappLink } from "@/lib/domain";
import { isOffline, useAppStore } from "@/lib/store";
import { useIsOffline } from "@/lib/hooks";
import type { Client, Order, Survey } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { ModalShell } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { contactFor, surveyCreation, surveyLink, surveyLinkText, surveyMessage, surveyUrl, type SurveyLink } from "./lib";
import { REASON_POSTVENTA, outlineBtnCls } from "./ui";
import { useHeldTarget } from "./use-held-target";

export type SurveyTarget = { s: Survey; order: Order; client?: Client };

/** Manual sharing (doc §4.3/§8): we open the app on the device and never claim delivery. */
const NO_DELIVERY = "El envío es manual: no se confirma la entrega ni la lectura.";

/** Whether `s`'s link works yet (lib.ts surveyLink): in account sessions, once its creation reached the server. */
export function useSurveyLink(s: Survey): SurveyLink {
  const item = useAppStore((st) => surveyCreation(st.sync.queue, s.id));
  return useMemo(() => surveyLink(item), [item]);
}

/**
 * Every way of sharing a link goes through here: a link whose survey is not on the server yet is not handed out (it would
 * answer «No encontramos esta encuesta», for good if the server then refuses it). The buttons are off meanwhile; this also
 * covers any other caller.
 */
function linkWorks(s: Survey): boolean {
  const st = useAppStore.getState();
  const link = surveyLink(surveyCreation(st.sync.queue, s.id));
  if (link.state === "ready") return true;
  toast.message(link.state === "refused" ? "La encuesta no se activó" : "La encuesta aún no está activa", { description: surveyLinkText(link, isOffline(st)) });
  return false;
}

export async function copySurveyLink(s: Survey) {
  if (!linkWorks(s)) return false;
  const url = surveyUrl(s.token);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace de encuesta copiado", { description: url.replace(/^https?:\/\//, "") });
    return true;
  } catch {
    toast.error("No se pudo copiar el enlace", { description: `Cópielo manualmente: ${url}` });
    return false;
  }
}

export function shareSurveyWhatsapp({ s, order, client }: SurveyTarget) {
  if (!linkWorks(s)) return;
  const contact = contactFor(order, client);
  if (!contact.phone) {
    toast.error("La orden no tiene teléfono de contacto", { description: "Registre el teléfono en la orden o elija otro canal." });
    return;
  }
  const text = surveyMessage({ contactName: contact.name, folio: order.folio, title: order.title, url: surveyUrl(s.token) });
  window.open(whatsappLink(contact.phone, text), "_blank", "noopener,noreferrer");
  toast("Se abrió WhatsApp", { description: NO_DELIVERY });
}

export function shareSurveyEmail({ s, order, client }: SurveyTarget) {
  if (!linkWorks(s)) return;
  if (!client?.contactEmail) {
    toast.error("El cliente no tiene correo registrado", { description: "Agregue el correo en Configuración o elija otro canal." });
    return;
  }
  const body = surveyMessage({ contactName: client.contactName, folio: order.folio, title: order.title, url: surveyUrl(s.token) });
  window.location.href = mailtoLink(client.contactEmail, `¿Cómo quedó su servicio ${order.folio}? · Pulkro`, body);
  toast("Se abrió su app de correo", { description: NO_DELIVERY });
}

/**
 * QR to show on the supervisor's phone so the client answers on site.
 * Centered dialog on desktop, bottom sheet on phones; stays mounted while it closes (exit animation).
 */
export function SurveyQrDialog({ target, canManage, onOpenChange }: { target: SurveyTarget | null; canManage: boolean; onOpenChange: (open: boolean) => void }) {
  const { held, session } = useHeldTarget(target);
  if (!held) return null;
  return <QrBody key={session} open={!!target} target={held} canManage={canManage} onOpenChange={onOpenChange} />;
}

/** 48px on phones, 44px from lg: three share actions that stack on a phone and sit in a row from sm. */
const SHARE_BTN = cn(outlineBtnCls, "h-12 w-full lg:h-11");

function QrBody({ target, open, canManage, onOpenChange }: { target: SurveyTarget; open: boolean; canManage: boolean; onOpenChange: (open: boolean) => void }) {
  const { s, order, client } = target;
  const url = surveyUrl(s.token);
  const [copied, setCopied] = useState(false);
  // The code (and the link) only once the survey is on the server: the client would scan a link that does not work yet.
  const link = useSurveyLink(s);
  const offline = useIsOffline();
  const ready = link.state === "ready";
  const share = canManage && ready;
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Encuesta por QR"
      description={
        <>
          <b>{order.folio}</b> · {client?.shortName ?? order.title}
        </>
      }
      size="md"
    >
      <div className="flex flex-col items-center">
        {ready ? (
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
        ) : (
          <div
            role="status"
            className={cn(
              "flex size-[250px] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed px-6 text-center text-[14px] leading-snug sm:size-[270px]",
              link.state === "refused" ? "border-red-line bg-red-soft text-red-fg" : "border-amber-line bg-amber-wash text-ink",
            )}
          >
            {link.state === "refused" ? <TriangleAlert className="size-7" aria-hidden /> : <CloudOff className="size-7 text-amber-fg" aria-hidden />}
            <span>{surveyLinkText(link, offline)}</span>
          </div>
        )}
        <p className="mt-5 max-w-xs text-center text-[14px] text-subtle">
          {ready
            ? "Pida al cliente que escanee el código con la cámara de su teléfono. No necesita instalar nada ni iniciar sesión."
            : "El código aparece aquí en cuanto la encuesta esté activa en el servidor."}
        </p>
        {ready && <p className="mt-3 max-w-full truncate rounded-[10px] bg-soft px-3 py-1.5 text-[12.5px] text-ink/70 tabular">{url.replace(/^https?:\/\//, "")}</p>}
        <div className="mt-5 grid w-full gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            className={SHARE_BTN}
            disabled={!share}
            onClick={() => {
              void copySurveyLink(s).then((ok) => ok && setCopied(true));
            }}
          >
            {copied ? <Check className="text-teal-fg" /> : <Copy />} {copied ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button variant="outline" className={SHARE_BTN} disabled={!share} onClick={() => shareSurveyWhatsapp(target)}>
            <MessageCircle /> WhatsApp
          </Button>
          <Button variant="outline" className={SHARE_BTN} disabled={!share} onClick={() => shareSurveyEmail(target)}>
            <Mail /> Correo
          </Button>
        </div>
        {!canManage && <p className="mt-3 text-center text-[12.5px] leading-snug text-subtle">{REASON_POSTVENTA}</p>}
      </div>
    </ModalShell>
  );
}
