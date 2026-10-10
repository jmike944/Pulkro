"use client";

import { use, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, Sparkles, UserRound } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { firstName, fmtDate, fmtLongDay } from "@/lib/format";
import type { SurveyAnswers } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { EASE } from "@/components/pk/motion";
import { SurveyLoader, SurveyShell } from "./survey-shell";
import { SurveyWizard } from "./survey-wizard";
import { SurveyMissing, SurveyThanks } from "./survey-states";

/**
 * /encuesta/[token] — PUBLIC client survey (doc §4.4 "encuesta mediante enlace externo sin instalar app").
 * No session required: it reads the survey by token from the on-device store.
 */
export function SurveyView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const hydrated = useAppStore((s) => s.hydrated);
  if (!hydrated) return <SurveyLoader />;
  return (
    <SurveyShell>
      <SurveyContent token={token} />
    </SurveyShell>
  );
}

function SurveyContent({ token }: { token: string }) {
  const survey = useAppStore((s) => s.surveys.find((x) => x.token === token));
  const order = useAppStore((s) => (survey ? s.orders.find((o) => o.id === survey.orderId) : undefined));
  const client = useAppStore((s) => (survey ? s.clients.find((c) => c.id === survey.clientId) : undefined));
  const serviceType = useAppStore((s) => (order ? s.serviceTypes.find((t) => t.id === order.serviceTypeId) : undefined));
  const supervisor = useAppStore((s) => (order ? s.users.find((u) => u.id === order.supervisorId) : undefined));
  const [submitted, setSubmitted] = useState<{ answers: SurveyAnswers; name?: string } | null>(null);

  if (!survey || !order) return <SurveyMissing token={token} />;

  const serviceDate = order.closure?.validatedAt ?? order.scheduledEnd;

  if (submitted) return <SurveyThanks answers={submitted.answers} name={submitted.name} fresh />;
  if (survey.respondedAt && survey.answers)
    return <SurveyThanks answers={survey.answers} name={survey.respondentName} respondedAt={survey.respondedAt} />;

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="mt-9 sm:mt-12"
      >
        <h1 className="font-serif text-[40px] font-medium leading-[1.04] tracking-[-0.02em] text-ink sm:text-[48px]">
          ¿Cómo quedó
          <br />
          <span className="italic text-brand-ink">su servicio?</span>
        </h1>
        <p className="mt-3 max-w-md text-[15.5px] leading-relaxed text-ink/70">Su opinión nos ayuda a dejar todo impecable. Le toma menos de un minuto.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
        className="mt-6 flex items-center gap-3.5 rounded-[20px] border border-surface/80 bg-surface/60 p-3.5 backdrop-blur-md"
      >
        {client && <ClientMark name={client.name} hue={client.hue} size={46} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{client?.name ?? "Su servicio"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink/65">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> {serviceType?.name ?? order.title}
            </span>
            <span className="inline-flex items-center gap-1.5" title={fmtLongDay(serviceDate)}>
              <CalendarDays className="size-3.5" /> {fmtDate(serviceDate)}
            </span>
            {supervisor && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5" /> Supervisó {firstName(supervisor.name)}
              </span>
            )}
          </p>
        </div>
      </motion.div>

      <SurveyWizard token={token} onSubmitted={(answers, name) => setSubmitted({ answers, name })} />
    </div>
  );
}
