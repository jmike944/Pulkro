"use client";

import { AnimatePresence, motion } from "motion/react";
import { PulkroLogo } from "@/components/pk/brand";
import { Bubbles } from "@/components/pk/aurora";
import { EASE } from "@/components/pk/motion";

/**
 * The frame of the screens outside the app shell (Entrar, Defina su contraseña): the aurora brand side on desktop and one
 * card with the task. `leaving` fades the card out while the app opens.
 */
export function AuthFrame({ children, leaving = false, cardKey }: { children: React.ReactNode; leaving?: boolean; cardKey?: string }) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side */}
      <div className="bg-aurora grain relative hidden overflow-hidden lg:block">
        <Bubbles />
        <div className="relative z-[2] flex h-full flex-col justify-between p-12">
          <PulkroLogo />
          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, ease: EASE }}
              className="font-serif text-[58px] font-medium leading-[1.02] tracking-[-0.02em] text-ink"
            >
              Si piensa en limpio…
              <br />
              <span className="italic text-brand-ink">¡piense en Pulkro!</span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/70"
            >
              Control operativo y postventa de cuadrillas: de la orden autorizada al reporte con fotos, sin papel y aun sin señal.
            </motion.p>
          </div>
          <div className="flex gap-10 text-[13px] text-ink/60">
            <span>
              <b className="block text-[22px] font-medium text-ink">1985</b>Desde
            </span>
            <span>
              <b className="block text-[22px] font-medium text-ink">3</b>Unidades
            </span>
            <span>
              <b className="block text-[22px] font-medium text-ink">Sin señal</b>Captura en campo
            </span>
          </div>
        </div>
      </div>

      {/* Task side */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <AnimatePresence mode="wait">
          {!leaving && (
            <motion.div
              key={cardKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: EASE }}
              className="w-full max-w-[440px] rounded-[28px] bg-surface p-7 shadow-lift ring-1 ring-edge sm:p-9"
            >
              <PulkroLogo className="mb-8 gap-3 lg:hidden [&>span:first-child]:size-11 [&>span:last-child]:h-[19px]" />
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Serif title + one or two sentences, as on the original login card. */
export function AuthHeading({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="font-serif text-[34px] font-medium leading-tight text-ink">{title}</h1>
      {children && <p className="mt-2 text-[15px] leading-relaxed text-subtle">{children}</p>}
    </>
  );
}
