"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtRelativeDay, plural } from "@/lib/format";
import type { ClientSegment } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stars } from "@/features/postventa/rating";
import { FilterChip, inputCls } from "@/features/postventa/ui";
import type { ClientStats } from "./use-clients";

type SortKey = "nombre" | "servicios" | "ultimo" | "csat" | "casos";
const SEGMENTS: ClientSegment[] = ["Industrial", "Comercial", "Residencial"];
const COLS = "md:grid-cols-[minmax(0,1.7fr)_56px_84px_108px_112px_64px_20px]";

type Sort = { key: SortKey; dir: 1 | -1 };
const dirFor = (key: SortKey): 1 | -1 => (key === "nombre" ? 1 : -1);
/** Phone sort menu: the desktop column headers (key + direction) spelled out as plain-language options. */
const SORT_OPTIONS: { key: SortKey; dir: 1 | -1; label: string }[] = [
  { key: "servicios", dir: -1, label: "Más servicios" },
  { key: "servicios", dir: 1, label: "Menos servicios" },
  { key: "ultimo", dir: -1, label: "Servicio más reciente" },
  { key: "ultimo", dir: 1, label: "Servicio más antiguo" },
  { key: "csat", dir: -1, label: "Mejor satisfacción" },
  { key: "csat", dir: 1, label: "Peor satisfacción" },
  { key: "casos", dir: -1, label: "Más casos abiertos" },
  { key: "casos", dir: 1, label: "Menos casos abiertos" },
  { key: "nombre", dir: 1, label: "Nombre, A a Z" },
  { key: "nombre", dir: -1, label: "Nombre, Z a A" },
];

/** "Todos los clientes": searchable, segment chips, sortable columns; cards on phones. */
export function ClientsTable({ rows }: { rows: ClientStats[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<ClientSegment | "todos">("todos");
  const [sort, setSort] = useState<Sort>({ key: "servicios", dir: -1 });

  const counts = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s, rows.filter((r) => r.client.segment === s).length])) as Record<ClientSegment, number>, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const val = (r: ClientStats): number | string => {
      switch (sort.key) {
        case "nombre":
          return r.client.name;
        case "servicios":
          return r.services.length;
        case "ultimo":
          return r.lastService ?? "";
        case "csat":
          return r.csatCount ? r.csat : -1;
        case "casos":
          return r.openCases;
      }
    };
    return rows
      .filter((r) => segment === "todos" || r.client.segment === segment)
      .filter((r) => !q || [r.client.name, r.client.shortName, r.client.contactName, ...r.sites.map((s) => s.municipality)].some((x) => x.toLowerCase().includes(q)))
      .sort((a, b) => {
        // unrated clients never lead a satisfaction ranking, whichever the direction
        if (sort.key === "csat" && (a.csatCount === 0) !== (b.csatCount === 0)) return a.csatCount === 0 ? 1 : -1;
        const x = val(a);
        const y = val(b);
        const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
        return c * sort.dir || a.client.name.localeCompare(b.client.name);
      });
  }, [rows, query, segment, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: dirFor(key) }));

  return (
    <div>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente, contacto o municipio" aria-label="Buscar clientes" className={cn(inputCls, "pl-10")} />
        </div>
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <FilterChip active={segment === "todos"} onClick={() => setSegment("todos")} count={rows.length}>
            Todos
          </FilterChip>
          {SEGMENTS.map((s) => (
            <FilterChip key={s} active={segment === s} onClick={() => setSegment(s)} count={counts[s]}>
              {s}
            </FilterChip>
          ))}
        </div>
        {/* phones have no column headers to click: same sort state, as a menu */}
        <Select
          value={`${sort.key}:${sort.dir}`}
          onValueChange={(v) => {
            const [key, dir] = v.split(":");
            setSort({ key: key as SortKey, dir: dir === "1" ? 1 : -1 });
          }}
        >
          <SelectTrigger aria-label="Ordenar clientes" className={cn(inputCls, "w-full data-[size=default]:h-11 md:hidden")}>
            <span className="flex min-w-0 items-center gap-2">
              <ArrowUpDown className="size-4 text-subtle" />
              <span className="text-subtle">Ordenar</span>
              <SelectValue className="truncate font-medium text-ink" />
            </span>
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-[14px] p-1">
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`} className="min-h-11 rounded-[10px] text-[14px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Sin coincidencias" className="mt-6">
          Pruebe con otro nombre o segmento.
        </EmptyState>
      ) : (
        <div className="mt-5">
          <div className={cn("hidden gap-4 border-b border-hairline pb-3 text-[12px] font-semibold text-subtle md:grid", COLS)}>
            <SortHeader k="nombre" sort={sort} onSort={toggle}>
              Cliente
            </SortHeader>
            <span className="uppercase tracking-[0.1em]">Sitios</span>
            <SortHeader k="servicios" sort={sort} onSort={toggle} className="justify-end" label="servicios en 12 meses">
              12 m
            </SortHeader>
            <SortHeader k="ultimo" sort={sort} onSort={toggle} label="último servicio">
              Último
            </SortHeader>
            <SortHeader k="csat" sort={sort} onSort={toggle} label="satisfacción">
              Satisfacción
            </SortHeader>
            <SortHeader k="casos" sort={sort} onSort={toggle} className="justify-end" label="casos abiertos">
              Casos
            </SortHeader>
            <span />
          </div>
          <motion.ul layout>
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((r, i) => (
                <motion.li
                  key={r.client.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(i, 12) * 0.03 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ layout: { type: "spring", stiffness: 420, damping: 38 } }}
                  className="border-b border-hairline"
                >
                  <Link href={`/clientes/${r.client.id}`} className={cn("group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4", COLS)}>
                    <span className="flex min-w-0 items-center gap-3">
                      <ClientMark name={r.client.name} hue={r.client.hue} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-ink group-hover:text-link">{r.client.name}</span>
                        <span className="block truncate text-[13px] text-subtle">
                          {r.client.segment}
                          <span className="md:hidden"> · {r.lastService ? `último ${fmtRelativeDay(r.lastService).toLowerCase()}` : "sin servicios"}</span>
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-[14px] text-ink tabular md:block">{r.sites.length}</span>
                    <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{r.services.length}</span>
                    <span className="hidden text-[14px] text-ink md:block">{r.lastService ? fmtRelativeDay(r.lastService) : "—"}</span>
                    <span className="hidden items-center gap-2 md:flex">
                      {r.csatCount ? (
                        <>
                          <Stars value={r.csat} size={12} />
                          <span className="text-[13px] font-semibold text-ink tabular">{r.csat.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="text-[13px] text-subtle">Sin encuestas</span>
                      )}
                    </span>
                    <span className="flex items-center justify-end gap-2 md:contents">
                      {r.openCases > 0 && (
                        <span className="inline-flex h-6 items-center rounded-md bg-[#fdeeee] px-1.5 text-[12px] font-semibold text-st-red md:hidden">
                          {r.openCases === 1 ? "1 caso" : `${r.openCases} casos`}
                        </span>
                      )}
                      <span
                        className={cn(
                          "hidden h-6 min-w-7 items-center justify-center rounded-md px-1.5 text-[12.5px] font-semibold tabular md:inline-flex md:justify-self-end",
                          r.openCases ? "bg-[#fdeeee] text-st-red" : "bg-[#f2f4f7] text-subtle",
                        )}
                        title={`${r.openCases} casos abiertos`}
                      >
                        {r.openCases}
                      </span>
                      <ChevronRight className="hidden size-4 text-[#c5ccd6] transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:block" />
                    </span>
                    {/* phones: the columns the table has (sitios, 12 m, numeric CSAT / sin encuestas), under the name (42px mark + 12px gap) */}
                    <span className="col-span-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-[54px] text-[13px] text-subtle md:hidden">
                      <span>
                        {plural(r.sites.length, "sitio", "sitios")} · {plural(r.services.length, "servicio", "servicios")} en 12 m
                      </span>
                      {r.csatCount ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Stars value={r.csat} size={12} />
                          <span className="font-semibold text-ink tabular">{r.csat.toFixed(1)}</span>
                        </span>
                      ) : (
                        <span>Sin encuestas</span>
                      )}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  k,
  sort,
  onSort,
  children,
  label,
  className,
}: {
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-label={`Ordenar por ${label ?? k}`}
      aria-pressed={active}
      className={cn("inline-flex items-center gap-1 text-left uppercase tracking-[0.1em] transition-colors hover:text-ink", active && "text-ink", className)}
    >
      {children}
      {active && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );
}
