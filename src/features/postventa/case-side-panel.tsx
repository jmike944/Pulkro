"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, CircleCheck, Hand, MessageCircle, Phone, RotateCcw, UserCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCurrentUser } from "@/lib/hooks";
import { whatsappLink } from "@/lib/domain";
import { firstName, fmtAgo, fmtDate } from "@/lib/format";
import { CASE_CHANNEL, CASE_STATUS, ROLE_LABEL, SEVERITY } from "@/lib/status";
import type { CaseStatus, Client, Order, PostSaleCase } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { SoftBadge, StatusDot } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DueLabel } from "./case-card";
import { CaseStatusDialog, type CaseMove } from "./case-status-dialog";
import { CASE_FLOW, caseOwnerCandidates } from "./lib";
import { Gate, REASON_POSTVENTA, menuItemCls, outlineBtnCls } from "./ui";

/** Right column of the case detail: status card in an aurora frame + client contact. */
export function CaseSidePanel({
  c,
  client,
  order,
  unitId,
  canManage,
}: {
  c: PostSaleCase;
  client?: Client;
  order?: Order;
  unitId: string;
  canManage: boolean;
}) {
  const user = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const updateCase = useAppStore((s) => s.updateCase);
  const [move, setMove] = useState<CaseMove | null>(null);
  const owner = users.find((u) => u.id === c.ownerId);
  const candidates = caseOwnerCandidates(users, unitId);
  const meta = CASE_STATUS[c.status];
  const step = CASE_FLOW.indexOf(c.status);

  const ask = (to: CaseStatus) => setMove({ c, client, owner, to });

  const take = () => {
    const mine = candidates.some((u) => u.id === user.id);
    updateCase(c.id, { status: "en_proceso", ...(mine ? { ownerId: user.id } : {}) }, mine ? `${firstName(user.name)} tomó el caso.` : "Cambió el caso a En proceso.");
    toast.success(`${c.folio} en proceso`, { description: mine ? "Usted quedó como responsable." : undefined });
  };

  const reassign = (id: string) => {
    if (id === c.ownerId) return;
    const u = users.find((x) => x.id === id);
    updateCase(c.id, { ownerId: id }, `Reasignó el caso a ${u?.name ?? "otro responsable"}.`);
    toast.success(`Caso reasignado a ${u ? firstName(u.name) : "nuevo responsable"}`);
  };

  const cta: { label: string; icon: React.ReactNode; onClick: () => void } | null =
    c.status === "abierto"
      ? { label: "Tomar caso", icon: <Hand />, onClick: take }
      : c.status === "en_proceso"
        ? { label: "Marcar resuelto", icon: <CircleCheck />, onClick: () => ask("resuelto") }
        : c.status === "resuelto"
          ? { label: "Cerrar caso", icon: <Check />, onClick: () => ask("cerrado") }
          : null;

  const contactPhone = order?.siteContact.phone || client?.contactPhone || "";
  const contactName = client?.contactName ?? order?.siteContact.name ?? "";

  return (
    <>
      <AuroraFrame>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Estado del caso</Eyebrow>
            <p className="mt-2 flex items-center gap-2.5 font-serif text-[28px] leading-none text-ink">
              <StatusDot tone={meta.tone} live={meta.live} className="size-[9px] [&>span]:size-[9px]" />
              {meta.label}
            </p>
          </div>
          <span className="rounded-[10px] bg-[#f2f4f7] px-2.5 py-1 text-[13px] font-semibold text-ink tabular">{c.folio}</span>
        </div>

        {/* lifecycle meter */}
        <div className="mt-5 grid grid-cols-4 gap-1.5" aria-hidden>
          {CASE_FLOW.map((st, i) => (
            <div key={st} className="h-[6px] overflow-hidden rounded-full bg-[#eef1f5]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.12 }}
                className={cn("h-full rounded-full", i === step ? "bg-[#1667e0]" : "bg-[#b9d8fb]")}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11px] text-subtle">
          {CASE_FLOW.map((st, i) => (
            <span key={st} className={cn("truncate", i === step && "font-semibold text-ink")}>
              {CASE_STATUS[st].label}
            </span>
          ))}
        </div>

        <KeyValues
          className="mt-6"
          rows={[
            {
              k: "Responsable",
              v: owner ? (
                <span className="inline-flex items-center gap-2">
                  <PersonAvatar name={owner.name} initials={owner.initials} hue={owner.hue} size={24} />
                  <span className="truncate">{owner.name}</span>
                </span>
              ) : (
                "Sin asignar"
              ),
            },
            {
              k: "Compromiso",
              v: (
                <span className="flex flex-col items-end gap-0.5">
                  <span className="tabular">{fmtDate(c.dueDate)}</span>
                  <DueLabel c={c} />
                </span>
              ),
            },
            { k: "Severidad", v: <SoftBadge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</SoftBadge> },
            { k: "Canal", v: CASE_CHANNEL[c.channel] },
            { k: "Actualizado", v: fmtAgo(c.updatedAt) },
          ]}
        />

        {c.resolution && (
          <div className="mt-6 rounded-[16px] bg-[#e7f7f4] p-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-st-teal">
              <CircleCheck className="size-4" /> Resolución
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{c.resolution}</p>
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          {cta && (
            <Gate allowed={canManage} reason={REASON_POSTVENTA} className="w-full">
              <motion.div className="w-full" whileTap={canManage ? { scale: 0.985 } : undefined}>
                <Button disabled={!canManage} onClick={cta.onClick} className="h-12 w-full rounded-[14px] text-[15px] font-semibold">
                  {cta.icon} {cta.label}
                </Button>
              </motion.div>
            </Gate>
          )}
          {c.status === "cerrado" && (
            <p className="flex items-center gap-2 rounded-[14px] bg-[#f4f8fd] px-4 py-3 text-[14px] text-ink">
              <BadgeCheckIcon /> Caso cerrado con conformidad del cliente.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Gate allowed={canManage} reason={REASON_POSTVENTA} className="w-full">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canManage}>
                  <Button variant="outline" disabled={!canManage} className={cn(outlineBtnCls, "w-full px-3")}>
                    <UserCog /> Reasignar <ChevronDown className="size-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 rounded-[14px] p-1.5">
                  <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Responsables de la unidad</DropdownMenuLabel>
                  {candidates.map((u) => (
                    <DropdownMenuItem key={u.id} className={menuItemCls} onClick={() => reassign(u.id)}>
                      <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{u.name}</span>
                        <span className="block text-[12px] text-subtle">{ROLE_LABEL[u.role]}</span>
                      </span>
                      {u.id === c.ownerId && <Check className="text-link" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Gate>
            {(c.status === "resuelto" || c.status === "cerrado") && (
              <Gate allowed={canManage} reason={REASON_POSTVENTA} className="w-full">
                <Button variant="outline" disabled={!canManage} onClick={() => ask("en_proceso")} className={cn(outlineBtnCls, "w-full px-3")}>
                  <RotateCcw /> Reabrir
                </Button>
              </Gate>
            )}
            {c.status === "en_proceso" && (
              <Gate allowed={canManage} reason={REASON_POSTVENTA} className="w-full">
                <Button variant="outline" disabled={!canManage} onClick={() => ask("cerrado")} className={cn(outlineBtnCls, "w-full px-3")}>
                  <Check /> Cerrar
                </Button>
              </Gate>
            )}
          </div>
        </div>
      </AuroraFrame>

      {client && (
        <div className="rounded-[22px] border border-hairline bg-white p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <ClientMark name={client.name} hue={client.hue} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{client.name}</p>
              <p className="truncate text-[13px] text-subtle">{contactName}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              className={cn(outlineBtnCls, "px-3")}
              disabled={!contactPhone}
              onClick={() => {
                window.open(
                  whatsappLink(contactPhone, `Hola ${firstName(contactName.replace(/^(Lic|Ing|Dra?|Mtra?|Adm|Cap)\.\s*/i, ""))}, le saluda Pulkro respecto a su reporte ${c.folio}${order ? ` del servicio ${order.folio}` : ""}.`),
                  "_blank",
                  "noopener,noreferrer",
                );
                toast("Se abrió WhatsApp", { description: "El envío es manual: no se confirma la entrega." });
              }}
            >
              <MessageCircle /> WhatsApp
            </Button>
            <Button asChild variant="outline" className={cn(outlineBtnCls, "px-3")}>
              <a href={`tel:${contactPhone.replace(/\s/g, "")}`}>
                <Phone /> Llamar
              </a>
            </Button>
          </div>
          <Link href={`/clientes/${client.id}`} className="group mt-4 flex items-center gap-1.5 text-[14px] font-semibold text-link">
            Historial del cliente <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      <CaseStatusDialog move={move} onOpenChange={(v) => !v && setMove(null)} />
    </>
  );
}

function BadgeCheckIcon() {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#dcf4ef] text-st-teal">
      <Check className="size-4" strokeWidth={2.5} />
    </span>
  );
}
