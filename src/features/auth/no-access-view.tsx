"use client";

import { usePathname } from "next/navigation";
import { LogOut, UserRoundX } from "lucide-react";
import { BigButton } from "@/components/pk/mobile";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { useSignOut } from "./use-sign-out";

/**
 * Shown by the shell instead of the app when the account's profile is no longer active (session.noAccess): the pull found it
 * deactivated and ended the Supabase session. The device keeps the account's data and unsent changes, but nobody uses them
 * here until the account is active again and signs in, or someone signs out and wipes them.
 */
export function NoAccessView() {
  const pathname = usePathname();
  const { requestSignOut, signOutDialog, signingOut } = useSignOut();
  return (
    <AuthFrame>
      <span className="mb-5 flex size-14 items-center justify-center rounded-[18px] bg-amber-soft text-amber-fg [&_svg]:size-6">
        <UserRoundX />
      </span>
      <AuthHeading title="Su cuenta ya no tiene acceso">
        Su perfil en Pulkro Cuadrillas ya no está activo, así que su sesión se cerró en este dispositivo. Sus datos y cambios sin enviar
        siguen guardados aquí. Si cree que es un error, comuníquese con Dirección.
      </AuthHeading>
      <div className="mt-7 space-y-3">
        <BigButton href={`/login?next=${encodeURIComponent(pathname)}`}>Entrar de nuevo</BigButton>
        <BigButton variant="outline" onClick={requestSignOut} disabled={signingOut}>
          <LogOut /> Cerrar sesión y borrar datos
        </BigButton>
      </div>
      {signOutDialog}
    </AuthFrame>
  );
}
