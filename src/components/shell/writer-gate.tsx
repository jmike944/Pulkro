"use client";

import { useSyncExternalStore } from "react";
import { AppWindow, Loader2 } from "lucide-react";
import { subscribeWriter, takeOver, writerState, type WriterState } from "@/lib/device-storage";
import { BigButton } from "@/components/pk/mobile";
import { AuthFrame, AuthHeading } from "@/features/auth/auth-frame";

const BLOCKED: WriterState[] = ["blocked", "taking", "kept", "lost"];

/**
 * One tab per device holds the app's data (lib/device-storage: the writer). Every other tab of the app shows this blocker
 * over the page, which stays inert underneath (it never loaded the data). «Usar aquí» asks the other tab to save what it has
 * pending and step aside; this tab then loads the data. The tab also takes over by itself when the other one closes.
 */
export function WriterGate({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeWriter, writerState, () => "starting" as const);
  const blocked = BLOCKED.includes(state);
  return (
    <>
      <div className="contents" inert={blocked}>
        {children}
      </div>
      {blocked && <Blocker state={state} />}
    </>
  );
}

function Blocker({ state }: { state: WriterState }) {
  const taking = state === "taking";
  const lost = state === "lost";
  const title = lost ? "Pulkro se abrió en otra ventana" : "Pulkro está abierta en otra ventana";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[300] overflow-y-auto bg-canvas">
      <AuthFrame cardKey={state === "kept" ? "kept" : "open"}>
        <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-blue-soft text-azure-fg [&_svg]:size-6">
          <AppWindow />
        </span>
        <AuthHeading title={title}>
          {lost
            ? "Esta ventana dejó de usarse para que sus capturas no se mezclen ni se pierdan."
            : "Para que sus capturas no se mezclen ni se pierdan, Pulkro trabaja en una sola ventana a la vez en este dispositivo. Siga en la otra ventana, o use Pulkro aquí: la otra guardará lo que tenga pendiente y se detendrá."}
        </AuthHeading>
        {state === "kept" && (
          <p role="alert" className="mt-5 rounded-[14px] bg-amber-soft px-4 py-3 text-[14px] leading-snug text-amber-olive">
            La otra ventana no pudo guardar sus cambios en el dispositivo (el almacenamiento está lleno o falló), así que siguen solo
            en esa ventana y no se detuvo. Vaya a esa ventana, libere espacio y espere a que se guarden; después pulse «Usar aquí»
            de nuevo.
          </p>
        )}
        <div className="mt-7">
          <BigButton onClick={takeOver} disabled={taking || lost}>
            {taking || lost ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {taking ? "Cambiando a esta ventana…" : lost ? "Cargando…" : "Usar aquí"}
          </BigButton>
          {taking && (
            <p className="mt-3 text-center text-[13.5px] leading-snug text-subtle" aria-live="polite">
              La otra ventana está guardando lo pendiente.
            </p>
          )}
        </div>
      </AuthFrame>
    </div>
  );
}
