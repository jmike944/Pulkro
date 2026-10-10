"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useAnimate, type Variants } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, CircleAlert, ClipboardList, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser, useIsOffline, useLookups, useMediaQuery, useScopedData, useShallow } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtDay, fmtHours, plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { canSeeOrder } from "@/lib/permissions";
import type { Order, Role } from "@/lib/types";
import { PageHeader } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { PulkroMark } from "@/components/pk/brand";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill } from "@/components/pk/status";
import { AnimatedNumber } from "@/components/pk/bits";
import { AuroraStat, BigButton, FlowHeading, FlowScreen, ItemCard, SuccessHero } from "@/components/pk/mobile";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  STEPS,
  dateKey,
  dayMinutes,
  initialDraft,
  normalizeRef,
  provisionalFolio,
  suggestedTitle,
  toInput,
  validateStep,
  willBeScheduled,
  type Draft,
} from "./draft";
import { Stepper } from "./stepper";
import { StepClient } from "./step-client";
import { StepService } from "./step-service";
import { StepSchedule } from "./step-schedule";
import { StepReview } from "./step-review";
import { LiveSummary } from "./live-summary";
import { SummaryButton, SummarySheet } from "./summary-sheet";
import type { StepProps } from "./step-types";

const STEP_COPY = [
  { title: "¿Para quién es el servicio?", body: "Cliente, sitio, contacto en sitio y la referencia de la autorización comercial." },
  { title: "¿Qué se va a hacer?", body: "Tipo de servicio, actividades, materiales e instrucciones especiales." },
  { title: "¿Cuándo y con quién?", body: "Supervisor responsable, jornadas y cuadrilla." },
  { title: "Revise y cree la orden", body: "Confirme los datos antes de guardar. Todo cambio queda en la bitácora." },
] as const;

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 44, filter: "blur(8px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.42, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, x: d * -44, filter: "blur(8px)", transition: { duration: 0.22, ease: EASE } }),
};

/** /ordenes/nueva — "Alta manual de orden de servicio" (doc §3 paso 2, §4.1). */
export function NewOrderView() {
  const canCreate = useCan("order.create");
  const user = useCurrentUser();
  if (!canCreate) return <NoPermission role={user.role} />;
  return <NewOrderWizard />;
}

function NoPermission({ role }: { role: Role }) {
  return (
    <div>
      <PageHeader breadcrumb={[{ label: "Órdenes", href: "/ordenes" }, { label: "Nueva orden" }]} title="Nueva orden" description="Alta manual de orden de servicio." />
      <EmptyState
        icon={<Lock />}
        title={role === "direccion" ? "Dirección solo consulta" : "Sin permiso para crear órdenes"}
        action={
          <Button asChild variant="outline" className="h-11 rounded-[14px] px-5 font-semibold">
            <Link href="/ordenes">Ver órdenes</Link>
          </Button>
        }
      >
        Las órdenes las dan de alta Administración y los supervisores. Desde Dirección puede consultar órdenes, indicadores y exportaciones.
      </EmptyState>
    </div>
  );
}

function NewOrderWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const user = useCurrentUser();
  const lk = useLookups();
  const canAssign = useCan("crew.assign");
  const offline = useIsOffline();
  const isPhone = useMediaQuery("(max-width: 767px)");
  const createOrder = useAppStore((s) => s.createOrder);
  const { clients, users, serviceTypes, materials, allOrders } = useAppStore(
    useShallow((s) => ({ clients: s.clients, users: s.users, serviceTypes: s.serviceTypes, materials: s.materials, allOrders: s.orders })),
  );
  const { orders: scopedOrders } = useScopedData();

  /* Clients the creator may open orders for: their own unit. */
  const allowedClients = useMemo(() => clients.filter((c) => c.unitId === user.unitId), [clients, user.unitId]);

  const [draft, setDraft] = useState<Draft>(() => {
    const pre = params.get("cliente");
    const client = clients.find((c) => c.id === pre && c.unitId === user.unitId);
    return initialDraft({ user, client, now: new Date() });
  });
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set());
  const [created, setCreated] = useState<Order | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const [nextScope, animateNext] = useAnimate<HTMLSpanElement>();

  const today = dateKey(new Date());
  const site = lk.sites.get(draft.siteId);
  const service = lk.serviceTypes.get(draft.serviceTypeId);
  const client = lk.clients.get(draft.clientId);
  const title = draft.titleEdited ? draft.title : suggestedTitle(service, site?.name);
  const folio = created?.folio ?? provisionalFolio(allOrders);

  const duplicateRefFolio = useMemo(() => {
    const ref = normalizeRef(draft.commercialRef);
    if (!ref) return undefined;
    return allOrders.find((o) => o.status !== "cancelada" && o.commercialRef.toUpperCase() === ref)?.folio;
  }, [allOrders, draft.commercialRef]);

  const supervisors = useMemo(
    () =>
      users
        .filter((u) => u.role === "supervisor" && u.active && u.unitId === (client?.unitId ?? user.unitId))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [users, client?.unitId, user.unitId],
  );

  const issuesByStep = useMemo(
    () => STEPS.map((_, i) => validateStep(i, draft, { today, title, duplicateRefFolio })),
    [draft, today, title, duplicateRefFolio],
  );
  const done = issuesByStep.map((x) => !x.first);
  /** valid AND already visited — what the stepper and summary show as complete */
  const complete = done.map((ok, i) => ok && i <= maxStep);
  const issues = issuesByStep[step];
  const reachable = (i: number) => i <= step || done.slice(0, i).every(Boolean);

  const errorOf = (field: string) => (touched.has(field) || attempted.has(step) ? issues.errors[field] : undefined);
  const touch = (field: string) => setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));

  // Warn before closing the tab with a half-filled order (client-side navigations are free).
  const dirty = !created && !!(draft.clientId || draft.serviceTypeId || draft.commercialRef.trim());
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const scrollTop = () => requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const go = (i: number) => {
    if (i === step || i < 0 || i >= STEPS.length || !reachable(i)) return;
    setDir(i > step ? 1 : -1);
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
    scrollTop();
  };

  const reveal = () => {
    setAttempted((a) => new Set(a).add(step));
    if (nextScope.current) void animateNext(nextScope.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.42 });
  };

  const submit = () => {
    if (created) return;
    const firstInvalid = issuesByStep.findIndex((x) => x.first);
    if (firstInvalid !== -1) {
      if (firstInvalid !== step) {
        toast.error("Falta información", { description: issuesByStep[firstInvalid].first });
        setAttempted((a) => new Set(a).add(firstInvalid));
        go(firstInvalid);
      } else reveal();
      return;
    }
    const order = createOrder(toInput(draft, title, canAssign));
    setCreated(order);
    useUi.getState().fireCelebrate();
    const handedOff = !canSeeOrder(user, order, "all");
    toast.success(`Orden ${order.folio} creada`, {
      description: handedOff
        ? `Asignada a ${lk.users.get(order.supervisorId)?.name ?? "otro supervisor"}.`
        : order.status === "programada"
          ? `Programada · ${plural(order.plannedDays, "jornada", "jornadas")} con cuadrilla asignada.`
          : "Guardada como Borrador: falta asignar la cuadrilla.",
    });
    if (!isPhone) router.push(handedOff ? "/ordenes" : `/ordenes/${order.folio}`);
  };

  const next = () => {
    if (step === STEPS.length - 1) return submit();
    if (issues.first) return reveal();
    go(step + 1);
  };

  const common: StepProps = { draft, setDraft, issues, errorOf, touch };
  const body =
    step === 0 ? (
      <StepClient {...common} clients={allowedClients} orders={scopedOrders} />
    ) : step === 1 ? (
      <StepService {...common} serviceTypes={serviceTypes} materials={materials} orders={allOrders} title={title} />
    ) : step === 2 ? (
      <StepSchedule {...common} user={user} canAssign={canAssign} supervisors={supervisors} orders={scopedOrders} today={today} />
    ) : (
      <StepReview {...common} title={title} folio={folio} canAssign={canAssign} offline={offline} onEdit={go} />
    );

  const isLast = step === STEPS.length - 1;
  const primaryLabel = isLast ? "Crear orden" : `Siguiente`;

  const assignNote = !canAssign && (
    <p className="mt-4 px-2 text-[13px] leading-relaxed text-subtle">
      Como {user.role === "administracion" ? "Administración" : "este rol"} da de alta la orden; el supervisor asigna la cuadrilla y la programa.
    </p>
  );
  /* Below xl the sticky aside is hidden: the same summary opens on demand. */
  const summarySheet = (
    <SummarySheet open={summaryOpen} onOpenChange={setSummaryOpen} draft={draft} title={title} folio={folio} canAssign={canAssign} done={complete} current={step} note={assignNote} />
  );

  const animatedBody = (
    <AnimatePresence mode="wait" custom={dir} initial={false}>
      <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit">
        {body}
      </motion.div>
    </AnimatePresence>
  );

  /* ───────── phone: full-screen flow ending in a success screen ───────── */
  if (isPhone) {
    const footer = created ? (
      <div className="space-y-2.5">
        {canSeeOrder(user, created, "all") && (
          <BigButton href={`/ordenes/${created.folio}`}>
            Ver orden {created.folio}
            <ArrowRight />
          </BigButton>
        )}
        <BigButton variant={canSeeOrder(user, created, "all") ? "outline" : "primary"} href="/ordenes">
          Volver a Órdenes
        </BigButton>
      </div>
    ) : (
      <div>
        <AnimatePresence initial={false}>
          {issues.first && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn("flex items-center justify-center gap-1.5 overflow-hidden pb-2.5 text-center text-[13.5px]", attempted.has(step) ? "text-st-red" : "text-subtle")}
            >
              <CircleAlert className="size-3.5 shrink-0" />
              {issues.first}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex gap-2.5">
          {step > 0 && (
            <BigButton variant="outline" onClick={() => go(step - 1)} className="w-[64px] shrink-0">
              <ChevronLeft />
              <span className="sr-only">Atrás</span>
            </BigButton>
          )}
          <span ref={nextScope} className="block min-w-0 flex-1">
            <BigButton onClick={next} className={cn(issues.first && "opacity-50")}>
              {isLast && <Sparkles />}
              {primaryLabel}
            </BigButton>
          </span>
        </div>
      </div>
    );

    return (
      <>
        <PageHeader breadcrumb={[{ label: "Órdenes", href: "/ordenes" }, { label: "Nueva orden" }]} title="Nueva orden" />
        <FlowScreen
          open
          onOpenChange={(v) => {
            if (!v) router.push(created && canSeeOrder(user, created, "all") ? `/ordenes/${created.folio}` : "/ordenes");
          }}
          title={created ? undefined : "Nueva orden"}
          closeSide={created ? "right" : "left"}
          description="Alta manual de orden de servicio"
          footer={footer}
        >
          {created ? (
            <PhoneSuccess order={created} draft={draft} />
          ) : (
            <>
              <div ref={topRef} className="scroll-mt-4" />
              <Stepper current={step} done={complete} reachable={reachable} onSelect={go} />
              <SummaryButton className="mt-4" scheduled={willBeScheduled(draft, canAssign)} onClick={() => setSummaryOpen(true)} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                  <FlowHeading
                    className="mb-4 mt-5"
                    eyebrow={
                      <>
                        <PulkroMark className="size-5 rounded-[6px]" />
                        {folio} · {STEPS[step].short}
                      </>
                    }
                    title={STEP_COPY[step].title}
                  >
                    {STEP_COPY[step].body}
                  </FlowHeading>
                </motion.div>
              </AnimatePresence>
              {animatedBody}
              {summarySheet}
            </>
          )}
        </FlowScreen>
      </>
    );
  }

  /* ───────── tablet / desktop page ───────── */
  return (
    <div>
      <div ref={topRef} className="scroll-mt-6" />
      <PageHeader
        breadcrumb={[{ label: "Órdenes", href: "/ordenes" }, { label: "Nueva orden" }]}
        title="Nueva orden"
        description={
          <>
            Alta manual de orden de servicio. El trabajo ya viene <b>autorizado por el sistema comercial</b>; aquí se programa la operación.
          </>
        }
        actions={
          <Button asChild variant="outline" className="h-11 rounded-[14px] border-[#dfe3ea] px-4 text-[14.5px] font-semibold">
            <Link href="/ordenes">Cancelar</Link>
          </Button>
        }
      />

      <Stepper current={step} done={complete} reachable={reachable} onSelect={go} />

      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-0">
        <div className="min-w-0 xl:border-r xl:border-hairline xl:pr-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="mb-5">
              <h2 className="font-serif text-[28px] font-medium leading-tight tracking-[-0.01em] text-ink">{STEP_COPY[step].title}</h2>
              <p className="mt-1.5 text-[14.5px] text-subtle">{STEP_COPY[step].body}</p>
            </motion.div>
          </AnimatePresence>

          {animatedBody}

          <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] z-30 mt-8 lg:bottom-4">
            <div className="flex items-center gap-2.5 rounded-[20px] border border-hairline bg-white/92 p-2.5 pl-4 shadow-lift backdrop-blur-xl">
              <div className="min-w-0 flex-1 text-[13.5px]" aria-live="polite">
                {issues.first ? (
                  <p className={cn("flex items-center gap-1.5 truncate", attempted.has(step) ? "text-st-red" : "text-subtle")}>
                    <CircleAlert className="size-4 shrink-0" />
                    <span className="truncate">{issues.first}</span>
                  </p>
                ) : (
                  <p className="truncate text-subtle">
                    Paso {step + 1} de {STEPS.length}
                    {!isLast && (
                      <>
                        {" "}
                        · sigue <span className="font-medium text-ink">{STEPS[step + 1].label}</span>
                      </>
                    )}
                    {isLast && (
                      <>
                        {" "}
                        · <span className="font-medium text-ink">{fmtHours(draft.days.reduce((s, d) => s + dayMinutes(d), 0))}</span> planeadas
                      </>
                    )}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSummaryOpen(true)}
                className="h-11 rounded-[14px] border-[#dfe3ea] px-4 text-[14.5px] font-semibold xl:hidden"
              >
                <ClipboardList className="size-4" />
                Resumen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => go(step - 1)}
                disabled={step === 0}
                className="h-11 rounded-[14px] border-[#dfe3ea] px-4 text-[14.5px] font-semibold"
              >
                <ChevronLeft className="size-4" />
                Atrás
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span ref={nextScope} className="inline-flex">
                    <Button
                      type="button"
                      onClick={next}
                      aria-disabled={!!issues.first || !!created}
                      className={cn("group h-11 min-w-[132px] rounded-[14px] px-5 text-[14.5px] font-semibold", (issues.first || created) && "opacity-55")}
                    >
                      {isLast && <Sparkles className="size-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />}
                      {primaryLabel}
                      {!isLast && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
                    </Button>
                  </span>
                </TooltipTrigger>
                {issues.first && <TooltipContent side="top">{issues.first}</TooltipContent>}
              </Tooltip>
            </div>
          </div>
        </div>

        <aside className="hidden min-w-0 xl:block xl:pl-10">
          <div className="sticky top-6">
            <LiveSummary draft={draft} title={title} folio={folio} canAssign={canAssign} done={complete} current={step} />
            {assignNote}
          </div>
        </aside>
      </div>
      {summarySheet}
    </div>
  );
}

function PhoneSuccess({ order, draft }: { order: Order; draft: Draft }) {
  const lk = useLookups();
  const client = lk.clients.get(order.clientId);
  const minutes = draft.days.reduce((s, d) => s + dayMinutes(d), 0);
  const dates = draft.days.map((d) => d.date).sort();
  const status = ORDER_STATUS[order.status];
  return (
    <div className="pb-2">
      <SuccessHero title="Orden creada">
        <b className="font-semibold text-ink">{order.folio}</b> quedó en <b className="font-semibold text-ink">{status.label}</b>.{" "}
        {order.status === "programada" ? "Ya aparece en la agenda del supervisor." : "El supervisor asignará la cuadrilla para programarla."}
      </SuccessHero>
      <ItemCard
        className="mt-8"
        leading={client ? <ClientMark name={client.name} hue={client.hue} size={44} /> : undefined}
        title={order.title}
        sub={`${order.folio} · ${client?.shortName ?? ""}`}
        status={<OrderStatusPill status={order.status} />}
      />
      <AuroraStat
        className="mt-5"
        label="Horas planeadas"
        value={
          <span className="flex items-baseline gap-2">
            <AnimatedNumber value={Math.round((minutes / 60) * 10) / 10} format={{ maximumFractionDigits: 1 }} />
            <span className="text-[18px] font-normal tracking-normal text-subtle">h</span>
          </span>
        }
        sub={`${plural(draft.days.length, "jornada", "jornadas")}${dates.length ? ` · ${dates.length > 1 ? `${fmtDay(dates[0])} – ${fmtDay(dates[dates.length - 1])}` : fmtDay(dates[0])}` : ""}`}
      />
    </div>
  );
}
