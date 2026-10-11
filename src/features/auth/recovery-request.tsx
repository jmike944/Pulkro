"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { recoveryErrorMessage } from "./auth-errors";
import { AuthHeading } from "./auth-frame";
import { AuthField, FormMessage, TextAction } from "./form-bits";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "¿Olvidó su contraseña?": Supabase e-mails a recovery link to /acceso/definir-contrasena (the recovery template builds it
 * from the Site URL; `redirectTo` must also be in the project's redirect allow list). The answer never says whether the
 * address has an account.
 */
export function RecoveryRequest({ email, onEmailChange, onBack }: { email: string; onEmailChange: (email: string) => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      setError("Escriba el correo completo de su cuenta, como nombre@empresa.com.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(mail, {
        redirectTo: `${window.location.origin}/acceso/definir-contrasena`,
      });
      if (authError) setError(recoveryErrorMessage(authError));
      else setSentTo(mail);
    } catch (err) {
      setError(recoveryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo)
    return (
      <>
        <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-teal-soft text-teal-fg">
          <MailCheck className="size-6" />
        </span>
        <AuthHeading title="Revise su correo">
          Si <b className="font-semibold text-ink">{sentTo}</b> tiene una cuenta, le llegará un enlace para definir una nueva contraseña. El
          enlace funciona una sola vez; si no lo ve, revise la carpeta de correo no deseado.
        </AuthHeading>
        <Button type="button" variant="outline" onClick={onBack} size="lg" className="mt-7 h-12 w-full rounded-[14px] border-line text-[15px] font-semibold">
          <ArrowLeft /> Volver
        </Button>
      </>
    );

  return (
    <>
      <AuthHeading title="¿Olvidó su contraseña?">Escriba el correo de su cuenta y le enviaremos un enlace para definir una nueva.</AuthHeading>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        <AuthField
          id="recovery-email"
          label="Correo electrónico"
          icon={<Mail />}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="nombre@empresa.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={busy}
        />
        <FormMessage>{error}</FormMessage>
        <Button type="submit" disabled={busy} size="lg" className="h-12 w-full rounded-[14px] text-[15px] font-semibold">
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Enviando…
            </>
          ) : (
            "Enviar enlace"
          )}
        </Button>
        <div className="flex justify-center">
          <TextAction onClick={onBack} disabled={busy}>
            <ArrowLeft className="size-4" /> Volver
          </TextAction>
        </div>
      </form>
    </>
  );
}
