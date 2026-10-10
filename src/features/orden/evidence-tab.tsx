"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Camera, CircleCheck, ImageOff, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { plural } from "@/lib/format";
import type { Jornada, Photo } from "@/lib/types";
import { BeforeAfter, PhotoThumb } from "@/components/pk/scene-photo";
import { EmptyState } from "@/components/pk/feedback";
import { UnderlineLink } from "@/components/pk/bits";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { Switch } from "@/components/ui/switch";
import { EASE } from "@/components/pk/motion";
import { JORNADA_STATUS, jornadaTitle } from "./orden-format";
import { useOrder } from "./order-context";
import { Gated } from "./ui";

const byTime = (a: Photo, b: Photo) => a.takenAt.localeCompare(b.takenAt);

/** Evidencia: ANTES / DESPUÉS per jornada, squeegee comparisons, and photo selection for the report. */
export function EvidenceTab() {
  const { d } = useOrder();
  const { evidence, photos, jornadas, order } = d;
  const reportable = photos.filter((p) => p.kind !== "postventa");
  const selected = reportable.filter((p) => p.selectedForReport).length;
  const incidentPhotos = photos.filter((p) => p.kind === "incidencia").sort(byTime);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Evidencia por jornada</h2>
          <p className="mt-1 text-[13.5px] text-subtle">
            <b className="font-semibold text-ink">
              {evidence.present} de {evidence.required}
            </b>{" "}
            categorías requeridas · {plural(reportable.length, "foto", "fotos")} ·{" "}
            <b className="font-semibold text-ink">{selected}</b> seleccionadas para el reporte
          </p>
        </div>
        <UnderlineLink href={`/evidencias?orden=${order.folio}`}>Ver en Evidencias</UnderlineLink>
      </div>

      {jornadas.length === 0 ? (
        <EmptyState icon={<Camera />} title="Sin jornadas todavía">
          Las fotos ANTES y DESPUÉS se capturan desde la pantalla de cada jornada.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {jornadas.map((j, i) => (
            <JornadaEvidence key={j.id} j={j} index={i} />
          ))}
          {incidentPhotos.length > 0 && (
            <section className="border-t border-hairline pt-8">
              <GroupTitle tone="bg-st-red" label="Fotos de incidencias" count={incidentPhotos.length} />
              <PhotoGrid photos={incidentPhotos} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function JornadaEvidence({ j, index }: { j: Jornada; index: number }) {
  const { d } = useOrder();
  const ps = d.photos.filter((p) => p.jornadaId === j.id && (p.kind === "antes" || p.kind === "despues"));
  const antes = ps.filter((p) => p.kind === "antes").sort(byTime);
  const despues = ps.filter((p) => p.kind === "despues").sort(byTime);
  const executed = !!j.checkIn;
  const inReport = ps.filter((p) => p.selectedForReport).length;

  // Pair ANTES/DESPUÉS of the same area for the squeegee comparison.
  const seen = new Set<string>();
  const pairs = antes.flatMap((a) => {
    if (seen.has(a.area)) return [];
    const b = despues.find((x) => x.area === a.area);
    if (!b) return [];
    seen.add(a.area);
    return [{ a, b }];
  });

  const status = JORNADA_STATUS[j.status];
  const complete = executed && antes.length > 0 && despues.length > 0;

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.06 * index }} className={cn(index > 0 && "border-t border-hairline pt-8")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-[17px] font-semibold text-ink">{jornadaTitle(j)}</h3>
          <TonePill tone={status.tone} live={j.status === "en_curso"}>
            {status.label}
          </TonePill>
        </div>
        <div className="flex items-center gap-2">
          {executed &&
            (complete ? (
              <SoftBadge tone="teal">
                <CircleCheck className="size-3" /> Completa
              </SoftBadge>
            ) : antes.length && j.status === "en_curso" ? (
              <SoftBadge tone="blue">DESPUÉS al terminar</SoftBadge>
            ) : (
              <SoftBadge tone="amber">
                <TriangleAlert className="size-3" /> Falta {!antes.length ? "ANTES" : "DESPUÉS"}
              </SoftBadge>
            ))}
          {ps.length > 0 && <span className="text-[12.5px] text-subtle">{inReport} en reporte</span>}
        </div>
      </div>

      {!executed && ps.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-[16px] bg-soft px-4 py-3.5 text-[13.5px] text-subtle">
          <ImageOff className="size-4 shrink-0" />
          La jornada aún no inicia. Las fotos se capturan al registrar la entrada.
          <Link href={`/jornada/${j.id}`} className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-link">
            Abrir <ArrowRight className="size-3.5" />
          </Link>
        </p>
      ) : (
        <>
          {/* stacked on phones, not a swipe carousel: the slider claims horizontal drags, so the carousel could not be paged from a photo */}
          {pairs.length > 0 && (
            <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-4 sm:pb-1">
              {pairs.map(({ a, b }) => (
                <figure key={a.id} className="min-w-0">
                  <BeforeAfter before={a} after={b} />
                  <figcaption className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-subtle">
                    <span className="truncate font-medium text-ink">{a.area}</span>
                    <span className="shrink-0">Deslice para comparar</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <GroupTitle tone="bg-st-amber" label="Antes" count={antes.length} />
              <PhotoGrid photos={antes} missing={executed && !antes.length ? { jornada: j, kind: "antes" } : undefined} />
            </div>
            <div>
              <GroupTitle tone="bg-st-teal" label="Después" count={despues.length} />
              <PhotoGrid photos={despues} missing={executed && !despues.length ? { jornada: j, kind: "despues", soft: j.status === "en_curso" } : undefined} />
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}

function GroupTitle({ tone, label, count }: { tone: string; label: string; count: number }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
      <span className={cn("size-[7px] rounded-full", tone)} />
      {label} · {count}
    </p>
  );
}

type Missing = { jornada: Jornada; kind: "antes" | "despues"; /** jornada still running: expected later, not an error */ soft?: boolean };

function PhotoGrid({ photos, missing, emptyText }: { photos: Photo[]; missing?: Missing; emptyText?: string }) {
  const { d, ui } = useOrder();
  const toggle = useAppStore((s) => s.togglePhotoForReport);
  if (!photos.length && !missing) return <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-subtle">{emptyText ?? "Sin fotos"}</p>;
  return (
    <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {photos.map((p) => (
        <div key={p.id} className="min-w-0">
          <PhotoThumb photo={p} pending={d.pendingIds.has(p.id)} selected={p.selectedForReport} onClick={() => ui.openPhoto(p.id)} />
          <Gated gate={d.gates.photos} className="flex w-full">
            <label className="mt-1.5 flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 px-1 text-[12.5px]">
              <span className={cn("truncate", p.selectedForReport ? "font-medium text-ink" : "text-subtle")}>{p.selectedForReport ? "En el reporte" : "Incluir en reporte"}</span>
              <Switch
                checked={p.selectedForReport}
                disabled={!d.gates.photos.ok}
                onCheckedChange={() => toggle(p.id)}
                aria-label={`Incluir foto de ${p.area} en el reporte`}
              />
            </label>
          </Gated>
        </div>
      ))}
      {missing && (
        <Link
          href={`/jornada/${missing.jornada.id}`}
          className={cn(
            "group flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-[16px] border-2 border-dashed p-3 text-center transition",
            missing.soft ? "border-blue-line bg-blue-wash hover:bg-blue-soft" : "border-amber-line-strong bg-amber-wash hover:bg-amber-tint",
          )}
        >
          <motion.span
            className={cn("inline-flex size-10 items-center justify-center rounded-full", missing.soft ? "bg-blue-tint text-azure-fg" : "bg-amber-mid text-amber-fg")}
            animate={missing.soft ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Camera className="size-[18px]" />
          </motion.span>
          <span className={cn("text-[13px] font-semibold", missing.soft ? "text-ink" : "text-amber-ink")}>
            {missing.soft ? "DESPUÉS al terminar" : `Falta foto ${missing.kind === "antes" ? "ANTES" : "DESPUÉS"}`}
          </span>
          <span className={cn("inline-flex items-center gap-1 text-[12px]", missing.soft ? "text-link" : "text-amber-fg")}>
            {missing.soft ? "Se captura antes de la salida" : `Capturar en Jornada ${missing.jornada.dayIndex}`}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}
    </motion.div>
  );
}
