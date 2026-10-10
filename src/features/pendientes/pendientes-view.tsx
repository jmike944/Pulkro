"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CalendarClock, Camera, ClipboardCheck, FileText, MessageSquareHeart, Send, Sparkles, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAgo, plural } from "@/lib/format";
import { PageHeader } from "@/components/pk/page";
import { MobileRow } from "@/components/pk/mobile";
import { EmptyState } from "@/components/pk/feedback";
import { staggerContainer, rowVariants } from "@/components/pk/motion";
import { PENDING_GROUPS, usePendingItems, type PendingKind } from "./use-pending-items";

const ICONS: Record<PendingKind, LucideIcon> = {
  incidencia: TriangleAlert,
  cierre: ClipboardCheck,
  evidencia: Camera,
  entrada: CalendarClock,
  reporte: FileText,
  asignar: Users,
  caso: MessageSquareHeart,
  encuesta: Send,
};

const TILE: Record<string, string> = {
  red: "bg-[#fde8e8] text-st-red",
  blue: "bg-[#e3f1fd] text-[#1667e0]",
  amber: "bg-[#fff1d6] text-[#b86e00]",
  teal: "bg-[#dcf4ef] text-st-teal",
  violet: "bg-[#ebe5ff] text-st-violet",
  slate: "bg-sand text-subtle",
};

/** "Pendientes" — the mobile Requests tab: everything waiting on the current role, grouped. */
export function PendientesView() {
  const { items, actionable } = usePendingItems();
  const [mine, setMine] = useState(true);
  const shown = useMemo(() => (mine ? items.filter((i) => i.actionable) : items), [items, mine]);
  const groups = PENDING_GROUPS.map((g) => ({ ...g, items: shown.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Pendientes"
        description={
          actionable ? (
            <>
              <b>{plural(actionable, "acción te espera", "acciones te esperan")}</b>. Sin alertas automáticas: aquí se juntan las que dependen de ti.
            </>
          ) : (
            "Nada depende de ti en este momento."
          )
        }
      />

      <LayoutGroup id="pend-filter">
        <div className="mb-6 inline-flex rounded-[14px] bg-sand p-1">
          {[
            { v: true, label: `Para mí · ${actionable}` },
            { v: false, label: `Todo · ${items.length}` },
          ].map((t) => (
            <button key={String(t.v)} onClick={() => setMine(t.v)} className={cn("relative rounded-[11px] px-4 py-2 text-[14px] transition-colors", mine === t.v ? "font-semibold text-ink" : "text-subtle")}>
              {mine === t.v && <motion.span layoutId="pend-thumb" className="absolute inset-0 rounded-[11px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.08)]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      {groups.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Todo al día">
          No hay pendientes {mine ? "a tu cargo" : "en tu alcance"}. ¡Impecable!
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <AnimatePresence initial={false}>
            {groups.map((g) => (
              <motion.section key={g.kind} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="text-[19px] font-medium text-ink">{g.label}</h2>
                  <span className="text-[14px] text-subtle">{g.items.length}</span>
                </div>
                <motion.div variants={staggerContainer(0.04, 0.05)} initial="hidden" animate="show">
                  {g.items.map((it) => {
                    const Icon = ICONS[it.kind];
                    return (
                      <motion.div key={it.id} variants={rowVariants}>
                        <MobileRow
                          href={it.href}
                          leading={
                            <span className={cn("inline-flex size-[54px] shrink-0 items-center justify-center rounded-[14px] [&_svg]:size-[21px]", TILE[it.tone])}>
                              <Icon strokeWidth={1.8} />
                            </span>
                          }
                          title={it.title}
                          meta={<span className="truncate">{it.sub}</span>}
                          status={{ tone: it.tone, label: it.actionable ? `Tú · ${fmtAgo(it.at)}` : `Seguimiento · ${fmtAgo(it.at)}` }}
                        />
                      </motion.div>
                    );
                  })}
                </motion.div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
