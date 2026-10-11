"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, Link2Off, Loader2, LockKeyhole, Mail, MailCheck, RotateCw, UserRoundX, WifiOff } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { BigButton } from "@/components/pk/mobile";
import { Button } from "@/components/ui/button";
import { linkErrorOf, setPasswordErrorMessage, type LinkFailure } from "./auth-errors";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { AuthField, FormMessage, PasswordChecklist, PasswordField } from "./form-bits";
import { PASSWORD_RULE_TEXT, passwordProblem } from "./password-policy";
import { useEnterAccount } from "./use-enter-account";

/**
 * /acceso/definir-contrasena — where the invite and recovery e-mails land (supabase/templates):
 *   ?token_hash=…&type=invite|recovery   → verifyOtp, then "Defina su contraseña" (updateUser), then into the app
 *   ?token_hash=…&type=email_change|email → verifyOtp, then "Correo confirmado", then into the app
 * The token works once: it is verified once per page (React may run effects twice) and dropped from the address bar after.
 */

const PASSWORD_LINKS = ["invite", "recovery"] as const;
const CONFIRM_LINKS = ["email_change", "email", "signup"] as const;
type LinkType = (typeof PASSWORD_LINKS)[number] | (typeof CONFIRM_LINKS)[number];
const isLinkType = (t: string): t is LinkType => (PASSWORD_LINKS as readonly string[]).includes(t) || (CONFIRM_LINKS as readonly string[]).includes(t);
const needsPassword = (t: LinkType) => (PASSWORD_LINKS as readonly string[]).includes(t);

type Verified = { userId: string; email: string; type: LinkType };
type Outcome = { ok: true; verified: Verified } | { ok: false; failure: LinkFailure };

type Stage =
  | { kind: "checking" }
  | { kind: "unconfigured" }
  | { kind: "incomplete" }
  | { kind: "expired"; type: LinkType }
  | { kind: "failed"; failure: LinkFailure }
  | { kind: "password"; verified: Verified }
  | { kind: "confirmed"; verified: Verified }
  | { kind: "refused"; message: string };

const verifications = new Map<string, Promise<Outcome>>();
let lastVerified: Verified | null = null;

function verifyOnce(tokenHash: string, type: LinkType): Promise<Outcome> {
  let pending = verifications.get(tokenHash);
  if (!pending) {
    pending = (async (): Promise<Outcome> => {
      try {
        const { data, error } = await getSupabaseBrowserClient().auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
        if (error) return { ok: false, failure: linkErrorOf(error) };
        if (!data.session || !data.user) {
          // Secure e-mail change: the first of the two links is accepted without a session.
          const message =
            type === "email_change"
              ? "Falta un paso: abra también el enlace que llegó a su otro correo para terminar el cambio."
              : "No se pudo abrir la sesión con este enlace. Pida a Dirección un nuevo enlace.";
          return { ok: false, failure: { kind: "other", message } };
        }
        return { ok: true, verified: { userId: data.user.id, email: data.user.email ?? "", type } };
      } catch (err) {
        return { ok: false, failure: linkErrorOf(err) };
      }
    })();
    verifications.set(tokenHash, pending);
  }
  return pending;
}

function stageOf(outcome: Outcome, type: LinkType): Stage {
  if (outcome.ok) return { kind: needsPassword(outcome.verified.type) ? "password" : "confirmed", verified: outcome.verified };
  return outcome.failure.kind === "expired" ? { kind: "expired", type } : { kind: "failed", failure: outcome.failure };
}

function initialStage(tokenHash: string, type: string): Stage {
  if (!isSupabaseConfigured) return { kind: "unconfigured" };
  if (!tokenHash) {
    // The address bar was already cleaned after a verification in this page (a remount): keep going with it.
    if (lastVerified) return { kind: needsPassword(lastVerified.type) ? "password" : "confirmed", verified: lastVerified };
    return { kind: "incomplete" };
  }
  return isLinkType(type) ? { kind: "checking" } : { kind: "incomplete" };
}

export function SetPasswordView() {
  return (
    <Suspense>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Read once: the query is removed from the address bar after the verification.
  const [link] = useState(() => ({ tokenHash: params.get("token_hash") ?? "", type: params.get("type") ?? "" }));
  const [stage, setStage] = useState<Stage>(() => initialStage(link.tokenHash, link.type));
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (stage.kind !== "checking" || !isLinkType(link.type)) return;
    const type = link.type;
    let alive = true;
    void verifyOnce(link.tokenHash, type).then((outcome) => {
      if (!alive) return;
      if (outcome.ok) {
        lastVerified = outcome.verified;
        // The token is spent: keep it out of the history and of anything that stores URLs.
        window.history.replaceState(null, "", window.location.pathname);
      }
      setStage(stageOf(outcome, type));
    });
    return () => {
      alive = false;
    };
  }, [attempt, link, stage.kind]);

  const retry = () => {
    verifications.delete(link.tokenHash);
    setStage({ kind: "checking" });
    setAttempt((a) => a + 1);
  };

  const entered = useCallback(() => {
    lastVerified = null;
    setLeaving(true);
    setTimeout(() => router.replace("/"), 450);
  }, [router]);

  const { enter, replaceDialog } = useEnterAccount({
    onEntered: entered,
    onCancelled: (message) => setStage({ kind: "refused", message }),
  });

  /** Profile check + store session (step shared with the login). */
  const continueIn = async (verified: Verified) => {
    const result = await enter(getSupabaseBrowserClient(), verified.userId);
    if (result.status === "refused") {
      lastVerified = null;
      setStage({ kind: "refused", message: result.message });
    }
  };

  return (
    <>
      <AuthFrame leaving={leaving} cardKey={stage.kind}>
        {stage.kind === "checking" && (
          <div className="flex flex-col items-center py-10 text-center" role="status">
            <Loader2 className="size-8 animate-spin text-subtle" />
            <p className="mt-4 text-[15px] text-subtle">Comprobando su enlace…</p>
          </div>
        )}

        {stage.kind === "unconfigured" && (
          <Notice icon={<UserRoundX />} title="Cuentas no disponibles">
            Esta versión de Pulkro Cuadrillas funciona solo como demostración, sin cuentas.
          </Notice>
        )}

        {stage.kind === "incomplete" && (
          <Notice icon={<Link2Off />} title="El enlace está incompleto">
            Ábralo directamente desde el correo, sin cortarlo. Si sigue sin funcionar, pida a Dirección un nuevo enlace.
          </Notice>
        )}

        {stage.kind === "expired" && (
          <Notice
            icon={<Link2Off />}
            title="El enlace ya no funciona"
            primary={
              stage.type === "recovery" ? (
                <BigButton href="/login?recuperar=1">
                  Pedir un enlace nuevo <ArrowRight />
                </BigButton>
              ) : undefined
            }
          >
            Este enlace ya se usó o venció. Pida a Dirección un nuevo enlace
            {stage.type === "recovery" ? ", o solicite otro con «¿Olvidó su contraseña?»." : "."}{" "}
            {stage.type === "invite" && "Si ya definió su contraseña, entre con su correo."}
          </Notice>
        )}

        {stage.kind === "failed" && (
          <Notice
            icon={stage.failure.kind === "network" ? <WifiOff /> : <Link2Off />}
            title={stage.failure.kind === "network" ? "Sin conexión" : "No se pudo comprobar el enlace"}
            primary={
              <BigButton onClick={retry}>
                <RotateCw /> Reintentar
              </BigButton>
            }
          >
            {stage.failure.message}
          </Notice>
        )}

        {stage.kind === "refused" && (
          <Notice icon={<UserRoundX />} title="No puede entrar todavía">
            {stage.message}
          </Notice>
        )}

        {stage.kind === "password" && <PasswordStep verified={stage.verified} onSaved={() => continueIn(stage.verified)} />}

        {stage.kind === "confirmed" && <ConfirmedStep verified={stage.verified} onContinue={() => continueIn(stage.verified)} />}
      </AuthFrame>
      {replaceDialog}
    </>
  );
}

/** A state of the link with what to do next; "Volver a la entrada" always leads to /login. */
function Notice({ icon, title, children, primary }: { icon: React.ReactNode; title: string; children: React.ReactNode; primary?: React.ReactNode }) {
  return (
    <>
      <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-amber-soft text-amber-fg [&_svg]:size-6">{icon}</span>
      <AuthHeading title={title}>{children}</AuthHeading>
      <div className="mt-7 space-y-3">
        {primary}
        <BigButton href="/login" variant="outline">
          Volver a la entrada
        </BigButton>
      </div>
    </>
  );
}

function PasswordStep({ verified, onSaved }: { verified: Verified; onSaved: () => Promise<unknown> }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const problem = passwordProblem(password, confirmation);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (authError) {
        setError(setPasswordErrorMessage(authError));
        setBusy(false);
        return;
      }
      await onSaved();
    } catch (err) {
      setError(setPasswordErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-blue-wash text-blue-ink">
        <KeyRound className="size-6" />
      </span>
      <AuthHeading title="Defina su contraseña">
        {verified.type === "invite"
          ? "Es su primera entrada a Pulkro Cuadrillas: elija la contraseña con la que entrará desde ahora."
          : "Elija una contraseña nueva para su cuenta."}
      </AuthHeading>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        {/* The account it applies to, also read by password managers as the user name. */}
        <AuthField id="set-email" label="Cuenta" icon={<Mail />} type="email" autoComplete="username" value={verified.email} readOnly />
        <PasswordField
          id="set-password"
          label="Contraseña nueva"
          icon={<LockKeyhole />}
          autoComplete="new-password"
          aria-describedby="set-password-rule"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <PasswordField
          id="set-password-confirm"
          label="Escríbala de nuevo"
          icon={<LockKeyhole />}
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
        />
        <div className="rounded-[16px] border border-hairline px-4 py-3.5">
          <p id="set-password-rule" className="mb-2.5 text-[13.5px] font-semibold text-ink">
            {PASSWORD_RULE_TEXT}
          </p>
          <PasswordChecklist password={password} confirmation={confirmation} />
        </div>
        <FormMessage>{error}</FormMessage>
        <Button
          type="submit"
          disabled={busy}
          size="lg"
          className={cn("group h-12 w-full rounded-[14px] text-[15px] font-semibold", problem && !busy && "opacity-60")}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Guardando…
            </>
          ) : (
            <>
              Guardar y entrar <ArrowRight className="transition-transform group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>
    </>
  );
}

function ConfirmedStep({ verified, onContinue }: { verified: Verified; onContinue: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-teal-soft text-teal-fg">
        <MailCheck className="size-6" />
      </span>
      <AuthHeading title="Correo confirmado">
        {verified.email ? (
          <>
            Su cuenta usa ahora <b className="font-semibold text-ink">{verified.email}</b>.
          </>
        ) : (
          "Su correo quedó confirmado."
        )}
      </AuthHeading>
      <div className="mt-7">
        <BigButton
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onContinue().finally(() => setBusy(false));
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null} Entrar <ArrowRight />
        </BigButton>
      </div>
    </>
  );
}
