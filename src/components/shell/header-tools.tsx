"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useCan, useCurrentUser, useSyncSummary } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/ui-store";
import { Kbd } from "@/components/ui/kbd";
import { MobileActivityButton } from "./activity-feed";
import { MobileUnitButton } from "./unit-picker";

export { ActivityList, MobileActivityButton } from "./activity-feed";
export { MobileUnitButton, UnitPickerSheet, useUnitScope } from "./unit-picker";

/**
 * Phone/tablet (mobile reference): compact search + round initials avatar → Perfil, with a sync dot. Renders nothing visible from `lg`:
 * there the search pill and the activity bell live in the card header (`card-header.tsx`), which every page shares.
 * Dirección also gets the unit pill: inline from 640px (where the activity bell joins too); on phones only while a
 * single unit is selected (row 2, as a scope reminder that opens the picker) so sub-page titles keep their space.
 * The phone unit control with all units visible lives in `MobileToolbar` (Hoy) and the Perfil unit card.
 */
export function HeaderTools() {
  return (
    <div className="grid grid-cols-[auto_auto] items-center justify-items-end gap-x-2.5 gap-y-2 sm:flex sm:gap-2.5 lg:hidden">
      <SearchButton className="order-1 sm:order-none" />
      <MobileUnitButton phoneScopedOnly className="order-3 col-span-2 sm:order-none" />
      <MobileActivityButton className="max-sm:hidden" />
      <ProfileAvatar className="order-2 sm:order-none lg:hidden" />
    </div>
  );
}

/**
 * The palette (command-menu.tsx) opens out of the visible `[data-search-origin]` control and closes back into it: while it is
 * open the control steps aside (the palette's copy of it stands in its place) and it comes back once the palette has shrunk
 * into it — the delay matches the palette's closing morph.
 */
const ORIGIN_HIDDEN = "opacity-0 [transition:opacity_0s]";
const ORIGIN_SHOWN = "[transition:opacity_120ms_ease_260ms,border-color_150ms,background-color_150ms,scale_150ms]";

/** Round sand search button (opens the ⌘K palette) for phone headers. */
export function SearchButton({ className }: { className?: string }) {
  const open = useUi((s) => s.commandOpen);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-label="Buscar"
      aria-haspopup="dialog"
      data-search-origin="button"
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink active:scale-95 lg:hidden", open ? ORIGIN_HIDDEN : ORIGIN_SHOWN, className)}
    >
      <SearchButtonFace />
    </button>
  );
}

export function SearchButtonFace() {
  return <Search className="size-[18px]" />;
}

/** Desktop (from `lg`): the ⌘K search pill, centered in the card header — "Buscar órdenes, clientes, folios" + shortcut hint; opens the command palette. */
export function SearchPill({ className }: { className?: string }) {
  const open = useUi((s) => s.commandOpen);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      data-search-origin="pill"
      className={cn(
        "hidden h-10 w-[clamp(220px,22vw,420px)] items-center gap-2.5 rounded-[14px] border border-hairline bg-surface px-3.5 text-left text-[14px] text-faint shadow-[0_1px_2px_rgb(16_24_40/0.03)] hover:border-line-strong lg:flex",
        open ? ORIGIN_HIDDEN : ORIGIN_SHOWN,
        className,
      )}
    >
      <SearchPillFace />
    </button>
  );
}

/** What the pill shows; the palette draws the same face where the pill was while it grows out of it. */
export function SearchPillFace() {
  return (
    <>
      <Search className="size-[17px] shrink-0 text-subtle" />
      <span className="flex-1 truncate">Buscar órdenes, clientes, folios</span>
      <Kbd className="bg-tile text-[11px]">⌘K</Kbd>
    </>
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
