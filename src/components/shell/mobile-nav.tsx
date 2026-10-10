"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { CalendarDays, ClipboardList, House, Inbox, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery, useScopedData } from "@/lib/hooks";
import { SECONDARY_BADGES, isActive, isSecondaryRoute } from "./nav";
import { MobileMenu } from "./mobile-menu";
import { MobileSyncPill } from "./sync-indicator";
import { useNavBadges } from "./use-nav-badges";

// Route tabs; keep in sync with PHONE_TAB_ROUTES in ./nav (the 5th tab, Menú, opens the sheet).
const TABS = [
  { href: "/", label: "Hoy", icon: House },
  { href: "/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pendientes", label: "Pendientes", icon: Inbox },
] as const;

const TILE = "relative flex h-[62px] w-full flex-col items-center justify-center gap-1 rounded-[16px]";

/**
 * Phone/tablet tab bar on the sand chrome (mobile reference): the active tab is a white tile.
 * Four route tabs + Menú, which opens the sections sheet; Menú stays lit (and the sheet's page highlighted) inside any
 * section that is not a tab, Perfil included. A labeled sync pill floats above the bar.
 */
export function MobileNav() {
  const pathname = usePathname();
  const badges = useNavBadges();
  const { jornadas } = useScopedData();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the sheet whenever the route changes (adjust state while rendering — no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }
  const live = jornadas.some((j) => j.status === "en_curso");
  // Sections that are not a tab carry their counts in the Menú sheet: surface them as a dot on the tab.
  const menuDot = SECONDARY_BADGES.some((k) => badges[k] > 0);
  // Resizing up to the desktop layout drops the sheet for good (it would reopen when shrinking back otherwise).
  if (desktop && menuOpen) setMenuOpen(false);
  const sheetOpen = menuOpen && !desktop;
  // One lit tile at a time: the open sheet wins, then secondary routes (incl. Perfil) light Menú, else the route's own tab.
  const menuActive = sheetOpen || isSecondaryRoute(pathname);
  // Perfil has its own sync card, jornadas their own banner, and the new-order wizard a sticky action bar above the tab bar.
  const hideSync = pathname === "/perfil" || pathname === "/ordenes/nueva" || pathname.startsWith("/jornada/");

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 bg-canvas/92 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden print:hidden"
      >
        <MobileSyncPill hidden={hideSync} />
        <LayoutGroup id="tabbar">
          <ul className="mx-auto grid max-w-lg grid-cols-5 gap-0.5">
            {TABS.map((t) => {
              const active = !menuActive && isActive(pathname, t.href);
              // Only what the user can act on (same count as the Pendientes page's "Para mí"); consulta roles with nothing actionable get no badge.
              const badge = t.href === "/pendientes" ? badges.pendientes : 0;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={badge > 0 ? `${t.label}, ${badge} por atender` : undefined}
                    className={TILE}
                  >
                    <TabFace icon={t.icon} label={t.label} active={active}>
                      {badge > 0 && (
                        <motion.span
                          key={badge}
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          className="absolute -right-2.5 -top-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-st-red px-1 text-[10px] font-bold text-white ring-2 ring-canvas"
                        >
                          {badge}
                        </motion.span>
                      )}
                      {t.href === "/" && live && !active && <span className="absolute -right-1 -top-0.5 size-2 animate-pulse rounded-full bg-sky ring-2 ring-canvas" />}
                    </TabFace>
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                aria-label={menuDot ? "Menú, hay avisos en otras secciones" : "Menú"}
                className={TILE}
              >
                <TabFace icon={Menu} label="Menú" active={menuActive}>
                  {menuDot && <span className={cn("absolute -right-1.5 -top-0.5 size-2.5 rounded-full bg-st-red ring-2", menuActive ? "ring-surface" : "ring-canvas")} />}
                </TabFace>
              </button>
            </li>
          </ul>
        </LayoutGroup>
      </nav>
      <MobileMenu open={sheetOpen} onOpenChange={setMenuOpen} />
    </>
  );
}

/** Shared tab content: the white active tile (glides between tabs), bouncing icon with its badge slot, and the label. */
function TabFace({ icon: Icon, label, active, children }: { icon: LucideIcon; label: string; active: boolean; children?: React.ReactNode }) {
  return (
    <>
      {active && (
        <motion.span
          layoutId="tab-tile"
          className="absolute inset-0 rounded-[16px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.05),0_8px_18px_-10px_rgb(16_24_40/0.25)]"
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
        />
      )}
      <span className="relative">
        <motion.span animate={active ? { y: [0, -3, 0] } : { y: 0 }} transition={{ duration: 0.35 }} className="block">
          <Icon className={cn("size-[22px] transition-colors", active ? "text-azure-fg" : "text-ink-muted")} strokeWidth={1.8} />
        </motion.span>
        {children}
      </span>
      <span className={cn("relative whitespace-nowrap text-[12px] transition-colors", active ? "font-semibold text-ink" : "text-ink-muted")}>{label}</span>
    </>
  );
}
