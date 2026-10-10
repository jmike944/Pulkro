"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, GitBranch, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneDot } from "@/lib/status";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { EASE } from "@/components/pk/motion";
import { FlowDetail } from "./flow-detail";
import { FLOW_PHASES, FLOW_ROLE_TONE, FLOW_STEPS, flowCell, pad2, type FlowStep } from "./flow-data";

/* Timing: the connector draws at constant speed and each node pops in as the line reaches it. */
const START = 0.35;
const DRAW = 2.6;
const TOUR_MS = 2600;
/** Arc position of each node, measured in row pitches (one column pitch ≈ 2.4 row pitches). */
const ARC = FLOW_STEPS.reduce<number[]>((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + (s.n === 6 || s.n === 11 ? 2.4 : 1));
  return acc;
}, []);
const ROLE_SHORT: Partial<Record<FlowStep["role"], string>> = { "Dirección / Administración": "Dirección · Admón." };
const nodeDelay = (n: number) => START + (ARC[n - 1] / ARC[ARC.length - 1]) * DRAW - 0.08;

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number };
type Pt = { x: number; y: number };

/** Polyline with rounded corners. */
function roundedPath(pts: Pt[], radius = 12) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const a = { x: p1.x + ((p0.x - p1.x) * r) / d1, y: p1.y + ((p0.y - p1.y) * r) / d1 };
    const b = { x: p1.x + ((p2.x - p1.x) * r) / d2, y: p1.y + ((p2.y - p1.y) * r) / d2 };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Hero of the help center: the 15-step "Flujo operativo y postventa" as an interactive serpentine
 * (desktop/tablet) or an expandable rail (phones). Click a node to see who does it, where and why.
 */
export function FlowChart() {
  const [selected, setSelected] = useState(1);
  const [playing, setPlaying] = useState(false);
  const step = FLOW_STEPS[selected - 1];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (selected >= 15) setPlaying(false);
      else setSelected(selected + 1);
    }, TOUR_MS);
    return () => clearTimeout(t);
  }, [playing, selected]);

  const pick = (n: number) => {
    setPlaying(false);
    setSelected(n);
  };
  const togglePlay = () => {
    if (!playing && selected >= 15) setSelected(1);
    setPlaying((p) => !p);
  };

  return (
    <AuroraPanel className="p-3 sm:p-6 lg:p-8" bubbles>
      <div className="flex flex-wrap items-end justify-between gap-4 px-2 pt-2 sm:px-0 sm:pt-0">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink/70">Flujo principal confirmado · doc §3</p>
          <h2 className="mt-1 font-serif text-[28px] font-medium leading-tight text-ink sm:text-[34px]">Flujo operativo y postventa</h2>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          className="relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-[14px] bg-brand-deep px-4 text-[14px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(7_36_63/0.7)] transition hover:bg-[#0b2f52] max-md:w-full md:h-11"
        >
          {playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}
          {playing ? "Pausar recorrido" : selected > 1 && selected < 15 ? "Continuar recorrido" : "Ver recorrido"}
          {playing && (
            <motion.span
              key={selected}
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-sky"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: TOUR_MS / 1000, ease: "linear" }}
            />
          )}
        </button>
      </div>

      {/* tablet / desktop: serpentine chart + detail */}
      <div className="mt-6 hidden grid-cols-[minmax(0,1fr)] gap-6 md:grid min-[1360px]:grid-cols-[minmax(0,1fr)_340px] min-[1360px]:gap-8">
        <Serpentine selected={selected} onSelect={pick} />
        <GlassCard className="self-start p-5 sm:p-6 min-[1360px]:sticky min-[1360px]:top-6">
          <FlowDetail step={step} onSelect={pick} />
        </GlassCard>
      </div>

      {/* phones: vertical rail with inline detail (follows the tour) */}
      <FlowRail selected={selected} playing={playing} onPick={pick} />

      <p className="mt-6 px-2 text-[12.5px] leading-relaxed text-ink/65 sm:px-0">
        Ramas de control: si faltan jornadas, regresar a registro de entrada; si falta evidencia, corregir antes del cierre. Los envíos son manuales; los clientes no
        acceden a la app. Los indicadores de costos requieren captura de datos adicionales.
      </p>
    </AuroraPanel>
  );
}

/* ───────────── desktop serpentine ───────────── */

function Serpentine({ selected, onSelect }: { selected: number; onSelect: (n: number) => void }) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [geo, setGeo] = useState<{ w: number; h: number; boxes: Box[] } | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // offset* ignores the nodes' pop-in transforms, so lines land on the final layout.
    const measure = () => {
      if (!el.offsetWidth) return;
      const boxes = nodeRefs.current.map((n) => {
        const l = n?.offsetLeft ?? 0;
        const t = n?.offsetTop ?? 0;
        const w = n?.offsetWidth ?? 0;
        const h = n?.offsetHeight ?? 0;
        return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
      });
      setGeo({ w: el.offsetWidth, h: el.offsetHeight, boxes });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    nodeRefs.current.forEach((n) => n && ro.observe(n));
    return () => ro.disconnect();
  }, []);

  const paths = useMemo(() => {
    if (!geo) return null;
    const B = (n: number) => geo.boxes[n - 1];
    const c = (n: number) => ({ x: B(n).cx, y: B(n).cy });
    const main = roundedPath([c(1), c(5), c(6), c(10), c(11), c(15)], 0);
    // Decision 10 "Sí" → back to 05 through the gap between columns 1 and 2.
    const gap1 = (B(5).r + B(6).l) / 2 - 6;
    const back10 = roundedPath([
      { x: B(10).l, y: B(10).cy + 12 },
      { x: gap1, y: B(10).cy + 12 },
      { x: gap1, y: B(5).cy - 16 },
      { x: B(5).r + 2, y: B(5).cy - 16 },
    ]);
    // Decision 11 "No" → back to 09 through the gap between columns 2 and 3.
    const gap2 = (B(10).r + B(11).l) / 2 + 6;
    const back11 = roundedPath([
      { x: B(11).l, y: B(11).cy + 14 },
      { x: gap2, y: B(11).cy + 14 },
      { x: gap2, y: B(9).cy },
      { x: B(9).r + 2, y: B(9).cy },
    ]);
    // Direction chevrons in every gap.
    const chevrons = FLOW_STEPS.slice(0, 14).map((s) => {
      const a = B(s.n);
      const b = B(s.n + 1);
      const vertical = Math.abs(a.cx - b.cx) < 2;
      if (vertical) {
        const down = b.cy > a.cy;
        const y = down ? (a.b + b.t) / 2 : (a.t + b.b) / 2;
        return { n: s.n, x: a.cx, y, rot: down ? 90 : -90 };
      }
      return { n: s.n, x: (a.r + b.l) / 2, y: a.cy, rot: 0 };
    });
    return { main, back10, back11, chevrons };
  }, [geo]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? selected + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? selected - 1 : null;
    if (next === null || next < 1 || next > 15) return;
    e.preventDefault();
    onSelect(next);
    nodeRefs.current[next - 1]?.focus();
  };

  return (
    <div className="min-w-0">
      <div className="mb-3 grid grid-cols-3 gap-x-8 lg:gap-x-10">
        {FLOW_PHASES.map((p, i) => (
          <div key={p.title} title={`${p.range} · ${p.hint}`} className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink/60">
            {i === 1 ? <ArrowUp className="size-3.5 shrink-0" /> : <ArrowDown className="size-3.5 shrink-0" />}
            <span className="truncate">{p.title}</span>
          </div>
        ))}
      </div>
      <div ref={gridRef} role="group" aria-label="Pasos del flujo" onKeyDown={onKeyDown} className="relative grid grid-cols-3 grid-rows-5 gap-x-8 gap-y-7 lg:gap-x-10">
        {paths && geo && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`}>
            <defs>
              <linearGradient id={`${uid}-line`} x1="0" y1="0" x2={geo.w} y2={geo.h} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#023a63" stopOpacity="0.55" />
                <stop offset="0.55" stopColor="#1667e0" stopOpacity="0.55" />
                <stop offset="1" stopColor="#023a63" stopOpacity="0.6" />
              </linearGradient>
              <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#d48806" />
              </marker>
              {(["back10", "back11"] as const).map((k, i) => (
                <mask key={k} id={`${uid}-${k}`} maskUnits="userSpaceOnUse" x={0} y={0} width={geo.w} height={geo.h}>
                  <motion.path
                    d={paths[k]}
                    fill="none"
                    stroke="white"
                    strokeWidth={8}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: EASE, delay: START + DRAW + 0.15 + i * 0.25 }}
                  />
                </mask>
              ))}
            </defs>

            <motion.path
              d={paths.main}
              fill="none"
              stroke={`url(#${uid}-line)`}
              strokeWidth={2.25}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DRAW, ease: "linear", delay: START }}
            />
            {!reduce && (
              <motion.path
                d={paths.main}
                fill="none"
                stroke="white"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeDasharray="3 15"
                initial={{ opacity: 0, strokeDashoffset: 0 }}
                animate={{ opacity: 0.9, strokeDashoffset: -36 }}
                transition={{
                  opacity: { delay: START + DRAW, duration: 0.6 },
                  strokeDashoffset: { duration: 1.6, ease: "linear", repeat: Infinity },
                }}
              />
            )}
            {(["back10", "back11"] as const).map((k) => {
              const active = (k === "back10" && selected === 10) || (k === "back11" && selected === 11);
              return (
                <g key={k} mask={`url(#${uid}-${k})`}>
                  <path
                    d={paths[k]}
                    fill="none"
                    stroke="#d48806"
                    strokeOpacity={active ? 1 : 0.55}
                    strokeWidth={active ? 2.25 : 1.75}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    markerEnd={`url(#${uid}-arrow)`}
                    className="transition-[stroke-opacity,stroke-width] duration-300"
                  />
                </g>
              );
            })}
            {paths.chevrons.map((ch) => (
              <motion.g
                key={ch.n}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: nodeDelay(ch.n) + 0.18, duration: 0.3 }}
              >
                <circle cx={ch.x} cy={ch.y} r={5.5} fill="white" fillOpacity={0.95} />
                <path
                  d={`M ${ch.x - 1.5} ${ch.y - 2.75} L ${ch.x + 1.75} ${ch.y} L ${ch.x - 1.5} ${ch.y + 2.75}`}
                  transform={`rotate(${ch.rot} ${ch.x} ${ch.y})`}
                  fill="none"
                  stroke="#023a63"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.g>
            ))}
          </svg>
        )}

        {FLOW_STEPS.map((s) => (
          <FlowNode
            key={s.n}
            step={s}
            selected={selected === s.n}
            layoutKey={uid}
            onSelect={onSelect}
            ref={(el) => {
              nodeRefs.current[s.n - 1] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FlowNode({
  step: s,
  selected,
  layoutKey,
  onSelect,
  ref,
}: {
  step: FlowStep;
  selected: boolean;
  layoutKey: string;
  onSelect: (n: number) => void;
  ref: (el: HTMLButtonElement | null) => void;
}) {
  const { col, row } = flowCell(s.n);
  const decision = !!s.branches;
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={() => onSelect(s.n)}
      aria-pressed={selected}
      aria-label={`Paso ${pad2(s.n)}: ${s.title} · ${s.role}`}
      style={{ gridColumn: col, gridRow: row }}
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 26, delay: nodeDelay(s.n) }}
      className={cn(
        "relative z-10 flex min-h-[84px] min-w-0 flex-col rounded-[18px] p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-sky/70 xl:p-3.5",
        decision
          ? "border border-[#f3c97a] bg-[#fff7e8]/95 shadow-[0_10px_24px_-16px_rgb(184_110_0/0.6)] backdrop-blur-md"
          : "glass-card",
      )}
    >
      {selected && (
        <motion.span
          layoutId={`${layoutKey}-selected`}
          aria-hidden
          className="absolute -inset-[4px] rounded-[22px] ring-2 ring-brand-deep"
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
        />
      )}
      <span className="flex items-center gap-2 text-[11.5px] font-semibold text-subtle">
        <span className={cn("tabular", decision ? "text-[#b86e00]" : "text-ink")}>{pad2(s.n)}</span>
        {decision ? <GitBranch className="size-3.5 text-[#b86e00]" /> : <span className={cn("size-[6px] rounded-full", toneDot[FLOW_ROLE_TONE[s.role]])} />}
        <span className="truncate">{ROLE_SHORT[s.role] ?? s.role}</span>
      </span>
      <span className="mt-1.5 text-[13px] font-medium leading-snug text-ink xl:text-[14px]">{s.title}</span>
      {s.branches && <BranchChips branches={s.branches} className="mt-auto hidden flex-wrap gap-1.5 pt-2 xl:flex" />}
    </motion.button>
  );
}

/** "Sí → 05 · No → 09": where each branch of a decision goes (the loop-back arrows of the serpentine, as text). */
function BranchChips({ branches, className }: { branches: NonNullable<FlowStep["branches"]>; className?: string }) {
  return (
    <span className={className}>
      {branches.map((b) => (
        <span
          key={b.label}
          className={cn("inline-flex h-[20px] items-center rounded-md px-1.5 text-[10.5px] font-bold tabular", b.label === "Sí" ? "bg-[#dcf4ef] text-st-teal" : "bg-white text-[#b86e00] ring-1 ring-[#f3c97a]")}
        >
          {b.label} → {pad2(b.to)}
        </span>
      ))}
    </span>
  );
}

/* ───────────── phones: vertical rail ───────────── */

/** Brings a rail item into view once the previously open one has collapsed. */
const revealStep = (n: number, reduce: boolean | null) =>
  setTimeout(() => document.getElementById(`flow-rail-${n}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }), 340);

/** Same selection as the serpentine, so the guided tour also runs on phones (the open item is the current step). */
function FlowRail({ selected, playing, onPick }: { selected: number; playing: boolean; onPick: (n: number) => void }) {
  const reduce = useReducedMotion();
  // the step the reader folded; it only applies while it is the selected one, so picking another step clears it by itself
  const [folded, setFolded] = useState<number | null>(null);
  const open = folded === selected && !playing ? null : selected;
  const jumpTo = (n: number) => {
    setFolded(null);
    onPick(n);
    revealStep(n, reduce);
  };
  // the tour moves the open item: follow it
  useEffect(() => {
    if (!playing) return;
    const t = revealStep(selected, reduce);
    return () => clearTimeout(t);
  }, [playing, selected, reduce]);
  return (
    <div className="mt-5 md:hidden">
      {FLOW_PHASES.map((phase, pi) => (
        <section key={phase.title} className={cn(pi > 0 && "mt-5")}>
          <p className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            {phase.range} · {phase.title}
            <span className="mt-0.5 block text-[12.5px] font-normal normal-case tracking-normal text-ink/55">{phase.hint}</span>
          </p>
          <ol className="space-y-2">
            {FLOW_STEPS.slice(pi * 5, pi * 5 + 5).map((s, i) => {
              const isOpen = open === s.n;
              const decision = !!s.branches;
              return (
                <motion.li
                  key={s.n}
                  id={`flow-rail-${s.n}`}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ duration: 0.35, ease: EASE, delay: i * 0.04 }}
                  className={cn("overflow-hidden rounded-[18px]", decision ? "border border-[#f3c97a] bg-[#fff7e8]" : "glass-card")}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(s.n);
                      setFolded(isOpen ? s.n : null);
                    }}
                    aria-expanded={isOpen}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <span
                      className={cn(
                        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular",
                        decision ? "bg-[#ffe7bd] text-[#8a5300]" : isOpen ? "bg-brand-deep text-white" : "bg-[#eef3f9] text-ink",
                      )}
                    >
                      {pad2(s.n)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold leading-snug text-ink">{s.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-subtle">
                        <span className={cn("size-[6px] rounded-full", toneDot[FLOW_ROLE_TONE[s.role]])} />
                        {s.role}
                      </span>
                      {s.branches && <BranchChips branches={s.branches} className="mt-1.5 flex flex-wrap gap-1.5" />}
                    </span>
                    <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-subtle">
                      <ChevronDown className="size-[18px]" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-black/5 px-3.5 pb-4 pt-3">
                          <FlowDetail step={s} onSelect={jumpTo} compact />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
