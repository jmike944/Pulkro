"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { MessageSquareHeart, Quote, Smile, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDay, fmtPct, plural } from "@/lib/format";
import type { Order, Survey } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { AnimatedNumber, IconTile, ProgressLine } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import type { Indicators } from "./compute";
import type { PeriodWindow } from "./period";
import { ScoreLine, Stars } from "./bits";

/** §5 "Satisfacción del cliente": CSAT, NPS, response rate, distribution and latest comments. */
export function SatisfactionCard({
  ind,
  win,
  orderById,
  clientName,
}: {
  ind: Indicators;
  win: PeriodWindow;
  orderById: Map<string, Order>;
  clientName: (clientId: string) => string;
}) {
  const sat = ind.sat;
  const manual = ind.periodSurveys.filter((s) => s.answers && s.manual).length;
  const distMax = Math.max(1, ...sat.distribution.map((d) => d.count));
  const csat = Math.round(sat.overall * 10) / 10;

  return (
    <AuroraFrame innerClassName="p-5 sm:p-7" className="print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile>
            <Smile />
          </IconTile>
          <div>
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Satisfacción del cliente</h2>
            <p className="text-[13.5px] text-subtle">Encuestas enviadas en {win.phrase} · enlace o captura manual</p>
          </div>
        </div>
        <Link href="/postventa" className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#dfe3ea] px-4 text-[14px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition hover:bg-muted">
          <MessageSquareHeart className="size-4" /> Postventa
        </Link>
      </div>

      {sat.sent === 0 ? (
        <EmptyState icon={<MessageSquareHeart />} title="Sin encuestas en el periodo" className="mt-6">
          Las encuestas se envían después de compartir el reporte con el cliente.
        </EmptyState>
      ) : (
        <>
          <div className="mt-7 grid gap-8 md:grid-cols-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-0">
            {/* CSAT */}
            <div className="min-w-0 xl:border-r xl:border-hairline xl:pr-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Calificación general</p>
              <div className="mt-3 flex items-end gap-2">
                {sat.answered ? (
                  <AnimatedNumber value={csat} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} className="text-[64px] font-medium leading-[0.9] tracking-[-0.045em] text-ink" />
                ) : (
                  <span className="text-[64px] font-medium leading-[0.9] tracking-[-0.045em] text-subtle">—</span>
                )}
                <span className="mb-1.5 text-[15px] text-subtle">/ 5</span>
              </div>
              <Stars value={sat.overall} size={18} className="mt-3" />
              <p className="mt-2 text-[13px] text-subtle">{plural(sat.answered, "respuesta", "respuestas")}</p>
              <div className="mt-6 space-y-3">
                <ScoreLine label="Calidad" value={sat.quality} delay={0} />
                <ScoreLine label="Puntualidad" value={sat.punctuality} delay={0.08} />
                <ScoreLine label="Personal" value={sat.staff} delay={0.16} />
              </div>
            </div>

            {/* NPS */}
            <div className="min-w-0 xl:border-r xl:border-hairline xl:px-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">NPS · recomendación</p>
              <NpsGauge nps={sat.nps} answered={sat.answered} />
              <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                <NpsBucket tone="bg-st-teal" label="Promotores" value={sat.promoters} />
                <NpsBucket tone="bg-st-slate" label="Pasivos" value={Math.max(0, sat.answered - sat.promoters - sat.detractors)} />
                <NpsBucket tone="bg-st-red" label="Detractores" value={sat.detractors} />
              </div>
            </div>

            {/* distribution + response rate */}
            <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:pl-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Distribución</p>
              <ul className="mt-4 space-y-2.5">
                {[...sat.distribution].reverse().map((d, i) => (
                  <li key={d.score} className="grid grid-cols-[34px_minmax(0,1fr)_28px] items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink tabular">
                      {d.score}
                      <Star className="size-3.5 text-[#f0a020]" fill="currentColor" strokeWidth={0} />
                    </span>
                    <span className="h-[8px] overflow-hidden rounded-full bg-[#eef1f5]">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: `${(d.count / distMax) * 100}%` }}
                        transition={{ duration: 0.8, ease: EASE, delay: 0.25 + i * 0.07 }}
                        className={cn("block h-full rounded-full", d.score >= 4 ? "bg-[#1667e0]" : d.score === 3 ? "bg-[#b9d8fb]" : "bg-st-red/70")}
                      />
                    </span>
                    <span className="text-right text-[13px] text-subtle tabular">{d.count}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-[16px] bg-[#f4f8fd] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium text-ink">Tasa de respuesta</span>
                  <span className="text-[18px] font-semibold text-ink tabular">{fmtPct(sat.responseRate)}</span>
                </div>
                <ProgressLine value={sat.responseRate} className="mt-2.5 bg-white" />
                <p className="mt-2 text-[12.5px] text-subtle">
                  {sat.answered} de {plural(sat.sent, "encuesta", "encuestas")}
                  {manual > 0 ? ` · ${manual} capturadas a mano` : ""}
                </p>
              </div>
            </div>
          </div>

          <Comments comments={ind.comments} orderById={orderById} clientName={clientName} />
        </>
      )}
    </AuroraFrame>
  );
}

function NpsBucket({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <div className="rounded-[12px] bg-[#f6f8fb] px-1 py-2">
      <p className="text-[18px] font-semibold text-ink tabular">{value}</p>
      <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-subtle">
        <span className={cn("size-[6px] rounded-full", tone)} />
        {label}
      </p>
    </div>
  );
}

const R = 78;
const CX = 100;
const CY = 98;

/** Semicircle gauge −100…100 with an arc that draws in and a knob riding the arc. */
function NpsGauge({ nps, answered }: { nps: number; answered: number }) {
  const gid = useId().replace(/:/g, "");
  const t = answered ? (nps + 100) / 200 : 0;
  const progress = useMotionValue(0);
  useEffect(() => {
    const ctrl = animate(progress, t, { duration: 1.3, ease: EASE, delay: 0.25 });
    return () => ctrl.stop();
  }, [t, progress]);
  const cx = useTransform(progress, (p) => CX + R * Math.cos(Math.PI * (1 - p)));
  const cy = useTransform(progress, (p) => CY - R * Math.sin(Math.PI * (1 - p)));
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const verdict = !answered ? "Sin respuestas" : nps >= 50 ? "Excelente" : nps >= 30 ? "Muy bueno" : nps >= 0 ? "Bueno" : "Por mejorar";

  return (
    <div className="relative mx-auto mt-2 w-full max-w-[240px]">
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={`NPS ${nps}: ${verdict}`}>
        <defs>
          <linearGradient id={`nps-${gid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#b9c7ff" />
            <stop offset="55%" stopColor="#7ad1f4" />
            <stop offset="100%" stopColor="#1667e0" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="#eef1f5" strokeWidth={14} strokeLinecap="round" />
        <motion.path d={arc} fill="none" stroke={`url(#nps-${gid})`} strokeWidth={14} strokeLinecap="round" style={{ pathLength: progress }} />
        <line x1={CX} x2={CX} y1={CY - R - 11} y2={CY - R + 11} stroke="#ffffff" strokeWidth={2} />
        {answered > 0 && <motion.circle r={9} cx={cx} cy={cy} fill="#ffffff" stroke="#07243f" strokeWidth={3} />}
        <text x={CX - R} y={CY + 18} textAnchor="middle" className="fill-[#98a2b3] text-[10px]">
          −100
        </text>
        <text x={CX + R} y={CY + 18} textAnchor="middle" className="fill-[#98a2b3] text-[10px]">
          100
        </text>
      </svg>
      <div className="absolute inset-x-0 bottom-[14px] flex flex-col items-center">
        <AnimatedNumber value={answered ? nps : 0} format={{ signDisplay: "exceptZero" }} className="text-[38px] font-medium leading-none tracking-[-0.04em] text-ink" />
        <span className="mt-1 rounded-md bg-[#e6f0fd] px-2 py-0.5 text-[11.5px] font-semibold text-[#1667e0]">{verdict}</span>
      </div>
    </div>
  );
}

function Comments({ comments, orderById, clientName }: { comments: Survey[]; orderById: Map<string, Order>; clientName: (id: string) => string }) {
  if (!comments.length) return null;
  return (
    <div className="mt-8 border-t border-hairline pt-6">
      <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Comentarios recientes</p>
      <motion.ul variants={staggerContainer(0.06, 0.3)} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2">
        {comments.map((s) => {
          const order = orderById.get(s.orderId);
          const score = s.answers!.overall;
          return (
            <motion.li key={s.id} variants={rowVariants}>
              <Link
                href={order ? `/ordenes/${order.folio}` : "/postventa"}
                className="group flex h-full flex-col rounded-[18px] border border-hairline bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <Quote className="mt-0.5 size-4 shrink-0 text-sky" />
                  <p className="text-[14.5px] leading-relaxed text-ink">{s.answers!.comment}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[12.5px] text-subtle">
                  <span className="min-w-0 truncate">
                    {s.respondentName ?? "Cliente"} · {clientName(s.clientId)} · {fmtDay(s.respondedAt!)}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 font-semibold tabular", score >= 4 ? "text-ink" : "text-st-red")}>
                    {score}
                    <Star className="size-3.5 text-[#f0a020]" fill="currentColor" strokeWidth={0} />
                    {order && <span className="ml-1 font-medium text-link group-hover:underline">{order.folio}</span>}
                  </span>
                </div>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
