"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { verifyAccount } from "@/lib/sync/pull";
import { DEMO_SIGN_IN } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AccountSignIn } from "./account-sign-in";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { DemoPicker } from "./demo-picker";
import { TextAction } from "./form-bits";
import { RecoveryRequest } from "./recovery-request";
import { safeNext } from "./safe-next";

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
  // The browser has no Supabase session for the account whose data is on the device: sign in again (same account, data kept).
  const reauth = useAppStore((s) => s.session.signedIn && s.session.mode === "supabase" && !!s.session.needsReauth);
  const noAccess = useAppStore((s) => s.session.signedIn && s.session.mode === "supabase" && !!s.session.noAccess);
  // The browser's Supabase session has been compared with the account on the device (verifyAccount).
  const [checked, setChecked] = useState(false);
  const accountEmail = useAppStore((s) => (s.session.mode === "supabase" ? s.users.find((u) => u.id === s.session.userId)?.email : undefined));
  const [panel, setPanel] = useState<Panel>(() =>
    !isSupabaseConfigured ? "demo" : params.get("recuperar") === "1" ? "recovery" : "account",
  );
  // null = not typed yet: a re-authentication offers the account's own e-mail.
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? (reauth ? (accountEmail ?? "") : "");
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

  useEffect(() => {
    if (!hydrated || !accountSignedIn) return;
    let alive = true;
    // None, or another account's (a link opened on this device) → needsReauth: the form below. This account's → in.
    void verifyAccount(useAppStore).then(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
  }, [hydrated, accountSignedIn]);

  // An account already signed in on this device goes straight in (it signs out from the app, which checks unsent changes) once
  // the browser's Supabase session is its own (or cannot be checked offline); otherwise it signs in again here. Only from the
  // sign-in panel: «¿Olvidó su contraseña?» (/login?recuperar=1, e.g. «Pedir un enlace nuevo» for someone else's expired
  // link) stays open — asking for a recovery e-mail does not touch the open session.
  useEffect(() => {
    if (panel === "account" && hydrated && accountSignedIn && checked && !reauth && !leavingRef.current) router.replace(next);
  }, [panel, hydrated, accountSignedIn, checked, reauth, router, next]);
  const opening = hydrated && accountSignedIn && !reauth;

  return (
    <AuthFrame leaving={leaving} cardKey={panel}>
      {panel === "account" && opening && (
        <div className="flex flex-col items-center py-10 text-center" role="status">
          <Loader2 className="size-8 animate-spin text-subtle" />
          <p className="mt-4 text-[15px] text-subtle">Abriendo su cuenta…</p>
        </div>
      )}

      {panel === "account" && !opening && (
        <>
          {noAccess ? (
            <AuthHeading title="Su cuenta ya no tiene acceso">
              Su perfil ya no está activo en Pulkro Cuadrillas. Sus datos siguen en este dispositivo: si Dirección lo reactiva, entre de nuevo con
              su contraseña. Para entrar con otra cuenta, escriba su correo.
            </AuthHeading>
          ) : reauth ? (
            <AuthHeading title="Vuelva a entrar">
              La sesión de su cuenta ya no está abierta en este dispositivo. Sus datos y los cambios sin enviar siguen guardados: escriba su
              contraseña para seguir sincronizando.
            </AuthHeading>
          ) : (
            <AuthHeading title="Bienvenido">Entre con el correo y la contraseña de su cuenta.</AuthHeading>
          )}
          <AccountSignIn email={email} onEmailChange={setEmail} onForgot={() => setPanel("recovery")} onEntered={entered} />
          {reauth && !noAccess && (
            <div className="mt-3 flex justify-center">
              <TextAction onClick={() => router.replace(next)}>
                <ArrowLeft className="size-4" /> Volver sin entrar
              </TextAction>
            </div>
          )}
          {DEMO_SIGN_IN && !reauth && (
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
