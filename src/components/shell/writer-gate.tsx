"use client";

import { useSyncExternalStore } from "react";
import { AppWindow, HardDrive, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { retryClaim, subscribeWriter, takeOver, takeOverAnyway, writerState, type WriterState } from "@/lib/device-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BigButton } from "@/components/pk/mobile";
import { AuthFrame, AuthHeading } from "@/features/auth/auth-frame";

const BLOCKED: WriterState[] = ["blocked", "taking", "kept", "unanswered", "handing", "lost", "full", "unreadable"];

/**
 * An account build's client survey is read and answered on the server (features/encuesta): a device that cannot hold the
 * app's data (full, unreadable) never keeps the client from answering it. The store then holds no staff session; the server
 * still refuses one it sees in this browser's cookies.
 */
export const surveyWithoutDevice = (state: WriterState) => isSupabaseConfigured && (state === "full" || state === "unreadable");

/** Whether the blocker covers the page at `pathname` in `state`. */
export const blocksPage = (state: WriterState, pathname: string) =>
  BLOCKED.includes(state) && !(pathname.startsWith("/encuesta") && surveyWithoutDevice(state));

/**
 * One tab per device holds the app's data (lib/device-storage: the writer). Every other tab of the app shows this blocker
 * over the page, which stays inert underneath (it never loaded the data). «Usar aquí» asks the other tab to save what it has
 * pending and step aside; this tab then loads the data. The tab also takes over by itself when the other one closes. The
 * same screen says when this tab cannot hold the data yet: the device is full, or could not be read (except over an account
 * build's client survey, which needs nothing from the device).
 */
export function WriterGate({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeWriter, writerState, () => "starting" as const);
  // The address is read on the client only (the server snapshot never blocks): usePathname here would hold the prerender
  // of every page.
  const blocked = typeof window !== "undefined" && blocksPage(state, window.location.pathname);
  return (
    <>
      <div className="contents" inert={blocked}>
        {children}
      </div>
      {blocked && <WriterBlocker state={state} />}
    </>
  );
}

const reload = () => window.location.reload();

const COPY: Partial<Record<WriterState, { title: string; body: string }>> = {
  blocked: {
    title: "Pulkro está abierta en otra ventana",
    body: "Para que sus capturas no se mezclen ni se pierdan, Pulkro trabaja en una sola ventana a la vez en este dispositivo. Siga en la otra ventana, o use Pulkro aquí: la otra guardará lo que tenga pendiente y se detendrá.",
  },
  unanswered: {
    title: "La otra ventana no responde",
    body: "Pulkro está abierta en otra ventana que no responde (puede estar en segundo plano) y que no pudo guardar en el dispositivo sus últimos cambios: siguen solo en esa ventana. Vaya a esa ventana y espere a que se guarden. Si usa Pulkro aquí de todos modos, esos cambios se perderán.",
  },
  handing: { title: "Pulkro se abrió en otra ventana", body: "Esta ventana está guardando lo pendiente para que la otra siga con sus datos." },
  lost: { title: "Pulkro se abrió en otra ventana", body: "Esta ventana dejó de usarse para que sus capturas no se mezclen ni se pierdan." },
  full: {
    title: "No hay espacio en el teléfono",
    body: "Pulkro no puede abrir sus datos porque el almacenamiento del teléfono está lleno. Libere espacio (fotos, videos o apps que no use): se vuelve a intentar solo.",
  },
  unreadable: {
    title: "No se pudieron leer sus datos",
    body: "Pulkro no pudo leer los datos guardados en este dispositivo. Siguen ahí: vuelva a intentarlo. Si no se resuelve, cierre la app por completo y ábrala de nuevo.",
  },
};

/** The full-screen blocker for `state`. */
export function WriterBlocker({ state }: { state: WriterState }) {
  const copy = COPY[state] ?? COPY.blocked!;
  const icon = state === "full" ? <HardDrive /> : state === "unreadable" || state === "unanswered" ? <TriangleAlert /> : <AppWindow />;
  return (
    <div role="dialog" aria-modal="true" aria-label={copy.title} className="fixed inset-0 z-[300] overflow-y-auto bg-canvas">
      <AuthFrame cardKey={state === "kept" || state === "taking" ? "blocked" : state}>
        <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-blue-soft text-azure-fg [&_svg]:size-6">{icon}</span>
        <AuthHeading title={copy.title}>{copy.body}</AuthHeading>
        {state === "kept" && (
          <p role="alert" className="mt-5 rounded-[14px] bg-amber-soft px-4 py-3 text-[14px] leading-snug text-amber-olive">
            La otra ventana no pudo guardar sus cambios en el dispositivo (el almacenamiento está lleno o falló), así que siguen solo
            en esa ventana y no se detuvo. Vaya a esa ventana, libere espacio y espere a que se guarden; después pulse «Usar aquí»
            de nuevo.
          </p>
        )}
        <div className="mt-7">
          {(state === "blocked" || state === "taking" || state === "kept") && (
            <>
              <BigButton onClick={takeOver} disabled={state === "taking"}>
                {state === "taking" && <Loader2 className="animate-spin" aria-hidden />}
                {state === "taking" ? "Cambiando a esta ventana…" : "Usar aquí"}
              </BigButton>
              {state === "taking" && (
                <p className="mt-3 text-center text-[13.5px] leading-snug text-subtle" aria-live="polite">
                  La otra ventana está guardando lo pendiente.
                </p>
              )}
            </>
          )}
          {state === "unanswered" && (
            <BigButton variant="outline" onClick={takeOverAnyway}>
              Usar aquí de todos modos
            </BigButton>
          )}
          {state === "handing" && (
            <BigButton disabled>
              <Loader2 className="animate-spin" aria-hidden /> Guardando…
            </BigButton>
          )}
          {(state === "lost" || state === "unreadable") && (
            <BigButton onClick={reload}>
              <RefreshCw aria-hidden /> {state === "lost" ? "Recargar" : "Reintentar"}
            </BigButton>
          )}
          {state === "full" && (
            <BigButton onClick={retryClaim}>
              <RefreshCw aria-hidden /> Reintentar ahora
            </BigButton>
          )}
        </div>
      </AuthFrame>
    </div>
  );
}
