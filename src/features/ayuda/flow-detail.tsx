"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronLeft, ChevronRight, Gavel, MapPinned, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneDot } from "@/lib/status";
import { EASE } from "@/components/pk/motion";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import { FLOW_ROLE_TONE, FLOW_STEPS, pad2, type FlowStep } from "./flow-data";

/** Explains one flow step: who does it, where in the app, and the governing rule. */
export function FlowDetail({ step, onSelect, compact }: { step: FlowStep; onSelect: (n: number) => void; compact?: boolean }) {
  const decision = !!step.branches;
  // Only the screens the current role may open (field screens are the supervisor's, Indicadores / Equipo are management's);
  // a step none of whose screens is reachable points to the orders list, where the detail tabs carry the same information.
  const canSee = useCanSeeRoute();
  const reachable = step.where.filter((w) => canSee(w.href));
  const where = reachable.length ? reachable : [{ label: "Órdenes", href: "/ordenes" }];
  return (
    <div className="@container">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.n}
          initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {!compact && (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
                  <span className={cn("size-[7px] rounded-full", toneDot[FLOW_ROLE_TONE[step.role]])} />
                  Paso {pad2(step.n)} · {step.role}
                </p>
                <h3 className="mt-2 font-serif text-[26px] font-medium leading-tight text-ink">{step.title}</h3>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(Math.max(1, step.n - 1))}
                  disabled={step.n === 1}
                  aria-label="Paso anterior"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-tile text-ink transition hover:bg-brand-deep hover:text-white disabled:opacity-40 disabled:hover:bg-tile disabled:hover:text-ink"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(Math.min(15, step.n + 1))}
                  disabled={step.n === 15}
                  aria-label="Paso siguiente"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-tile text-ink transition hover:bg-brand-deep hover:text-white disabled:opacity-40 disabled:hover:bg-tile disabled:hover:text-ink"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}

          <div className={cn("grid gap-5 @lg:grid-cols-3 @lg:gap-6", !compact && "mt-5")}>
            <section>
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
                <UserRound className="size-3.5" /> {decision ? "Cómo se decide" : "Quién lo hace"}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{step.who}</p>
            </section>

            <section>
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
                <MapPinned className="size-3.5" /> {decision ? "Ramas" : "Dónde en la app"}
              </p>
              {decision ? (
                <ul className="mt-2 space-y-2">
                  {step.branches!.map((b) => {
                    const target = FLOW_STEPS[b.to - 1];
                    return (
                      <li key={b.label}>
                        <button
                          type="button"
                          onClick={() => onSelect(b.to)}
                          className="group flex min-h-11 w-full items-start gap-2.5 rounded-[14px] bg-surface/70 px-3 py-2.5 text-left ring-1 ring-hairline transition hover:ring-brand-deep/40"
                        >
                          <span className={cn("mt-px inline-flex h-[22px] shrink-0 items-center rounded-md px-1.5 text-[11.5px] font-bold", b.label === "Sí" ? "bg-teal-tint text-teal-fg" : "bg-amber-tint text-amber-fg")}>
                            {b.label}
                          </span>
                          <span className="min-w-0 text-[13.5px] leading-snug text-ink">
                            {b.text}
                            <span className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-link">
                              Ir al paso {pad2(target.n)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {where.map((w) => (
                    <li key={w.href}>
                      <Link
                        href={w.href}
                        className="group inline-flex h-11 items-center gap-1.5 rounded-[12px] bg-surface px-3.5 lg:h-10 text-[13.5px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.06)] ring-1 ring-hairline transition hover:bg-brand-deep hover:text-white hover:ring-brand-deep"
                      >
                        {w.label}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
                <Gavel className="size-3.5" /> Regla de negocio
              </p>
              <p className="mt-2 rounded-[14px] bg-blue-wash px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">{step.rule}</p>
              {decision && where[0] && (
                <Link href={where[0].href} className="group mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-link">
                  Ver en {where[0].label} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </section>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
