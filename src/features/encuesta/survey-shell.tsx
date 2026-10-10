"use client";

import { motion } from "motion/react";
import { PulkroMark } from "@/components/pk/brand";
import { Bubbles } from "@/components/pk/aurora";
import { EASE } from "@/components/pk/motion";

/** Public page chrome: aurora canvas, drifting soap bubbles, Pulkro mark. No app shell, no login. */
export function SurveyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-aurora grain animate-aurora relative min-h-dvh overflow-hidden">
      <Bubbles />
      <span aria-hidden className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-white/40 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -right-20 bottom-10 size-80 rounded-full bg-[#7fbdff]/30 blur-3xl" />
      <div className="relative z-[2] mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] sm:px-6 sm:pt-10">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex items-center gap-3"
        >
          <PulkroMark className="size-10 rounded-[12px]" />
          <span className="flex flex-col leading-none">
            <span className="font-brand text-[18px] font-extrabold tracking-[0.18em] text-brand-deep">PULKRO</span>
            <span className="mt-1 text-[11px] font-medium tracking-wide text-ink/60">Compañía de Servicios · desde 1985</span>
          </span>
        </motion.header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="mt-8 text-center text-[12px] leading-relaxed text-ink/55">
          Pulkro Compañía de Servicios · Monterrey, N.L.
          <br />
          Sus respuestas se usan solo para mejorar nuestro servicio.
        </footer>
      </div>
    </div>
  );
}

/** Branded loader while the on-device store hydrates. */
export function SurveyLoader() {
  return (
    <SurveyShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="relative">
          <span className="absolute inset-0 rounded-[18px] bg-white/60 animate-ping-soft" />
          <PulkroMark animated className="relative size-16 rounded-[18px]" />
        </motion.div>
        <p className="text-[14px] font-medium text-ink/70">Preparando su encuesta…</p>
        <div className="w-full max-w-[360px] space-y-3">
          <div className="h-5 w-3/4 animate-pulse rounded-full bg-white/55" />
          <div className="h-36 animate-pulse rounded-[24px] bg-white/50" />
        </div>
      </div>
    </SurveyShell>
  );
}
