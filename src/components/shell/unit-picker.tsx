"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan } from "@/lib/hooks";
import { BottomSheet } from "./bottom-sheet";

/** Global unit scope (session.unitFilter) — only roles with view.allUnits (Dirección) can change it. */
export function useUnitScope() {
  const units = useAppStore((s) => s.units);
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const setUnitFilter = useAppStore((s) => s.setUnitFilter);
  const allUnits = useCan("view.allUnits");
  const selected = unitFilter === "all" ? null : (units.find((u) => u.id === unitFilter) ?? null);
  return { allUnits, units, unitFilter, selected, setUnitFilter };
}

/** Phone counterpart of the sidebar UnitSwitcher: "Todas las unidades" + each unit as 56px rows, check on the active one. */
export function UnitPickerSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { units, unitFilter, setUnitFilter } = useUnitScope();
  const pick = (id: string) => {
    onOpenChange(false);
    if (id === unitFilter) return;
    setUnitFilter(id);
    toast.success(id === "all" ? "Ahora ve todas las unidades" : `Ahora ve solo ${units.find((u) => u.id === id)?.name ?? "la unidad"} en toda la app`);
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Unidad" description="Elija qué unidad ver. Aplica a todas las secciones de la app.">
      <ul role="radiogroup" aria-label="Unidad" className="space-y-0.5">
        <UnitOption code="PK" title="Todas las unidades" sub={`${units.length} unidades`} active={unitFilter === "all"} onPick={() => pick("all")} />
        {units.map((u) => (
          <UnitOption key={u.id} code={u.code} title={u.name} sub={u.city} active={unitFilter === u.id} onPick={() => pick(u.id)} />
        ))}
      </ul>
    </BottomSheet>
  );
}

function UnitOption({ code, title, sub, active, onPick }: { code: string; title: string; sub: string; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onPick}
        className={cn("flex h-[60px] w-full items-center gap-3.5 rounded-[14px] px-2.5 text-left transition active:bg-sand", active && "bg-blue-wash")}
      >
        <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold tracking-wide", active ? "bg-blue-tint text-azure-fg" : "bg-sand text-ink")}>{code}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-ink">{title}</span>
          <span className="block truncate text-[13.5px] text-subtle">{sub}</span>
        </span>
        {active && <Check className="size-5 shrink-0 text-azure-fg" />}
      </button>
    </li>
  );
}

/**
 * Round-ish 44px pill with the active unit code ("PK" = todas); opens the unit picker sheet.
 * Renders nothing for roles without view.allUnits. Tinted blue while a single unit is scoping the data.
 * `phoneScopedOnly`: below 640px show it only while a single unit is selected (a scope reminder for page headers);
 * with "todas las unidades" it is hidden there (the control still lives in the Hoy/Perfil toolbars). From sm up it is unchanged.
 */
export function MobileUnitButton({ className, phoneScopedOnly = false }: { className?: string; phoneScopedOnly?: boolean }) {
  const { allUnits, selected } = useUnitScope();
  const [open, setOpen] = useState(false);
  if (!allUnits) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Unidad: ${selected?.name ?? "todas las unidades"}. Cambiar unidad`}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[13px] font-bold tracking-wide transition active:scale-95 lg:hidden",
          selected ? "bg-blue-tint text-azure-fg" : "bg-sand text-ink",
          phoneScopedOnly && !selected && "max-sm:hidden",
          className,
        )}
      >
        {selected?.code ?? "PK"}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      <UnitPickerSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
