"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { DEMO_SIGN_IN } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AccountSignIn } from "./account-sign-in";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { DemoPicker } from "./demo-picker";
import { TextAction } from "./form-bits";
import { RecoveryRequest } from "./recovery-request";
import { safeNext } from "./session";

type Panel = "account" | "recovery" | "demo";

/**
 * /login. With a Supabase project: e-mail + password (accounts are created by Dirección through an invite), "¿Olvidó su
 * contraseña?", and — while the demo is on — "Entrar al demo" as the secondary way in. Without one: only the demo picker.
 */
export function LoginView() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useAppStore((s) => s.hydrated);
  const accountSignedIn = useAppStore((s) => s.session.signedIn && s.session.mode === "supabase");
  const [panel, setPanel] = useState<Panel>(() =>
    !isSupabaseConfigured ? "demo" : params.get("recuperar") === "1" ? "recovery" : "account",
  );
  const [email, setEmail] = useState("");
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const entered = useCallback(() => {
    leavingRef.current = true;
    setLeaving(true);
    setTimeout(() => router.replace(next), 450);
  }, [router, next]);

  // An account already signed in on this device goes straight in (it signs out from the app, which checks unsent changes).
  useEffect(() => {
    if (hydrated && accountSignedIn && !leavingRef.current) router.replace(next);
  }, [hydrated, accountSignedIn, router, next]);

  return (
    <AuthFrame leaving={leaving} cardKey={panel}>
      {panel === "account" && (
        <>
          <AuthHeading title="Bienvenido">Entre con el correo y la contraseña de su cuenta.</AuthHeading>
          <AccountSignIn email={email} onEmailChange={setEmail} onForgot={() => setPanel("recovery")} onEntered={entered} />
          {DEMO_SIGN_IN && (
            <>
              <div className="my-6 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle" aria-hidden>
                <span className="h-px flex-1 bg-hairline" />o<span className="h-px flex-1 bg-hairline" />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPanel("demo")}
                size="lg"
                className="h-12 w-full rounded-[14px] border-line text-[15px] font-semibold"
              >
                <Sparkles /> Entrar al demo
              </Button>
            </>
          )}
          <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-fg" />
            Cada persona entra con su cuenta individual. Dirección da de alta las cuentas: recibirá un correo para definir su contraseña.
          </p>
        </>
      )}

      {panel === "recovery" && <RecoveryRequest email={email} onEmailChange={setEmail} onBack={() => setPanel("account")} />}

      {panel === "demo" && (
        <>
          <AuthHeading title="Bienvenido">Elija un perfil de demostración para entrar. Cada rol ve solo lo que le corresponde.</AuthHeading>
          <DemoPicker onEntered={entered} />
          {isSupabaseConfigured && (
            <div className="mt-3 flex justify-center">
              <TextAction onClick={() => setPanel("account")}>
                <ArrowLeft className="size-4" /> Volver
              </TextAction>
            </div>
          )}
          <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-fg" />
            {isSupabaseConfigured
              ? "Prototipo navegable con datos de demostración guardados solo en este dispositivo: no se mezclan con los de una cuenta."
              : "Prototipo navegable. En producción cada persona accede con su cuenta individual, sesiones seguras y bitácora de auditoría."}
          </p>
        </>
      )}
    </AuthFrame>
  );
}
