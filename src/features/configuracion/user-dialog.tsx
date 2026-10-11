"use client";

import { useEffect, useRef, useState } from "react";
import { Info, KeyRound, Loader2, Send, TriangleAlert, UserCog, UserPlus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/store";
import { useAppStore, useCurrentUser } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/status";
import type { Role, User } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { firstMissing } from "@/components/pk/modal-shell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipSelect, Field, FormDialog, GatedButton, ROLES, SwitchLite, hueFrom, initialsOf, inputCls, isEmail, norm, phoneDigits, selectTriggerCls } from "./shared";
import { DeactivateUserDialog } from "./deactivate-user";
import {
  ALREADY_ACTIVE,
  NEEDS_CONNECTION,
  NEEDS_CONNECTION_DETAIL,
  REAUTH,
  REAUTH_DETAIL,
  changeUserEmail,
  inviteUser,
  isUnknownOutcome,
  resendInvitation,
  setUserActive,
  useAccountAdmin,
  useOpIds,
} from "./account-admin";

const DEFAULT_TITLE: Record<Role, string> = {
  direccion: "Dirección",
  administracion: "Coordinación administrativa",
  supervisor: "Supervisor de operaciones",
};

type FieldKey = "name" | "title" | "email" | "phone";

/**
 * Create / edit a user account (users.admin).
 *
 * Demo: the store applies everything locally. Account session: a new user is an INVITATION (admin-users sends the e-mail and
 * creates the profile), and the e-mail and the active switch of an existing user change on the server when saving — all
 * three need a connection. Name, title, role, unit and phone keep going through the store (queued for the server).
 * "Reenviar invitación" (an existing, active account; account sessions online only) sends the invitation e-mail again
 * right away, apart from "Guardar".
 */
export function UserDialog({
  user,
  open,
  onOpenChange,
  onDeactivated,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** account sessions: the account was deactivated on save; `openOrders` = folios the server says it still supervises */
  onDeactivated?: (user: User, openOrders: string[]) => void;
}) {
  const me = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const units = useAppStore((s) => s.units);
  const upsertUser = useAppStore((s) => s.upsertUser);
  const { account, offline, reauth } = useAccountAdmin();
  const opFor = useOpIds();
  const isNew = !user;
  const isMe = user?.id === me.id;

  const [name, setName] = useState(user?.name ?? "");
  const [title, setTitle] = useState(user?.title ?? DEFAULT_TITLE.supervisor);
  const [role, setRole] = useState<Role>(user?.role ?? "supervisor");
  const [unitId, setUnitId] = useState(user?.unitId ?? me.unitId);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "+52 81 ");
  const [active, setActive] = useState(user?.active ?? true);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // An invitation whose answer never came (timeout, no answer, 5xx) may have gone out: the profile the pull then brings is
  // this same invitation, not another person's. While the form stays as it was sent, the address is not "taken" and
  // "Enviar invitación" resends the same operation (same op id: the server answers its stored result, nothing is e-mailed
  // twice). Holds the payload of that attempt.
  const [uncertainInvite, setUncertainInvite] = useState<string | null>(null);
  // bumped when the server answered another status than asked (a stale retry): the next "Guardar" is a new operation
  const [activeAttempt, setActiveAttempt] = useState(0);
  // what the form opened with: drives "¿Descartar cambios?" and "Aún no hay cambios que guardar"
  const [start] = useState({ name, title, role, unitId, email, phone, active });
  const [resending, setResending] = useState(false);
  // the answer of "Reenviar invitación" when it did not go out: "info" = no pending invitation (the message says the way in)
  const [resendNote, setResendNote] = useState<{ tone: "info" | "error"; message: string } | null>(null);

  const mail = email.trim().toLowerCase();
  const clean = name.trim().replace(/\s+/g, " ");
  const inviteInput = { email: mail, name: clean, role, unitId, title: title.trim(), phone: phone.trim(), hue: hueFrom(clean) };
  const resendingInvite = isNew && uncertainInvite === JSON.stringify(inviteInput);
  const emailTaken = !resendingInvite && users.some((u) => u.id !== user?.id && norm(u.email) === norm(email.trim()));
  const errors = {
    name: name.trim().length < 5 ? "Escriba nombre y apellidos." : null,
    title: !title.trim() ? "Escriba el puesto, por ejemplo Supervisor de operaciones." : null,
    email: !isEmail(email) ? "Escriba un correo completo, con @ y dominio: nombre@pulkro.com.mx." : emailTaken ? "Ese correo ya pertenece a otro usuario; use uno distinto." : null,
    phone: phoneDigits(phone) < 10 ? "Escriba al menos 10 dígitos, con lada." : null,
  };
  const show = (k: FieldKey) => (touched[k] ? errors[k] : null);
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const emailChanged = mail !== start.email.trim().toLowerCase();
  const activeChanged = active !== start.active;
  const profileChanged =
    name.trim() !== start.name.trim() ||
    title.trim() !== start.title.trim() ||
    role !== start.role ||
    unitId !== start.unitId ||
    phone.trim() !== start.phone.trim();
  const dirty = profileChanged || email.trim() !== start.email.trim() || activeChanged;
  // Account sessions: what only the server can do (invite, e-mail, active) waits for a connection.
  const needsServer = account && (isNew || emailChanged || activeChanged);
  const hint = firstMissing(
    [errors.name, "Escriba nombre y apellidos"],
    [errors.title, "Escriba el puesto"],
    [errors.email, isEmail(email) ? "Ese correo ya está en uso" : "Escriba un correo válido"],
    [errors.phone, "Escriba un teléfono de al menos 10 dígitos"],
    [!isNew && !dirty, "Aún no hay cambios que guardar"],
    [needsServer && offline, NEEDS_CONNECTION],
    [needsServer && reauth, REAUTH],
  );

  // The explanation of a refusal sits at the end of a body that scrolls (bottom sheet on phones): bring it into view.
  useEffect(() => {
    if (serverError) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [serverError]);

  // Turning a live account off goes through the same confirmation as the users list; the change itself is stored with "Guardar".
  const willDeactivate = !!user?.active && !active;
  const toggleActive = (next: boolean) => {
    if (!next && user?.active) setConfirmOff(true);
    else setActive(next);
  };

  // "Reenviar invitación": an existing, active account other than one's own. It goes to the login address the account has
  // now, so an e-mail change still in the form is saved (or undone) first.
  const showResend = !isNew && !isMe && !!user?.active;
  const resendBlocked = !account
    ? "En la demostración no se envían correos."
    : offline
      ? `${NEEDS_CONNECTION}: las invitaciones se envían desde el servidor.`
      : reauth
        ? "Vuelva a entrar con su cuenta: las invitaciones se envían a su nombre."
        : emailChanged
          ? "Guarde o descarte primero el cambio de correo: la invitación va al correo actual."
          : null;
  const resend = async () => {
    if (!user || resending || resendBlocked) return;
    setResending(true);
    setResendNote(null);
    try {
      const result = await resendInvitation(user);
      if (result.ok) {
        toast.success(`Invitación reenviada a ${user.email}`, {
          description: "Pídale que abra el enlace del correo más reciente: el de una invitación anterior puede ya no funcionar.",
        });
        return;
      }
      setResendNote({ tone: result.code === ALREADY_ACTIVE ? "info" : "error", message: result.message });
    } finally {
      setResending(false);
    }
  };

  const preview = name.trim() || "Nuevo usuario";
  const unitName = units.find((u) => u.id === unitId)?.name ?? "";

  /** Demo: everything local, as before. */
  const saveLocally = () => {
    const next: User = {
      id: user?.id ?? uid("usr"),
      name: clean,
      initials: initialsOf(clean),
      role,
      title: title.trim(),
      unitId,
      email: mail,
      phone: phone.trim(),
      hue: user?.hue ?? hueFrom(clean),
      active,
    };
    upsertUser(next);
    toast.success(isNew ? `Usuario ${clean.split(" ")[0]} creado` : "Cambios guardados", {
      description: willDeactivate ? "Cuenta desactivada: ya no puede iniciar sesión." : `${ROLE_LABEL[role]} · ${unitName}`,
    });
    onOpenChange(false);
  };

  /** Account session: the server parts first (each one idempotent, so "Guardar" again after a failure is safe), then the rest. */
  const saveOnServer = async () => {
    setBusy(true);
    setServerError(null);
    try {
      if (isNew) {
        const invited = await inviteUser(inviteInput, opFor("invite", inviteInput));
        if (!invited.ok) {
          const unknown = isUnknownOutcome(invited);
          setUncertainInvite(unknown ? JSON.stringify(inviteInput) : null);
          setServerError(
            unknown && invited.code !== "timeout" ? `${invited.message} Si la invitación ya salió, al enviarla de nuevo no se repite.` : invited.message,
          );
          return;
        }
        toast.success(`Invitación enviada a ${mail}`, {
          description: `${ROLE_LABEL[role]} · ${unitName}. La persona define su contraseña con el enlace del correo.`,
        });
        onOpenChange(false);
        return;
      }

      const target = user!;
      let invitePending = false;
      if (emailChanged) {
        const changed = await changeUserEmail(target, mail, opFor("email", mail));
        if (!changed.ok) {
          // The login may already use the new address while the list still shows the old one: only the same "Guardar"
          // (same operation) finishes it.
          setServerError(
            isUnknownOutcome(changed)
              ? `${changed.code === "timeout" ? "El servidor no confirmó la respuesta a tiempo." : changed.message} El correo de inicio de sesión pudo haber cambiado ya: vuelva a guardar para terminar el cambio (no se repetirá).`
              : changed.message,
          );
          return;
        }
        invitePending = changed.invite_pending;
      }
      let openOrders: string[] = [];
      if (activeChanged) {
        const switched = await setUserActive(target, active, opFor("active", [active, activeAttempt]));
        if (!switched.ok) {
          setServerError(emailChanged ? `El correo ya quedó cambiado. ${switched.message}` : switched.message);
          return;
        }
        if (switched.active !== active) {
          setActiveAttempt((n) => n + 1);
          setServerError(
            `${emailChanged ? "El correo ya quedó cambiado. " : ""}Otra persona de Dirección cambió el estado de la cuenta mientras tanto: ahora está ${switched.active ? "activa" : "desactivada"}. Revise y vuelva a guardar.`,
          );
          return;
        }
        openOrders = switched.open_orders;
      }
      if (profileChanged) {
        // The other fields go through the store (queued); e-mail and active are the server's values applied above.
        const current = useAppStore.getState().users.find((u) => u.id === target.id) ?? target;
        upsertUser({ ...current, name: clean, initials: initialsOf(clean), role, title: title.trim(), unitId, phone: phone.trim() });
      }

      toast.success("Cambios guardados", {
        description: invitePending
          ? "La persona aún no ha aceptado su invitación: pídale que use «¿Olvidó su contraseña?» con el nuevo correo para definir su contraseña."
          : emailChanged
            ? isMe
              ? `Sus sesiones se cerraron: vuelva a entrar con ${mail} cuando la app se lo pida.`
              : `Sus sesiones abiertas se cerraron: debe volver a iniciar sesión con ${mail}. Avísele del cambio.`
            : willDeactivate
              ? "Cuenta desactivada: ya no puede iniciar sesión."
              : `${ROLE_LABEL[role]} · ${unitName}`,
        duration: invitePending || emailChanged ? 12_000 : undefined,
      });
      onOpenChange(false);
      if (willDeactivate) setTimeout(() => onDeactivated?.(target, openOrders), 0);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy ? (isNew && account ? "Enviando…" : "Guardando…") : isNew ? (account ? "Enviar invitación" : "Crear usuario") : "Guardar cambios";

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(v) => {
          if (!v && busy) return;
          onOpenChange(v);
        }}
        icon={isNew ? <UserPlus /> : <UserCog />}
        title={isNew ? (account ? "Invitar usuario" : "Nuevo usuario") : "Editar usuario"}
        description={
          isNew
            ? account
              ? "La persona recibe un correo para definir su contraseña. Lo que puede hacer sigue la matriz de permisos de su rol."
              : "Cuenta individual con rol y unidad. El acceso de cada rol sigue la matriz de permisos."
            : `Cambios a la cuenta de ${user!.name}. Quedan en la bitácora.`
        }
        submitLabel={submitLabel}
        submitDisabled={!!hint || busy}
        footerNote={busy ? undefined : (hint ?? (serverError ? "No se completó: vea el motivo abajo" : undefined))}
        dirty={dirty}
        onSubmit={() => {
          if (hint || busy) return;
          if (account) void saveOnServer();
          else saveLocally();
        }}
      >
        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-3 rounded-[16px] bg-soft p-3">
            <PersonAvatar name={preview} initials={initialsOf(preview)} hue={user?.hue ?? hueFrom(preview)} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{preview}</p>
              <p className="truncate text-[13px] text-subtle">
                {ROLE_LABEL[role]} · {unitName}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" htmlFor="u-name" error={show("name")} className="sm:col-span-2">
              <Input
                id="u-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => touch("name")}
                autoComplete="name"
                placeholder="Ej. Ana López Garza"
                className={inputCls}
                aria-invalid={!!show("name")}
              />
            </Field>

            <Field label="Rol" className="sm:col-span-2" hint={isMe ? "No puede cambiar su propio rol." : "Lo que la persona puede hacer en la app."}>
              <ChipSelect
                ariaLabel="Rol"
                value={role}
                onChange={(r) => {
                  if (isMe) return;
                  setRole(r);
                  if (isNew || title === DEFAULT_TITLE[role]) setTitle(DEFAULT_TITLE[r]);
                }}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                className={isMe ? "pointer-events-none opacity-60" : undefined}
              />
            </Field>

            <Field label="Puesto" htmlFor="u-title" error={show("title")}>
              <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => touch("title")} className={inputCls} aria-invalid={!!show("title")} />
            </Field>

            <Field label="Unidad" hint={role === "direccion" ? "Dirección consulta todas las unidades." : "Las órdenes y los datos que la persona verá."}>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className={selectTriggerCls} aria-label="Unidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Correo"
              htmlFor="u-email"
              error={show("email")}
              hint={
                account && !isNew
                  ? emailChanged
                    ? "Al guardar, se cierran sus sesiones y vuelve a entrar con este correo: avísele del cambio."
                    : "Es el correo con el que inicia sesión. Cambiarlo necesita conexión."
                  : account
                    ? "La invitación llega a este correo; con él iniciará sesión."
                    : "Cada persona inicia sesión con su propio correo."
              }
            >
              <Input
                id="u-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => touch("email")}
                placeholder="nombre.apellido@pulkro.com.mx"
                className={inputCls}
                aria-invalid={!!show("email")}
              />
            </Field>

            <Field label="Teléfono" htmlFor="u-phone" error={show("phone")}>
              <Input
                id="u-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => touch("phone")}
                className={inputCls}
                aria-invalid={!!show("phone")}
              />
            </Field>
          </div>

          {/* An invitation always starts active; in an account session only an existing account is switched on or off. */}
          {!(isNew && account) && (
            <label className={cn("flex min-h-14 items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3", isMe ? "cursor-not-allowed" : "cursor-pointer")}>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-ink">Cuenta activa</span>
                <span className="block text-[12.5px] text-subtle">{isMe ? "Su propia cuenta siempre queda activa." : "Si se desactiva, la persona no puede iniciar sesión."}</span>
                {willDeactivate && <span className="mt-1 block text-[12.5px] font-medium text-amber-fg">Se desactivará al guardar los cambios.</span>}
              </span>
              <SwitchLite checked={active} onChange={toggleActive} disabled={isMe} label="Cuenta activa" />
            </label>
          )}

          {showResend && (
            <div className="rounded-[16px] border border-hairline px-4 py-3">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">Invitación</span>
                  <span className="block text-[12.5px] text-subtle">Si la persona aún no la acepta, se le envía de nuevo a su correo actual.</span>
                </span>
                <GatedButton
                  type="button"
                  variant="outline"
                  allowed={!resendBlocked}
                  reason={resendBlocked ?? ""}
                  lockIcon={account && offline ? <WifiOff className="size-3.5" /> : account && reauth ? <KeyRound className="size-3.5" /> : undefined}
                  disabled={resending}
                  aria-busy={resending || undefined}
                  onClick={() => void resend()}
                  className="border-line"
                >
                  {resending ? <Loader2 className="animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                  {resending ? "Enviando…" : "Reenviar invitación"}
                </GatedButton>
              </div>
              {resendNote && (
                <p
                  role={resendNote.tone === "error" ? "alert" : "status"}
                  className={cn(
                    "mt-3 flex gap-2.5 rounded-[12px] px-3.5 py-2.5 text-[13px] leading-snug",
                    resendNote.tone === "error" ? "bg-red-soft font-medium text-red-fg" : "bg-blue-soft text-ink-soft",
                  )}
                >
                  {resendNote.tone === "info" && <Info className="mt-0.5 size-4 shrink-0 text-azure-fg" aria-hidden />}
                  <span>{resendNote.message}</span>
                </p>
              )}
            </div>
          )}

          {/* not a footer hint: the footer slot only says what is missing, and this stays true after validation passes */}
          {isNew && !account && (
            <div role="note" className="flex gap-3 rounded-[16px] bg-amber-soft p-4 text-[13.5px] leading-snug text-amber-deep">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-fg" aria-hidden />
              <span>La recuperación de cuentas aún está pendiente de definir.</span>
            </div>
          )}
          {isNew && account && !offline && (
            <div role="note" className="flex gap-3 rounded-[16px] bg-blue-soft p-4 text-[13.5px] leading-snug text-ink-soft">
              <Info className="mt-0.5 size-4 shrink-0 text-azure-fg" aria-hidden />
              <span>La persona define su contraseña con el enlace del correo. El enlace funciona una sola vez.</span>
            </div>
          )}
          {needsServer && offline && (
            <div role="status" className="flex gap-3 rounded-[16px] bg-soft p-4 text-[13.5px] leading-snug text-ink-soft">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
              <span>
                <b className="font-semibold text-ink">{NEEDS_CONNECTION}.</b> {NEEDS_CONNECTION_DETAIL}
              </span>
            </div>
          )}
          {needsServer && reauth && !offline && (
            <div role="status" className="flex gap-3 rounded-[16px] bg-soft p-4 text-[13.5px] leading-snug text-ink-soft">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
              <span>
                <b className="font-semibold text-ink">{REAUTH}.</b> {REAUTH_DETAIL}
              </span>
            </div>
          )}
          {serverError && (
            <p ref={errorRef} role="alert" className="rounded-[16px] bg-red-soft p-4 text-[13.5px] font-medium leading-snug text-red-fg">
              {serverError}
            </p>
          )}
        </div>
      </FormDialog>

      <DeactivateUserDialog user={user} open={confirmOff} onOpenChange={setConfirmOff} onConfirm={() => setActive(false)} deferred />
    </>
  );
}
