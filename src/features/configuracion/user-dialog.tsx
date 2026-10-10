"use client";

import { useState } from "react";
import { UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/store";
import { useAppStore, useCurrentUser } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/status";
import type { Role, User } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipSelect, Field, FormDialog, ROLES, SwitchLite, hueFrom, initialsOf, inputCls, isEmail, norm, phoneDigits, selectTriggerCls } from "./shared";

const DEFAULT_TITLE: Record<Role, string> = {
  direccion: "Dirección",
  administracion: "Coordinación administrativa",
  supervisor: "Supervisor de operaciones",
};

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
  const [submitted, setSubmitted] = useState(false);

  const emailTaken = users.some((u) => u.id !== user?.id && norm(u.email) === norm(email.trim()));
  const errors = {
    name: name.trim().length < 5 ? "Captura nombre y apellidos." : null,
    title: !title.trim() ? "Captura el puesto." : null,
    email: !isEmail(email) ? "Correo no válido." : emailTaken ? "Ese correo ya pertenece a otro usuario." : null,
    phone: phoneDigits(phone) < 10 ? "Teléfono de al menos 10 dígitos." : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  const preview = name.trim() || "Nuevo usuario";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={isNew ? <UserPlus /> : <UserCog />}
      title={isNew ? "Nuevo usuario" : "Editar usuario"}
      description={isNew ? "Cuenta individual con rol y unidad. El acceso de cada rol sigue la matriz de permisos." : `Cambios a la cuenta de ${user!.name}. Quedan en la bitácora.`}
      submitLabel={isNew ? "Crear usuario" : "Guardar cambios"}
      footerNote={isNew ? "La recuperación de cuentas está PENDIENTE de definir (doc §11)." : undefined}
      onSubmit={() => {
        setSubmitted(true);
        if (!valid) return;
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
          description: `${ROLE_LABEL[role]} · ${units.find((u) => u.id === unitId)?.name ?? ""}`,
        });
        onOpenChange(false);
      }}
    >
      <div className="space-y-5">
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
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ej. Ana López Garza" className={inputCls} aria-invalid={!!show("name")} />
          </Field>

          <Field label="Rol" className="sm:col-span-2" hint={isMe ? "No puedes cambiar tu propio rol." : "Define qué puede hacer en la app."}>
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
            <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} aria-invalid={!!show("title")} />
          </Field>

          <Field label="Unidad" hint={role === "direccion" ? "Dirección consulta todas las unidades." : "Limita lo que ve (doc §2)."}>
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

          <Field label="Correo" htmlFor="u-email" error={show("email")}>
            <Input id="u-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre.apellido@pulkro.com.mx" className={inputCls} aria-invalid={!!show("email")} />
          </Field>

          <Field label="Teléfono" htmlFor="u-phone" error={show("phone")}>
            <Input id="u-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} aria-invalid={!!show("phone")} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-ink">Cuenta activa</p>
            <p className="text-[12.5px] text-subtle">{isMe ? "Tu propia cuenta siempre queda activa." : "Si se desactiva, no puede iniciar sesión."}</p>
          </div>
          <SwitchLite checked={active} onChange={setActive} disabled={isMe} label="Cuenta activa" />
        </div>
      </div>
    </FormDialog>
  );
}
