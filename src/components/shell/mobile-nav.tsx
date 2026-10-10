"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { ClipboardList, House, Inbox, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScopedData } from "@/lib/hooks";
import { usePendingItems } from "@/features/pendientes/use-pending-items";
import { isActive, isSecondaryRoute } from "./nav";
import { MobileSyncPill } from "./sync-indicator";

const TABS = [
  { href: "/", label: "Hoy", icon: House },
  { href: "/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/pendientes", label: "Pendientes", icon: Inbox },
  { href: "/perfil", label: "Perfil", icon: UserRound },
] as const;

/**
 * Phone/tablet tab bar on the sand chrome (mobile reference): the active tab is a white tile.
 * Perfil stays lit inside its secondary sections (Agenda, Clientes…); a labeled sync pill floats above the bar.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { actionable, items } = usePendingItems();
  const { jornadas } = useScopedData();
  const live = jornadas.some((j) => j.status === "en_curso");
  const inMore = isSecondaryRoute(pathname);
  // Perfil has its own sync card, jornadas their own banner, and the new-order wizard a sticky action bar above the tab bar.
  const hideSync = pathname === "/perfil" || pathname === "/ordenes/nueva" || pathname.startsWith("/jornada/");
  // Consulta roles (Dirección, Administración) have nothing actionable: show what they follow as a neutral count instead of red.
  const neutral = actionable === 0;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 bg-sand/92 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden print:hidden"
    >
      <MobileSyncPill hidden={hideSync} />
      <LayoutGroup id="tabbar">
        <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {TABS.map((t) => {
            const active = t.href === "/perfil" ? isActive(pathname, t.href) || inMore : isActive(pathname, t.href);
            const Icon = t.icon;
            const badge = t.href === "/pendientes" ? actionable || items.length : 0;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={badge > 0 ? `${t.label}, ${badge} ${neutral ? "por revisar" : "por atender"}` : undefined}
                  className="relative flex h-[62px] flex-col items-center justify-center gap-1 rounded-[16px]"
                >
                  {active && (
                    <motion.span
                      layoutId="tab-tile"
                      className="absolute inset-0 rounded-[16px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.05),0_8px_18px_-10px_rgb(16_24_40/0.25)]"
                      transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    />
                  )}
                  <span className="relative">
                    <motion.span animate={active ? { y: [0, -3, 0] } : { y: 0 }} transition={{ duration: 0.35 }} className="block">
                      <Icon className={cn("size-[22px] transition-colors", active ? "text-[#1667e0]" : "text-[#5b6675]")} strokeWidth={1.8} />
                    </motion.span>
                    {badge > 0 && (
                      <motion.span
                        key={badge}
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className={cn(
                          "absolute -right-2.5 -top-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 ring-sand",
                          neutral ? "bg-[#e9edf2] text-ink" : "bg-st-red text-white",
                        )}
                      >
                        {badge}
                      </motion.span>
                    )}
                    {t.href === "/" && live && !active && <span className="absolute -right-1 -top-0.5 size-2 animate-pulse rounded-full bg-sky ring-2 ring-sand" />}
                  </span>
                  <span className={cn("relative text-[12.5px] transition-colors", active ? "font-semibold text-ink" : "text-[#5b6675]")}>{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
