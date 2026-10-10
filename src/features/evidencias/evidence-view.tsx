"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLookups, useNow, useScopedData } from "@/lib/hooks";
import { closedAt, photoCompliance } from "@/lib/metrics";
import { fmtNum, fmtPct, plural } from "@/lib/format";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { ClientMark } from "@/components/pk/client-mark";
import { EASE } from "@/components/pk/motion";
import { despuesResponse, evidenceRequests } from "./evidence-data";
import { PendingTab } from "./pending-tab";
import { GalleryTab } from "./gallery-tab";
import { ComplianceTab } from "./compliance-tab";

type TabKey = "pendientes" | "galeria" | "cumplimiento";
const TABS: TabKey[] = ["pendientes", "galeria", "cumplimiento"];

/** /evidencias — missing-evidence requests, photo gallery and photo compliance (doc §4.2 · §5 · §8). */
export function EvidenceView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const folio = params.get("orden");
  const data = useScopedData();
  const lk = useLookups();
  const now = useNow(60_000);

  const filterOrder = useMemo(() => (folio ? data.orders.find((o) => o.folio === folio) : undefined), [folio, data.orders]);

  const allRequests = useMemo(() => evidenceRequests(data.orders, data.jornadas, data.photos, now), [data.orders, data.jornadas, data.photos, now]);
  const requests = useMemo(
    () => (folio ? allRequests.filter((r) => r.order.id === filterOrder?.id) : allRequests),
    [allRequests, folio, filterOrder],
  );
  const photos = useMemo(() => (folio ? data.photos.filter((p) => p.orderId === filterOrder?.id) : data.photos), [data.photos, folio, filterOrder]);
  const response = useMemo(() => despuesResponse(data.jornadas, data.photos, now), [data.jornadas, data.photos, now]);
  const yearRate = useMemo(() => {
    const closed = data.orders.filter((o) => closedAt(o)?.getFullYear() === now.getFullYear());
    return photoCompliance(closed, data.jornadas, data.photos).rate;
  }, [data.orders, data.jornadas, data.photos, now]);

  const [tab, setTab] = useState<TabKey>(() => {
    const t = params.get("tab") as TabKey | null;
    if (t && TABS.includes(t)) return t;
    return folio && requests.length === 0 ? "galeria" : "pendientes";
  });

  const setOrderParam = (next: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set("orden", next);
    else sp.delete("orden");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openCount = requests.length;
  const orderCount = new Set(requests.map((r) => r.order.id)).size;
  const overdue = requests.filter((r) => r.overdue).length;

  const description =
    openCount === 0 ? (
      folio ? (
        <>
          <b>{folio}</b> no tiene evidencia pendiente.
        </>
      ) : (
        <>
          Evidencia al día: cada jornada ejecutada tiene fotos ANTES y DESPUÉS. <b>{fmtPct(yearRate)}</b> de cumplimiento en {now.getFullYear()}.
        </>
      )
    ) : (
      <>
        <b>{plural(openCount, "pendiente", "pendientes")}</b> en {folio ? folio : plural(orderCount, "orden", "órdenes")}.{" "}
        {overdue ? (
          <>
            <b>{plural(overdue, "vencida", "vencidas")}</b>.
          </>
        ) : (
          "Ninguna vencida."
        )}
      </>
    );

  const client = filterOrder ? lk.clients.get(filterOrder.clientId) : undefined;

  return (
    <div>
      <PageHeader title="Evidencias" description={description} />

      <UnderlineTabs
        id="evidencias-tabs"
        value={tab}
        onChange={(v) => setTab(v as TabKey)}
        items={[
          { value: "pendientes", label: "Pendientes", count: requests.length },
          { value: "galeria", label: "Galería", count: fmtNum(photos.length) },
          { value: "cumplimiento", label: "Cumplimiento", count: fmtPct(yearRate) },
        ]}
      />

      <AnimatePresence initial={false}>
        {folio && tab !== "cumplimiento" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex min-w-0 items-center gap-3 rounded-[16px] bg-blue-wash py-2 pl-2 pr-1.5">
              {client ? <ClientMark name={client.name} hue={client.hue} size={36} /> : null}
              <p className="min-w-0 flex-1 truncate text-[14px] text-ink">
                <span className="text-subtle">Orden </span>
                <b className="font-semibold tabular">{folio}</b>
                {filterOrder ? <span className="text-subtle"> · {filterOrder.title}</span> : <span className="text-subtle"> · no disponible en tu alcance</span>}
              </p>
              <button
                type="button"
                onClick={() => setOrderParam(null)}
                aria-label="Quitar filtro de orden"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-subtle transition hover:bg-surface hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="mt-7"
        >
          {tab === "pendientes" && <PendingTab requests={requests} response={response} />}
          {tab === "galeria" && <GalleryTab photos={photos} orders={data.orders} now={now} />}
          {tab === "cumplimiento" && (
            <ComplianceTab
              orders={data.orders}
              jornadas={data.jornadas}
              photos={data.photos}
              now={now}
              onOpenOrder={(f) => {
                setOrderParam(f);
                setTab("pendientes");
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
