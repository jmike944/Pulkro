"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Building2, Check, Eye, KeyRound, Mail, Minus, Pencil, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCurrentUser, useLookups } from "@/lib/hooks";
import { PERMISSION_ROWS, can } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/status";
import { PersonAvatar } from "@/components/pk/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, FormDialog, RoleBadge, inputCls, phoneDigits } from "./shared";
import { consultaFor } from "./permission-matrix";

/** "Mi perfil": who you are in the app, what your role may do, and your own contact phone. */
export function ProfileCard() {
  const user = useCurrentUser();
  const lk = useLookups();
  const unit = lk.units.get(user.unitId);
  const [editing, setEditing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const allowed = PERMISSION_ROWS.filter((r) => can(user.role, r.action)).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      aria-label="Mi perfil"
      className="relative overflow-hidden rounded-[22px] border border-hairline bg-surface p-4 shadow-soft sm:p-5"
    >
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 size-40 rounded-full bg-[radial-gradient(circle,var(--aurora-1)_0%,transparent_65%)]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 left-16 size-40 rounded-full bg-[radial-gradient(circle,var(--aurora-4)_0%,transparent_65%)]" />
      <div className="relative grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:gap-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative">
            <PersonAvatar name={user.name} initials={user.initials} hue={user.hue} size={56} className="ring-4 ring-surface shadow-soft" />
            <span className="absolute bottom-0.5 right-0.5 size-3 rounded-full bg-st-teal ring-2 ring-surface" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
              <UserRound className="size-3.5" /> Mi perfil
            </p>
            <p className="mt-0.5 truncate text-[17px] font-semibold text-ink">{user.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-subtle">
              <RoleBadge role={user.role} />
              <span className="truncate">{user.title}</span>
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-1.5 border-t border-hairline pt-3 text-[13.5px] sm:col-span-2 sm:row-start-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] xl:col-span-1 xl:row-start-auto xl:grid-cols-1 xl:border-0 xl:pt-0">
          {[
            { icon: <Building2 />, label: "Unidad", value: unit?.name ?? "—" },
            { icon: <Mail />, label: "Correo", value: user.email || "—" },
            { icon: <Phone />, label: "Teléfono", value: user.phone || "—" },
          ].map((row) => (
            <div key={row.label} className="flex min-w-0 items-center gap-2">
              <dt className="shrink-0 text-subtle [&_svg]:size-4">
                {row.icon}
                <span className="sr-only">{row.label}</span>
              </dt>
              <dd className="truncate text-ink tabular">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-2.5 sm:col-start-2 sm:row-start-1 sm:flex xl:col-start-auto">
          <PermissionsPopover allowed={allowed} />
          <Button variant="outline" onClick={() => {
              setEditing(true);
              setEditKey((k) => k + 1);
              setEditOpen(true);
            }} className="h-11 min-w-0 rounded-[12px] border-line px-3 text-[14px] font-semibold sm:flex-none sm:px-4 lg:h-10">
            <Pencil className="size-4" /> Mis datos
          </Button>
        </div>
      </div>
      {editing && <EditMyPhoneDialog key={editKey} open={editOpen} onOpenChange={setEditOpen} />}
    </motion.section>
  );
}

function PermissionsPopover({ allowed }: { allowed: number }) {
  const user = useCurrentUser();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 min-w-0 rounded-[12px] border-line px-3 text-[14px] font-semibold sm:flex-none sm:px-4 lg:h-10">
          <KeyRound className="size-4" />
          Mis permisos
          <span className="hidden rounded-md bg-tile px-1.5 text-[12px] tabular text-subtle sm:inline">
            {allowed}/{PERMISSION_ROWS.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <div className="border-b border-hairline px-4 py-3">
          <p className="font-semibold text-ink">Permisos de {ROLE_LABEL[user.role]}</p>
          <p className="text-[12.5px] text-subtle">Matriz de roles del documento maestro (§2).</p>
        </div>
        <ul className="max-h-[360px] overflow-y-auto p-2">
          {PERMISSION_ROWS.map((r, i) => {
            const yes = can(user.role, r.action);
            const consulta = !yes && consultaFor(r.action, user.role);
            return (
              <motion.li
                key={r.action}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.025 }}
                className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-[13.5px]"
              >
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                    yes ? "bg-brand-deep text-white" : consulta ? "bg-blue-soft text-link" : "bg-tile text-faint",
                  )}
                >
                  {yes ? <Check className="size-3.5" strokeWidth={3} /> : consulta ? <Eye className="size-3.5" /> : <Minus className="size-3.5" />}
                </span>
                <span className={cn("min-w-0 flex-1", yes ? "text-ink" : "text-subtle")}>{r.label}</span>
                {consulta && <span className="text-[11.5px] text-link">{consulta}</span>}
              </motion.li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function EditMyPhoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const user = useCurrentUser();
  const upsertUser = useAppStore((s) => s.upsertUser);
  const [phone, setPhone] = useState(user.phone);
  const [touched, setTouched] = useState(false);
  const error = phoneDigits(phone) < 10 ? "Captura un teléfono de al menos 10 dígitos." : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mis datos de contacto"
      description="Tu teléfono aparece en los reportes y en la ficha de las órdenes que supervisas."
      icon={<Phone />}
      submitLabel="Guardar teléfono"
      footerNote="Nombre, rol, unidad y correo los administra Dirección."
      onSubmit={() => {
        setTouched(true);
        if (error) return;
        upsertUser({ ...user, phone: phone.trim() });
        toast.success("Teléfono actualizado", { description: "El cambio quedó en la bitácora." });
        onOpenChange(false);
      }}
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input value={user.name} disabled className={inputCls} />
        </Field>
        <Field label="Teléfono" htmlFor="my-phone" error={touched ? error : null} hint="Formato sugerido: +52 81 1234 5678">
          <Input id="my-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched(true)} className={inputCls} />
        </Field>
      </div>
    </FormDialog>
  );
}
