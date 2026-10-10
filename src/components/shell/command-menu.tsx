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
import { NAV_FOOT, NAV_MAIN } from "./nav";

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar en Pulkro" description="Órdenes, clientes, personal y secciones">
      <Command>
      <CommandInput placeholder="Folio, cliente, dirección, trabajador…" />
      <CommandList className="max-h-[440px]">
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {canCreate && (
          <CommandGroup heading="Acciones">
            <CommandItem onSelect={() => go("/ordenes/nueva")}>
              <Plus /> Nueva orden de servicio
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => { setOpen(false); setSyncOpen(true); }}>
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
              <CommandItem key={o.id} value={`${o.folio} ${o.title} ${c?.name} ${site?.address} ${site?.municipality}`} onSelect={() => go(`/ordenes/${o.folio}`)}>
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
            <CommandItem key={c.id} value={`${c.name} ${c.contactName} ${c.segment}`} onSelect={() => go(`/clientes/${c.id}`)}>
              <Building2 /> {c.name}
              <span className="ml-auto text-[12px] text-subtle">{c.segment}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Personal">
          {workers.slice(0, 50).map((w) => (
            <CommandItem key={w.id} value={`${w.name} ${w.specialty}`} onSelect={() => go(`/equipo?w=${w.id}`)}>
              <UserRound /> {w.name}
              <span className="ml-auto text-[12px] text-subtle">{w.specialty}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Secciones">
          {[...NAV_MAIN, ...NAV_FOOT].map((n) => (
            <CommandItem key={n.key} onSelect={() => go(n.href)}>
              <n.icon /> {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
