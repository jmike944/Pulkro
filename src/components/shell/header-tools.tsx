"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useCan, useCurrentUser, useSyncSummary } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/ui-store";
import { Kbd } from "@/components/ui/kbd";
import { ActivityBell, MobileActivityButton } from "./activity-feed";
import { MobileUnitButton } from "./unit-picker";

export { ActivityList, MobileActivityButton } from "./activity-feed";
export { MobileUnitButton, UnitPickerSheet, useUnitScope } from "./unit-picker";

/**
 * Desktop: search pill (⌘K) + recent-activity bell.
 * Phone/tablet (mobile reference): compact search + round initials avatar → Perfil, with a sync dot.
 * Dirección also gets the unit pill: inline from 640px (where the activity bell joins too); on phones only while a
 * single unit is selected (row 2, as a scope reminder that opens the picker) so sub-page titles keep their space.
 * The phone unit control with all units visible lives in `MobileToolbar` (Hoy) and the Perfil unit card.
 */
export function HeaderTools() {
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <div className="grid grid-cols-[auto_auto] items-center justify-items-end gap-x-2.5 gap-y-2 sm:flex sm:gap-2.5 lg:gap-3">
      <button
        onClick={() => setCommandOpen(true)}
        className="hidden h-12 w-[min(420px,32vw)] items-center gap-3 rounded-[16px] border border-hairline bg-surface px-4 text-left text-[15px] text-faint shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-line-strong lg:flex"
      >
        <Search className="size-[18px] text-subtle" />
        <span className="flex-1 truncate">Buscar órdenes, clientes, folios</span>
        <Kbd className="bg-tile text-[11px]">⌘K</Kbd>
      </button>
      <SearchButton className="order-1 sm:order-none" />
      <MobileUnitButton phoneScopedOnly className="order-3 col-span-2 sm:order-none" />
      <MobileActivityButton className="max-sm:hidden" />
      <span className="hidden lg:block">
        <ActivityBell />
      </span>
      <ProfileAvatar className="order-2 sm:order-none lg:hidden" />
    </div>
  );
}

/** Round sand search button (opens the ⌘K palette) for phone headers. */
export function SearchButton({ className }: { className?: string }) {
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-label="Buscar"
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink transition active:scale-95 lg:hidden", className)}
    >
      <Search className="size-[18px]" />
    </button>
  );
}

/**
 * Tool cluster for a MobileGreeting avatar slot (Hoy, Perfil): search + avatar, then unit (Dirección) + activity bell.
 * `avatar={false}` on Perfil itself, `unit={false}` where the unit control lives elsewhere on the screen.
 */
export function MobileToolbar({ avatar = true, unit = true, avatarClassName }: { avatar?: boolean; unit?: boolean; avatarClassName?: string }) {
  const allUnits = useCan("view.allUnits");
  const showUnit = unit && allUnits;
  return (
    <div className="grid shrink-0 grid-cols-[auto_auto] items-center justify-items-end gap-x-2.5 gap-y-2 lg:hidden">
      <SearchButton />
      {avatar && <ProfileAvatar className={avatarClassName} />}
      {showUnit && <MobileUnitButton />}
      <MobileActivityButton className={cn(avatar && !showUnit && "col-start-2")} />
    </div>
  );
}

/** Round initials avatar (sand) linking to Perfil; a dot shows offline / pending sync (the labeled pill above the tab bar opens the queue). */
export function ProfileAvatar({ className }: { className?: string }) {
  const user = useCurrentUser();
  const { offline, pending } = useSyncSummary();
  return (
    <Link
      href="/perfil"
      aria-label={`Perfil de ${user.name}${offline ? " · sin conexión" : ""}${pending.length ? ` · ${pending.length} por enviar` : ""}`}
      className={cn("relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-[14px] font-semibold tracking-wide text-ink transition active:scale-95", className)}
    >
      {user.initials}
      {(offline || pending.length > 0) && (
        <span className={cn("absolute right-0 top-0 size-3 rounded-full ring-2 ring-surface", offline ? "bg-st-amber" : "bg-sky animate-pulse")} />
      )}
    </Link>
  );
}
