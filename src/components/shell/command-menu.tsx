"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, ClipboardList, Plus, UserRound, WifiOff } from "lucide-react";
import { useAppStore, useCan, useLookups, useScopedData } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { ORDER_STATUS } from "@/lib/status";
import { fmtDay } from "@/lib/format";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { StatusDot } from "@/components/pk/status";
import { NAV_FOOT, NAV_GROUPS, NAV_HOME, type NavItem } from "./nav";

/**
 * Phones: expose the *visual* viewport height (it shrinks when the on-screen keyboard opens, unlike dvh) as --pk-vvh
 * so the palette list can size itself to the space above the keyboard.
 */
function useVisualViewportHeight(active: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--pk-vvh", `${Math.round(vv.height)}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      root.style.removeProperty("--pk-vvh");
    };
  }, [active]);
}

// Phone rows get a 44px tap target; desktop keeps the compact cmdk rows.
const ITEM = "max-lg:min-h-11";

/** Global ⌘K palette: orders by folio/client/address, clients, crew, pages, quick actions. */
export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const setSyncOpen = useUi((s) => s.setSyncOpen);
  const router = useRouter();
  const { orders } = useScopedData();
  const lk = useLookups();
  const clients = useAppStore((s) => s.clients);
  const workers = useAppStore((s) => s.workers);
  const canCreate = useCan("order.create");

  useVisualViewportHeight(open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60),
    [orders],
  );

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const sectionItem = (n: NavItem) => (
    <CommandItem key={n.key} className={ITEM} onSelect={() => go(n.href)}>
      <n.icon /> {n.label}
    </CommandItem>
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Buscar en Pulkro"
      description="Órdenes, clientes, personal y secciones"
      className="max-lg:top-[max(12px,env(safe-area-inset-top))] max-sm:max-w-[calc(100%-1rem)]"
    >
      <Command>
      <div className="flex items-center">
        <div className="min-w-0 flex-1 max-lg:[&_[data-slot=input-group]]:h-11!">
          {/* 16px on phones: smaller input text makes iOS zoom the page on focus */}
          <CommandInput placeholder="Folio, cliente, dirección, trabajador…" className="max-lg:text-base" />
        </div>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 shrink-0 items-center px-3 text-[15px] font-semibold text-link lg:hidden">
          Cancelar
        </button>
      </div>
      <CommandList className="max-h-[440px] max-lg:max-h-[min(calc(var(--pk-vvh,100dvh)-7.5rem),36rem)]">
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {canCreate && (
          <CommandGroup heading="Acciones">
            <CommandItem className={ITEM} onSelect={() => go("/ordenes/nueva")}>
              <Plus /> Nueva orden de servicio
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem className={ITEM} onSelect={() => { setOpen(false); setSyncOpen(true); }}>
              <WifiOff /> Estado de sincronización
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Órdenes">
          {recentOrders.map((o) => {
            const c = lk.clients.get(o.clientId);
            const site = lk.sites.get(o.siteId);
            const st = ORDER_STATUS[o.status];
            return (
              <CommandItem key={o.id} className={ITEM} value={`${o.folio} ${o.title} ${c?.name} ${site?.address} ${site?.municipality}`} onSelect={() => go(`/ordenes/${o.folio}`)}>
                <ClipboardList />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    <b className="font-semibold">{o.folio}</b> · {o.title}
                  </span>
                  <span className="truncate text-[12px] text-subtle">
                    {c?.shortName} · {fmtDay(o.scheduledStart)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-subtle">
                  <StatusDot tone={st.tone} /> {st.label}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Clientes">
          {clients.map((c) => (
            <CommandItem key={c.id} className={ITEM} value={`${c.name} ${c.contactName} ${c.segment}`} onSelect={() => go(`/clientes/${c.id}`)}>
              <Building2 /> {c.name}
              <span className="ml-auto text-[12px] text-subtle">{c.segment}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Personal">
          {workers.slice(0, 50).map((w) => (
            <CommandItem key={w.id} className={ITEM} value={`${w.name} ${w.specialty}`} onSelect={() => go(`/equipo?w=${w.id}`)}>
              <UserRound /> {w.name}
              <span className="ml-auto text-[12px] text-subtle">{w.specialty}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Principal">{NAV_HOME.map(sectionItem)}</CommandGroup>
        {NAV_GROUPS.map((g) => (
          <CommandGroup key={g.key} heading={g.label}>
            {g.items.map(sectionItem)}
          </CommandGroup>
        ))}
        <CommandGroup heading="Configuración y ayuda">{NAV_FOOT.map(sectionItem)}</CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
