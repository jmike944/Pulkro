"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHours, plural } from "@/lib/format";
import { AuroraPanel } from "@/components/pk/aurora";
import { AnimatedNumber, ProgressLine } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import type { ClientStats } from "./use-clients";

type Rank = "servicios" | "satisfaccion" | "horas";

/** Corner arrow button; the first card's is dark (reference "Manufacturers" overview). */
export function CornerArrow({ href, label, dark }: { href: string; label: string; dark?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "relative z-[1] inline-flex size-10 shrink-0 items-center justify-center rounded-full transition hover:scale-105",
        dark ? "bg-brand-deep text-white shadow-[0_8px_18px_-8px_rgb(2_58_99/0.7)]" : "bg-tile text-ink hover:bg-brand-deep hover:text-white",
      )}
    >
      <ArrowUpRight className="size-[18px]" />
    </Link>
  );
}

/** Aurora hero with the four most active clients as white cards. */
export function TopClients({ rows }: { rows: ClientStats[] }) {
  const [rank, setRank] = useState<Rank>("servicios");
  const top = useMemo(() => {
    const key = (r: ClientStats) => (rank === "servicios" ? r.services.length : rank === "horas" ? r.minutes : r.csatCount ? r.csat : -1);
    return [...rows].filter((r) => r.services.length > 0).sort((a, b) => key(b) - key(a) || b.services.length - a.services.length).slice(0, 4);
  }, [rows, rank]);

  return (
    <AuroraPanel className="p-3 sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 sm:mb-6 sm:px-0 sm:pt-0">
        <div>
          <p className="text-[14px] font-medium text-ink/70">Clientes más activos</p>
          <p className="text-[13px] text-ink/55">Últimos 12 meses · servicios con cierre validado</p>
        </div>
        <Segmented
          id="top-rank"
          items={[
            { value: "servicios", label: "Servicios" },
            { value: "satisfaccion", label: "Satisfacción" },
            { value: "horas", label: "Horas" },
          ]}
          value={rank}
          onChange={setRank}
          className="bg-surface/55 backdrop-blur"
        />
      </div>
      {top.length === 0 ? (
        <p className="rounded-[22px] bg-surface/70 px-6 py-10 text-center text-[14px] text-subtle">Aún no hay servicios terminados en su alcance.</p>
      ) : (
        <div className="scrollbar-none -mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
          {top.map((r, i) => (
            <TopClientCard key={r.client.id} r={r} index={i} />
          ))}
        </div>
      )}
    </AuroraPanel>
  );
}

function TopClientCard({ r, index }: { r: ClientStats; index: number }) {
  const { client } = r;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.15 + index * 0.08, layout: { type: "spring", stiffness: 300, damping: 30 } }}
      whileHover={{ y: -3 }}
      className="relative flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-[22px] bg-surface p-5 shadow-glass sm:w-auto sm:max-w-none"
    >
      <Link href={`/clientes/${client.id}`} className="absolute inset-0 rounded-[22px]" aria-label={`Ver ${client.name}`} />
      <div className="pointer-events-none flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ClientMark name={client.name} hue={client.hue} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{client.shortName}</p>
            <p className="text-[12.5px] text-subtle">{client.segment}</p>
          </div>
        </div>
        <span className="pointer-events-auto">
          <CornerArrow href={`/clientes/${client.id}`} label={`Abrir ${client.shortName}`} dark={index === 0} />
        </span>
      </div>
      <div className="pointer-events-none mt-6 flex items-end gap-2">
        <AnimatedNumber value={r.services.length} className="text-[46px] font-medium leading-none tracking-[-0.04em] text-ink" />
        <span className="mb-1.5 text-[14px] text-subtle">servicios</span>
      </div>
      <p className="pointer-events-none mt-1 text-[13px] text-subtle">de {plural(r.programmed, "programado", "programados")}</p>
      <div className="pointer-events-none mt-5 border-t border-hairline pt-4">
        <div className="flex items-baseline justify-between text-[13.5px]">
          <span className="text-subtle">Satisfacción</span>
          <span className="font-semibold text-ink tabular">{r.csatCount ? r.csat.toFixed(1) : "—"}</span>
        </div>
        <ProgressLine value={r.csatCount ? r.csat / 5 : 0} className="mt-2" tone={r.csat && r.csat < 4 ? "amber" : "blue"} />
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-subtle">Horas reales</dt>
            <dd className="mt-0.5 text-[17px] font-medium text-ink tabular">{fmtHours(r.minutes)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Quejas</dt>
            <dd className={cn("mt-0.5 text-[17px] font-medium tabular", r.cases.length ? "text-red-fg" : "text-ink")}>{r.cases.length}</dd>
          </div>
        </dl>
      </div>
    </motion.article>
  );
}
