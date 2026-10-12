"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole, Loader2, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { signInErrorMessage } from "./auth-errors";
import { AuthField, FormMessage, PasswordField, TextAction } from "./form-bits";
import { useEnterAccount } from "./use-enter-account";

/** E-mail + password sign-in (Supabase Auth), then the account's own profile decides whether it may enter. */
export function AccountSignIn({
  email,
  onEmailChange,
  onForgot,
  onEntered,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onForgot: () => void;
  onEntered: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { enter, replaceDialog } = useEnterAccount({
    onEntered,
    onCancelled: (message) => {
      setError(message);
      setBusy(false);
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (!mail || !password) {
      setError(!mail ? "Escriba el correo de su cuenta." : "Escriba su contraseña.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (authError || !data.user) {
        setError(signInErrorMessage(authError));
        setBusy(false);
        return;
      }
      const result = await enter(supabase, data.user.id);
      // "entered": the card leaves; "confirm": the dialog decides (onCancelled re-enables the form).
      if (result.status === "refused") {
        setPassword("");
        setError(result.message);
        setBusy(false);
      }
    } catch (err) {
      setError(signInErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        <AuthField
          id="login-email"
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
        <PasswordField
          id="login-password"
          label="Contraseña"
          icon={<LockKeyhole />}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <FormMessage>{error}</FormMessage>
        <Button type="submit" disabled={busy} size="lg" className="group h-12 w-full rounded-[14px] text-[15px] font-semibold">
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Entrando…
            </>
          ) : (
            <>
              Entrar <ArrowRight className="transition-transform group-hover:translate-x-1" />
            </>
          )}
        </Button>
        <div className="flex justify-center">
          <TextAction onClick={onForgot} disabled={busy}>
            ¿Olvidó su contraseña?
          </TextAction>
        </div>
      </form>
      {replaceDialog}
    </>
  );
}
