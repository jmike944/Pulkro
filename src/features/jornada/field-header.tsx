"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, CloudUpload, Eye, MapPin, Phone, WifiOff } from "lucide-react";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDuration, fmtLongDay, fmtTime, plural } from "@/lib/format";
import { TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { HeaderTools } from "@/components/shell/header-tools";
import { usePublishCrumbs } from "@/components/shell/crumbs";
import type { FieldReady } from "./use-field-state";

const JORNADA_PILL = {
  pendiente: { tone: "blue", label: "Programada" },
  en_curso: { tone: "sky", label: "En curso", live: true },
  cerrada: { tone: "teal", label: "Cerrada" },
} as const;

/**
 * Back link to the order, eyebrow "Jornada 2 de 3 · jueves 9 de octubre", serif title, site line, narrative.
 * From `lg` the card header carries the trail (Operación › Órdenes › OS-24391 › Jornada 2) and the tools, so the back-link row is phone/tablet only.
 */
export function FieldHeader({ f }: { f: FieldReady }) {
  const { order, client, site, jornada } = f;
  const pill = JORNADA_PILL[jornada.status];
  usePublishCrumbs([{ label: "Órdenes", href: "/ordenes" }, { label: order.folio, href: `/ordenes/${order.folio}` }, { label: `Jornada ${f.index}` }]);

  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE }}>
          <Link
            href={`/ordenes/${order.folio}`}
            className="group -ml-2 inline-flex h-11 items-center gap-1.5 rounded-[12px] pl-1.5 pr-3 text-[14px] font-medium text-subtle transition hover:bg-muted hover:text-ink"
          >
            <ChevronLeft className="size-[18px] transition-transform group-hover:-translate-x-0.5" />
            <span className="font-semibold text-ink tabular">{order.folio}</span>
            <span className="hidden sm:inline">· Volver a la orden</span>
          </Link>
        </motion.div>
        <HeaderTools />
      </div>

      <motion.div initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: EASE }}>
        <p className="mt-4 text-[14.5px] text-subtle sm:mt-5 lg:mt-0">
          Jornada {f.index} de {f.total} · {fmtLongDay(jornada.plannedStart)}
        </p>
        <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-[1.1] tracking-[-0.015em] text-ink sm:text-[40px] sm:leading-[1.08]">{order.title}</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-subtle"
      >
        <TonePill tone={pill.tone} live={"live" in pill}>
          {pill.label}
        </TonePill>
        <span className="text-ink/80">
          {client.shortName} · {site.name}
        </span>
        <a
          href={mapsLink(site.lat, site.lng)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 min-w-0 items-center gap-1 text-link hover:underline"
        >
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {site.address}, {site.municipality}
          </span>
        </a>
        {/* one-tap call; the wide layout has it in the rail */}
        {order.siteContact.phone && (
          <a
            href={`tel:${order.siteContact.phone.replace(/\s/g, "")}`}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-link hover:underline @min-[880px]:hidden"
          >
            <Phone className="size-3.5 shrink-0" /> Llamar al contacto
          </a>
        )}
      </motion.div>

      <Narrative f={f} />
      <ConnectivityBanner f={f} />
      {!f.permissions.capture && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
          className="mt-5 flex items-start gap-3 rounded-[18px] bg-soft px-4 py-3.5 text-[14px] leading-snug text-subtle"
        >
          <Eye className="mt-0.5 size-4 shrink-0 text-ink/60" />
          <span>
            <b className="font-semibold text-ink">Modo consulta.</b> {f.roleLabel} ve toda la jornada; la entrada, salida, fotos, incidencias y notas las captura el supervisor en sitio, y solo él autoriza el cierre y elige las fotos del reporte.
          </span>
        </motion.p>
      )}
    </header>
  );
}

function Narrative({ f }: { f: FieldReady }) {
  const now = useNow(60_000);
  const { jornada } = f;
  const fotos = (
    <>
      <b>{f.antes.length}</b> ANTES · <b>{f.despues.length}</b> DESPUÉS
    </>
  );
  const inc = f.openIncidents.length ? (
    <>
      {" "}
      · <b>{plural(f.openIncidents.length, "incidencia abierta", "incidencias abiertas")}</b>
    </>
  ) : null;

  return (
    <motion.p
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
      className="mt-3 max-w-3xl text-[15px] leading-relaxed text-subtle [&_b]:font-semibold [&_b]:text-ink"
    >
      {jornada.status === "pendiente" && (
        <>
          Inicio programado a las <b>{fmtTime(jornada.plannedStart)}</b> con cuadrilla de <b>{f.crew.length}</b>. Registre la entrada al llegar al sitio.
        </>
      )}
      {jornada.status === "en_curso" && (
        <>
          <b>{fmtDuration(jornadaMinutes(jornada, now))}</b> en sitio · {fotos}
          {inc}.
        </>
      )}
      {jornada.status === "cerrada" && (
        <>
          Jornada de <b>{fmtDuration(jornadaMinutes(jornada))}</b> · {fotos}
          {inc}.
        </>
      )}
    </motion.p>
  );
}

/** Offline banner (doc §6) + a quiet "sincronizando" chip while this order still has items in the queue. */
function ConnectivityBanner({ f }: { f: FieldReady }) {
  const setSyncOpen = useUi((s) => s.setSyncOpen);
  const pending = f.pendingSync.length;
  const offline = f.offline;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {offline ? (
        <motion.button
          key="offline"
          type="button"
          onClick={() => setSyncOpen(true)}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="mt-5 flex w-full items-center gap-3 rounded-[18px] bg-amber-soft px-4 py-3.5 text-left ring-1 ring-amber-line transition hover:bg-amber-tint"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-amber-mid text-amber-fg">
            <WifiOff className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1 text-[14px] leading-snug text-amber-olive">
            <b className="font-semibold text-amber-olive-ink">Sin conexión</b> · lo que capture se guarda en el dispositivo y se sincroniza al volver la señal
          </span>
          <span className="shrink-0 rounded-full bg-surface/80 px-2.5 py-1 text-[12.5px] font-semibold text-amber-fg tabular">
            {pending} {pending === 1 ? "pendiente" : "pendientes"}
          </span>
        </motion.button>
      ) : pending > 0 ? (
        <motion.button
          key="syncing"
          type="button"
          onClick={() => setSyncOpen(true)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-sky-soft px-3.5 text-[13px] font-medium text-azure-fg"
        >
          <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
            <CloudUpload className="size-4" />
          </motion.span>
          Sincronizando {plural(pending, "registro", "registros")} de {f.order.folio}…
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
