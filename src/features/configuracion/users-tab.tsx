"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser, useLookups, useShallow } from "@/lib/hooks";
import { OPEN_STATUSES, ROLE_LABEL } from "@/lib/status";
import type { Role, User } from "@/lib/types";
import { PersonAvatar, SectionHeader } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, GatedButton, useDialogTarget, InlineSwitch, ListHead, NO_USERS, ROLES, RoleBadge, SearchField, norm } from "./shared";
import { UserDialog } from "./user-dialog";
import { PermissionMatrix } from "./permission-matrix";

const ROLE_ORDER: Record<Role, number> = { direccion: 0, administracion: 1, supervisor: 2 };

/**
 * Rows drive their own entrance (initial/animate on each <motion.li>, stagger via the `custom` index) instead of inheriting "show" from the <ul>.
 * The inner <AnimatePresence> resets the presence context, so under settings-view's `<AnimatePresence initial={false}>` a parent-driven list
 * deadlocks: the <ul> is initial-blocked (never animates) while its rows start hidden and wait for it to push "show".
 */
const rowIn = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: 0.05 + Math.min(0.5, i * 0.035) } }),
};

export function UsersTab() {
  const { users, orders } = useAppStore(useShallow((s) => ({ users: s.users, orders: s.orders })));
  const upsertUser = useAppStore((s) => s.upsertUser);
  const lk = useLookups();
  const me = useCurrentUser();
  const canAdmin = useCan("users.admin");
  const [role, setRole] = useState<"all" | Role>("all");
  const [q, setQ] = useState("");
  const dlg = useDialogTarget<User | "new">();
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openOrdersBy = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => {
      if (OPEN_STATUSES.includes(o.status)) m.set(o.supervisorId, (m.get(o.supervisorId) ?? 0) + 1);
    });
    return m;
  }, [orders]);

  const list = useMemo(() => {
    const term = norm(q.trim());
    return users
      .filter((u) => role === "all" || u.role === role)
      .filter((u) => !term || norm(`${u.name} ${u.email} ${u.title} ${lk.units.get(u.unitId)?.name ?? ""}`).includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "es"));
  }, [users, role, q, lk.units]);

  const toggleActive = (u: User, next: boolean) => {
    if (!next) {
      setDeactivating(u);
      setConfirmOpen(true);
      return;
    }
    upsertUser({ ...u, active: true });
    toast.success(`${u.name.split(" ")[0]} puede volver a iniciar sesión`);
  };

  const roleCounts = useMemo(() => {
    const c: Record<Role, number> = { direccion: 0, administracion: 0, supervisor: 0 };
    users.forEach((u) => c[u.role]++);
    return c;
  }, [users]);

  return (
    <div className="space-y-14">
      <section>
        <SectionHeader
          title="Usuarios"
          subtitle="Cada persona inicia sesión con su cuenta individual (doc §6). Los trabajadores de cuadrilla no usan la app."
          action={
            <GatedButton allowed={canAdmin} reason={NO_USERS} onClick={() => dlg.show("new")}>
              <UserPlus className="size-4" /> Nuevo usuario
            </GatedButton>
          }
        />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
            <Segmented
              id="users-role"
              value={role}
              onChange={setRole}
              items={[
                { value: "all", label: `Todos · ${users.length}` },
                ...ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} · ${roleCounts[r]}` })),
              ]}
            />
          </div>
          <SearchField value={q} onChange={setQ} placeholder="Buscar por nombre, correo o unidad" className="sm:w-[300px]" />
        </div>

        {list.length === 0 ? (
          <EmptyState icon={<Users />} title="Sin coincidencias">
            Ningún usuario coincide con la búsqueda.
          </EmptyState>
        ) : (
          <div>
            <ListHead className="lg:hidden xl:grid grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_64px_96px]">
              <span>Usuario</span>
              <span>Rol y unidad</span>
              <span>Contacto</span>
              <span className="text-center">Activo</span>
              <span />
            </ListHead>
            <ul>
              <AnimatePresence>
                {list.map((u, i) => {
                  const isMe = u.id === me.id;
                  const open = openOrdersBy.get(u.id) ?? 0;
                  return (
                    <motion.li
                      key={u.id}
                      layout
                      custom={i}
                      variants={rowIn}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-hairline py-4 xl:grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_64px_96px] xl:gap-x-4",
                        !u.active && "opacity-60",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={40} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-[16px] font-semibold text-ink xl:text-[15px]">
                            <span className="truncate">{u.name}</span>
                            {isMe && <span className="shrink-0 rounded-md bg-sky-soft px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.06em] text-[#1667e0]">TÚ</span>}
                          </p>
                          <p className="truncate text-[13px] text-subtle">
                            {u.title}
                            {u.role === "supervisor" && open > 0 && <span className="text-ink/70"> · {open} abiertas</span>}
                          </p>
                        </div>
                      </div>
                      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[52px] xl:col-start-auto xl:row-start-auto xl:block xl:pl-0">
                        <RoleBadge role={u.role} />
                        <p className="truncate text-[13px] text-subtle xl:mt-1">{lk.units.get(u.unitId)?.name ?? "—"}</p>
                      </div>
                      <div className="col-start-1 row-start-3 min-w-0 pl-[52px] text-[13px] xl:col-start-auto xl:row-start-auto xl:pl-0">
                        <a href={`mailto:${u.email}`} className="block truncate text-ink hover:text-link">
                          {u.email}
                        </a>
                        <a href={`tel:${u.phone.replace(/\s/g, "")}`} className="block truncate text-subtle tabular hover:text-link">
                          {u.phone}
                        </a>
                      </div>
                      <div className="col-start-2 row-span-3 row-start-1 flex flex-col items-end gap-1 xl:col-start-auto xl:row-span-1 xl:row-start-auto xl:items-center">
                        <InlineSwitch
                          checked={u.active}
                          onChange={(v) => toggleActive(u, v)}
                          label={`${u.active ? "Desactivar" : "Activar"} a ${u.name}`}
                          disabled={!canAdmin || isMe}
                          reason={isMe ? "No puedes desactivar tu propia cuenta." : NO_USERS}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={!canAdmin}
                          onClick={() => dlg.show(u)}
                          aria-label={`Editar a ${u.name}`}
                          className="size-11 rounded-[12px] border-[#dfe3ea] xl:hidden"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                      <div className="hidden justify-end xl:flex">
                        <GatedButton allowed={canAdmin} reason={NO_USERS} variant="outline" onClick={() => dlg.show(u)} className="min-w-[84px] border-[#dfe3ea] shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
                          Editar
                        </GatedButton>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </section>

      <PermissionMatrix />

      {dlg.target && <UserDialog key={dlg.key} user={dlg.target === "new" ? null : dlg.target} open={dlg.open} onOpenChange={dlg.onOpenChange} />}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={<UserMinus />}
        iconTone="red"
        title="Desactivar usuario"
        description="La cuenta deja de iniciar sesión. Su historial, bitácora y órdenes se conservan."
        rows={
          deactivating
            ? [
                { k: "Usuario", v: deactivating.name },
                { k: "Rol", v: ROLE_LABEL[deactivating.role] },
                { k: "Unidad", v: lk.units.get(deactivating.unitId)?.name ?? "—" },
                { k: "Órdenes abiertas asignadas", v: openOrdersBy.get(deactivating.id) ?? 0 },
              ]
            : []
        }
        checkboxLabel={`Entiendo que ${deactivating?.name.split(" ")[0] ?? "la persona"} ya no podrá iniciar sesión.`}
        confirmLabel="Desactivar usuario"
        destructive
        onConfirm={() => {
          if (!deactivating) return;
          const u = deactivating;
          upsertUser({ ...u, active: false });
          toast(`${u.name} quedó desactivado`, {
            description: "Registrado en la bitácora.",
            action: { label: "Deshacer", onClick: () => upsertUser({ ...u, active: true }) },
          });
        }}
      >
        {deactivating && (openOrdersBy.get(deactivating.id) ?? 0) > 0 && (
          <p className="rounded-[14px] bg-[#fff6e6] px-4 py-3 text-[13.5px] leading-snug text-[#8a5300]">
            Tiene órdenes abiertas. Reasígnalas desde el detalle de cada orden para que no queden sin supervisor.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
