"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, ClipboardList, Copy, MessageCircle, MessageSquareWarning, NotebookPen, QrCode, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/format";
import { useIsOffline } from "@/lib/hooks";
import type { CaseChannel, PostSaleCase } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { Segmented } from "@/components/pk/page";
import { TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SURVEY_CHANNEL_LABEL, surveyLinkText } from "./lib";
import { ManualSurveyDialog, type ManualTarget } from "./manual-survey-dialog";
import { NpsValue, Stars } from "./rating";
import { SurveyQrDialog, copySurveyLink, shareSurveyWhatsapp, useSurveyLink, type SurveyTarget } from "./survey-share";
import type { SurveyRow } from "./use-postventa";
import { REASON_POSTVENTA, inputCls, menuItemCls, outlineBtnCls } from "./ui";

type StateFilter = "todas" | "pendientes" | "respondidas";
const PAGE = 12;

const channelLabel = (r: SurveyRow) => (r.s.manual && r.s.channel === "descarga" ? "Registro manual" : SURVEY_CHANNEL_LABEL[r.s.channel]);

const needsAttention = (r: SurveyRow) => !!r.s.answers && (r.s.answers.overall <= 3 || r.s.answers.nps <= 6);

/** Encuestas: sent links, answers, and the manual share actions. */
export function SurveysPanel({
  rows,
  canManage,
  focusOrderId,
  caseByOrder,
  onOpenCase,
}: {
  rows: SurveyRow[];
  canManage: boolean;
  focusOrderId?: string;
  caseByOrder: Map<string, PostSaleCase>;
  onOpenCase: (orderId: string, channel: CaseChannel, description?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("todas");
  const [limit, setLimit] = useState(PAGE);
  const [qr, setQr] = useState<SurveyTarget | null>(null);
  const [manual, setManual] = useState<ManualTarget | null>(null);

  const counts = useMemo(() => ({ pendientes: rows.filter((r) => !r.s.respondedAt).length, respondidas: rows.filter((r) => r.s.respondedAt).length }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (state === "pendientes" && r.s.respondedAt) return false;
      if (state === "respondidas" && !r.s.respondedAt) return false;
      if (!q) return true;
      return [r.order.folio, r.order.title, r.client?.name, r.client?.shortName, r.s.answers?.comment, r.s.respondentName].some((x) => x?.toLowerCase().includes(q));
    });
  }, [rows, query, state]);

  const shown = filtered.slice(0, limit);

  const actions = {
    qr: (r: SurveyRow) => setQr(r),
    manual: (r: SurveyRow) => setManual({ order: r.order, client: r.client }),
    openCase: (r: SurveyRow) =>
      onOpenCase(r.order.id, "encuesta", r.s.answers?.comment ? `Comentario en encuesta (${r.s.answers.overall}/5): “${r.s.answers.comment}”` : undefined),
  };

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[340px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar folio, cliente o comentario"
            aria-label="Buscar encuestas"
            className={cn(inputCls, "pl-10")}
          />
        </div>
        <Segmented
          id="sv-state"
          items={[
            { value: "todas", label: `Todas · ${rows.length}` },
            { value: "pendientes", label: `Pendientes · ${counts.pendientes}` },
            { value: "respondidas", label: `Respondidas · ${counts.respondidas}` },
          ]}
          value={state}
          onChange={(v) => {
            setState(v);
            setLimit(PAGE);
          }}
          className="scrollbar-none max-w-full overflow-x-auto"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={rows.length ? "Sin coincidencias" : "Aún no hay encuestas"} className="mt-6">
          {rows.length ? "Pruebe con otro folio, cliente o filtro." : "Genere la primera desde “Por dar seguimiento”."}
        </EmptyState>
      ) : (
        <>
          {/* desktop table */}
          <div className="mt-5 hidden xl:block">
            <div className="grid grid-cols-[minmax(0,1.5fr)_104px_124px_96px_48px_minmax(0,1.25fr)_52px] gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
              <span>Orden y cliente</span>
              <span>Enviada</span>
              <span>Estado</span>
              <span>Calificación</span>
              <span>NPS</span>
              <span>Comentario</span>
              <span />
            </div>
            <ul>
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((r, i) => {
                  const focus = r.order.id === focusOrderId;
                  return (
                    <motion.li
                      key={r.s.id}
                      layout
                      data-focus={focus ? "true" : undefined}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(i, 10) * 0.03 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      className={cn(
                        "grid grid-cols-[minmax(0,1.5fr)_104px_124px_96px_48px_minmax(0,1.25fr)_52px] items-center gap-4 border-b border-hairline py-4",
                        focus && "-mx-3 rounded-[16px] bg-sky-soft/60 px-3",
                      )}
                    >
                      <OrderCell r={r} />
                      <span className="text-[14px] text-ink">
                        <span className="block tabular">{fmtDay(r.s.sentAt)}</span>
                        <span className="text-[12.5px] text-subtle">{channelLabel(r)}</span>
                      </span>
                      <StateCell r={r} />
                      <span>{r.s.answers ? <Stars value={r.s.answers.overall} size={14} /> : <span className="text-subtle">—</span>}</span>
                      <span>{r.s.answers ? <NpsValue value={r.s.answers.nps} /> : <span className="text-subtle">—</span>}</span>
                      <CommentCell r={r} />
                      <span className="flex justify-end">
                        <SurveyMenu r={r} canManage={canManage} caseByOrder={caseByOrder} actions={actions} compact />
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>

          {/* phone / tablet cards */}
          <motion.ul layout className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((r, i) => {
                const focus = r.order.id === focusOrderId;
                return (
                  <motion.li
                    key={r.s.id}
                    layout
                    data-focus={focus ? "true" : undefined}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.035 } }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    className={cn("flex flex-col rounded-[20px] border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]", focus && "ring-2 ring-sky ring-offset-2")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <OrderCell r={r} />
                      <StateCell r={r} />
                    </div>
                    {r.s.answers && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Stars value={r.s.answers.overall} size={16} />
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[12.5px] text-subtle">NPS</span>
                          <NpsValue value={r.s.answers.nps} showLabel />
                        </span>
                      </div>
                    )}
                    <div className="mt-3 flex-1">
                      <CommentCell r={r} />
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                      <span className="text-[12.5px] text-subtle">
                        Enviada {fmtDay(r.s.sentAt)} · {channelLabel(r)}
                      </span>
                      <SurveyMenu r={r} canManage={canManage} caseByOrder={caseByOrder} actions={actions} />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>

          {filtered.length > limit && (
            <div className="mt-5 flex justify-center">
              <Button variant="outline" className={outlineBtnCls} onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar más · quedan {filtered.length - limit}
              </Button>
            </div>
          )}
        </>
      )}

      <SurveyQrDialog target={qr} canManage={canManage} onOpenChange={(v) => !v && setQr(null)} />
      <ManualSurveyDialog
        target={manual}
        onOpenChange={(v) => !v && setManual(null)}
        onSaved={(sv, t) => {
          if (sv.answers && (sv.answers.overall <= 3 || sv.answers.nps <= 6) && canManage) {
            toast("Calificación baja: ¿abrir un caso?", {
              description: "Dé seguimiento a la inconformidad del cliente.",
              action: { label: "Abrir caso", onClick: () => onOpenCase(t.order.id, "encuesta", sv.answers?.comment) },
            });
          }
        }}
      />
    </div>
  );
}

function OrderCell({ r }: { r: SurveyRow }) {
  return (
    <Link href={`/ordenes/${r.order.folio}`} className="group flex min-w-0 items-center gap-3">
      {r.client && <ClientMark name={r.client.name} hue={r.client.hue} size={38} />}
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-ink group-hover:text-link">{r.client?.shortName ?? r.order.title}</span>
        <span className="block truncate text-[13px] text-subtle">
          <span className="tabular">{r.order.folio}</span> · {r.order.title}
        </span>
      </span>
    </Link>
  );
}

function StateCell({ r }: { r: SurveyRow }) {
  return (
    <span className="flex shrink-0 flex-col items-start gap-1">
      {r.s.respondedAt ? (
        <TonePill tone="teal">Respondida</TonePill>
      ) : (
        <TonePill tone="amber" live>
          Pendiente
        </TonePill>
      )}
      {r.s.manual && <span className="text-[11.5px] font-medium text-subtle">Captura manual</span>}
      {needsAttention(r) && <span className="text-[11.5px] font-semibold text-red-fg">Requiere atención</span>}
    </span>
  );
}

function CommentCell({ r }: { r: SurveyRow }) {
  if (!r.s.answers) return <span className="text-[13.5px] text-subtle">Esperando respuesta del cliente</span>;
  if (!r.s.answers.comment) return <span className="text-[13.5px] text-subtle">Sin comentario</span>;
  return (
    <span className="block">
      <span className="line-clamp-2 font-serif text-[15px] italic leading-snug text-ink">“{r.s.answers.comment}”</span>
      {r.s.respondentName && <span className="mt-0.5 block truncate text-[12.5px] text-subtle">— {r.s.respondentName}</span>}
    </span>
  );
}

function SurveyMenu({
  r,
  canManage,
  caseByOrder,
  actions,
  compact,
}: {
  r: SurveyRow;
  canManage: boolean;
  caseByOrder: Map<string, PostSaleCase>;
  actions: { qr: (r: SurveyRow) => void; manual: (r: SurveyRow) => void; openCase: (r: SurveyRow) => void };
  compact?: boolean;
}) {
  const pending = !r.s.respondedAt;
  const existingCase = caseByOrder.get(r.order.id);
  // Account sessions: the link is shared once the survey is on the server (it answers «No encontramos esta encuesta» before).
  const link = useSurveyLink(r.s);
  const offline = useIsOffline();
  const share = canManage && link.state === "ready";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" aria-label={`Acciones de la encuesta ${r.order.folio}`} className="size-10 rounded-[12px] border-line">
            <ChevronDown className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" className={cn(outlineBtnCls, "px-3.5")}>
            Acciones <ChevronDown className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-[14px] p-1.5">
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">{r.order.folio}</DropdownMenuLabel>
        {link.state !== "ready" && (
          <p className={cn("px-2.5 pb-1.5 pt-0.5 text-[12px] leading-snug", link.state === "refused" ? "text-red-fg" : "text-subtle")}>{surveyLinkText(link, offline)}</p>
        )}
        <DropdownMenuItem className={menuItemCls} disabled={!share} onClick={() => void copySurveyLink(r.s)}>
          <Copy /> Copiar enlace
        </DropdownMenuItem>
        {pending && (
          <>
            <DropdownMenuItem className={menuItemCls} disabled={!share} onClick={() => shareSurveyWhatsapp(r)}>
              <MessageCircle /> Compartir por WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemCls} disabled={!share} onClick={() => actions.qr(r)}>
              <QrCode /> Ver QR
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemCls} disabled={!canManage} onClick={() => actions.manual(r)}>
              <NotebookPen /> Registrar respuesta manual
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {existingCase ? (
          <DropdownMenuItem asChild className={menuItemCls}>
            <Link href={`/postventa/${existingCase.folio}`}>
              <MessageSquareWarning /> Ver caso {existingCase.folio} <ArrowRight className="ml-auto" />
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className={cn(menuItemCls, needsAttention(r) && "font-semibold text-red-fg")} disabled={!canManage} onClick={() => actions.openCase(r)}>
            <MessageSquareWarning /> Abrir caso postventa
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className={menuItemCls}>
          <Link href={`/ordenes/${r.order.folio}`}>
            Ver orden <ArrowRight className="ml-auto" />
          </Link>
        </DropdownMenuItem>
        {!canManage && <p className="px-2.5 pb-1.5 pt-1 text-[12px] leading-snug text-subtle">{REASON_POSTVENTA}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
