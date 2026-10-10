"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Coins, HardHat, Lock, SprayCan, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/hooks";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";

type LockedSpec = {
  key: string;
  title: string;
  icon: LucideIcon;
  missing: string[];
  today: string;
  chart: "area" | "bars" | "bubbles";
  href?: string;
  linkLabel?: string;
};

/**
 * Indicators requested but not measurable yet (doc §5 "ADVERTENCIA DE ALCANCE", §9 Fase 2).
 * Shown as locked cards so nobody mistakes an estimate for data.
 */
export function Fase2Section() {
  const materials = useAppStore((s) => s.materials.length);
  const cards: LockedSpec[] = [
    {
      key: "costos",
      title: "Costos y rentabilidad",
      icon: Coins,
      missing: ["Mano de obra por jornada", "Materiales, traslados y otros costos por orden", "Ingreso del servicio (sistema comercial)"],
      today: "Hoy la app no registra montos; el ingreso vive en el sistema comercial externo.",
      chart: "area",
    },
    {
      key: "materiales",
      title: "Consumo de materiales",
      icon: SprayCan,
      missing: ["Cantidad entregada a la cuadrilla", "Cantidad usada y sobrante al cierre"],
      today: `Hoy solo se captura lo planeado en cada orden (${materials} productos en catálogo).`,
      chart: "bars",
    },
    {
      key: "trabajador",
      title: "Productividad por trabajador",
      icon: HardHat,
      missing: ["Entrada y salida por persona (hoy es por cuadrilla)", "Definir si se mide en servicios, horas o rendimiento"],
      today: "La definición sigue abierta (preguntas pendientes, §11).",
      chart: "bubbles",
      href: "/equipo",
      linkLabel: "Ver asignaciones del equipo",
    },
  ];

  return (
    <section className="mt-14 border-t border-hairline pt-10 print:hidden" aria-labelledby="fase2-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-violet-soft px-2 text-[12px] font-semibold text-violet-fg">
            <Lock className="size-3.5" /> Fase 2
          </span>
          <h2 id="fase2-title" className="mt-3 font-serif text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink">
            Requiere captura adicional
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-subtle">
            Se pidieron métricas de <b className="font-semibold text-ink">costos</b>, <b className="font-semibold text-ink">productividad individual</b> y{" "}
            <b className="font-semibold text-ink">consumo</b>, pero hoy la operación no registra costos, tiempos por persona ni consumos reales. Para no
            prometer números sin respaldo, primero hace falta un módulo de captura o una integración.
          </p>
        </div>
        <p className="shrink-0 text-[12.5px] text-subtle sm:pt-9">Doc §5 · advertencia de alcance · §9</p>
      </div>

      <motion.div
        variants={staggerContainer(0.08, 0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="mt-7 grid gap-4 md:grid-cols-3"
      >
        {cards.map((c) => (
          <LockedCard key={c.key} spec={c} />
        ))}
      </motion.div>
    </section>
  );
}

function LockedCard({ spec }: { spec: LockedSpec }) {
  const Icon = spec.icon;
  return (
    <motion.article
      variants={rowVariants}
      whileHover="hover"
      className="group relative flex flex-col overflow-hidden rounded-[22px] border border-hairline bg-surface shadow-soft"
    >
      {/* frosted placeholder chart — deliberately unreadable */}
      <div aria-hidden className="relative h-[148px] overflow-hidden border-b border-hairline bg-wash">
        <div className="absolute inset-0 scale-105 opacity-80 blur-[3px]">
          <SkeletonChart kind={spec.chart} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-surface/40 to-surface/80 backdrop-blur-[1.5px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            variants={{ hover: { rotate: [0, -12, 10, -6, 0], transition: { duration: 0.6 } } }}
            className="inline-flex size-12 items-center justify-center rounded-[16px] bg-surface text-ink shadow-glass"
          >
            <Lock className="size-5" />
          </motion.span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-tile text-subtle [&_svg]:size-[17px]">
            <Icon />
          </span>
          <h3 className="text-[16px] font-semibold text-ink">{spec.title}</h3>
        </div>
        <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Falta capturar</p>
        <ul className="mt-2 space-y-1.5">
          {spec.missing.map((m) => (
            <li key={m} className="flex gap-2 text-[13.5px] leading-snug text-ink">
              <span className="mt-[7px] size-[5px] shrink-0 rounded-full bg-st-violet" />
              {m}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-relaxed text-subtle">{spec.today}</p>
        {spec.href && (
          <Link href={spec.href} className="group/link mt-auto flex w-fit items-center gap-1.5 pt-4 text-[14px] font-semibold text-link">
            {spec.linkLabel}
            <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-0.5" />
          </Link>
        )}
      </div>
    </motion.article>
  );
}

const BAR_HEIGHTS = [38, 62, 48, 80, 56, 70, 44, 88, 60];
const BUBBLES = [
  { x: 14, y: 58, s: 26 },
  { x: 30, y: 30, s: 16 },
  { x: 44, y: 62, s: 34 },
  { x: 60, y: 24, s: 22 },
  { x: 72, y: 56, s: 18 },
  { x: 86, y: 34, s: 30 },
];

function SkeletonChart({ kind }: { kind: LockedSpec["chart"] }) {
  if (kind === "bars") {
    return (
      <div className="flex h-full items-end gap-2.5 px-6 pb-5 pt-6">
        {BAR_HEIGHTS.map((h, i) => (
          <motion.span
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.05 }}
            className={cn("shimmer flex-1 rounded-full", i === 7 && "bg-blue-line [animation:none]")}
          />
        ))}
      </div>
    );
  }
  if (kind === "bubbles") {
    return (
      <div className="relative h-full">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="absolute animate-float rounded-full border border-white bg-[radial-gradient(circle_at_30%_30%,#ffffff,#cfe6fd_55%,#b9c7ff)] dark:border-sky/30 dark:bg-[radial-gradient(circle_at_30%_30%,rgb(122_209_244/0.55),rgb(79_148_255/0.35)_55%,rgb(159_177_255/0.3))]"
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.s, height: b.s, animationDelay: `${i * 0.7}s` }}
          />
        ))}
      </div>
    );
  }
  return (
    <svg viewBox="0 0 300 148" preserveAspectRatio="none" className="size-full">
      <defs>
        <linearGradient id="fase2-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--sky)" }} stopOpacity="0.55" />
          <stop offset="100%" style={{ stopColor: "var(--sky)" }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 110 C 40 96, 60 70, 100 78 S 160 40, 200 52 S 260 22, 300 30 L 300 148 L 0 148 Z" fill="url(#fase2-area)" />
      <path d="M0 110 C 40 96, 60 70, 100 78 S 160 40, 200 52 S 260 22, 300 30" fill="none" className="stroke-azure" strokeWidth="3" strokeLinecap="round" />
      <path d="M0 124 C 50 118, 90 104, 140 108 S 220 84, 300 88" fill="none" className="stroke-chart-4" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
    </svg>
  );
}
