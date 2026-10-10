"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCan, useLookups, useNow } from "@/lib/hooks";
import { daysUntil, fmtDate, plural } from "@/lib/format";
import { exportToExcel } from "@/lib/export";
import { CASE_CATEGORY, CASE_CHANNEL, CASE_STATUS, SEVERITY } from "@/lib/status";
import type { CaseChannel, PostSaleCase } from "@/lib/types";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { FadeIn } from "@/components/pk/motion";
import { ClientMark } from "@/components/pk/client-mark";
import { Button } from "@/components/ui/button";
import { CaseBoard } from "./case-board";
import { FollowUpPanel, pendingFollowUps } from "./followup-panel";
import { NewCaseDialog, type NewCaseDefaults } from "./new-case-dialog";
import { SatisfactionHero } from "./satisfaction-hero";
import { SurveysPanel } from "./surveys-panel";
import { csatOf, inLastDays, isCaseOpen, SURVEY_CHANNEL_LABEL } from "./lib";
import { usePostventaData } from "./use-postventa";
import { Gate, REASON_EXPORT, REASON_POSTVENTA, outlineBtnCls } from "./ui";

type Tab = "casos" | "encuestas" | "seguimiento";

/** /postventa — complaints, satisfaction surveys and follow-up (doc §4.4, §5). */
export function PostventaView() {
  const params = useSearchParams();
  const folio = params.get("orden");
  return <PostventaInner key={folio ?? "all"} folio={folio} />;
}

function PostventaInner({ folio }: { folio: string | null }) {
  const data = usePostventaData();
  const { caseRows, surveyRows, followUps, orders, cases, surveys } = data;
  const canManage = useCan("postventa.manage");
  const canExport = useCan("export.excel");
  const router = useRouter();
  const lk = useLookups();
  const now = useNow(60_000);

  const focus = folio ? orders.find((o) => o.folio === folio) : undefined;
  const pending = useMemo(() => pendingFollowUps(followUps, now, focus?.id), [followUps, now, focus?.id]);

  const [tab, setTab] = useState<Tab>(() => {
    if (!focus) return "casos";
    if (cases.some((c) => c.orderId === focus.id)) return "casos";
    if (surveys.some((s) => s.orderId === focus.id)) return "encuestas";
    return "seguimiento";
  });
  const [newCase, setNewCase] = useState<{ open: boolean; defaults?: NewCaseDefaults }>({ open: false });

  // Bring the focused order (?orden=) into view once the lists have animated in.
  const focusId = focus?.id;
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('[data-focus="true"]')).find((n) => n.offsetParent !== null);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 650);
    return () => clearTimeout(t);
  }, [focusId, tab]);

  const scopedCases = focus ? caseRows.filter((r) => r.c.orderId === focus.id) : caseRows;
  const scopedSurveys = focus ? surveyRows.filter((r) => r.order.id === focus.id) : surveyRows;

  const caseByOrder = useMemo(() => {
    const m = new Map<string, PostSaleCase>();
    // prefer the open case per order
    [...cases].sort((a, b) => Number(isCaseOpen(a)) - Number(isCaseOpen(b))).forEach((c) => m.set(c.orderId, c));
    return m;
  }, [cases]);

  const openCases = cases.filter(isCaseOpen);
  const dueToday = openCases.filter((c) => daysUntil(c.dueDate) === 0).length;
  const overdue = openCases.filter((c) => daysUntil(c.dueDate) < 0).length;
  const answered30 = surveys.filter((s) => s.answers && inLastDays(s.respondedAt, 30, now));
  const csat30 = csatOf(answered30);

  const openNewCase = (defaults?: NewCaseDefaults) => {
    if (!canManage) return;
    setNewCase({ open: true, defaults });
  };

  const exportAll = async () => {
    const byId = new Map(orders.map((o) => [o.id, o] as const));
    await exportToExcel(`postventa-${now.toISOString().slice(0, 10)}`, [
      {
        name: "Casos",
        columns: [
          { header: "Folio", key: "folio", width: 10 },
          { header: "Orden", key: "orden", width: 12 },
          { header: "Cliente", key: "cliente", width: 28 },
          { header: "Categoría", key: "categoria", width: 22 },
          { header: "Severidad", key: "severidad" },
          { header: "Canal", key: "canal" },
          { header: "Estado", key: "estado" },
          { header: "Responsable", key: "responsable", width: 26 },
          { header: "Compromiso", key: "compromiso", width: 14 },
          { header: "Descripción", key: "descripcion", width: 50 },
          { header: "Resolución", key: "resolucion", width: 50 },
        ],
        rows: caseRows.map((r) => ({
          folio: r.c.folio,
          orden: r.order?.folio,
          cliente: r.client?.name,
          categoria: CASE_CATEGORY[r.c.category],
          severidad: SEVERITY[r.c.severity].label,
          canal: CASE_CHANNEL[r.c.channel],
          estado: CASE_STATUS[r.c.status].label,
          responsable: r.owner?.name,
          compromiso: fmtDate(r.c.dueDate),
          descripcion: r.c.description,
          resolucion: r.c.resolution ?? "",
        })),
      },
      {
        name: "Encuestas",
        columns: [
          { header: "Orden", key: "orden", width: 12 },
          { header: "Cliente", key: "cliente", width: 28 },
          { header: "Enviada", key: "enviada", width: 14 },
          { header: "Canal", key: "canal" },
          { header: "Estado", key: "estado" },
          { header: "General", key: "general" },
          { header: "Calidad", key: "calidad" },
          { header: "Puntualidad", key: "puntualidad" },
          { header: "Trato", key: "trato" },
          { header: "NPS", key: "nps" },
          { header: "Comentario", key: "comentario", width: 50 },
          { header: "Respondió", key: "respondio", width: 24 },
        ],
        rows: surveyRows.map((r) => ({
          orden: byId.get(r.s.orderId)?.folio,
          cliente: r.client?.name,
          enviada: fmtDate(r.s.sentAt),
          canal: SURVEY_CHANNEL_LABEL[r.s.channel],
          estado: r.s.respondedAt ? (r.s.manual ? "Respondida (manual)" : "Respondida") : "Pendiente",
          general: r.s.answers?.overall,
          calidad: r.s.answers?.quality,
          puntualidad: r.s.answers?.punctuality,
          trato: r.s.answers?.staff,
          nps: r.s.answers?.nps,
          comentario: r.s.answers?.comment ?? "",
          respondio: r.s.respondentName ?? "",
        })),
      },
    ]);
    toast.success("Excel de postventa descargado");
  };

  const description = (
    <>
      <b>{plural(openCases.length, "caso abierto", "casos abiertos")}</b>
      {dueToday > 0 && `, ${plural(dueToday, "vence", "vencen")} hoy`}
      {overdue > 0 && (
        <>
          {dueToday > 0 ? " y " : ", "}
          <b>{plural(overdue, "vencido", "vencidos")}</b>
        </>
      )}
      .{" "}
      {answered30.length ? (
        <>
          Satisfacción <b>{csat30.toFixed(1)} / 5</b> en 30 días.
        </>
      ) : (
        "Sin respuestas de encuesta en 30 días."
      )}
    </>
  );

  const focusClient = focus ? lk.clients.get(focus.clientId) : undefined;

  return (
    <div>
      <PageHeader
        title="Postventa"
        description={description}
        actions={
          <>
            <Gate allowed={canExport} reason={REASON_EXPORT}>
              <Button variant="outline" disabled={!canExport} onClick={() => void exportAll().catch(() => toast.error("No se pudo generar el Excel"))} className={outlineBtnCls}>
                <Download /> Exportar
              </Button>
            </Gate>
            <Gate allowed={canManage} reason={REASON_POSTVENTA}>
              <Button disabled={!canManage} onClick={() => openNewCase(focus ? { orderId: focus.id } : undefined)} className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
                <Plus /> Nuevo caso
              </Button>
            </Gate>
          </>
        }
      />

      <SatisfactionHero surveys={surveys} cases={cases} now={now} />

      <section className="mt-10">
        <UnderlineTabs
          id="pv-tabs"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: "casos", label: "Casos", count: focus ? scopedCases.length : openCases.length },
            { value: "encuestas", label: "Encuestas", count: scopedSurveys.length },
            { value: "seguimiento", label: "Por dar seguimiento", count: focus ? pending.filter((r) => r.order.id === focus.id).length : pending.length },
          ]}
        />

        <AnimatePresence>
          {folio && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-sky-soft/70 px-4 py-3 text-[14px] text-ink">
                {focusClient && <ClientMark name={focusClient.name} hue={focusClient.hue} size={28} />}
                <span className="min-w-0 flex-1">
                  {focus ? (
                    <>
                      Mostrando <b className="font-semibold tabular">{focus.folio}</b> · {focus.title}
                    </>
                  ) : (
                    <>
                      No encontramos la orden <b className="font-semibold">{folio}</b> en su alcance.
                    </>
                  )}
                </span>
                <Button variant="ghost" onClick={() => router.replace("/postventa", { scroll: false })} className="h-10 rounded-[12px] px-3 text-link">
                  <X /> Ver todo
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <FadeIn key={tab}>
            {tab === "casos" && <CaseBoard rows={scopedCases} canManage={canManage} focusOrderId={focus?.id} />}
            {tab === "encuestas" && (
              <SurveysPanel
                rows={scopedSurveys}
                canManage={canManage}
                focusOrderId={focus?.id}
                caseByOrder={caseByOrder}
                onOpenCase={(orderId: string, channel: CaseChannel, desc?: string) => openNewCase({ orderId, channel, description: desc })}
              />
            )}
            {tab === "seguimiento" && <FollowUpPanel rows={focus ? followUps.filter((f) => f.order.id === focus.id) : followUps} now={now} canManage={canManage} focusOrderId={focus?.id} />}
          </FadeIn>
        </AnimatePresence>
      </section>

      <NewCaseDialog open={newCase.open} defaults={newCase.defaults} onOpenChange={(v) => setNewCase((s) => ({ ...s, open: v }))} />
    </div>
  );
}
