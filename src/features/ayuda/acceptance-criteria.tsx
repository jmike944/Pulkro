"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowRight, Sparkle } from "lucide-react";
import { useAppStore, useCurrentUser, useScopedData } from "@/lib/hooks";
import { can } from "@/lib/permissions";
import { fmtNum } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/status";
import { AnimatedNumber } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";

type Criterion = {
  text: string;
  screens: { label: string; href: string }[];
  example?: { label: string; href: string } | null;
  note?: string;
};

/** Doc §10 acceptance criteria, each linked to the screen that covers it and to a live example in the user's data. */
export function AcceptanceCriteria() {
  const user = useCurrentUser();
  const { orders, jornadas, incidents, reports, cases, surveys } = useScopedData();
  const totalOrders = useAppStore((s) => s.orders.length);

  const items: Criterion[] = useMemo(() => {
    const folio = new Map(orders.map((o) => [o.id, o.folio]));
    const programmed = orders.find((o) => o.status === "programada" && o.crewHistory.length);
    const offlineJ = jornadas.find((j) => j.checkIn?.offline) ?? jornadas.find((j) => j.status === "en_curso");
    const exception = orders.find((o) => o.closure?.exception);
    const repCount = new Map<string, number>();
    reports.forEach((r) => repCount.set(r.orderId, (repCount.get(r.orderId) ?? 0) + 1));
    const multi = orders.find((o) => o.plannedDays >= 3 && repCount.has(o.id)) ?? orders.find((o) => o.plannedDays >= 3);
    const incident = incidents.find((i) => i.photoIds.length > 0) ?? incidents[0];
    const shared = reports.find((r) => r.shares.length > 0);
    const kase = cases[0];
    const answered = surveys.find((s) => s.respondedAt);
    return [
      {
        text: "Un supervisor puede crear o recibir una orden manual, asignar trabajadores y fechas y consultar el detalle desde la app.",
        screens: [
          { label: "Nueva orden", href: "/ordenes/nueva" },
          { label: "Agenda", href: "/agenda" },
        ],
        example: programmed ? { label: `${programmed.folio} · programada con cuadrilla`, href: `/ordenes/${programmed.folio}` } : null,
      },
      {
        text: "Puede registrar entrada, salida y GPS de una jornada, con o sin conexión; la app indica claramente el estado de sincronización.",
        screens: [
          { label: "Agenda", href: "/agenda" },
          { label: "Sincronización", href: "/configuracion?tab=sincronizacion" },
        ],
        example: offlineJ
          ? { label: `${folio.get(offlineJ.orderId) ?? "Jornada"} · J${offlineJ.dayIndex}${offlineJ.checkIn?.offline ? " capturada sin conexión" : " en curso"}`, href: `/jornada/${offlineJ.id}` }
          : null,
      },
      {
        text: "Puede adjuntar fotos ANTES y DESPUÉS; no cierra sin ambas categorías, salvo excepción autorizada.",
        screens: [{ label: "Evidencias", href: "/evidencias" }],
        example: exception ? { label: `${exception.folio} · cierre con excepción`, href: `/ordenes/${exception.folio}?tab=evidencia` } : null,
      },
      {
        text: "Una orden de tres días guarda tres jornadas y emite un único reporte final con datos agregados.",
        screens: [{ label: "Reportes", href: "/reportes" }],
        example: multi
          ? { label: `${multi.folio} · ${multi.plannedDays} jornadas · ${repCount.get(multi.id) ? "1 reporte" : "sin reporte aún"}`, href: repCount.get(multi.id) ? `/ordenes/${multi.folio}/reporte` : `/ordenes/${multi.folio}?tab=jornadas` }
          : null,
      },
      {
        text: "Puede registrar una incidencia con tipo, descripción y fotos y verla en el historial.",
        screens: [{ label: "Incidencias", href: "/incidencias" }],
        example: incident ? { label: `${incident.folio} · ${photoCount(incident.photoIds.length)}`, href: `/incidencias?i=${incident.id}` } : null,
      },
      {
        text: "Puede revisar un PDF, seleccionar fotos y abrir WhatsApp o email para compartirlo manualmente.",
        screens: [{ label: "Reportes", href: "/reportes" }],
        example: shared ? { label: `${folio.get(shared.orderId) ?? "Reporte"} · v${shared.version} · ${shared.shares.length} envío(s)`, href: `/ordenes/${folio.get(shared.orderId)}/reporte` } : null,
      },
      {
        text: "Dirección consulta órdenes e indicadores autorizados; el supervisor no ve información restringida.",
        screens: [
          { label: "Indicadores", href: "/indicadores" },
          { label: "Mis permisos", href: "/configuracion" },
        ],
        note: `Como ${ROLE_LABEL[user.role]} ves ${fmtNum(orders.length)} de ${fmtNum(totalOrders)} órdenes.`,
      },
      {
        text: "Se pueden exportar PDF de orden y Excel de indicadores habilitados.",
        screens: [
          { label: "Indicadores", href: "/indicadores" },
          { label: "Reportes", href: "/reportes" },
        ],
        note: can(user.role, "export.excel") ? `Tu rol exporta PDF y Excel.` : `Tu rol exporta PDF; Excel es para Dirección y Administración.`,
      },
      {
        text: "Las encuestas y quejas quedan asociadas a cliente y orden, según el alcance finalmente contratado.",
        screens: [
          { label: "Postventa", href: "/postventa" },
          { label: "Clientes", href: "/clientes" },
        ],
        example: kase ? { label: `${kase.folio} · ligado a ${folio.get(kase.orderId) ?? "su orden"}`, href: `/postventa/${kase.folio}` } : answered ? { label: `Encuesta de ${folio.get(answered.orderId)}`, href: `/postventa?orden=${folio.get(answered.orderId)}` } : null,
      },
    ];
  }, [orders, jornadas, incidents, reports, cases, surveys, user.role, totalOrders]);

  const withExample = items.filter((i) => i.example || i.note).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <CoverageRing covered={items.length} total={items.length} />
        <p className="mt-4 text-[14px] leading-relaxed text-subtle">
          Cada criterio del documento (§10) tiene una pantalla en el prototipo. <b className="font-semibold text-ink">{withExample}</b> se pueden comprobar ahora mismo con tus datos.
        </p>
      </div>
      <ol className="min-w-0">
        {items.map((c, i) => (
          <motion.li
            key={c.text}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, ease: EASE, delay: (i % 3) * 0.05 }}
            className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 border-b border-hairline py-4 last:border-0 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-x-4"
          >
            <CheckMark delay={0.1 + (i % 3) * 0.05} />
            <div className="min-w-0">
              <p className="text-[15px] leading-snug text-ink">{c.text}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {c.screens.map((s) => (
                  <Link
                    key={s.href + s.label}
                    href={s.href}
                    className="group inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-[#f2f4f7] lg:h-9 px-3 text-[13px] font-semibold text-ink transition hover:bg-brand-deep hover:text-white"
                  >
                    {s.label}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
                {c.example && (
                  <Link
                    href={c.example.href}
                    className="group inline-flex h-11 max-w-full items-center gap-1.5 rounded-[10px] bg-sky-soft lg:h-9 px-3 text-[13px] font-semibold text-[#1667e0] transition hover:bg-[#cfeafb]"
                  >
                    <Sparkle className="size-3.5 shrink-0" />
                    <span className="truncate">Ejemplo: {c.example.label}</span>
                  </Link>
                )}
                {c.note && <span className="text-[13px] text-subtle">{c.note}</span>}
              </div>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

const photoCount = (n: number) => (n === 1 ? "1 foto" : `${n} fotos`);

function CheckMark({ delay }: { delay: number }) {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 480, damping: 24, delay }}
      className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-brand-deep text-white shadow-[0_6px_14px_-8px_rgb(2_58_99/0.8)] sm:size-9"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: EASE, delay: delay + 0.15 }} />
      </svg>
      <span className="sr-only">Cubierto</span>
    </motion.span>
  );
}

function CoverageRing({ covered, total }: { covered: number; total: number }) {
  const r = 52;
  const len = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5 lg:flex-col lg:items-start">
      <div className="relative size-[132px] shrink-0">
        <svg viewBox="0 0 132 132" className="size-full -rotate-90" aria-hidden>
          <circle cx="66" cy="66" r={r} fill="none" stroke="#eef1f5" strokeWidth="12" />
          <motion.circle
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke="url(#pk-ring)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={len}
            initial={{ strokeDashoffset: len }}
            whileInView={{ strokeDashoffset: len * (1 - covered / total) }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
          />
          <defs>
            <linearGradient id="pk-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7ad1f4" />
              <stop offset="1" stopColor="#023a63" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="flex items-baseline">
            <AnimatedNumber value={covered} className="text-[34px] font-medium leading-none tracking-[-0.04em] text-ink" />
            <span className="text-[16px] text-subtle">/{total}</span>
          </span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">cubiertos</span>
        </div>
      </div>
      <p className="font-serif text-[22px] leading-tight text-ink lg:mt-1">Criterios con pantalla en el prototipo</p>
    </div>
  );
}
