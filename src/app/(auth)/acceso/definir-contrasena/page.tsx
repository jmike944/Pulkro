import type { Metadata } from "next";
import { SetPasswordView } from "@/features/auth/set-password-view";

// Public (no app shell): the invite and recovery e-mails land here with a one-time token in the query, so the page sends no
// referrer anywhere.
export const metadata: Metadata = { title: "Defina su contraseña", referrer: "no-referrer" };

export default function Page() {
  return <SetPasswordView />;
}
