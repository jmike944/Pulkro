"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Check, ShieldAlert, Smartphone, Sparkles } from "lucide-react";
import { firstName, fmtDate } from "@/lib/format";
import type { SurveyAnswers } from "@/lib/types";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { NpsValue, Stars } from "@/features/postventa/rating";
import { RATING_LABELS } from "@/features/postventa/lib";

/** Thank-you screen. `fresh` = just submitted (celebration + squeegee shine). */
export function SurveyThanks({ answers, name, respondedAt, fresh }: { answers: SurveyAnswers; name?: string; respondedAt?: string; fresh?: boolean }) {
  const happy = answers.overall >= 4;
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="glass-card relative overflow-hidden rounded-[30px] px-6 pb-8 pt-10 text-center sm:px-10"
      >
        {fresh && (
          <motion.span
            aria-hidden
            initial={{ x: "-120%" }}
            animate={{ x: "220%" }}
            transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.35 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/90 dark:via-white/25 to-transparent motion-reduce:hidden"
          />
        )}

        <div className="relative mx-auto size-24">
          {fresh &&
            [0, 1].map((i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-sky"
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 1.6, delay: 0.2 + i * 0.45, ease: "easeOut" }}
              />
            ))}
          <motion.span
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
            className="relative inline-flex size-24 items-center justify-center rounded-full bg-brand-deep text-white shadow-[0_18px_40px_-14px_rgb(2_58_99/0.6)]"
          >
            {fresh ? <Sparkles className="size-10 text-sky" /> : <Check className="size-10 text-sky" strokeWidth={2.5} />}
          </motion.span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
          className="mt-7 font-serif text-[36px] font-medium leading-tight tracking-[-0.015em] text-ink"
        >
          {fresh ? `¡Gracias${name ? `, ${firstName(name)}` : ""}!` : "Esta encuesta ya fue respondida"}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="mx-auto mt-3 max-w-sm text-[15.5px] leading-relaxed text-ink/70">
          {fresh
            ? happy
              ? "Nos alegra que su servicio haya quedado impecable. Su calificación ya llegó al equipo de Pulkro."
              : "Gracias por decírnoslo. Su comentario llega al equipo de postventa para revisarlo y mejorar."
            : `Recibimos su calificación${respondedAt ? ` el ${fmtDate(respondedAt)}` : ""}. ¡Gracias por tomarse el tiempo!`}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
          className="mx-auto mt-6 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-[16px] bg-blue-wash px-4 py-3"
        >
          <Stars value={answers.overall} size={20} delay={0.6} />
          <span className="whitespace-nowrap text-[14px] font-medium text-ink">{RATING_LABELS[answers.overall - 1]}</span>
          <span className="hidden h-4 w-px bg-hairline min-[480px]:block" />
          <span className="flex items-center gap-1.5 text-[13px] text-subtle">
            Recomendación <NpsValue value={answers.nps} />
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.75 }}
          className="mt-9 font-serif text-[26px] leading-[1.15] text-ink sm:text-[30px]"
        >
          Si piensas en limpio…
          <br />
          <span className="italic text-brand-ink">¡piensa en Pulkro!</span>
        </motion.p>
      </motion.section>
      <p className="mt-5 text-center text-[13px] text-ink/60">Ya puede cerrar esta ventana.</p>
    </div>
  );
}

/** Token not on this device: explain the prototype's on-device storage kindly. */
export function SurveyMissing({ token }: { token: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="glass-card rounded-[30px] px-6 py-9 text-center sm:px-10"
      >
        <div className="relative mx-auto w-fit">
          <span className="absolute -left-4 -top-2 size-4 rounded-full border border-sky/60 bg-sky-soft animate-float" />
          <span className="absolute -right-3 top-8 size-2.5 rounded-full border border-sky/60 bg-sky-soft animate-float [animation-delay:1.2s]" />
          <span className="inline-flex size-16 items-center justify-center rounded-[20px] bg-sky-soft text-azure-fg">
            <Smartphone className="size-7" />
          </span>
        </div>
        <h1 className="mt-6 font-serif text-[30px] font-medium leading-tight text-ink">No encontramos esta encuesta</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink/70">
          Este prototipo guarda la información en el dispositivo donde se generó el enlace. Ábralo en el mismo navegador donde el equipo de Pulkro lo creó, o pida un enlace nuevo a su supervisor.
        </p>
        <p className="mx-auto mt-5 w-fit rounded-[10px] bg-tile px-3 py-1.5 text-[12.5px] text-subtle">
          Código <span className="font-semibold text-ink tabular">{token}</span>
        </p>
        <p className="mt-8 font-serif text-[20px] italic text-brand-ink">Si piensas en limpio… ¡piensa en Pulkro!</p>
      </motion.section>
    </div>
  );
}

/**
 * A Pulkro session is open on this device. The public survey is answered by the client, never from a staff session (the
 * answer would be recorded as the client's), so it shows neither the form nor stored answers until the session is closed.
 */
export function SurveyStaffSession({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="glass-card rounded-[30px] px-6 py-9 text-center sm:px-10"
      >
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-[20px] bg-amber-soft text-amber-fg">
          <ShieldAlert className="size-7" />
        </span>
        <h1 className="mt-6 font-serif text-[30px] font-medium leading-tight text-ink">Hay una sesión de Pulkro abierta</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink/70">
          La encuesta la responde el cliente, no el equipo de Pulkro. Para verla como la ve el cliente, cierre la sesión en este dispositivo; para consultar las respuestas, use Postventa.
        </p>
        <div className="mx-auto mt-7 flex w-full max-w-xs flex-col gap-2.5">
          <Button onClick={onSignOut} className="h-12 rounded-[14px] text-[15px] font-semibold">
            Cerrar sesión y abrir como cliente
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-[14px] border-line text-[15px] font-semibold">
            <Link href="/postventa">Volver a Postventa</Link>
          </Button>
        </div>
      </motion.section>
    </div>
  );
}
