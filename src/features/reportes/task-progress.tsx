"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CloudOff, LoaderCircle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { OutputTask } from "./use-report-outputs";
import { SqueegeeProgress } from "./fx";

export type SyncGate =
  | { kind: "ok" }
  | { kind: "syncing"; count: number }
  | { kind: "blocked"; count: number; offline: boolean; error: boolean };

export function progressOf(t: OutputTask) {
  switch (t.step) {
    case "registro":
      return 0.06;
    case "fotos":
      return 0.1 + 0.66 * (t.total ? t.done / t.total : 1);
    case "pdf":
      return 0.86;
    case "listo":
      return 1;
    default:
      return 0.5;
  }
}

export function labelOf(t: OutputTask) {
  switch (t.step) {
    case "registro":
      return `Registrando versión v${t.version}`;
    case "fotos":
      return t.total ? `Preparando fotos ${t.done} de ${t.total}` : "Preparando fotos";
    case "pdf":
      return "Componiendo páginas del PDF";
    case "listo":
      return `PDF v${t.version} listo`;
    default:
      return t.error ?? "No se pudo componer el PDF";
  }
}

/** Animated "squeegee" progress while a version is composed into a PDF. */
export function TaskProgress({ task, className }: { task: OutputTask; className?: string }) {
  const value = progressOf(task);
  const label = labelOf(task);
  const steps = [
    ...(task.kind === "generate" ? [{ key: "registro", label: "Versión" }] : []),
    { key: "fotos", label: "Fotos" },
    { key: "pdf", label: "PDF" },
  ];
  const order = ["registro", "fotos", "pdf", "listo"];
  const at = order.indexOf(task.step);
  return (
    <div className={className} aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className={cn("truncate text-[14.5px] font-semibold", task.step === "error" ? "text-st-red" : "text-ink")}
          >
            {label}
          </motion.p>
        </AnimatePresence>
        <span className="shrink-0 text-[13px] text-subtle tabular">{Math.round(value * 100)}%</span>
      </div>
      <SqueegeeProgress value={value} indeterminate={task.step === "pdf"} className="mt-3.5" />
      <ol className="mt-4 flex items-center gap-4 text-[12.5px]">
        {steps.map((s) => {
          const i = order.indexOf(s.key);
          const done = at > i;
          const active = at === i;
          return (
            <li key={s.key} className={cn("flex items-center gap-1.5", done ? "text-st-teal" : active ? "font-semibold text-ink" : "text-[#98a2b3]")}>
              <span className={cn("inline-flex size-4 items-center justify-center rounded-full", done ? "bg-[#dcf4ef]" : active ? "bg-sky-soft" : "bg-[#f2f4f7]")}>
                {done ? <Check className="size-3" strokeWidth={3} /> : active ? <LoaderCircle className="size-3 animate-spin text-link" /> : null}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Pending-sync gate (doc §8): the definitive PDF is shared only once the order is fully synced. */
export function SyncGatePanel({ gate, onOpenSync, className }: { gate: SyncGate; onOpenSync: () => void; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {gate.kind !== "ok" && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={cn("overflow-hidden", className)}>
          {gate.kind === "syncing" ? (
            <div className="flex items-center gap-2.5 rounded-[14px] bg-sky-soft px-3.5 py-3 text-[13.5px] leading-snug text-[#11507e]">
              <LoaderCircle className="size-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">
                Sincronizando {plural(gate.count, "registro", "registros")} de esta orden… el PDF definitivo se comparte al terminar.
              </span>
              <button type="button" onClick={onOpenSync} className="-my-2 h-10 shrink-0 rounded-[10px] px-3 text-[13px] font-semibold text-link hover:bg-white/60">
                Ver
              </button>
            </div>
          ) : (
            <div className="rounded-[16px] bg-[#fff6e6] p-4 text-[13.5px] leading-snug text-[#8a5300]">
              <p className="flex items-center gap-2 font-semibold">
                {gate.offline ? <WifiOff className="size-4" /> : <CloudOff className="size-4" />}
                {gate.offline ? "Sin conexión" : "Sincronización con errores"}
              </p>
              <p className="mt-1.5">
                {plural(gate.count, "registro", "registros")} de esta orden aún no {gate.count === 1 ? "llega" : "llegan"} al servidor. Para no enviar datos incompletos, el PDF
                definitivo se comparte cuando todo esté sincronizado.
              </p>
              <Button variant="outline" onClick={onOpenSync} className="mt-3 h-10 rounded-[12px] border-[#f1d7a8] bg-white px-4 font-semibold text-ink">
                Ver sincronización
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
