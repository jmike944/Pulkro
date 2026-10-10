"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flame, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";
import { AnimatedNumber } from "@/components/pk/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeFilterCount, type OrderFilters } from "./order-rows";

export type FilterOption = { value: string; label: string };

export type FilterOptions = {
  supervisors: FilterOption[];
  services: FilterOption[];
  clients: FilterOption[];
  units: FilterOption[];
};

const ALL = "__all";

type Props = {
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
  search: string;
  onSearch: (q: string) => void;
  options: FilterOptions;
  showSupervisor: boolean;
  showUnit: boolean;
  resultCount: number;
  onClear: () => void;
};

/** Search + filter row. Inline on tablet/desktop; a bottom sheet on phones. */
export function OrdersFilters(props: Props) {
  const { filters, search, onSearch, resultCount, onClear } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(filters);
  const dirty = count > 0 || search.trim().length > 0;
  const chips = appliedChips(props);

  return (
    <div className="mt-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <SearchBox value={search} onChange={onSearch} />

      {/* Phone: one button → sheet with every filter */}
      <div className="flex items-center gap-2 md:hidden">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSheetOpen(true)}
          className={cn("h-11 flex-1 rounded-[14px] border-hairline px-4 text-[14.5px] font-semibold", count > 0 && "border-blue-line bg-blue-wash")}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {count > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-deep px-1.5 text-[11px] font-bold text-white">{count}</span>}
        </Button>
        <AltaToggle on={filters.alta} onToggle={() => props.onChange({ alta: !filters.alta })} className="h-11" />
      </div>

      {/* Phone: what the sheet applied, one tap to drop each filter */}
      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <motion.ul
            key="chips"
            aria-label="Filtros aplicados"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="-my-1.5 flex flex-wrap gap-x-2 overflow-hidden md:hidden"
          >
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => props.onChange({ [c.key]: "" })} aria-label={`Quitar filtro ${c.label}: ${c.value}`} className="group inline-flex h-11 items-center outline-none">
                  <span className="inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-full border border-blue-line bg-blue-wash pl-3.5 pr-2.5 text-[13.5px] transition group-focus-visible:ring-3 group-focus-visible:ring-ring/50 group-active:scale-95">
                    <span className="min-w-0 truncate">
                      <span className="text-subtle">{c.label}: </span>
                      <span className="font-semibold text-ink">{c.value}</span>
                    </span>
                    <X className="size-3.5 shrink-0 text-subtle" />
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Tablet / desktop: inline */}
      <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
        <FilterFields {...props} />
        <AltaToggle on={filters.alta} onToggle={() => props.onChange({ alta: !filters.alta })} />
      </div>

      <div className="flex items-center justify-between gap-3 md:ml-auto md:justify-end">
        <p className="text-[13.5px] text-subtle" aria-live="polite">
          <AnimatedNumber value={resultCount} className="font-semibold text-ink" /> {resultCount === 1 ? "orden" : "órdenes"}
        </p>
        <AnimatePresence initial={false}>
          {dirty && (
            <motion.button
              type="button"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              onClick={onClear}
              className="inline-flex h-10 items-center gap-1.5 rounded-[12px] px-3 text-[13.5px] font-medium text-link transition hover:bg-blue-wash"
            >
              <X className="size-4" />
              Limpiar
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] gap-0 rounded-t-[26px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="px-1 pb-3 pt-5">
            <SheetTitle className="font-serif text-[26px] font-medium">Filtros</SheetTitle>
            <SheetDescription>Combine filtros para encontrar la orden.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2.5 overflow-y-auto px-1 pb-4 [&_[data-slot=select-trigger]]:w-full">
            <FilterFields {...props} stacked />
          </div>
          <div className="flex gap-2.5 border-t border-hairline px-1 pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-[14px] font-semibold"
              onClick={() => props.onChange({ sup: "", srv: "", cli: "", uni: "" })}
              disabled={!filters.sup && !filters.srv && !filters.cli && !filters.uni}
            >
              Quitar filtros
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-[14px] font-semibold" onClick={() => setSheetOpen(false)}>
              Ver {plural(resultCount, "orden", "órdenes")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type SelectKey = "sup" | "srv" | "cli" | "uni";

/** Applied select filters with their readable value, for the phone chip row. */
function appliedChips({ filters, options }: Props) {
  const defs: { key: SelectKey; label: string; list: FilterOption[] }[] = [
    { key: "sup", label: "Supervisor", list: options.supervisors },
    { key: "srv", label: "Servicio", list: options.services },
    { key: "cli", label: "Cliente", list: options.clients },
    { key: "uni", label: "Unidad", list: options.units },
  ];
  return defs.flatMap((d) => (filters[d.key] ? [{ key: d.key, label: d.label, value: d.list.find((o) => o.value === filters[d.key])?.label ?? "Seleccionado" }] : []));
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full md:w-[300px] lg:w-[320px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-subtle" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Folio, título, cliente o dirección"
        aria-label="Buscar órdenes"
        className="h-11 rounded-[14px] border-hairline bg-surface pl-10 pr-10 text-[15px] shadow-[0_1px_2px_rgb(16_24_40/0.03)] md:h-10 md:rounded-[12px] md:text-[14px]"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Borrar búsqueda"
          className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-subtle hover:bg-muted hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function FilterFields({ filters, onChange, options, showSupervisor, showUnit, stacked }: Props & { stacked?: boolean }) {
  return (
    <>
      {showSupervisor && (
        <FilterSelect label="Supervisor" value={filters.sup} options={options.supervisors} onChange={(v) => onChange({ sup: v })} stacked={stacked} />
      )}
      <FilterSelect label="Servicio" value={filters.srv} options={options.services} onChange={(v) => onChange({ srv: v })} stacked={stacked} />
      <FilterSelect label="Cliente" value={filters.cli} options={options.clients} onChange={(v) => onChange({ cli: v })} stacked={stacked} />
      {showUnit && <FilterSelect label="Unidad" value={filters.uni} options={options.units} onChange={(v) => onChange({ uni: v })} stacked={stacked} />}
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  stacked,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  stacked?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "max-w-[240px] rounded-[12px] border-hairline bg-surface px-3 text-[14px] shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-line-strong data-[size=default]:h-10",
          stacked && "max-w-none rounded-[14px] data-[size=default]:h-12",
          current && "border-blue-line bg-blue-wash hover:border-blue-line",
        )}
      >
        <span className="min-w-0 truncate text-left">
          <span className={cn(current ? "text-subtle" : "text-ink")}>{label}</span>
          {current && (
            <>
              <span className="text-subtle">: </span>
              <span className="font-semibold text-ink">{current.label}</span>
            </>
          )}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-[340px] min-w-[220px] rounded-[14px] p-1">
        <SelectItem value={ALL} className="h-9 rounded-[10px]">
          Todos
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="h-9 rounded-[10px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AltaToggle({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] border px-3 text-[14px] font-medium transition-colors",
        on ? "border-red-line bg-red-soft text-red-fg" : "border-hairline bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.03)] hover:border-line-strong",
        className,
      )}
    >
      <motion.span animate={on ? { rotate: [0, -14, 10, 0], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }} transition={{ duration: 0.45 }} className="inline-flex">
        <Flame className={cn("size-4", on ? "fill-st-red/20" : "text-subtle")} />
      </motion.span>
      Prioridad alta
    </motion.button>
  );
}
