"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan, useCurrentUser, useNow, useSyncSummary } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { ROLE_LABEL } from "@/lib/status";
import { fmtAgo } from "@/lib/format";
import { PersonAvatar } from "@/components/pk/bits";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { NAV_FOOT, NAV_GROUPS, isActive, type NavGroup, type NavItem } from "./nav";
import { UnitPickerSheet, useUnitScope } from "./unit-picker";
import { useNavBadges } from "./use-nav-badges";

/**
 * Phone/tablet "Menú" sheet (5th tab): everything the tab bar has no room for, organized like the desktop sidebar.
 * Profile + unit scope, quick actions, the grouped sections as a tile grid, then Configuración / Ayuda and sync status.
 * vaul Drawer: drag down to dismiss. It closes on navigation (MobileNav) and on any action, which runs after the close starts.
 */
export function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [unitOpen, setUnitOpen] = useState(false);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  const setSyncOpen = useUi((s) => s.setSyncOpen);
  const close = () => onOpenChange(false);
  // Close the sheet first, then hand the screen to whatever the action opens.
  const then = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            "gap-0 bg-sand shadow-lift",
            "data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:border-t-0 data-[vaul-drawer-direction=bottom]:max-h-[88dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]",
            "motion-reduce:[animation-duration:0.01ms]! motion-reduce:[transition-duration:0.01ms]!",
          )}
        >
          <div className="flex shrink-0 items-center justify-between pb-2 pl-5 pr-3 pt-2">
            <DrawerTitle className="font-serif text-[26px] font-medium text-ink">Menú</DrawerTitle>
            <DrawerClose asChild>
              <button type="button" aria-label="Cerrar" className="inline-flex size-11 items-center justify-center rounded-full bg-white text-ink transition active:scale-95">
                <X className="size-[18px]" />
              </button>
            </DrawerClose>
          </div>
          <DrawerDescription className="sr-only">Tu perfil, acciones rápidas y todas las secciones de Pulkro.</DrawerDescription>
          <MenuBody onClose={close} onPickUnit={then(() => setUnitOpen(true))} onSearch={then(() => setCommandOpen(true))} onSync={then(() => setSyncOpen(true))} />
        </DrawerContent>
      </Drawer>
      <UnitPickerSheet open={unitOpen} onOpenChange={setUnitOpen} />
    </>
  );
}

function MenuBody({ onClose, onPickUnit, onSearch, onSync }: { onClose: () => void; onPickUnit: () => void; onSearch: () => void; onSync: () => void }) {
  const pathname = usePathname();
  const badges = useNavBadges();
  const canCreate = useCan("order.create");
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1">
      <ProfileCard onClose={onClose} onPickUnit={onPickUnit} />

      <div className={cn("grid gap-2.5", canCreate ? "grid-cols-2" : "grid-cols-1")}>
        {canCreate && (
          <Link
            href="/ordenes/nueva"
            onClick={onClose}
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[16px] bg-brand-deep text-[15.5px] font-semibold text-white transition active:scale-[0.98]"
          >
            <Plus className="size-[18px]" /> Nueva orden
          </Link>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[16px] border border-hairline bg-white text-[15.5px] font-semibold text-ink transition active:scale-[0.98]"
        >
          <Search className="size-[18px]" /> Buscar
        </button>
      </div>

      {NAV_GROUPS.map((group) => (
        <TileGroup key={group.key} group={group} pathname={pathname} badges={badges} onClose={onClose} />
      ))}

      <div className="rounded-[22px] border border-hairline bg-white p-1.5">
        {NAV_FOOT.map((item) => (
          <ListRow key={item.key} item={item} onClose={onClose} />
        ))}
        <SyncRow onOpen={onSync} />
      </div>
    </div>
  );
}

/** Profile row (→ Perfil) and, for roles that can switch it (Dirección), the unit scope row that opens the unit picker. */
function ProfileCard({ onClose, onPickUnit }: { onClose: () => void; onPickUnit: () => void }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { allUnits, units, selected } = useUnitScope();
  const scopeName = allUnits ? (selected?.name ?? "Todas las unidades") : (units.find((u) => u.id === user.unitId)?.name ?? "");
  return (
    <section aria-label="Cuenta" className="rounded-[22px] border border-hairline bg-white p-1.5">
      <Link href="/perfil" onClick={onClose} aria-current={isActive(pathname, "/perfil") ? "page" : undefined} className="flex min-h-[60px] items-center gap-3.5 rounded-[16px] px-2.5 py-2 transition active:bg-sand">
        <PersonAvatar name={user.name} initials={user.initials} hue={user.hue} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-[13.5px] text-subtle">
            {ROLE_LABEL[user.role]} · {scopeName}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-[#98a2b3]" />
      </Link>
      {allUnits && (
        <>
          <div aria-hidden className="mx-2.5 my-0.5 border-t border-hairline" />
          <button
            type="button"
            onClick={onPickUnit}
            aria-haspopup="dialog"
            aria-label={`Unidad: ${scopeName}. Cambiar unidad`}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-[16px] px-2.5 py-2 text-left transition active:bg-sand"
          >
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-sand text-[13px] font-bold tracking-wide text-ink">{selected?.code ?? "PK"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Unidad</span>
              <span className="block truncate text-[15.5px] font-semibold text-ink">{scopeName}</span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold text-link">Cambiar</span>
          </button>
        </>
      )}
    </section>
  );
}

/** One sidebar group as a labeled 4-column grid of tiles. */
function TileGroup({ group, pathname, badges, onClose }: { group: NavGroup; pathname: string; badges: ReturnType<typeof useNavBadges>; onClose: () => void }) {
  const headingId = `menu-${group.key}`;
  return (
    <section>
      <p id={headingId} className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-subtle">
        {group.label}
      </p>
      <ul aria-labelledby={headingId} className="grid grid-cols-4 gap-2">
        {group.items.map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.badge ? badges[item.badge] : 0;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                aria-label={count > 0 ? `${item.label}, ${count}` : undefined}
                className={cn(
                  "relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[18px] border px-0.5 py-2 transition active:scale-[0.97]",
                  active ? "border-[#cfe3fb] bg-[#f2f8fe]" : "border-hairline bg-white",
                )}
              >
                <span className={cn("inline-flex size-10 items-center justify-center rounded-[12px]", active ? "bg-[#e3f1fd] text-[#1667e0]" : "bg-sand text-[#3b4554]")}>
                  <Icon className="size-[20px]" strokeWidth={1.8} />
                </span>
                {/* truncate clips at the padding box and the line box leaves ~1px above the accent of "Ó": py + -my gives it headroom without moving the tile. */}
                <span className={cn("-my-[3px] max-w-full truncate py-[3px] text-[12.5px] leading-snug", active ? "font-semibold text-ink" : "text-[#3b4554]")}>{item.label}</span>
                {count > 0 && (
                  <span aria-hidden className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e9edf2] px-1 text-[11px] font-semibold text-ink tabular">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ROW = "flex h-[52px] w-full items-center gap-3.5 rounded-[16px] px-2.5 text-left text-[15.5px] text-ink transition active:bg-sand";
const ROW_ICON = "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-sand text-[#3b4554]";

function ListRow({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={cn(ROW, active && "bg-[#f2f8fe]")}>
      <span className={cn(ROW_ICON, active && "bg-[#e3f1fd] text-[#1667e0]")}>
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className={cn("flex-1", active && "font-semibold")}>{item.label}</span>
      <ChevronRight className="size-4 shrink-0 text-[#98a2b3]" />
    </Link>
  );
}

/** Compact sync status; opens the sync queue sheet. */
function SyncRow({ onOpen }: { onOpen: () => void }) {
  const { offline, pending, syncing, lastSyncAt } = useSyncSummary();
  useNow(30_000);
  const state = offline ? "offline" : syncing.length || pending.length ? "syncing" : "ok";
  const queued = pending.length + syncing.length;
  return (
    <button type="button" onClick={onOpen} aria-label="Estado de sincronización" className={ROW}>
      <span className={ROW_ICON}>
        <span className={cn("size-2.5 rounded-full", state === "ok" && "bg-st-blue", state === "syncing" && "animate-pulse bg-sky", state === "offline" && "bg-st-amber")} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {state === "ok" && (
          <>
            <b className="font-semibold">Sincronizado</b> <span className="text-subtle">· {fmtAgo(lastSyncAt)}</span>
          </>
        )}
        {state === "syncing" && (
          <>
            <b className="font-semibold">Sincronizando</b> <span className="text-subtle">· {queued} en cola</span>
          </>
        )}
        {state === "offline" && (
          <>
            <b className="font-semibold">Sin conexión</b> <span className="text-subtle">· {pending.length} pendientes</span>
          </>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-[#98a2b3]" />
    </button>
  );
}
