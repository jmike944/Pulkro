"use client";

import { useState } from "react";
import { UserCog, UserPlus } from "lucide-react";
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
import { ChipSelect, Field, FormDialog, ROLES, SwitchLite, hueFrom, initialsOf, inputCls, isEmail, norm, phoneDigits, selectTriggerCls } from "./shared";
import { DeactivateUserDialog } from "./deactivate-user";

const DEFAULT_TITLE: Record<Role, string> = {
  direccion: "Dirección",
  administracion: "Coordinación administrativa",
  supervisor: "Supervisor de operaciones",
};

type FieldKey = "name" | "title" | "email" | "phone";

/** Create / edit a user account (users.admin). */
export function UserDialog({ user, open, onOpenChange }: { user: User | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const units = useAppStore((s) => s.units);
  const upsertUser = useAppStore((s) => s.upsertUser);
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
  // what the form opened with: drives "¿Descartar cambios?" and "Aún no hay cambios que guardar"
  const [start] = useState({ name, title, role, unitId, email, phone, active });

  const emailTaken = users.some((u) => u.id !== user?.id && norm(u.email) === norm(email.trim()));
  const errors = {
    name: name.trim().length < 5 ? "Escriba nombre y apellidos." : null,
    title: !title.trim() ? "Escriba el puesto, por ejemplo Supervisor de operaciones." : null,
    email: !isEmail(email) ? "Escriba un correo completo, con @ y dominio: nombre@pulkro.com.mx." : emailTaken ? "Ese correo ya pertenece a otro usuario; use uno distinto." : null,
    phone: phoneDigits(phone) < 10 ? "Escriba al menos 10 dígitos, con lada." : null,
  };
  const show = (k: FieldKey) => (touched[k] ? errors[k] : null);
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const dirty =
    name.trim() !== start.name.trim() ||
    title.trim() !== start.title.trim() ||
    role !== start.role ||
    unitId !== start.unitId ||
    email.trim() !== start.email.trim() ||
    phone.trim() !== start.phone.trim() ||
    active !== start.active;
  const hint = firstMissing(
    [errors.name, "Escriba nombre y apellidos"],
    [errors.title, "Escriba el puesto"],
    [errors.email, isEmail(email) ? "Ese correo ya está en uso" : "Escriba un correo válido"],
    [errors.phone, "Escriba un teléfono de al menos 10 dígitos"],
    [!isNew && !dirty, "Aún no hay cambios que guardar"],
  );

  // Turning a live account off goes through the same confirmation as the users list; the change itself is stored with "Guardar".
  const willDeactivate = !!user?.active && !active;
  const toggleActive = (next: boolean) => {
    if (!next && user?.active) setConfirmOff(true);
    else setActive(next);
  };

  const preview = name.trim() || "Nuevo usuario";

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        icon={isNew ? <UserPlus /> : <UserCog />}
        title={isNew ? "Nuevo usuario" : "Editar usuario"}
        description={isNew ? "Cuenta individual con rol y unidad. El acceso de cada rol sigue la matriz de permisos." : `Cambios a la cuenta de ${user!.name}. Quedan en la bitácora.`}
        submitLabel={isNew ? "Crear usuario" : "Guardar cambios"}
        submitDisabled={!!hint}
        footerNote={hint}
        dirty={dirty}
        onSubmit={() => {
          if (hint) return;
          const clean = name.trim().replace(/\s+/g, " ");
          const next: User = {
            id: user?.id ?? uid("usr"),
            name: clean,
            initials: initialsOf(clean),
            role,
            title: title.trim(),
            unitId,
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            hue: user?.hue ?? hueFrom(clean),
            active,
          };
          upsertUser(next);
          toast.success(isNew ? `Usuario ${clean.split(" ")[0]} creado` : "Cambios guardados", {
            description: willDeactivate ? "Cuenta desactivada: ya no puede iniciar sesión." : `${ROLE_LABEL[role]} · ${units.find((u) => u.id === unitId)?.name ?? ""}`,
          });
          onOpenChange(false);
        }}
      >
        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-3 rounded-[16px] bg-soft p-3">
            <PersonAvatar name={preview} initials={initialsOf(preview)} hue={user?.hue ?? hueFrom(preview)} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{preview}</p>
              <p className="truncate text-[13px] text-subtle">
                {ROLE_LABEL[role]} · {units.find((u) => u.id === unitId)?.name}
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

            <Field label="Correo" htmlFor="u-email" error={show("email")} hint="Cada persona inicia sesión con su propio correo.">
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

          <label className={cn("flex min-h-14 items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3", isMe ? "cursor-not-allowed" : "cursor-pointer")}>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">Cuenta activa</span>
              <span className="block text-[12.5px] text-subtle">{isMe ? "Su propia cuenta siempre queda activa." : "Si se desactiva, la persona no puede iniciar sesión."}</span>
              {willDeactivate && <span className="mt-1 block text-[12.5px] font-medium text-amber-fg">Se desactivará al guardar los cambios.</span>}
            </span>
            <SwitchLite checked={active} onChange={toggleActive} disabled={isMe} label="Cuenta activa" />
          </label>
        </div>
      </FormDialog>

      <DeactivateUserDialog user={user} open={confirmOff} onOpenChange={setConfirmOff} onConfirm={() => setActive(false)} deferred />
    </>
  );
}
