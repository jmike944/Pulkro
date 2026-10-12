/**
 * The public survey against the server (architecture §9): `public.get_survey(p_token)` and `public.submit_survey(…)`, granted
 * to `anon` only — the client's browser has no session and uses the publishable key. A staff session in the browser gets
 * 42501 (the page asks to sign out, as the store path does). Nothing here is queued: the client answers online.
 */
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { SurveyAnswers } from "@/lib/types";

/** What the page shows of the survey (only what get_survey returns). */
export type RemoteSurvey = {
  clientName: string;
  clientHue: number;
  serviceName: string;
  orderTitle: string;
  serviceDate: string;
  supervisorFirstName: string;
  respondedAt?: string;
  respondentName?: string;
  answers?: SurveyAnswers;
};

export type LoadOutcome =
  | { status: "ok"; survey: RemoteSurvey }
  /** Unknown, malformed or removed token (PT404 survey_not_found). */
  | { status: "missing" }
  /** A Pulkro session is open in this browser (42501): answering would not be the client's. */
  | { status: "staff" }
  | { status: "error"; message: string };

export type SendOutcome = { status: "ok" } | { status: "already" } | { status: "missing" } | { status: "staff" } | { status: "error"; message: string };

type RpcError = { message: string; code?: string | null };
type LooseRpc = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }> };

const NETWORK = "No hay conexión con el servidor. Revise su señal e intente de nuevo.";
const SERVER = "No se pudo completar en este momento. Intente de nuevo en unos minutos.";

function failure(error: RpcError): LoadOutcome & SendOutcome {
  if (error.code === "PT404") return { status: "missing" };
  if (error.code === "42501") return { status: "staff" };
  if (!error.code || /fetch|network|load failed/i.test(error.message)) return { status: "error", message: NETWORK };
  return { status: "error", message: SERVER };
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

function answersOf(v: unknown): SurveyAnswers | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  const [overall, quality, punctuality, staff, nps] = [num(a.overall), num(a.quality), num(a.punctuality), num(a.staff), num(a.nps)];
  if (overall === undefined || quality === undefined || punctuality === undefined || staff === undefined || nps === undefined) return undefined;
  return { overall, quality, punctuality, staff, nps, comment: str(a.comment) };
}

export async function loadSurvey(client: SupabaseBrowserClient, token: string): Promise<LoadOutcome> {
  try {
    const { data, error } = await (client as unknown as LooseRpc).rpc("get_survey", { p_token: token });
    if (error) return failure(error);
    const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return {
      status: "ok",
      survey: {
        clientName: str(r.client_name) ?? "",
        clientHue: num(r.client_hue) ?? 210,
        serviceName: str(r.service_name) ?? "",
        orderTitle: str(r.order_title) ?? "",
        serviceDate: str(r.service_date) ?? new Date().toISOString(),
        supervisorFirstName: str(r.supervisor_first_name) ?? "",
        respondedAt: str(r.responded_at),
        respondentName: str(r.respondent_name),
        answers: answersOf(r.answers),
      },
    };
  } catch {
    return { status: "error", message: NETWORK };
  }
}

export async function sendSurvey(client: SupabaseBrowserClient, token: string, answers: SurveyAnswers, respondentName?: string): Promise<SendOutcome> {
  try {
    const { data, error } = await (client as unknown as LooseRpc).rpc("submit_survey", {
      p_token: token,
      p_overall: answers.overall,
      p_quality: answers.quality,
      p_punctuality: answers.punctuality,
      p_staff: answers.staff,
      p_nps: answers.nps,
      p_comment: answers.comment,
      p_respondent_name: respondentName,
    });
    if (error) return failure(error);
    const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (r.ok === false && r.status === "already_responded") return { status: "already" };
    return r.ok === true ? { status: "ok" } : { status: "error", message: SERVER };
  } catch {
    return { status: "error", message: NETWORK };
  }
}
