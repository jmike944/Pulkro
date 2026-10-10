"use client";

import { motion } from "motion/react";
import { Clock3, Info, Send } from "lucide-react";
import { fmtDuration, fmtNum, fmtRelativeDay, plural } from "@/lib/format";
import type { Client } from "@/lib/types";
import { BarList, Insight } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import type { HubMetrics } from "./hub-data";
import { CHANNEL_TO_LABEL } from "./share";

/** Right column: channel split, cierre → envío timing and the report waiting the longest. */
export function HubInsights({ m, clients, wide }: { m: HubMetrics; clients: Map<string, Client>; wide?: boolean }) {
  const halves = m.toPdfMinutes + m.toShareMinutes || 1;
  // Headline = stageDurations indicator (hour resolution); the halves split it proportionally so they always add up.
  const total = m.cierreEnvioMinutes >= 120 ? Math.round(m.cierreEnvioMinutes / 60) * 60 : Math.round(m.cierreEnvioMinutes);
  const toPdf = Math.round((total * m.toPdfMinutes) / halves);
  const toShare = Math.max(0, total - toPdf);
  const waiting = m.waiting;
  return (
    <div className={wide ? "grid gap-10 md:grid-cols-2 md:gap-x-12 min-[1440px]:grid-cols-1" : "space-y-10"}>
      <section>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Canales de envío</h2>
        <p className="mb-6 mt-1 text-[13.5px] text-subtle">
          {plural(m.sharesTotal, "intento iniciado", "intentos iniciados")} · sin confirmación de entrega
        </p>
        {m.sharesTotal === 0 ? (
          <p className="text-[14px] text-subtle">Aún no hay envíos registrados.</p>
        ) : (
          <BarList items={m.channels.map((c) => ({ label: CHANNEL_TO_LABEL[c.channel], value: c.value, pct: c.pct, sub: plural(c.value, "envío", "envíos") }))} />
        )}
      </section>

      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Cierre → envío</h2>
            <p className="mt-1 text-[13.5px] text-subtle">Promedio en {plural(m.measured, "servicio", "servicios")}</p>
          </div>
          <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-blue-tint text-azure-fg">
            <Clock3 className="size-5" />
          </span>
        </div>
        <p className="mt-4 text-[44px] font-medium leading-none tracking-[-0.04em] text-ink tabular">
          {m.measured ? fmtDuration(total) : "—"}
        </p>
        {m.measured > 0 && (
          <>
            <div className="mt-5 flex h-[10px] w-full gap-1 overflow-hidden rounded-full">
              <motion.span
                className="h-full rounded-full bg-azure"
                initial={{ width: 0 }}
                animate={{ width: `${(m.toPdfMinutes / halves) * 100}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
              />
              <motion.span
                className="h-full rounded-full bg-blue-line"
                initial={{ width: 0 }}
                animate={{ width: `${(m.toShareMinutes / halves) * 100}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <dt className="flex items-center gap-2 text-subtle">
                  <span className="size-[7px] rounded-full bg-azure" /> Cierre → PDF
                </dt>
                <dd className="mt-0.5 font-semibold text-ink tabular">{fmtDuration(toPdf)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-subtle">
                  <span className="size-[7px] rounded-full bg-blue-line" /> PDF → primer envío
                </dt>
                <dd className="mt-0.5 font-semibold text-ink tabular">{fmtDuration(toShare)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      {waiting?.latest ? (
        <Insight className={wide ? "md:col-span-2 min-[1440px]:col-span-1" : undefined} icon={<Send />} href={`/ordenes/${waiting.order.folio}/reporte`} linkLabel="Compartir ahora">
          <b className="font-semibold">{waiting.order.folio}</b> · {clients.get(waiting.order.clientId)?.shortName} tiene la v{waiting.latest.version} lista desde{" "}
          {fmtRelativeDay(waiting.latest.generatedAt).toLowerCase()} y aún sin envío.
        </Insight>
      ) : (
        <Insight className={wide ? "md:col-span-2 min-[1440px]:col-span-1" : undefined} icon={<Info />}>
          El envío es manual desde el teléfono del supervisor: se registra quién lo inició y cuándo, nunca la entrega. {fmtNum(m.counts.enviados)} servicios con envío iniciado.
        </Insight>
      )}
    </div>
  );
}
