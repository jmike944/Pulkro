"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, Link2Off, Loader2, LockKeyhole, Mail, MailCheck, RotateCw, UserRoundX, WifiOff } from "lucide-react";
import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { BigButton } from "@/components/pk/mobile";
import { Button } from "@/components/ui/button";
import { NETWORK_MESSAGE, linkErrorOf, linkRedirectErrorOf, setPasswordErrorMessage, type LinkFailure } from "./auth-errors";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { isCredential, needsPassword, parseAuthLink, type AuthLink, type LinkCredential, type LinkType } from "./auth-link";
import { AuthField, FormMessage, PasswordChecklist, PasswordField } from "./form-bits";
import { PASSWORD_RULE_TEXT, passwordProblem } from "./password-policy";
import { accountOnDevice, whenHydrated } from "./session";
import { useEnterAccount } from "./use-enter-account";

/**
 * /acceso/definir-contrasena: where the invite and recovery e-mails land, in every form Supabase Auth sends (auth-link.ts):
 *   ?token_hash=…&type=…                   (custom templates, supabase/templates)        → verifyOtp
 *   #access_token=…&refresh_token=…&type=… (default templates, invite: implicit flow)    → setSession
 *   ?code=…                                (default templates, recovery asked for here)  → exchangeCodeForSession ("recovery")
 *   #error=…&error_code=…                  (a link Auth refused)                         → expired / failed, nothing to verify
 * invite / recovery → "Defina su contraseña" (updateUser), email_change / email / signup → "Correo confirmado"; then into
 * the app. Links that land on another page (the dashboard's invite goes to the Site URL) are sent here by the root layout
 * (auth-link-forward.ts).
 * This page is the only place that turns a link into a session. The browser client never reads the address bar
 * (detectSessionInUrl: false, lib/supabase/client.ts), so it cannot spend the one-time code or swallow the fragment first.
 * Verifying the link replaces the browser's Supabase session with the link's account. While an account is open on this
 * device, the page asks first ("other-account"), so a link opened on a shared tablet never silently takes over its session.
 * The link is a credential until it is used: the query and the fragment leave the address bar (and the history) as soon as
 * the page has read them, whatever happens next; "Reintentar" works from the copy in memory. It is verified once per page
 * (React may run effects twice).
 */

type Verified = { userId: string; email: string; type: LinkType };
type Outcome = { ok: true; verified: Verified } | { ok: false; failure: LinkFailure };

type Stage =
  | { kind: "checking" }
  | { kind: "other-account"; name: string }
  | { kind: "unconfigured" }
  | { kind: "incomplete" }
  // type null: Auth refused the link before it reached the page, and its error does not say which kind it was.
  | { kind: "expired"; type: LinkType | null; otherBrowser: boolean }
  // retry false: the link carried Auth's error, so trying it again reads the same error.
  | { kind: "failed"; failure: LinkFailure; retry: boolean }
  | { kind: "password"; verified: Verified }
  | { kind: "confirmed"; verified: Verified }
  | { kind: "refused"; message: string };

const verifications = new Map<string, Promise<Outcome>>();
/** PKCE codes this page has handed to Auth. After any attempt auth-js drops the verifier, so the code cannot work again here. */
const triedCodes = new Set<string>();
/** This page's link and its verified account, for a remount after the address bar was cleaned (memory only). */
let pageLink: LinkCredential | null = null;
let lastVerified: Verified | null = null;

/** The link in the address bar; without one (already cleaned), the one this page read before. */
function readLink(search: string, hash: string): AuthLink {
  const link = parseAuthLink(search, hash);
  if (link.form === "none") return pageLink ?? link;
  lastVerified = null; // a new link: whatever the previous one verified does not carry over
  // An error or an unusable link is final: nothing of it is kept for a remount.
  pageLink = isCredential(link) ? link : null;
  return link;
}

/** The link is finished with (entered, refused, spent): nothing of it stays in memory for a later visit. */
function forgetLink() {
  pageLink = null;
  lastVerified = null;
}

const keyOf = (link: LinkCredential) =>
  link.form === "otp" ? `otp:${link.tokenHash}` : link.form === "session" ? `session:${link.refreshToken}` : `code:${link.code}`;

function verifyOnce(link: LinkCredential): Promise<Outcome> {
  const key = keyOf(link);
  let pending = verifications.get(key);
  if (!pending) {
    pending = verify(link).catch((err): Outcome => ({ ok: false, failure: linkErrorOf(err) }));
    verifications.set(key, pending);
  }
  return pending;
}

const fail = (failure: LinkFailure): Outcome => ({ ok: false, failure });

async function verify(link: LinkCredential): Promise<Outcome> {
  const auth = getSupabaseBrowserClient().auth;
  switch (link.form) {
    case "otp": {
      const { data, error } = await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type as EmailOtpType });
      return error ? fail(linkErrorOf(error)) : sessionOutcome(data, link.type);
    }
    case "session": {
      // The session Auth put in the fragment, checked with Auth (getUser, or a refresh if the access token has expired).
      const { data, error } = await auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
      return error ? fail(linkErrorOf(error)) : sessionOutcome(data, link.type);
    }
    case "code": {
      // auth-js drops this browser's verifier after any exchange, even one that never reached Auth. Offline it is kept,
      // and "Reintentar" can still work.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return fail({ kind: "network", message: NETWORK_MESSAGE });
      const retried = triedCodes.has(link.code);
      triedCodes.add(link.code);
      const { data, error } = await auth.exchangeCodeForSession(link.code, link.flowId ? { flowId: link.flowId } : undefined);
      if (!error) return sessionOutcome(data, "recovery");
      const failure = linkErrorOf(error);
      // No verifier after an attempt of this page's own: the link is spent here, not opened in the wrong browser.
      return fail(failure.kind === "other-browser" && retried ? { kind: "expired", message: "Este enlace ya se usó o venció." } : failure);
    }
  }
}

function sessionOutcome(data: { session: Session | null; user: User | null }, type: LinkType): Outcome {
  if (!data.session || !data.user) {
    // Secure e-mail change: the first of the two links is accepted without a session.
    const message =
      type === "email_change"
        ? "Falta un paso: abra también el enlace que llegó a su otro correo para terminar el cambio."
        : "No se pudo abrir la sesión con este enlace. Pida a Dirección un nuevo enlace.";
    return fail({ kind: "other", message });
  }
  return { ok: true, verified: { userId: data.user.id, email: data.user.email ?? "", type } };
}

function stageOf(outcome: Outcome, type: LinkType | null, retry: boolean): Stage {
  if (outcome.ok) return { kind: needsPassword(outcome.verified.type) ? "password" : "confirmed", verified: outcome.verified };
  const { failure } = outcome;
  // No "pedir un enlace nuevo" nor "Reintentar" when the account itself may not enter.
  if (failure.kind === "no-access") return { kind: "refused", message: failure.message };
  if (failure.kind === "expired" || failure.kind === "other-browser") return { kind: "expired", type, otherBrowser: failure.kind === "other-browser" };
  return { kind: "failed", failure, retry };
}

function initialStage(link: AuthLink): Stage {
  if (!isSupabaseConfigured) return { kind: "unconfigured" };
  if (link.form === "error") return stageOf(fail(linkRedirectErrorOf(link.error, link.errorCode)), link.type, false);
  if (!isCredential(link)) return { kind: "incomplete" };
  // Verified earlier in this page (a remount): keep going with it.
  if (lastVerified) return { kind: needsPassword(lastVerified.type) ? "password" : "confirmed", verified: lastVerified };
  return { kind: "checking" };
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
  // Read once into memory; the effect below takes it out of the address bar. useSearchParams keeps this tree client-rendered
  // (prerendered routes bail out to the client up to the Suspense above), where the fragment can be read too.
  const [link] = useState(() => readLink(params.toString(), typeof window === "undefined" ? "" : window.location.hash));
  const [stage, setStage] = useState<Stage>(() => initialStage(link));
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // The person chose to go on with the link although an account is open on this device.
  const takeOver = useRef(false);

  // Right away, on every outcome (also a failed, expired or abandoned check): the token stays out of the history, the
  // address bar and anything that stores URLs (sync of open tabs, screenshots, a link shared by mistake).
  useEffect(() => {
    if (window.location.search || window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (stage.kind !== "checking" || !isCredential(link)) return;
    let alive = true;
    void (async () => {
      if (!takeOver.current) {
        await whenHydrated();
        const open = accountOnDevice();
        if (open) {
          if (alive) setStage({ kind: "other-account", name: open.name });
          return;
        }
      }
      const outcome = await verifyOnce(link);
      if (!alive) return;
      if (outcome.ok) lastVerified = outcome.verified;
      // Used or refused for good: a later visit to this page starts from its own link.
      else if (outcome.failure.kind !== "network" && outcome.failure.kind !== "other") forgetLink();
      setStage(stageOf(outcome, link.type, true));
    })();
    return () => {
      alive = false;
    };
  }, [attempt, link, stage.kind]);

  const retry = () => {
    if (isCredential(link)) verifications.delete(keyOf(link));
    setStage({ kind: "checking" });
    setAttempt((a) => a + 1);
  };

  const continueWithLink = () => {
    takeOver.current = true;
    setStage({ kind: "checking" });
  };

  const entered = useCallback(() => {
    forgetLink();
    setLeaving(true);
    setTimeout(() => router.replace("/"), 450);
  }, [router]);

  const { enter, replaceDialog } = useEnterAccount({
    onEntered: entered,
    onCancelled: (message) => {
      forgetLink();
      setStage({ kind: "refused", message });
    },
  });

  /** Profile check + store session (step shared with the login). */
  const continueIn = async (verified: Verified) => {
    const result = await enter(getSupabaseBrowserClient(), verified.userId);
    if (result.status === "refused") {
      forgetLink();
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

        {stage.kind === "other-account" && (
          <>
            <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-amber-soft text-amber-fg [&_svg]:size-6">
              <UserRoundX />
            </span>
            <AuthHeading title="Hay una cuenta abierta en este dispositivo">
              Está abierta la cuenta de <b className="font-semibold text-ink">{stage.name}</b>. Si este enlace es de otra persona, al continuar se
              cerrará esa sesión aquí; sus cambios sin enviar no se borran sin preguntar antes.
            </AuthHeading>
            <div className="mt-7 space-y-3">
              <BigButton onClick={continueWithLink}>
                Continuar con el enlace <ArrowRight />
              </BigButton>
              <BigButton
                variant="outline"
                onClick={() => {
                  forgetLink();
                  router.replace("/");
                }}
              >
                Volver a la app
              </BigButton>
            </div>
          </>
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
            title={stage.otherBrowser ? "Abra el enlace donde lo pidió" : "El enlace ya no funciona"}
            primary={
              // Asked for again from this browser, the new link works here.
              stage.type === "recovery" || stage.type === null ? (
                <BigButton href="/login?recuperar=1">
                  Pedir un enlace nuevo <ArrowRight />
                </BigButton>
              ) : undefined
            }
          >
            {stage.otherBrowser ? (
              "Por seguridad, este enlace funciona una sola vez y solo en el navegador donde pidió el cambio de contraseña. Ábralo ahí, o pida uno nuevo desde este dispositivo."
            ) : (
              <>
                Este enlace ya se usó o venció. Pida a Dirección un nuevo enlace
                {stage.type === "recovery" || stage.type === null ? ", o solicite otro con «¿Olvidó su contraseña?»." : "."}{" "}
                {(stage.type === "invite" || stage.type === null) && "Si ya definió su contraseña, entre con su correo."}
              </>
            )}
          </Notice>
        )}

        {stage.kind === "failed" && (
          <Notice
            icon={stage.failure.kind === "network" ? <WifiOff /> : <Link2Off />}
            title={stage.failure.kind === "network" ? "Sin conexión" : "No se pudo comprobar el enlace"}
            primary={
              stage.retry ? (
                <BigButton onClick={retry}>
                  <RotateCw /> Reintentar
                </BigButton>
              ) : undefined
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
