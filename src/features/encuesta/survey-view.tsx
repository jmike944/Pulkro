"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { CalendarDays, Sparkles, UserRound } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { subscribeWriter, writerState } from "@/lib/device-storage";
import { endSessionOnDevice, getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useSignOut } from "@/features/auth/use-sign-out";
import { firstName, fmtDate, fmtLongDay } from "@/lib/format";
import type { SurveyAnswers } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { EASE } from "@/components/pk/motion";
import { surveyWithoutDevice } from "@/components/shell/writer-gate";
import { SurveyLoader, SurveyShell } from "./survey-shell";
import { SurveyWizard } from "./survey-wizard";
import { SurveyLoading, SurveyMissing, SurveyStaffSession, SurveyThanks, SurveyUnreachable } from "./survey-states";
import { loadSurvey, sendSurvey, type LoadOutcome } from "./survey-remote";

/**
 * /encuesta/[token] — PUBLIC client survey (doc §4.4 "encuesta mediante enlace externo sin instalar app"). No session.
 *  - A build with a Supabase project: the survey lives on the server (architecture §9). The page reads it with
 *    `get_survey(p_token)` and sends the answer with `submit_survey`, as `anon` (survey-remote.ts).
 *  - The demo (no project, or a demo survey kept on this device): the on-device store, as before.
 * A staff session open on the device never answers as the client: it is asked to sign out first.
 * An account build's survey never depends on the device: when this tab cannot hold the app's data (the device is full or
 * unreadable), the page answers on the server without it (the server refuses a staff session it sees in the cookies).
 */
export function SurveyView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const hydrated = useAppStore((s) => s.hydrated);
  const writer = useSyncExternalStore(subscribeWriter, writerState, () => "starting" as const);
  if (!hydrated && !surveyWithoutDevice(writer)) return <SurveyLoader />;
  return (
    <SurveyShell>
      <SurveyContent token={token} />
    </SurveyShell>
  );
}

function SurveyContent({ token }: { token: string }) {
  const local = useAppStore((s) => s.surveys.some((x) => x.token === token));
  const demo = useAppStore((s) => s.session.mode !== "supabase");
  // An account's links are answered on the server; the demo answers the surveys it keeps on this device.
  if (!isSupabaseConfigured || (local && demo)) return <LocalSurvey token={token} />;
  return <ServerSurvey token={token} />;
}

/** The survey header: client, service, date, supervisor. */
function SurveyIntro({ clientName, clientHue, service, serviceDate, supervisorFirstName }: { clientName?: string; clientHue?: number; service: string; serviceDate: string; supervisorFirstName?: string }) {
  return (
    <>
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
        {clientName && <ClientMark name={clientName} hue={clientHue ?? 210} size={46} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{clientName || "Su servicio"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink/65">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> {service}
            </span>
            <span className="inline-flex items-center gap-1.5" title={fmtLongDay(serviceDate)}>
              <CalendarDays className="size-3.5" /> {fmtDate(serviceDate)}
            </span>
            {supervisorFirstName && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5" /> Supervisó {supervisorFirstName}
              </span>
            )}
          </p>
        </div>
      </motion.div>
    </>
  );
}

/** Account builds: the survey on the server, read and answered as `anon`. */
function ServerSurvey({ token }: { token: string }) {
  const staffSession = useAppStore((s) => s.session.signedIn);
  const { requestSignOut, signOutDialog } = useSignOut({ redirectTo: null });
  const [loaded, setLoaded] = useState<LoadOutcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitted, setSubmitted] = useState<{ answers: SurveyAnswers; name?: string } | null>(null);
  useEffect(() => {
    if (staffSession) return;
    let alive = true;
    void loadSurvey(getSupabaseBrowserClient(), token).then((r) => alive && setLoaded(r));
    return () => {
      alive = false;
    };
  }, [token, staffSession, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  if (submitted) return <SurveyThanks answers={submitted.answers} name={submitted.name} fresh />;
  // A staff session in the store, or one the server saw in this browser's cookies (42501): close it first.
  if (staffSession || loaded?.status === "staff")
    return (
      <>
        <SurveyStaffSession
          onSignOut={
            staffSession
              ? requestSignOut
              : () =>
                  void endSessionOnDevice().finally(() => {
                    setLoaded(null);
                    reload();
                  })
          }
        />
        {signOutDialog}
      </>
    );
  if (!loaded) return <SurveyLoading />;
  if (loaded.status === "missing") return <SurveyMissing token={token} account />;
  if (loaded.status === "error") return <SurveyUnreachable message={loaded.message} onRetry={reload} />;
  const s = loaded.survey;
  if (s.respondedAt && s.answers) return <SurveyThanks answers={s.answers} name={s.respondentName} respondedAt={s.respondedAt} />;
  return (
    <div className="flex flex-1 flex-col">
      <SurveyIntro clientName={s.clientName} clientHue={s.clientHue} service={s.serviceName || s.orderTitle} serviceDate={s.serviceDate} supervisorFirstName={s.supervisorFirstName || undefined} />
      <SurveyWizard
        token={token}
        send={(answers, name) => sendSurvey(getSupabaseBrowserClient(), token, answers, name)}
        onStale={reload}
        onSubmitted={(answers, name) => setSubmitted({ answers, name })}
      />
    </div>
  );
}

/** The demo: the survey from the on-device store. */
function LocalSurvey({ token }: { token: string }) {
  const survey = useAppStore((s) => s.surveys.find((x) => x.token === token));
  const order = useAppStore((s) => (survey ? s.orders.find((o) => o.id === survey.orderId) : undefined));
  const client = useAppStore((s) => (survey ? s.clients.find((c) => c.id === survey.clientId) : undefined));
  const serviceType = useAppStore((s) => (order ? s.serviceTypes.find((t) => t.id === order.serviceTypeId) : undefined));
  const supervisor = useAppStore((s) => (order ? s.users.find((u) => u.id === order.supervisorId) : undefined));
  const staffSession = useAppStore((s) => s.session.signedIn);
  // Stays on the survey: once signed out, the page opens as the client sees it (an account's data leaves the device).
  const { requestSignOut, signOutDialog } = useSignOut({ redirectTo: null });
  const [submitted, setSubmitted] = useState<{ answers: SurveyAnswers; name?: string } | null>(null);

  // Never answer (or read answers) as the client from a staff session: close it first (see store.submitSurvey).
  if (staffSession && !submitted)
    return (
      <>
        <SurveyStaffSession onSignOut={requestSignOut} />
        {signOutDialog}
      </>
    );
  if (!survey || !order) return <SurveyMissing token={token} />;

  const serviceDate = order.closure?.validatedAt ?? order.scheduledEnd;

  if (submitted) return <SurveyThanks answers={submitted.answers} name={submitted.name} fresh />;
  if (survey.respondedAt && survey.answers)
    return <SurveyThanks answers={survey.answers} name={survey.respondentName} respondedAt={survey.respondedAt} />;

  return (
    <div className="flex flex-1 flex-col">
      <SurveyIntro
        clientName={client?.name}
        clientHue={client?.hue}
        service={serviceType?.name ?? order.title}
        serviceDate={serviceDate}
        supervisorFirstName={supervisor ? firstName(supervisor.name) : undefined}
      />

      <SurveyWizard token={token} onSubmitted={(answers, name) => setSubmitted({ answers, name })} />
    </div>
  );
}
