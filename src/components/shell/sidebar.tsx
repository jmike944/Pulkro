"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, ChevronDown, ChevronRight, EllipsisVertical, LogOut, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/status";
import { DEMO_ENABLED } from "@/lib/demo";
import type { Role } from "@/lib/types";
import { PulkroEmblem, PulkroLetters } from "@/components/pk/brand";
import { PersonAvatar } from "@/components/pk/bits";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isActive, navFor, type NavGroup, type NavItem } from "./nav";
import { useNavBadges } from "./use-nav-badges";
import { useOpenGroups } from "./use-open-groups";
import { SyncChip } from "./sync-indicator";
import { ThemeMenuGroup } from "./theme-switcher";
import { DemoResetDialog } from "./demo-reset-dialog";

const COLLAPSE_KEY = "pk.sidebar.collapsed";

/** Saved collapsed state. The sidebar mounts only after the store hydrates (never in server HTML), so reading it up front is safe. */
function readCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Keyboard focus ring for sidebar rows. Inset: the scrolling nav would clip a ring drawn outside the row. */
const ROW_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60";

/**
 * The logo row is the collapse/expand control. Expanded: emblem + letters, with a "collapse" icon fading in at the
 * right on hover/focus. Collapsed: the emblem cross-fades into an "expand" icon in the same spot. Opacity-only
 * transitions, so nothing shifts while the sidebar's width animates.
 */
function LogoToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expandir menú" : "Contraer menú";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!collapsed}
          className={cn(
            "group/logo relative flex h-11 w-full items-center gap-3 rounded-[14px] px-1.5 text-brand-ink transition-colors hover:bg-surface",
            ROW_FOCUS,
            collapsed && "justify-center px-0",
          )}
        >
          <span className="relative grid size-9 shrink-0 place-items-center">
            <PulkroEmblem className={cn("transition-opacity duration-200", collapsed && "group-hover/logo:opacity-0 group-focus-visible/logo:opacity-0")} />
            {collapsed && (
              <Icon aria-hidden className="absolute size-[20px] text-ink opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100" />
            )}
          </span>
          {!collapsed && (
            <>
              <PulkroLetters />
              <Icon
                aria-hidden
                className="ml-auto mr-1 size-[18px] text-subtle opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100"
              />
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side={collapsed ? "right" : "bottom"}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const role = useCurrentUser().role;
  const nav = navFor(role);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const groups = useOpenGroups(pathname);
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {}
    setCollapsed(!collapsed);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 84 : 272 }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden px-4 pb-3 pt-4 lg:flex print:hidden"
    >
      <LogoToggle collapsed={collapsed} onToggle={toggle} />

      <div className="mt-3 space-y-1.5">
        <UnitSwitcher collapsed={collapsed} />
        <NewOrderButton collapsed={collapsed} />
      </div>

      {/* One LayoutGroup for the whole sidebar (home rows, group children, footer) so the active pill glides between them. */}
      <LayoutGroup id="sidebar">
        <NavScroller>
          <ul className="space-y-0.5">
            {nav.home.map((item) => (
              <NavLink key={item.key} item={item} collapsed={collapsed} />
            ))}
            {nav.groups.map((group) =>
              collapsed ? (
                <CollapsedGroup key={group.key} group={group} />
              ) : (
                <NavGroupSection key={group.key} group={group} open={groups.isOpen(group.key)} onOpenChange={(open) => groups.setGroupOpen(group.key, open)} />
              ),
            )}
          </ul>
        </NavScroller>

        <div className="mt-1.5">
          <ul className="space-y-0.5">
            {nav.foot.map((item) => (
              <NavLink key={item.key} item={item} collapsed={collapsed} />
            ))}
          </ul>
          <div className="pt-1.5">
            <SyncChip collapsed={collapsed} slim />
          </div>
          <UserCard collapsed={collapsed} />
        </div>
      </LayoutGroup>
    </motion.aside>
  );
}

/** Scrolling middle of the sidebar (the footer stays pinned). Fades out the edge(s) where more sections are hidden. */
function NavScroller({ children }: { children: React.ReactNode }) {
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const nav = navRef.current;
    const inner = innerRef.current;
    if (!nav || !inner) return;
    const update = () => {
      setMore(nav.scrollHeight - nav.scrollTop - nav.clientHeight > 4);
      setScrolled(nav.scrollTop > 4);
    };
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    ro.observe(inner);
    nav.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <nav
      ref={navRef}
      aria-label="Secciones"
      className={cn(
        "scrollbar-none mt-2 flex-1 overflow-y-auto",
        more && !scrolled && "[mask-image:linear-gradient(to_bottom,#000_calc(100%-36px),transparent)]",
        !more && scrolled && "[mask-image:linear-gradient(to_bottom,transparent,#000_28px)]",
        more && scrolled && "[mask-image:linear-gradient(to_bottom,transparent,#000_28px,#000_calc(100%-36px),transparent)]",
      )}
    >
      <div ref={innerRef}>{children}</div>
    </nav>
  );
}

/** The white tile behind the current section. One shared layoutId, so it glides between rows, group children and the footer. */
function ActivePill() {
  return (
    <motion.span
      layoutId="nav-active"
      className="absolute inset-0 rounded-[14px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.05),0_8px_20px_-12px_rgb(16_24_40/0.18)]"
      transition={{ type: "spring", stiffness: 480, damping: 38 }}
    />
  );
}

function CountChip({ count }: { count: number }) {
  return (
    <motion.span
      key={count}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="relative inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-press px-1.5 text-[12px] font-semibold text-ink tabular"
    >
      {count}
    </motion.span>
  );
}

/** Badge counts of one group: per item, plus the sum (shown on the group while it is closed so attention items never hide). */
function useGroupCounts(group: NavGroup) {
  const badges = useNavBadges();
  const counts = group.items.map((item) => (item.badge ? badges[item.badge] : 0));
  return { counts, total: counts.reduce((sum, n) => sum + n, 0) };
}

/**
 * Expanded sidebar: a group is a collapsible row (icon · label · chevron). Open, its pages list below as icon-less rows
 * along a thin guide line. Closed, the chevron carries the summed badge count.
 */
function NavGroupSection({ group, open, onOpenChange }: { group: NavGroup; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const { counts, total } = useGroupCounts(group);
  const Icon = group.icon;
  const hasActive = group.items.some((item) => isActive(pathname, item.href));
  return (
    <li>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          className={cn(
            "group relative flex h-10 w-full items-center gap-3.5 rounded-[14px] px-3.5 text-left text-[15px] transition-colors",
            hasActive && !open ? "text-ink" : "text-ink-soft hover:text-ink",
            ROW_FOCUS,
          )}
        >
          <Icon className={cn("size-[20px] shrink-0 transition-colors", hasActive && !open ? "text-azure-fg" : "text-ink-muted group-hover:text-ink")} strokeWidth={1.7} />
          <span className="flex-1 truncate">{group.label}</span>
          {!open && total > 0 && <CountChip count={total} />}
          <ChevronRight className="size-4 shrink-0 text-subtle transition-transform duration-200 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden motion-safe:data-[state=closed]:animate-collapsible-up motion-safe:data-[state=open]:animate-collapsible-down">
          <ul aria-label={group.label} className="ml-6 mt-0.5 border-l border-edge-strong pl-[7px]">
            {group.items.map((item, i) => (
              <SubLink key={item.key} item={item} count={counts[i]} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** Page row inside an open group: text only (the group icon already says what it is), pill + semibold when current. */
function SubLink({ item, count }: { item: NavItem; count: number }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  // The middle of the sidebar scrolls on short windows: keep the current section in view.
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <li>
      <Link
        ref={ref}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative scroll-my-10 flex h-9 items-center gap-2 rounded-[14px] pl-4 pr-3.5 text-[14.5px] transition-colors",
          active ? "font-semibold text-ink" : "text-ink-soft hover:text-ink",
          ROW_FOCUS,
        )}
      >
        {active && <ActivePill />}
        <span className="relative flex-1 truncate">{item.label}</span>
        {count > 0 && <CountChip count={count} />}
      </Link>
    </li>
  );
}

/**
 * Collapsed sidebar (84px): one icon per group. It opens a flyout to the right with the group's pages; the tooltip names the
 * group while the flyout is closed. Lit like an active row when the current page is inside, red dot when anything needs attention.
 */
function CollapsedGroup({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const { counts, total } = useGroupCounts(group);
  const Icon = group.icon;
  const hasActive = group.items.some((item) => isActive(pathname, item.href));
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  // Closing the flyout hands focus back to the trigger, which would pop the tooltip open on a stale hover/focus.
  const justClosed = useRef(false);
  return (
    <li>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          // Opening with the keyboard never clicks the trigger, so the tooltip would otherwise reappear once the flyout closes.
          if (next) setTipOpen(false);
        }}
      >
        <Tooltip
          open={tipOpen && !menuOpen}
          onOpenChange={(next) => {
            if (!(next && justClosed.current)) setTipOpen(next);
          }}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group relative flex h-10 w-full items-center justify-center rounded-[14px] transition-colors data-[state=open]:bg-surface/60",
                  hasActive ? "text-ink" : "text-ink-soft hover:text-ink",
                  ROW_FOCUS,
                )}
              >
                {hasActive && <ActivePill />}
                <Icon className={cn("relative size-[20px] shrink-0 transition-colors", hasActive ? "text-azure-fg" : "text-ink-muted group-hover:text-ink")} strokeWidth={1.7} />
                <span className="sr-only">
                  {group.label}
                  {total > 0 ? `, ${total} por atender` : ""}
                </span>
                {total > 0 && <span aria-hidden className="absolute right-3.5 top-2.5 size-2 rounded-full bg-st-red ring-2 ring-canvas" />}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{group.label}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={10}
          className="w-60 rounded-[16px] p-1.5 shadow-[0_12px_32px_-12px_rgb(16_24_40/0.28)]"
          onCloseAutoFocus={() => {
            justClosed.current = true;
            setTimeout(() => (justClosed.current = false), 250);
          }}
        >
          <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[13px] font-semibold text-subtle">{group.label}</DropdownMenuLabel>
          {group.items.map((item, i) => {
            const active = isActive(pathname, item.href);
            const ItemIcon = item.icon;
            return (
              <DropdownMenuItem
                key={item.key}
                asChild
                className={cn("h-10 gap-3 rounded-[11px] px-2.5 text-[14.5px]", active ? "bg-tile font-semibold text-ink" : "text-ink-soft")}
              >
                <Link href={item.href} aria-current={active ? "page" : undefined}>
                  <ItemIcon className={cn("size-[18px] shrink-0", active ? "text-azure-fg" : "text-ink-muted")} strokeWidth={1.7} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {counts[i] > 0 && <CountChip count={counts[i]} />}
                  {active && <Check className="size-4 shrink-0 text-azure-fg" aria-hidden />}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Row with its own icon: Inicio / Pendientes at the top and Configuración / Centro de ayuda in the footer. */
function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const badges = useNavBadges();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const count = item.badge ? badges[item.badge] : 0;
  // The middle of the sidebar scrolls on short windows: keep the current section in view.
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const link = (
    <Link
      ref={ref}
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative scroll-my-10 flex h-10 items-center gap-3.5 rounded-[14px] px-3.5 text-[15px] transition-colors",
        active ? "font-semibold text-ink" : "text-ink-soft hover:text-ink",
        collapsed && "justify-center px-0",
        ROW_FOCUS,
      )}
    >
      {active && <ActivePill />}
      <Icon className={cn("relative size-[20px] shrink-0 transition-colors", active ? "text-azure-fg" : "text-ink-muted group-hover:text-ink")} strokeWidth={1.7} />
      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
      {!collapsed && count > 0 && <CountChip count={count} />}
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
        "flex w-full items-center gap-3 rounded-[16px] border border-surface bg-surface/70 p-2 text-left shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition hover:bg-surface",
        collapsed && "justify-center p-1.5",
      )}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-well text-[13px] font-bold tracking-wide text-ink">{code.slice(0, 2)}</span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{title}</span>
            <span className="block truncate text-[12.5px] leading-tight text-subtle">{sub}</span>
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
        "group flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-surface bg-surface text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05),0_6px_16px_-10px_rgb(16_24_40/0.2)] transition hover:-translate-y-px hover:shadow-soft active:translate-y-0",
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
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div className={cn("mt-0.5 flex items-center gap-3 rounded-[14px] px-2 py-1", collapsed && "justify-center")}>
      <PersonAvatar name={user.name} initials={user.initials} hue={user.hue} size={36} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight text-ink">{user.name.split(" ").slice(0, 2).join(" ")}</p>
          <AnimatePresence mode="wait">
            <motion.p key={user.role} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="truncate text-[12.5px] leading-tight text-subtle">
              {ROLE_LABEL[user.role]} · {user.title}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn("rounded-lg p-1.5 text-subtle outline-none hover:bg-surface hover:text-ink", collapsed && "hidden")} aria-label="Menú de usuario">
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60">
          {DEMO_ENABLED && (
            <>
              <DropdownMenuLabel>Ver la app como (demo)</DropdownMenuLabel>
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
            </>
          )}
          <ThemeMenuGroup />
          <DropdownMenuSeparator />
          {DEMO_ENABLED && (
            <DropdownMenuItem onClick={() => setResetOpen(true)}>
              <RotateCcw className="size-4" /> Restablecer datos demo…
            </DropdownMenuItem>
          )}
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
      <DemoResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
