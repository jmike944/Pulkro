"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { motion } from "motion/react";
import {
  Building2,
  Camera,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  MessageSquareHeart,
  ShieldCheck,
  Star,
  TriangleAlert,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser, useLookups, useScopedAudit } from "@/lib/hooks";
import { businessDateStamp, exportToExcel, fmtBusinessTime } from "@/lib/export";
import { fmtLongDay, fmtNum, fmtRelativeDay, fmtTime, plural } from "@/lib/format";
import { ROLE_LABEL, type Tone } from "@/lib/status";
import type { AuditEntity, AuditEntry } from "@/lib/types";
import { BarList, Insight, PersonAvatar, SectionHeader } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { SoftBadge } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GatedButton, NO_EXCEL, SearchField, norm, selectTriggerCls } from "./shared";

export const ENTITY_META: Record<AuditEntity, { label: string; tone: Tone; icon: React.ReactNode }> = {
  orden: { label: "Orden", tone: "navy", icon: <ClipboardList /> },
  jornada: { label: "Jornada", tone: "blue", icon: <CalendarClock /> },
  foto: { label: "Foto", tone: "amber", icon: <Camera /> },
  incidencia: { label: "Incidencia", tone: "red", icon: <TriangleAlert /> },
  reporte: { label: "Reporte", tone: "teal", icon: <FileText /> },
  caso: { label: "Caso", tone: "violet", icon: <MessageSquareHeart /> },
  encuesta: { label: "Encuesta", tone: "sky", icon: <Star /> },
  catalogo: { label: "Catálogo", tone: "slate", icon: <Building2 /> },
  usuario: { label: "Usuario", tone: "slate", icon: <UserCog /> },
};

type Range = "hoy" | "7d" | "30d" | "todo";
const PAGE = 60;

export function AuditTab() {
  const audit = useScopedAudit();
  const me = useCurrentUser();
  const lk = useLookups();
  const orders = useAppStore((s) => s.orders);
  const canExcel = useCan("export.excel");
  const [entity, setEntity] = useState<"all" | AuditEntity>("all");
  const [who, setWho] = useState<string>("all");
  const [range, setRange] = useState<Range>("30d");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const folioOf = useMemo(() => new Map(orders.map((o) => [o.id, o.folio])), [orders]);
  const nameOf = (id: string) => (id === "cliente" ? "Cliente (encuesta)" : lk.users.get(id)?.name ?? "Usuario eliminado");

  const people = useMemo(() => {
    const ids = [...new Set(audit.map((a) => a.by))];
    return ids
      .map((id) => ({ id, name: id === "cliente" ? "Cliente (encuesta)" : lk.users.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [audit, lk.users]);

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    const now = new Date();
    const from = range === "hoy" ? startOfDay(now) : range === "7d" ? subDays(startOfDay(now), 6) : range === "30d" ? subDays(startOfDay(now), 29) : null;
    const fromIso = from?.toISOString();
    return audit.filter((a) => {
      if (entity !== "all" && a.entity !== entity) return false;
      if (who !== "all" && a.by !== who) return false;
      if (fromIso && a.at < fromIso) return false;
      if (term) {
        const hay = norm(`${a.action} ${a.reason ?? ""} ${a.orderId ? folioOf.get(a.orderId) ?? "" : ""} ${a.by === "cliente" ? "cliente" : lk.users.get(a.by)?.name ?? ""}`);
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [audit, entity, who, range, q, folioOf, lk.users]);

  const groups = useMemo(() => {
    const out: { key: string; date: string; items: AuditEntry[] }[] = [];
    filtered.slice(0, limit).forEach((a) => {
      const key = format(parseISO(a.at), "yyyy-MM-dd");
      const last = out.at(-1);
      if (last?.key === key) last.items.push(a);
      else out.push({ key, date: a.at, items: [a] });
    });
    return out;
  }, [filtered, limit]);

  const dayTotals = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((a) => {
      const key = format(parseISO(a.at), "yyyy-MM-dd");
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [filtered]);

  const byEntity = useMemo(() => {
    const m = new Map<AuditEntity, number>();
    filtered.forEach((a) => m.set(a.entity, (m.get(a.entity) ?? 0) + 1));
    const total = filtered.length || 1;
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => ({ label: ENTITY_META[k].label, value: v, pct: v / total }));
  }, [filtered]);

  const topPeople = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((a) => m.set(a.by, (m.get(a.by) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  const withReason = filtered.filter((a) => a.reason).length;

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setLimit(PAGE);
  };

  const exportExcel = async () => {
    await exportToExcel(`bitacora-pulkro-${businessDateStamp()}`, [
      {
        name: "Bitácora",
        columns: [
          { header: "Fecha", key: "fecha", width: 12 },
          { header: "Hora", key: "hora", width: 8 },
          { header: "Usuario", key: "usuario", width: 28 },
          { header: "Rol", key: "rol", width: 16 },
          { header: "Entidad", key: "entidad", width: 12 },
          { header: "Acción", key: "accion", width: 52 },
          { header: "Motivo", key: "motivo", width: 48 },
          { header: "Orden", key: "orden", width: 12 },
        ],
        rows: filtered.map((a) => {
          const u = lk.users.get(a.by);
          return {
            fecha: businessDateStamp(a.at),
            hora: fmtBusinessTime(a.at),
            usuario: nameOf(a.by),
            rol: u ? ROLE_LABEL[u.role] : a.by === "cliente" ? "Cliente" : "",
            entidad: ENTITY_META[a.entity].label,
            accion: a.action,
            motivo: a.reason ?? "",
            orden: a.orderId ? folioOf.get(a.orderId) ?? "" : "",
          };
        }),
      },
    ]);
    toast.success("Bitácora exportada", { description: `${plural(filtered.length, "movimiento", "movimientos")} en Excel.` });
  };

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-0">
      <div className="min-w-0 xl:border-r xl:border-hairline xl:pr-10">
        <SectionHeader
          title={me.role === "supervisor" ? "Mi bitácora" : "Bitácora de cambios"}
          subtitle={
            me.role === "supervisor"
              ? "Movimientos de tus órdenes asignadas y los que tú registraste."
              : "Todo cambio guarda usuario, fecha y motivo (doc §3)."
          }
          action={
            <GatedButton allowed={canExcel} reason={NO_EXCEL} variant="outline" onClick={exportExcel} disabled={!filtered.length} className="border-line">
              {canExcel && <FileSpreadsheet className="size-4" />} Excel
            </GatedButton>
          }
        />

        <div className="mb-6 space-y-3">
          <SearchField value={q} onChange={reset(setQ)} placeholder="Buscar acción, motivo, folio o persona" />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={entity} onValueChange={(v) => reset(setEntity)(v as "all" | AuditEntity)}>
              <SelectTrigger className={cn(selectTriggerCls, "sm:w-[170px]")} aria-label="Entidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las entidades</SelectItem>
                {(Object.keys(ENTITY_META) as AuditEntity[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ENTITY_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={who} onValueChange={reset(setWho)}>
              <SelectTrigger className={cn(selectTriggerCls, "sm:w-[210px]")} aria-label="Usuario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las personas</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
              <Segmented<Range>
                id="audit-range"
                value={range}
                onChange={reset(setRange)}
                items={[
                  { value: "hoy", label: "Hoy" },
                  { value: "7d", label: "7 días" },
                  { value: "30d", label: "30 días" },
                  { value: "todo", label: "Todo" },
                ]}
              />
            </div>
          </div>
          <p className="text-[13px] text-subtle">
            <b className="font-semibold text-ink tabular">{fmtNum(filtered.length)}</b> {filtered.length === 1 ? "movimiento" : "movimientos"}
            {withReason > 0 && <> · {fmtNum(withReason)} con motivo</>}
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<History />} title="Sin movimientos">
            Ningún registro coincide con los filtros. Prueba con otro rango de fechas.
          </EmptyState>
        ) : (
          <div>
            {groups.map((g) => (
              <section key={g.key} aria-label={fmtLongDay(g.date)} className="mb-2">
                <div className="sticky top-0 z-10 -mx-2 flex items-center justify-between gap-3 bg-surface/90 px-2 py-2.5 backdrop-blur-md">
                  <p className="text-[13px] font-semibold text-ink">
                    {fmtRelativeDay(g.date)}
                    <span className="font-normal text-subtle"> · {fmtLongDay(g.date)}</span>
                  </p>
                  <span className="rounded-md bg-tile px-1.5 py-0.5 text-[12px] font-semibold text-subtle tabular">{dayTotals.get(g.key)}</span>
                </div>
                <ol className="relative ml-[19px] border-l border-hairline pb-2">
                  {g.items.map((a, i) => (
                    <AuditRow key={a.id} entry={a} index={i} nameOf={nameOf} folio={a.orderId ? folioOf.get(a.orderId) : undefined} />
                  ))}
                </ol>
              </section>
            ))}
            {filtered.length > limit && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} className="h-11 rounded-[12px] border-line px-5 font-semibold">
                  Ver {Math.min(PAGE, filtered.length - limit)} más · quedan {fmtNum(filtered.length - limit)}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="order-first min-w-0 xl:order-none xl:pl-10">
        <div className="grid gap-8 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          <div>
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Qué se registra</h2>
            <p className="mb-5 mt-1 text-[13.5px] text-subtle">Por tipo de registro en el periodo</p>
            {byEntity.length ? <BarList items={byEntity} /> : <p className="text-[13.5px] text-subtle">Sin datos en el periodo.</p>}
          </div>
          <div>
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Quién registra</h2>
            <p className="mb-4 mt-1 text-[13.5px] text-subtle">Personas con más movimientos</p>
            <ul className="space-y-1">
              {topPeople.map(([id, n], i) => {
                const u = lk.users.get(id);
                return (
                  <motion.li key={id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05, ease: EASE }}>
                    <button
                      type="button"
                      onClick={() => reset(setWho)(who === id ? "all" : id)}
                      aria-pressed={who === id}
                      className={cn("flex min-h-11 w-full items-center gap-3 rounded-[14px] px-2 py-1.5 text-left transition hover:bg-muted", who === id && "bg-sky-soft hover:bg-sky-soft")}
                    >
                      {u ? (
                        <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={32} />
                      ) : (
                        <span className="inline-flex size-8 items-center justify-center rounded-full bg-violet-soft text-violet-fg">
                          <Star className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{nameOf(id)}</span>
                        <span className="block truncate text-[12px] text-subtle">{u ? ROLE_LABEL[u.role] : "Respuesta externa"}</span>
                      </span>
                      <span className="text-[14px] font-semibold text-ink tabular">{fmtNum(n)}</span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </div>
          <Insight icon={<ShieldCheck />} className="sm:col-span-2 xl:col-span-1">
            Las ediciones posteriores al cierre generan <b className="font-semibold">nueva versión</b> del reporte y quedan aquí con su motivo (doc §8).
          </Insight>
        </div>
      </aside>
    </div>
  );
}

function AuditRow({ entry: a, index, nameOf, folio }: { entry: AuditEntry; index: number; nameOf: (id: string) => string; folio?: string }) {
  const lk = useLookups();
  const u = lk.users.get(a.by);
  const meta = ENTITY_META[a.entity];
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index, 12) * 0.025 }}
      className="relative py-3 pl-7"
    >
      <span className="absolute -left-[16px] top-3.5">
        {u ? (
          <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={32} ring />
        ) : (
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-violet-soft text-violet-fg ring-2 ring-surface">
            <Star className="size-4" />
          </span>
        )}
      </span>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[14.5px] leading-snug text-ink">
          <span className="font-semibold">{nameOf(a.by)}</span>
          <span className="text-subtle"> · </span>
          {a.action}
        </p>
        <time dateTime={a.at} className="shrink-0 pt-0.5 text-[12.5px] text-subtle tabular">
          {fmtTime(a.at)}
        </time>
      </div>
      {a.reason && (
        <blockquote className="mt-1.5 border-l-2 border-sky pl-3 text-[13.5px] italic leading-snug text-ink/75">“{a.reason}”</blockquote>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SoftBadge tone={meta.tone} className="[&_svg]:size-3">
          {meta.icon}
          {meta.label}
        </SoftBadge>
        {folio && (
          <Link href={`/ordenes/${folio}?tab=actividad`} className="relative inline-flex h-[22px] items-center rounded-md bg-tile px-2 text-[11.5px] font-semibold text-ink transition after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-[''] hover:bg-brand-deep hover:text-white tabular">
            {folio}
          </Link>
        )}
      </div>
    </motion.li>
  );
}
