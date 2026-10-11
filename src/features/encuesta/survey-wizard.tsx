"use client";

import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import type { SurveyAnswers } from "@/lib/types";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NpsPicker, StarInput } from "@/features/postventa/rating";

const STEPS = ["General", "Detalle", "Recomendación", "Comentario"] as const;

const DETAIL: { key: "quality" | "punctuality" | "staff"; label: string; hint: string }[] = [
  { key: "quality", label: "Calidad de la limpieza", hint: "¿Quedó como esperaba?" },
  { key: "punctuality", label: "Puntualidad", hint: "Llegada y horarios acordados" },
  { key: "staff", label: "Trato del personal", hint: "Amabilidad y orden de la cuadrilla" },
];

const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 36, filter: "blur(4px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.42, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -36, filter: "blur(4px)", transition: { duration: 0.22, ease: EASE } }),
};

/** Four short steps: overall stars → detail stars → NPS → optional comment + name. */
export function SurveyWizard({ token, onSubmitted }: { token: string; onSubmitted: (answers: SurveyAnswers, name?: string) => void }) {
  const submitSurvey = useAppStore((s) => s.submitSurvey);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [overall, setOverall] = useState(0);
  const [detail, setDetail] = useState({ quality: 0, punctuality: 0, staff: 0 });
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);

  const canNext = step === 0 ? overall > 0 : step === 1 ? DETAIL.every((d) => detail[d.key] > 0) : step === 2 ? nps !== null : true;

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    // Moving to the detail step pre-fills it with the overall score — the client only adjusts.
    if (to === 1 && step === 0)
      setDetail((d) => ({ quality: d.quality || overall, punctuality: d.punctuality || overall, staff: d.staff || overall }));
    setStep(to);
  };

  const submit = () => {
    if (nps === null || !overall || sending) return;
    setSending(true);
    const answers: SurveyAnswers = { overall, ...detail, nps, comment: comment.trim() || undefined };
    const ok = submitSurvey(token, answers, name.trim() || undefined);
    if (!ok) {
      setSending(false);
      // Only claim "already answered" when it is: a refusal for another reason (open staff session) was explained by the store.
      if (useAppStore.getState().surveys.some((x) => x.token === token && x.respondedAt))
        toast.error("Esta encuesta ya fue respondida", { description: "Gracias, ya tenemos su calificación." });
      return;
    }
    useUi.getState().fireCelebrate();
    onSubmitted(answers, name.trim() || undefined);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
      className="glass-card mt-5 overflow-hidden rounded-[28px]"
      aria-label="Encuesta de satisfacción"
    >
      {/* progress */}
      <div className="flex items-center gap-1.5 px-6 pt-5 sm:px-8 sm:pt-6" aria-hidden>
        {STEPS.map((s, i) => (
          <div key={s} className="h-[5px] flex-1 overflow-hidden rounded-full bg-press">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sky to-azure"
              initial={false}
              animate={{ width: i < step ? "100%" : i === step ? "45%" : "0%" }}
              transition={{ type: "spring", stiffness: 160, damping: 24 }}
            />
          </div>
        ))}
      </div>
      <p className="px-6 pt-2.5 text-[12px] font-medium text-subtle sm:px-8">
        Paso {step + 1} de {STEPS.length} · {STEPS[step]}
      </p>

      <div className="relative min-h-[300px] px-6 pb-6 pt-4 sm:px-8">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit">
            {step === 0 && (
              <div className="flex flex-col items-center pt-2 text-center">
                <h2 className="font-serif text-[25px] leading-tight text-ink">En general, ¿cómo calificaría el servicio?</h2>
                <StarInput value={overall} onChange={setOverall} size="lg" label="Calificación general" showLabel className="mt-6" />
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="font-serif text-[25px] leading-tight text-ink">Cuéntenos un poco más</h2>
                <p className="mt-1 text-[14px] text-subtle">Ajuste lo que haga falta.</p>
                <ul className="mt-4">
                  {DETAIL.map((d, i) => (
                    <motion.li
                      key={d.key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE, delay: 0.08 + i * 0.07 }}
                      className="flex flex-col gap-1 border-b border-hairline py-3 last:border-0 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
                    >
                      <span>
                        <span className="block text-[15px] font-semibold text-ink">{d.label}</span>
                        <span className="text-[13px] text-subtle">{d.hint}</span>
                      </span>
                      <StarInput value={detail[d.key]} onChange={(v) => setDetail((x) => ({ ...x, [d.key]: v }))} size="sm" label={d.label} className="-ml-1.5 min-[420px]:ml-0" />
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-serif text-[25px] leading-tight text-ink">¿Qué tan probable es que nos recomiende?</h2>
                <p className="mt-1 text-[14px] text-subtle">Con un colega, vecino o amigo.</p>
                <NpsPicker value={nps} onChange={setNps} className="mt-6" />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-serif text-[25px] leading-tight text-ink">¿Algo más que quiera contarnos?</h2>
                  <p className="mt-1 text-[14px] text-subtle">Opcional. Lo lee el equipo de postventa.</p>
                </div>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={overall >= 4 ? "Lo que más le gustó…" : "Qué podemos mejorar…"}
                  aria-label="Comentario"
                  maxLength={600}
                  className="min-h-[112px] rounded-[16px] border-input bg-surface px-4 py-3 text-[16px]"
                />
                <div>
                  <label htmlFor="sv-name" className="mb-2 block text-[13px] font-medium text-subtle">
                    Su nombre <span className="font-normal text-faint">· opcional</span>
                  </label>
                  <Input
                    id="sv-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="¿Con quién tenemos el gusto?"
                    className="h-12 rounded-[14px] border-input bg-surface px-4 text-[16px]"
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 border-t border-hairline bg-surface/70 px-6 py-4 sm:px-8">
        {step > 0 && (
          <Button variant="ghost" onClick={() => go(step - 1)} className="h-12 rounded-[14px] px-4 text-[15px]">
            <ArrowLeft /> Volver
          </Button>
        )}
        <motion.div className="ml-auto" animate={canNext ? { scale: 1, opacity: 1 } : { scale: 0.98, opacity: 0.85 }}>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => go(step + 1)} disabled={!canNext} className={cn("h-12 rounded-[14px] px-6 text-[15px] font-semibold")}>
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button onClick={submit} disabled={sending} className="h-12 rounded-[14px] px-6 text-[15px] font-semibold">
              <Send /> Enviar respuesta
            </Button>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
}
