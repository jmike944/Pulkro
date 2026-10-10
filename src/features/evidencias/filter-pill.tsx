"use client";

import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PillOption = { value: string; label: string; hint?: React.ReactNode; icon?: React.ReactNode };

export const ALL = "all";

export const pillClass =
  "inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border bg-surface px-4 lg:h-10 text-[14px] text-ink shadow-[0_1px_2px_rgb(16_24_40/0.04)] outline-none transition hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-line-heavy data-[state=open]:bg-wash";

/**
 * Reference-style filter pill ("Supervisor ⌄", "Estado: Abiertas ⌄") backed by a radio DropdownMenu.
 * With `allLabel`, an "all" option is offered and the pill reads just the label while it's selected.
 */
export function FilterPill({
  label,
  value,
  options,
  onChange,
  allLabel,
  menuLabel,
  className,
}: {
  label: string;
  value: string;
  options: PillOption[];
  onChange: (v: string) => void;
  allLabel?: string;
  menuLabel?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const active = !!allLabel && value !== ALL;
  const showValue = (active || !allLabel) && !!current;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(pillClass, active ? "border-blue-mid bg-blue-wash" : "border-hairline", className)}
        aria-label={`Filtrar por ${label.toLowerCase()}`}
      >
        <span className={cn("shrink-0", showValue || !allLabel ? "text-subtle" : "font-medium")}>
          {label}
          {showValue && ":"}
        </span>
        {showValue && <span className="min-w-0 truncate font-semibold">{current.label}</span>}
        <ChevronDown className="size-4 shrink-0 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[340px] w-auto min-w-[220px] max-w-[300px] rounded-[14px] p-1.5">
        {menuLabel && <DropdownMenuLabel className="px-2 pt-1.5 text-[11.5px] uppercase tracking-[0.1em]">{menuLabel}</DropdownMenuLabel>}
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {allLabel && (
            <>
              <DropdownMenuRadioItem value={ALL} className="min-h-11 rounded-[9px] px-2.5 text-[14px] lg:min-h-10">
                {allLabel}
              </DropdownMenuRadioItem>
              {options.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 gap-2.5 rounded-[9px] px-2.5 text-[14px] lg:min-h-10">
              {o.icon}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint !== undefined && <span className="shrink-0 text-[12.5px] text-subtle tabular">{o.hint}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Limpiar" text button shown when any filter is active. */
export function ClearFilters({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-subtle lg:h-10 transition hover:bg-muted hover:text-ink", className)}
    >
      <X className="size-4" /> Limpiar
    </button>
  );
}
