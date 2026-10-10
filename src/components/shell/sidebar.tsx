"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, ChevronDown, EllipsisVertical, LogOut, PanelLeft, Plus, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { PersonAvatar } from "@/components/pk/bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_FOOT, NAV_MAIN, isActive, type NavItem } from "./nav";
import { useNavBadges } from "./use-nav-badges";
import { SyncChip } from "./sync-indicator";

const COLLAPSE_KEY = "pk.sidebar.collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  return (
    <motion.aside
      animate={{ width: collapsed ? 84 : 272 }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden px-4 pb-4 pt-6 lg:flex print:hidden"
    >
      <div className={cn("flex items-center justify-between px-1.5", collapsed && "flex-col gap-4")}>
        <Link href="/" className="flex items-center gap-3">
          <PulkroMark />
          {!collapsed && <span className="font-brand text-[19px] font-extrabold tracking-[0.16em] text-brand-deep">PULKRO</span>}
        </Link>
        <button onClick={toggle} className="rounded-lg p-1.5 text-subtle transition hover:bg-white hover:text-ink" aria-label="Contraer menú">
          <PanelLeft className="size-[18px]" />
        </button>
      </div>

      <div className="mt-6 space-y-3">
        <UnitSwitcher collapsed={collapsed} />
        <NewOrderButton collapsed={collapsed} />
      </div>

      <nav className="scrollbar-none mt-6 flex-1 overflow-y-auto">
        <LayoutGroup id="sidebar">
          <ul className="space-y-1">
            {NAV_MAIN.map((item) => (
              <NavLink key={item.key} item={item} collapsed={collapsed} />
            ))}
          </ul>
        </LayoutGroup>
      </nav>

      <div className="mt-4 space-y-1">
        <LayoutGroup id="sidebar-foot">
          <ul className="space-y-1">
            {NAV_FOOT.map((item) => (
              <NavLink key={item.key} item={item} collapsed={collapsed} />
            ))}
          </ul>
        </LayoutGroup>
        <div className="pt-3">
          <SyncChip collapsed={collapsed} />
        </div>
        <UserCard collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const badges = useNavBadges();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const count = item.badge ? badges[item.badge] : 0;
  const link = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex h-11 items-center gap-3.5 rounded-[14px] px-3.5 text-[15px] transition-colors",
        active ? "font-semibold text-ink" : "text-[#3b4554] hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-[14px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.05),0_8px_20px_-12px_rgb(16_24_40/0.18)]"
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
        />
      )}
      <Icon className={cn("relative size-[20px] shrink-0 transition-colors", active ? "text-[#1667e0]" : "text-[#5b6675] group-hover:text-ink")} strokeWidth={1.7} />
      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
      {!collapsed && count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-[#e9edf2] px-1.5 text-[12px] font-semibold text-ink tabular"
        >
          {count}
        </motion.span>
      )}
      {collapsed && count > 0 && <span className="absolute right-3.5 top-2.5 size-2 rounded-full bg-st-red ring-2 ring-canvas" />}
    </Link>
  );
  return (
    <li>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

export function UnitSwitcher({ collapsed }: { collapsed?: boolean }) {
  const units = useAppStore((s) => s.units);
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const setUnit = useAppStore((s) => s.setUnitFilter);
  const user = useCurrentUser();
  const allUnits = useCan("view.allUnits");
  const ownUnit = units.find((u) => u.id === user.unitId);
  const selected = unitFilter === "all" ? null : units.find((u) => u.id === unitFilter);
  const title = allUnits ? (selected ? selected.name : "Pulkro") : (ownUnit?.name ?? "Pulkro");
  const sub = allUnits ? (selected ? selected.city : `${units.length} unidades · Monterrey`) : user.role === "supervisor" ? "Mis asignaciones" : ownUnit?.city;
  const code = allUnits ? (selected?.code ?? "PK") : (ownUnit?.code ?? "PK");

  const card = (
    <span
      className={cn(
        "flex w-full items-center gap-3 rounded-[16px] border border-white bg-white/70 p-2.5 text-left shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition hover:bg-white",
        collapsed && "justify-center p-2",
      )}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef1f5] text-[13px] font-bold tracking-wide text-ink">{code.slice(0, 2)}</span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{title}</span>
            <span className="block truncate text-[12.5px] text-subtle">{sub}</span>
          </span>
          {allUnits && <ChevronDown className="size-4 shrink-0 text-subtle" />}
        </>
      )}
    </span>
  );
  if (!allUnits) return card;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-sky">{card}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Unidad</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setUnit("all")}>
          <span className="flex-1">Todas las unidades</span>
          {unitFilter === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {units.map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => setUnit(u.id)}>
            <span className="flex-1">
              {u.name} <span className="text-subtle">· {u.code}</span>
            </span>
            {unitFilter === u.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NewOrderButton({ collapsed }: { collapsed?: boolean }) {
  const canCreate = useCan("order.create");
  if (!canCreate) return null;
  return (
    <Link
      href="/ordenes/nueva"
      className={cn(
        "group flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white bg-white text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05),0_6px_16px_-10px_rgb(16_24_40/0.2)] transition hover:-translate-y-px hover:shadow-soft active:translate-y-0",
      )}
    >
      <Plus className="size-[18px] transition-transform duration-300 group-hover:rotate-90" />
      {!collapsed && "Nueva orden"}
    </Link>
  );
}

export function UserCard({ collapsed }: { collapsed?: boolean }) {
  const user = useCurrentUser();
  const switchRole = useAppStore((s) => s.switchRole);
  const signOut = useAppStore((s) => s.signOut);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const router = useRouter();
  return (
    <div className={cn("mt-2 flex items-center gap-3 rounded-[14px] px-2 py-2", collapsed && "justify-center")}>
      <PersonAvatar name={user.name} initials={user.initials} hue={user.hue} size={38} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-ink">{user.name.split(" ").slice(0, 2).join(" ")}</p>
          <AnimatePresence mode="wait">
            <motion.p key={user.role} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="truncate text-[12.5px] text-subtle">
              {ROLE_LABEL[user.role]} · {user.title}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn("rounded-lg p-1.5 text-subtle outline-none hover:bg-white hover:text-ink", collapsed && "hidden")} aria-label="Menú de usuario">
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60">
          <DropdownMenuLabel>Ver la app como</DropdownMenuLabel>
          {(["direccion", "administracion", "supervisor"] as Role[]).map((r) => (
            <DropdownMenuItem
              key={r}
              onClick={() => {
                switchRole(r);
                toast.success(`Ahora ves Pulkro como ${ROLE_LABEL[r]}`);
              }}
            >
              <UserRound className="size-4" />
              <span className="flex-1">{ROLE_LABEL[r]}</span>
              {user.role === r && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              resetDemo();
              toast("Datos de demostración restablecidos");
            }}
          >
            <RotateCcw className="size-4" /> Restablecer datos demo
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              signOut();
              router.push("/login");
            }}
          >
            <LogOut className="size-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
