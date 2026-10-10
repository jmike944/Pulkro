"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Users } from "lucide-react";
import { useCan, useMediaQuery } from "@/lib/hooks";
import { fmtLongDay, plural } from "@/lib/format";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { PillBars } from "@/components/pk/pill-bars";
import { AnimatedNumber, IconTile, MiniStat } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { dowShort, weekNumber } from "@/features/agenda/agenda-model";
import { useTeamData } from "./use-team";
import { PersonalTab } from "./personal-tab";
import { SupervisorsTab } from "./supervisors-tab";
import { WorkerSheet } from "./worker-sheet";
import { WorkerDialog, type EditorState } from "./worker-dialog";

type Tab = "personal" | "supervisores";

/**
 * Equipo: cleaning staff (they don't use the app — the supervisor captures for them) and
 * supervisors. `?w=<workerId>` opens the worker profile.
 */
export function EquipoView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const data = useTeamData();
  const canCatalog = useCan("catalogs.admin");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Below lg a tap on a day shows its count (tap used to navigate away before it could be read).
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const w = searchParams.get("w");
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "supervisores" ? "supervisores" : "personal");
  // Keep the last profile mounted while the sheet animates closed.
  const [shownW, setShownW] = useState<string | null>(w);
  if (w && w !== shownW) setShownW(w);
  const [editor, setEditor] = useState<EditorState>(null);

  // Activity keeps this route alive in the background: drop the editor when it hides.
  useLayoutEffect(() => () => setEditor(null), []);

  const setWorkerParam = (id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("w", id);
    else params.delete("w");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const { counts } = data;
  const description = (
    <>
      <b>{plural(counts.active, "persona activa", "personas activas")}</b> en {data.scopeLabel}. <b>{counts.assignedToday}</b>{" "}
      {counts.assignedToday === 1 ? "asignada" : "asignadas"} hoy
      {counts.doubleToday > 0 ? (
        <>
          {" "}
          y <b>{plural(counts.doubleToday, "con doble asignación", "con doble asignación")}</b>.
        </>
      ) : (
        ", sin dobles asignaciones."
      )}
    </>
  );

  const bars = data.weekBars.map((b) => ({ key: b.key, label: `${dowShort(b.date)} ${b.date.getDate()}`, value: b.value }));
  const todayBar = data.weekBars[data.todayIndex];
  const peak = data.weekBars.reduce((m, b) => Math.max(m, b.value), 0);
  const pickedIdx = !isDesktop && pickedDay !== null && data.weekBars[pickedDay] ? pickedDay : null;
  const picked = pickedIdx !== null ? data.weekBars[pickedIdx] : undefined;
  const shownBar = picked ?? todayBar;
  const highlightIdx = pickedIdx ?? (data.todayIndex >= 0 ? data.todayIndex : bars.length - 1);
  const agendaBar = shownBar ?? data.weekBars[data.weekBars.length - 1];
  const exists = !!w && data.stats.some((s) => s.worker.id === w);

  return (
    <div>
      <PageHeader title="Equipo" description={description} />

      {/* ── Hero ── */}
      <AuroraPanel className="p-3 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
          <GlassCard className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconTile>
                  <Users />
                </IconTile>
                <span className="text-[15px] font-medium text-ink">Personal activo</span>
              </div>
              <span className="truncate rounded-[10px] bg-[#f2f4f7] px-3 py-1.5 text-[13px] font-medium text-ink">{data.scopeLabel}</span>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <AnimatedNumber value={counts.active} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]" />
              <span className="mb-2 text-[15px] text-subtle">personas</span>
            </div>
            <p className="mt-3 text-[14px] text-subtle">
              {counts.inField > 0 ? (
                <>
                  <b className="font-semibold text-ink">{counts.inField}</b> en campo ahora ·{" "}
                </>
              ) : null}
              {plural(data.supervisors.length, "supervisor captura", "supervisores capturan")} por sus cuadrillas
            </p>
            <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
              <MiniStat tone="blue" label="Asignadas" value={counts.assignedToday} sub="hoy" className="pr-3" />
              <MiniStat tone="teal" label="Disponibles" value={counts.availableToday} sub="hoy" className="px-3 sm:px-5" />
              <MiniStat tone="amber" label="Dobles" value={counts.doubleToday} sub="hoy" className="pl-3 sm:pl-5" />
            </div>
          </GlassCard>

          <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0">
            <p className="text-[14px] font-medium text-ink/70">Personas asignadas{data.weekBars[0] ? ` · semana ${weekNumber(data.weekBars[0].date)}` : ""}</p>
            <AnimatedNumber value={shownBar?.value ?? peak} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
            <p className="mt-2 text-[14px] text-ink/70">
              {picked && picked !== todayBar ? fmtLongDay(picked.date) : todayBar ? "hoy" : "máximo de la semana"} · de {counts.active} disponibles ·{" "}
              {isDesktop ? "toca un día para abrir la agenda" : "toca un día para ver su carga"}
            </p>
            <PillBars
              data={bars}
              highlight={highlightIdx}
              className="mt-6 flex-1"
              height={190}
              format={(v) => plural(v, "persona", "personas")}
              onSelect={(i) => (isDesktop ? router.push(`/agenda?fecha=${data.weekBars[i].key}`) : setPickedDay(i))}
            />
            {agendaBar && (
              <Link
                href={`/agenda?fecha=${agendaBar.key}`}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 self-start rounded-[14px] bg-white px-4 text-[14px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08)] transition active:scale-[0.98] lg:hidden"
              >
                <CalendarDays className="size-4" /> Abrir agenda · {agendaBar === todayBar ? "hoy" : `${dowShort(agendaBar.date)} ${agendaBar.date.getDate()}`}
              </Link>
            )}
          </div>
        </div>
      </AuroraPanel>

      <UnderlineTabs
        id="equipo-tabs"
        className="mb-6 mt-9"
        items={[
          { value: "personal", label: "Personal", count: data.stats.filter((s) => s.worker.active).length },
          { value: "supervisores", label: "Supervisores", count: data.supervisors.length },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {tab === "personal" ? (
            <PersonalTab data={data} canCatalog={canCatalog} onOpen={(id) => setWorkerParam(id)} onAdd={() => setEditor({ workerId: null, open: true })} />
          ) : (
            <SupervisorsTab data={data} />
          )}
        </motion.div>
      </AnimatePresence>

      <WorkerSheet
        workerId={shownW}
        open={exists}
        data={data}
        canCatalog={canCatalog}
        onOpenChange={(open) => !open && setWorkerParam(null)}
        onEdit={(id) => setEditor({ workerId: id, open: true })}
      />
      <WorkerDialog
        state={editor}
        onOpenChange={(open) => setEditor((s) => (s ? { ...s, open } : s))}
        onSaved={(id, created) => {
          setEditor((s) => (s ? { ...s, open: false } : s));
          if (created) setWorkerParam(id);
        }}
      />
    </div>
  );
}
