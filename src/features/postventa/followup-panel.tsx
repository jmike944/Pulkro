"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Copy, Link2, Mail, MessageCircle, NotebookPen, QrCode, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { fmtAgo, plural } from "@/lib/format";
import { SHARE_CHANNEL } from "@/lib/status";
import type { ShareChannel } from "@/lib/types";
import { DateBadge, Insight } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { SoftBadge } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { channelText, contactFor, inLastDays } from "./lib";
import { ManualSurveyDialog, type ManualTarget } from "./manual-survey-dialog";
import { SurveyQrDialog, copySurveyLink, shareSurveyEmail, shareSurveyWhatsapp, type SurveyTarget } from "./survey-share";
import type { FollowUpRow } from "./use-postventa";
import { Gate, REASON_POSTVENTA, menuItemCls, outlineBtnCls } from "./ui";

/** How far back "recent" goes for orders still waiting for a survey. */
export const FOLLOW_UP_DAYS = 45;

type GenerateMode = "whatsapp" | "email" | "qr" | "link";
const MODE_CHANNEL: Record<GenerateMode, ShareChannel> = { whatsapp: "whatsapp", email: "email", qr: "descarga", link: "descarga" };

/** Rows that belong in "Por dar seguimiento": closed + report shared + no survey + recent. */
export function pendingFollowUps(rows: FollowUpRow[], now: Date, focusOrderId?: string) {
  return rows.filter((r) => !r.survey && ((r.sharedAt && inLastDays(r.sharedAt, FOLLOW_UP_DAYS, now)) || r.order.id === focusOrderId));
}

export function FollowUpPanel({
  rows,
  now,
  canManage,
  focusOrderId,
}: {
  rows: FollowUpRow[];
  now: Date;
  canManage: boolean;
  focusOrderId?: string;
}) {
  const createSurvey = useAppStore((s) => s.createSurvey);
  /** Orders whose survey was generated here — they stay on screen with their share options. */
  const [generated, setGenerated] = useState<string[]>([]);
  const [qr, setQr] = useState<SurveyTarget | null>(null);
  const [manual, setManual] = useState<ManualTarget | null>(null);

  const visible = useMemo(() => {
    const pending = new Set(pendingFollowUps(rows, now, focusOrderId).map((r) => r.order.id));
    return rows.filter((r) => pending.has(r.order.id) || generated.includes(r.order.id));
  }, [rows, now, focusOrderId, generated]);

  const generate = (r: FollowUpRow, mode: GenerateMode) => {
    if (!canManage) return;
    const s = createSurvey(r.order.id, MODE_CHANNEL[mode]);
    setGenerated((g) => [...g, r.order.id]);
    const target: SurveyTarget = { s, order: r.order, client: r.client };
    if (mode === "whatsapp") shareSurveyWhatsapp(target);
    else if (mode === "email") shareSurveyEmail(target);
    else if (mode === "qr") setQr(target);
    else void copySurveyLink(s.token);
    toast.success(`Encuesta generada · ${r.order.folio}`, { description: "La orden pasa a seguimiento postventa." });
  };

  const waiting = visible.filter((r) => !r.survey).length;

  return (
    <div className="mt-6">
      <Insight icon={<Send />} className="mb-6">
        Órdenes con cierre validado y reporte enviado en los últimos <b className="font-semibold">{FOLLOW_UP_DAYS} días</b> que aún no tienen encuesta.
        {waiting > 0 ? (
          <>
            {" "}
            Quedan <b className="font-semibold">{plural(waiting, "orden", "órdenes")}</b> por invitar a calificar.
          </>
        ) : (
          " ¡Todas tienen su encuesta!"
        )}
      </Insight>

      {visible.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Todo al día">
          Cada servicio reciente ya tiene su encuesta. Las nuevas aparecerán aquí al enviar el reporte.
        </EmptyState>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {visible.map((r, i) => {
              const contact = contactFor(r.order, r.client);
              const focus = r.order.id === focusOrderId;
              const survey = r.survey;
              const target: SurveyTarget | null = survey ? { s: survey, order: r.order, client: r.client } : null;
              const sharedVia = r.report?.shares.at(-1)?.channel;
              return (
                <motion.li
                  key={r.order.id}
                  layout
                  data-focus={focus ? "true" : undefined}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(i, 10) * 0.04 } }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-hairline py-4 md:grid-cols-[64px_minmax(0,1fr)_200px_auto]",
                    focus && "-mx-3 rounded-[16px] bg-sky-soft/60 px-3",
                  )}
                >
                  <DateBadge date={r.closedAt} />
                  <Link href={`/ordenes/${r.order.folio}`} className="group min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink group-hover:text-link">{r.order.title}</p>
                    <p className="mt-0.5 truncate text-[13px] text-subtle">
                      <span className="tabular">{r.order.folio}</span> · {r.client?.shortName}
                      {r.sharedAt ? ` · reporte ${sharedVia ? `por ${channelText(SHARE_CHANNEL[sharedVia])} ` : ""}${fmtAgo(r.sharedAt)}` : " · reporte sin enviar"}
                    </p>
                  </Link>
                  <div className="col-start-2 min-w-0 text-[13px] md:col-start-auto">
                    <p className="truncate font-medium text-ink">{contact.name || "Sin contacto"}</p>
                    <p className="truncate text-subtle tabular">{contact.phone || r.client?.contactEmail}</p>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {target ? (
                        <motion.div
                          key="share"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 380, damping: 26 }}
                          className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto"
                        >
                          <SoftBadge tone="teal" className="mr-auto md:mr-1">
                            <Sparkles className="size-3" /> Encuesta generada
                          </SoftBadge>
                          <Button variant="outline" size="icon" aria-label="Enviar por WhatsApp" className="size-10 rounded-[12px] border-[#dfe3ea]" onClick={() => shareSurveyWhatsapp(target)}>
                            <MessageCircle />
                          </Button>
                          <Button variant="outline" size="icon" aria-label="Enviar por correo" className="size-10 rounded-[12px] border-[#dfe3ea]" onClick={() => shareSurveyEmail(target)}>
                            <Mail />
                          </Button>
                          <Button variant="outline" size="icon" aria-label="Copiar enlace" className="size-10 rounded-[12px] border-[#dfe3ea]" onClick={() => void copySurveyLink(target.s.token)}>
                            <Copy />
                          </Button>
                          <Button variant="outline" size="icon" aria-label="Ver QR" className="size-10 rounded-[12px] border-[#dfe3ea]" onClick={() => setQr(target)}>
                            <QrCode />
                          </Button>
                          {!target.s.respondedAt && (
                            <Button variant="outline" className={cn(outlineBtnCls, "px-3")} onClick={() => setManual({ order: r.order, client: r.client })}>
                              <NotebookPen /> <span className="hidden sm:inline">Registrar respuesta</span>
                              <span className="sm:hidden">Respuesta</span>
                            </Button>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div key="gen" exit={{ opacity: 0, scale: 0.9 }} className="w-full md:w-auto">
                          <Gate allowed={canManage} reason={REASON_POSTVENTA} className="w-full md:w-auto">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild disabled={!canManage}>
                                <Button disabled={!canManage} className="h-10 w-full rounded-[12px] px-4 text-[14px] font-semibold md:w-auto">
                                  Generar encuesta <ChevronDown className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-60 rounded-[14px] p-1.5">
                                <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">¿Cómo la compartirá?</DropdownMenuLabel>
                                <DropdownMenuItem className={menuItemCls} onClick={() => generate(r, "whatsapp")}>
                                  <MessageCircle /> Por WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem className={menuItemCls} onClick={() => generate(r, "email")}>
                                  <Mail /> Por correo
                                </DropdownMenuItem>
                                <DropdownMenuItem className={menuItemCls} onClick={() => generate(r, "qr")}>
                                  <QrCode /> QR en sitio
                                </DropdownMenuItem>
                                <DropdownMenuItem className={menuItemCls} onClick={() => generate(r, "link")}>
                                  <Link2 /> Solo copiar enlace
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </Gate>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <SurveyQrDialog target={qr} onOpenChange={(v) => !v && setQr(null)} />
      <ManualSurveyDialog target={manual} onOpenChange={(v) => !v && setManual(null)} />
    </div>
  );
}
