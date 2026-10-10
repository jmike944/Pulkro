"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { BellOff, CalendarDays, Sparkles } from "lucide-react";
import { useLookups, useMediaQuery, useNow } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader, Segmented } from "@/components/pk/page";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { Insight, Panel, SectionHeader } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { FollowList, GroupSection, LeadCard, LeadNextStep, QueueSummary, TypeRail, useScrollSpy, type Group } from "./pending-parts";
import { queueSentence } from "./pending-meta";
import { PENDING_GROUPS, usePendingItems, type PendingItem, type PendingKind } from "./use-pending-items";

type Filter = "mine" | "all";

const NOTE = "Sin alertas automáticas: aquí se juntan las tareas que dependen de cada rol.";

/**
 * "Pendientes" — the work queue. What is waiting, how urgent it is and who has to act.
 * Hero = how the queue is made up + the item to attend first; below, one list per type.
 * Phones get the next-step card first (act in one tap), the composition second.
 */
export function PendientesView() {
  const { items, actionable } = usePendingItems();
  const lk = useLookups();
  const now = useNow(60_000);
  const desktop = useMediaQuery("(min-width: 1024px)");

  // "A mi cargo" only means something when it splits the queue; otherwise show everything.
  const others = items.length - actionable;
  const canFilter = actionable > 0 && others > 0;
  const [pick, setPick] = useState<Filter | null>(null);
  const filter: Filter = canFilter ? (pick ?? "mine") : "all";
  const mine = filter === "mine";

  const shown = useMemo(() => (mine ? items.filter((i) => i.actionable) : items), [items, mine]);
  const groups = useMemo<Group[]>(() => PENDING_GROUPS.map((g) => ({ ...g, items: shown.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length), [shown]);
  const sentence = useMemo(
    () =>
      queueSentence(
        { n: shown.length, blocking: shown.filter((i) => i.blocksClosure).length, ready: shown.filter((i) => i.kind === "cierre").length },
        { mine, others },
      ),
    [shown, mine, others],
  );
  const spy = useScrollSpy(desktop ? groups.map((g) => g.kind) : []);

  const jump = useCallback((kind: PendingKind) => {
    const el = document.getElementById(`pend-${kind}`);
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    // keyboard and screen-reader users land on the list they asked for, not back on the chip
    el.focus({ preventScroll: true });
  }, []);

  /** who acts is only worth saying on a row when the list mixes people (or when it is somebody else's) */
  const showBadge = useCallback((it: PendingItem) => (it.actionable ? canFilter && !mine : true), [canFilter, mine]);

  const description =
    items.length === 0 ? (
      "Nada pendiente en su alcance."
    ) : actionable === 0 ? (
      <>
        <b>Nada depende de usted</b> por ahora. Aquí se sigue lo que supervisores y administración tienen en curso.
      </>
    ) : others > 0 ? (
      <>
        <b>{plural(actionable, "acción", "acciones")}</b> {actionable === 1 ? "depende" : "dependen"} de usted y <b>{others}</b> más {others === 1 ? "está" : "están"} en seguimiento.
      </>
    ) : (
      <>
        <b>{plural(actionable, "acción", "acciones")}</b> {actionable === 1 ? "depende" : "dependen"} de usted.
      </>
    );

  const filterControl = canFilter ? (
    <Segmented<Filter>
      id="pendientes-filtro"
      value={filter}
      onChange={setPick}
      className="max-lg:[&_button]:inline-flex max-lg:[&_button]:min-h-11 max-lg:[&_button]:items-center max-lg:[&_button]:px-4"
      items={[
        { value: "mine", label: `A mi cargo · ${actionable}` },
        { value: "all", label: `Todo · ${items.length}` },
      ]}
    />
  ) : undefined;

  if (items.length === 0) {
    const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
    return (
      <div>
        <PageHeader title="Pendientes" description={description} />
        <EmptyState
          icon={<Sparkles />}
          title="Sin pendientes"
          className="mt-2"
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button asChild className="h-11 rounded-[12px] px-4 font-semibold">
                <Link href={`/agenda?fecha=${tomorrow}`}>
                  <CalendarDays /> Ver agenda de mañana
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-[12px] border-[#dfe3ea] px-4 font-semibold">
                <Link href="/ordenes">Ver órdenes abiertas</Link>
              </Button>
            </div>
          }
        >
          Nada espera acción en su alcance. Aproveche para revisar lo que viene.
        </EmptyState>
      </div>
    );
  }

  const featured = shown.slice(0, desktop ? 3 : 1);
  const listTitle = actionable === 0 ? "En seguimiento" : mine || others === 0 ? "A mi cargo" : "Todo lo pendiente";
  const clientOf = (it: PendingItem) => (it.clientId ? lk.clients.get(it.clientId) : undefined);
  const personOf = (it: PendingItem) => (it.actorId ? lk.users.get(it.actorId) : undefined);

  return (
    <div>
      <PageHeader title="Pendientes" description={description} actions={filterControl} />

      {desktop ? (
        <>
          <AuroraPanel className="p-3 sm:p-6 lg:p-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:gap-10">
              <GlassCard className="p-5 sm:p-7">
                <QueueSummary sentence={sentence} groups={groups} onJump={jump} />
              </GlassCard>
              <div className="flex min-w-0 flex-col gap-3">
                <LeadCard it={featured[0]} now={now} client={clientOf(featured[0])} person={personOf(featured[0])} className="flex-1" />
                {featured.length > 1 && <FollowList items={featured.slice(1)} now={now} clients={lk.clients} />}
              </div>
            </div>
          </AuroraPanel>

          <section className="mt-10 grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 xl:border-r xl:border-hairline xl:pr-10">
              <SectionHeader
                title={`${listTitle} · ${shown.length}`}
                subtitle="Cada tipo va ordenado por urgencia."
              />
              <div key={filter}>
                {groups.map((g) => (
                  <GroupSection key={g.kind} group={g} now={now} clients={lk.clients} people={lk.users} desktop showBadge={showBadge} />
                ))}
              </div>
              {/* below xl the rail is hidden (rows need the width) and the doc-rule note closes the list */}
              <Insight icon={<BellOff />} className="mt-10 xl:hidden">
                {NOTE}
              </Insight>
            </div>
            <aside className="hidden min-w-0 xl:block xl:pl-10">
              <div className="xl:sticky xl:top-6">
                <SectionHeader title="Por tipo" />
                <TypeRail groups={groups} now={now} active={spy} onJump={jump} />
                <Insight icon={<BellOff />} className="mt-8">
                  {NOTE}
                </Insight>
              </div>
            </aside>
          </section>
        </>
      ) : (
        <>
          <LeadNextStep it={featured[0]} now={now} client={clientOf(featured[0])} person={personOf(featured[0])} />
          <Panel className="mt-4 p-5">
            <QueueSummary sentence={sentence} groups={groups} onJump={jump} />
          </Panel>

          <div key={filter} className="mt-9">
            {groups.map((g) => (
              <GroupSection key={g.kind} group={g} now={now} clients={lk.clients} people={lk.users} desktop={false} showBadge={showBadge} />
            ))}
          </div>
          <Insight icon={<BellOff />} className="mt-10">
            {NOTE}
          </Insight>
        </>
      )}
    </div>
  );
}
