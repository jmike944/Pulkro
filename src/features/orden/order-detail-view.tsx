"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { ORDER_STATUS } from "@/lib/status";
import type { OrderStatus } from "@/lib/types";
import type { TabItem } from "@/components/pk/page";
import { UnderlineTabs } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { IncidentSheet } from "@/components/pk/incident-sheet";
import { Button } from "@/components/ui/button";
import { ORDER_TABS, OrderProvider, useOrderDetailData, type OrderDetail, type OrderTab, type OrderUi } from "./order-context";
import { OrderHeader } from "./order-header";
import { SummaryTab } from "./summary-tab";
import { JornadasTab } from "./jornadas-tab";
import { EvidenceTab } from "./evidence-tab";
import { IncidentsTab } from "./incidents-tab";
import { ActivityTab } from "./activity-tab";
import { ClosureDialog } from "./closure-dialog";
import { CrewDialog } from "./crew-dialog";
import { ScheduleDialog } from "./schedule-dialog";
import { EditOrderDialog } from "./edit-order-dialog";
import { CancelDialog, ReopenDialog } from "./status-dialogs";
import { PhotoDialog } from "./photo-dialog";

/**
 * /ordenes/[folio] — order detail + closure (doc §3, §4.1–4.3, §8, §10).
 * Tabs and the closure dialog live in the URL (?tab=…, ?cerrar=1) and are updated with the native
 * History API, so switching is instant and works offline.
 */
export function OrderDetailView({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: raw } = use(params);
  const folio = decodeURIComponent(raw);
  const d = useOrderDetailData(folio);
  if (!d) return <OrderNotFound folio={folio} />;
  return <OrderDetailScreen d={d} />;
}

function OrderNotFound({ folio }: { folio: string }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <EmptyState
        icon={<FileSearch />}
        title="No encontramos esta orden"
        className="w-full max-w-lg border-none"
        action={
          <Button asChild className="h-10 rounded-[12px] px-5 font-semibold">
            <Link href="/ordenes">Volver a órdenes</Link>
          </Button>
        }
      >
        La orden <b className="font-semibold text-ink">{folio}</b> no existe o no está dentro de su alcance. Los supervisores ven sus órdenes asignadas y Administración las de su
        unidad.
      </EmptyState>
    </div>
  );
}

function OrderDetailScreen({ d }: { d: OrderDetail }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const setOrderStatus = useAppStore((s) => s.setOrderStatus);
  const tabsRef = useRef<HTMLDivElement>(null);

  const tabParam = searchParams.get("tab");
  const tab: OrderTab = (ORDER_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as OrderTab) : "resumen";
  const wantsClosure = searchParams.get("cerrar") === "1";
  const closureOk = d.gates.closure.ok;
  const closureReason = d.gates.closure.reason;

  const [crew, setCrew] = useState<{ open: boolean; jornadaId?: string }>({ open: false });
  const [incident, setIncident] = useState<{ open: boolean; jornadaId?: string }>({ open: false });
  const [schedule, setSchedule] = useState<{ open: boolean; mode: "reprogramar" | "agregar" }>({ open: false, mode: "reprogramar" });
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);

  const setParams = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(window.location.search);
      mutate(sp);
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  // ?cerrar=1 coming from lists/dashboard: explain why it can't open, then drop the flag.
  // After a successful validation the gate closes too — then just drop the flag silently.
  const closureShown = useRef(false);
  useEffect(() => {
    if (!wantsClosure) {
      closureShown.current = false;
      return;
    }
    if (closureOk) {
      closureShown.current = true;
      return;
    }
    if (!closureShown.current) toast.info(closureReason ?? "No es posible validar el cierre", { id: "cerrar-bloqueado" });
    closureShown.current = false;
    setParams((sp) => sp.delete("cerrar"));
  }, [wantsClosure, closureOk, closureReason, setParams]);

  const ui: OrderUi = {
    setTab: (t, opts) => {
      setParams((sp) => (t === "resumen" ? sp.delete("tab") : sp.set("tab", t)));
      if (opts?.scroll) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    openClosure: () => {
      if (!d.gates.closure.ok) {
        toast.info(d.gates.closure.reason ?? "No es posible validar el cierre");
        return;
      }
      setParams((sp) => sp.set("cerrar", "1"));
    },
    openCrew: (jornadaId) => setCrew({ open: true, jornadaId }),
    openIncident: (jornadaId) => setIncident({ open: true, jornadaId }),
    openSchedule: (mode) => setSchedule({ open: true, mode }),
    openEdit: () => setEditOpen(true),
    openCancel: () => setCancelOpen(true),
    openReopen: () => setReopenOpen(true),
    openPhoto: (id) => setPhotoId(id),
    confirmDates: () => {
      const js = d.jornadas;
      const next: OrderStatus = js.some((j) => j.status === "en_curso") ? "en_ejecucion" : js.some((j) => j.status === "cerrada") ? "jornada_cerrada" : "programada";
      setOrderStatus(d.order.id, next, "Fechas confirmadas con el cliente");
      toast.success("Fechas confirmadas", { description: `La orden vuelve a ${ORDER_STATUS[next].label}.` });
    },
  };

  const tabs: TabItem[] = [
    { value: "resumen", label: "Resumen" },
    { value: "jornadas", label: "Jornadas", count: d.jornadas.length },
    { value: "evidencia", label: "Evidencia", count: `${d.evidence.present}/${d.evidence.required}` },
    { value: "incidencias", label: "Incidencias", count: d.incidents.length },
    { value: "actividad", label: "Actividad", count: d.audit.length },
  ];

  return (
    <OrderProvider value={{ d, ui }}>
      <OrderHeader />

      <div ref={tabsRef} className="scroll-mt-24 lg:scroll-mt-6">
        <UnderlineTabs id="orden-tabs" items={tabs} value={tab} onChange={(v) => ui.setTab(v as OrderTab)} className="mb-8" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          aria-label={tabs.find((t) => t.value === tab)?.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {tab === "resumen" && <SummaryTab />}
          {tab === "jornadas" && <JornadasTab />}
          {tab === "evidencia" && <EvidenceTab />}
          {tab === "incidencias" && <IncidentsTab />}
          {tab === "actividad" && <ActivityTab />}
        </motion.div>
      </AnimatePresence>

      <ClosureDialog open={wantsClosure && closureOk} onOpenChange={(v) => !v && setParams((sp) => sp.delete("cerrar"))} />
      <CrewDialog open={crew.open} jornadaId={crew.jornadaId} onOpenChange={(v) => setCrew((c) => ({ ...c, open: v }))} />
      <ScheduleDialog open={schedule.open} mode={schedule.mode} onOpenChange={(v) => setSchedule((s) => ({ ...s, open: v }))} />
      <EditOrderDialog open={editOpen} onOpenChange={setEditOpen} />
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} />
      <ReopenDialog open={reopenOpen} onOpenChange={setReopenOpen} />
      <PhotoDialog photoId={photoId} onOpenChange={(v) => !v && setPhotoId(null)} />
      <IncidentSheet
        orderId={d.order.id}
        jornadaId={incident.jornadaId}
        open={incident.open}
        onOpenChange={(v) => setIncident((s) => ({ ...s, open: v }))}
        onCreated={() => ui.setTab("incidencias")}
      />
    </OrderProvider>
  );
}
