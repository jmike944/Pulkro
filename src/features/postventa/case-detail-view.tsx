"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { BadgeCheck, CircleCheck, Inbox, MessageSquareText, RotateCcw, ShieldCheck, StickyNote, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useCan, useCanonicalFolio, useLookups, useOrderBundle, useScopedData } from "@/lib/hooks";
import { findByRef } from "@/lib/folio";
import { firstName, fmtDateTime, plural } from "@/lib/format";
import { CASE_CATEGORY, CASE_CHANNEL, CASE_STATUS, ROLE_LABEL } from "@/lib/status";
import type { PostSaleCase } from "@/lib/types";
import { PageHeader } from "@/components/pk/page";
import { NotFoundOrOutOfScope } from "@/components/shell/out-of-scope";
import { ClientMark } from "@/components/pk/client-mark";
import { SectionHeader } from "@/components/pk/bits";
import { TonePill } from "@/components/pk/status";
import { Timeline, type TimelineStep } from "@/components/pk/timeline";
import { PhotoCaptureButtons } from "@/components/pk/photo-capture";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CaseSidePanel } from "./case-side-panel";
import { CaseOrderCard, CaseOrderIncidents, CaseOrderSurvey } from "./case-order";
import { channelText, isCaseOpen } from "./lib";
import { Gate, REASON_POSTVENTA, textareaCls } from "./ui";

/** /postventa/[folio] — claim-detail layout for one post-sale case. */
export function CaseDetailView({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: raw } = use(params);
  const folio = decodeURIComponent(raw);
  const scoped = useScopedData();
  // Its folio, its id, or the provisional folio it had before the server assigned the real one (lib/folio.ts).
  const c = findByRef(scoped.cases, folio);
  useCanonicalFolio(folio, c?.folio, "/postventa/");

  if (!c) {
    // One state for "doesn't exist" and "outside your scope" (doc §2): it never says which.
    return (
      <div>
        <PageHeader title="Caso postventa" breadcrumb={[{ label: "Postventa", href: "/postventa" }, { label: "Caso" }]} />
        <NotFoundOrOutOfScope subject="Este caso" backHref="/postventa" backLabel="Volver a Postventa" />
      </div>
    );
  }
  return <CaseDetail key={c.id} c={c} />;
}

function noteIcon(text: string, i: number) {
  if (i === 0) return <Inbox />;
  if (/^Resolución/i.test(text)) return <CircleCheck />;
  if (/^Cerró/i.test(text)) return <BadgeCheck />;
  if (/^Reabrió|^Regresó/i.test(text)) return <RotateCcw />;
  if (/^Reasignó|tomó el caso/i.test(text)) return <UserCog />;
  if (/foto/i.test(text)) return <ShieldCheck />;
  return <StickyNote />;
}

function CaseDetail({ c }: { c: PostSaleCase }) {
  const lk = useLookups();
  const bundle = useOrderBundle(c.orderId);
  const canManage = useCan("postventa.manage");
  const addCaseNote = useAppStore((s) => s.addCaseNote);
  const updateCase = useAppStore((s) => s.updateCase);
  const allPhotos = useAppStore((s) => s.photos);
  const [note, setNote] = useState("");

  const client = lk.clients.get(c.clientId);
  const creator = lk.users.get(c.createdBy);
  const order = bundle?.order;
  const casePhotos = useMemo(() => allPhotos.filter((p) => c.photoIds.includes(p.id) || p.caseId === c.id), [allPhotos, c.photoIds, c.id]);
  const meta = CASE_STATUS[c.status];

  const steps: TimelineStep[] = useMemo(() => {
    const done: TimelineStep[] = c.timeline.map((t, i) => {
      const by = lk.users.get(t.by);
      return {
        id: `${t.at}-${i}`,
        title: t.text,
        detail: by ? `${by.name} · ${ROLE_LABEL[by.role]}` : t.by === "cliente" ? "Cliente" : undefined,
        when: fmtDateTime(t.at),
        state: i === c.timeline.length - 1 && isCaseOpen(c) ? "current" : "done",
        icon: noteIcon(t.text, i),
      };
    });
    if (c.status === "abierto" || c.status === "en_proceso")
      done.push({ id: "next-res", title: "Registrar resolución", detail: `Compromiso ${fmtDateTime(c.dueDate)}`, state: "upcoming" });
    if (c.status === "resuelto") done.push({ id: "next-close", title: "Confirmar conformidad del cliente", detail: "Para cerrar el caso", state: "upcoming" });
    return done;
  }, [c, lk]);

  const submitNote = () => {
    const t = note.trim();
    if (t.length < 3) return;
    addCaseNote(c.id, t);
    setNote("");
    toast.success("Nota agregada al caso");
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Postventa", href: "/postventa" }, { label: c.folio }]}
        title={CASE_CATEGORY[c.category]}
        titleAddon={
          <TonePill tone={meta.tone} live={meta.live} className="h-7 px-2.5 text-[13px]">
            {meta.label}
          </TonePill>
        }
        meta={
          <>
            {client && (
              <Link href={`/clientes/${client.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:text-link">
                <ClientMark name={client.name} hue={client.hue} size={22} className="rounded-[7px]" />
                {client.name}
              </Link>
            )}
            {order && (
              <>
                <span className="text-ghost">•</span>
                <Link href={`/ordenes/${order.folio}`} className="font-medium text-link tabular hover:underline">
                  {order.folio}
                </Link>
              </>
            )}
            <span className="text-ghost">•</span>
            <span>Vía {channelText(CASE_CHANNEL[c.channel])}</span>
            <span className="text-ghost">•</span>
            <span>
              Registró {creator ? firstName(creator.name) : "—"} · {fmtDateTime(c.createdAt)}
            </span>
          </>
        }
        description={<>“{c.description}”</>}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 space-y-10 lg:border-r lg:border-hairline lg:pr-10">
          {/* ── case timeline + notes ── */}
          <section>
            <SectionHeader title="Seguimiento del caso" subtitle={`${plural(c.timeline.length, "registro", "registros")} · cada cambio guarda usuario y fecha`} />
            <Timeline steps={steps} className="mt-6" />
            <div className="mt-7 rounded-[20px] border border-hairline bg-wash p-3 sm:p-4">
              <label htmlFor="case-note" className="sr-only">
                Agregar nota
              </label>
              <Textarea
                id="case-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote();
                }}
                disabled={!canManage}
                placeholder={canManage ? "Agregar nota: llamada al cliente, acuerdo, visita de revisión…" : REASON_POSTVENTA}
                className={`${textareaCls} min-h-[84px] border-transparent bg-surface`}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="hidden text-[12.5px] text-subtle sm:inline">⌘ + Enter para guardar</span>
                <Gate allowed={canManage} reason={REASON_POSTVENTA} className="ml-auto">
                  <Button onClick={submitNote} disabled={!canManage || note.trim().length < 3} className="h-10 rounded-[12px] px-4 font-semibold">
                    <MessageSquareText /> Agregar nota
                  </Button>
                </Gate>
              </div>
            </div>
          </section>

          {/* ── evidence ── */}
          <section>
            <SectionHeader
              title="Evidencia del caso"
              subtitle={casePhotos.length ? plural(casePhotos.length, "foto adjunta", "fotos adjuntas") : "Fotos que respaldan la queja o la resolución"}
              action={
                canManage && order ? (
                  <PhotoCaptureButtons
                    compact
                    meta={{ orderId: order.id, caseId: c.id, kind: "postventa", area: CASE_CATEGORY[c.category], serviceTypeId: order.serviceTypeId, selectedForReport: false }}
                    onCaptured={(ids) => ids.length && updateCase(c.id, { photoIds: [...c.photoIds, ...ids] }, `Agregó ${ids.length === 1 ? "una foto" : `${ids.length} fotos`} de evidencia.`)}
                  />
                ) : undefined
              }
            />
            {casePhotos.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {casePhotos.map((p) => (
                  <PhotoThumb key={p.id} photo={p} />
                ))}
              </div>
            ) : (
              <p className="rounded-[18px] border border-dashed border-line-strong px-4 py-6 text-center text-[14px] text-subtle">
                Sin fotos adjuntas{canManage ? ". Tome una foto o súbala desde la galería." : "."}
              </p>
            )}
          </section>

          {bundle && <CaseOrderCard bundle={bundle} />}
          {bundle && <CaseOrderIncidents bundle={bundle} />}
        </div>

        <div className="order-first min-w-0 lg:order-none lg:pl-10">
          <div className="space-y-6 lg:sticky lg:top-6">
            <CaseSidePanel c={c} client={client} unitId={order?.unitId ?? client?.unitId ?? ""} canManage={canManage} order={order} />
            {bundle && <CaseOrderSurvey bundle={bundle} />}
          </div>
        </div>
      </div>
    </div>
  );
}
