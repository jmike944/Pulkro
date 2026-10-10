"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { getYear, parseISO } from "date-fns";
import { Building, ChevronDown, MessageCircle, Phone, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useCan, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { whatsappLink } from "@/lib/domain";
import { firstName, fmtHours, fmtPct, plural } from "@/lib/format";
import type { Client } from "@/lib/types";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { AnimatedNumber, IconTile, MiniStat } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { MetaList, PageHeader } from "@/components/pk/page";
import { PillBars } from "@/components/pk/pill-bars";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MONTHS_LONG } from "@/features/postventa/lib";
import { Gate, REASON_ORDER_CREATE, menuItemCls, outlineBtnCls } from "@/features/postventa/ui";
import { ClientAside } from "./client-aside";
import { ClientHistory, ClientOpenOrders } from "./client-history";
import { computeClientStats, periodRange, servicesPerMonth, visibleClients, type ClientPeriod } from "./use-clients";

const PERIOD_LABEL: Record<ClientPeriod, string> = { "12m": "12 meses", year: "Este año" };
const stripTitle = (name: string) => name.replace(/^(Lic|Ing|Dra?|Mtra?|Adm|Cap)\.\s*/i, "");

/** /clientes/[clientId] — "Carrier" detail: indicators, open work, full service history, sites. */
export function ClientDetailView({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const scoped = useScopedData();
  const clients = useAppStore((s) => s.clients);
  const client = clients.find((c) => c.id === clientId);
  const visible = client ? visibleClients([client], scoped.user, scoped.unitFilter, scoped.orders).length > 0 : false;

  if (!client || !visible) {
    return (
      <div>
        <PageHeader title="Cliente" breadcrumb={[{ label: "Clientes", href: "/clientes" }, { label: client?.shortName ?? "No encontrado" }]} />
        <EmptyState
          icon={<SearchX />}
          title={client ? "Cliente fuera de su alcance" : "No encontramos el cliente"}
          action={
            <Button asChild variant="outline" className={outlineBtnCls}>
              <Link href="/clientes">Ver clientes</Link>
            </Button>
          }
        >
          {client ? "Su rol solo consulta clientes de su unidad o de sus órdenes asignadas." : "Puede que el catálogo haya cambiado en este dispositivo."}
        </EmptyState>
      </div>
    );
  }
  return <ClientDetail key={client.id} client={client} />;
}

function ClientDetail({ client }: { client: Client }) {
  const { orders, jornadas, surveys, cases, photos } = useScopedData();
  const lk = useLookups();
  const canCreate = useCan("order.create");
  const now = useNow(5 * 60_000);
  const [period, setPeriod] = useState<ClientPeriod>("12m");
  const [month, setMonth] = useState<number | null>(null);

  const stats = useMemo(
    () => computeClientStats(client, { orders, jornadas, surveys, cases, sites: lk.sites }, periodRange(period, now)),
    [client, orders, jornadas, surveys, cases, lk.sites, period, now],
  );
  const allTime = useMemo(
    () => computeClientStats(client, { orders, jornadas, surveys, cases, sites: lk.sites }, { start: new Date(0), end: now }),
    [client, orders, jornadas, surveys, cases, lk.sites, now],
  );
  const bars = useMemo(() => servicesPerMonth(stats.services, period, now), [stats.services, period, now]);
  const highlight = month ?? bars.length - 1;
  const sinceYear = getYear(parseISO(client.since));
  const contact = stripTitle(client.contactName);

  const openWhatsapp = () => {
    window.open(whatsappLink(client.contactPhone, `Hola ${firstName(contact)}, le saluda Pulkro Compañía de Servicios.`), "_blank", "noopener,noreferrer");
    toast("Se abrió WhatsApp", { description: "El envío es manual: no se confirma la entrega." });
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Clientes", href: "/clientes" }, { label: client.shortName }]}
        title={
          <span className="inline-flex items-center gap-4">
            <ClientMark name={client.name} hue={client.hue} size={52} className="rounded-[15px] shadow-soft" />
            <span>{client.name}</span>
          </span>
        }
        meta={
          <MetaList>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-[6px] rounded-full bg-st-teal" />
              Cliente desde {sinceYear}
            </span>
            <span>{client.segment}</span>
            <span>{plural(stats.sites.length, "sitio", "sitios")}</span>
            <span>
              Contacto: <span className="font-medium text-ink">{client.contactName}</span>
            </span>
          </MetaList>
        }
        actions={
          <>
            <Button variant="outline" onClick={openWhatsapp} className={outlineBtnCls}>
              <MessageCircle /> WhatsApp
            </Button>
            <Button asChild variant="outline" className={outlineBtnCls}>
              <a href={`tel:${client.contactPhone.replace(/\s/g, "")}`}>
                <Phone /> Llamar
              </a>
            </Button>
            <Gate allowed={canCreate} reason={REASON_ORDER_CREATE}>
              {canCreate ? (
                <Button asChild className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
                  <Link href={`/ordenes/nueva?cliente=${client.id}`}>
                    <Plus /> Nueva orden
                  </Link>
                </Button>
              ) : (
                <Button disabled className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
                  <Plus /> Nueva orden
                </Button>
              )}
            </Gate>
          </>
        }
      />

      <AuroraPanel className="p-3 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
          <GlassCard className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
              <div className="flex min-w-0 flex-1 basis-[9.5rem] items-center gap-3">
                <IconTile>
                  <Building />
                </IconTile>
                <span className="text-[15px] font-medium leading-snug text-ink sm:truncate sm:leading-normal">Servicios para {client.shortName}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-[#f2f4f7] px-3 text-[14px] font-medium text-ink outline-none transition hover:bg-[#e9edf2]">
                  {PERIOD_LABEL[period]}
                  <ChevronDown className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(PERIOD_LABEL) as ClientPeriod[]).map((p) => (
                    <DropdownMenuItem
                      key={p}
                      className={menuItemCls}
                      onClick={() => {
                        setPeriod(p);
                        setMonth(null);
                      }}
                    >
                      {PERIOD_LABEL[p]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <AnimatedNumber value={stats.services.length} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]" />
              <span className="mb-2 text-[15px] text-subtle">servicios</span>
            </div>
            <p className="mt-4 text-[14px] text-subtle">
              <span className="font-medium text-ink">{fmtHours(stats.minutes)}</span> reales ·{" "}
              <span className="font-medium text-ink">{fmtPct(stats.services.length ? stats.surveyed / stats.services.length : 0)}</span> con encuesta · de{" "}
              {plural(stats.programmed, "programado", "programados")}
            </p>
            <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
              <MiniStat tone="blue" label="Abiertas" value={<AnimatedNumber value={stats.openOrders.length} />} sub="órdenes" className="pr-3" />
              <MiniStat
                tone="teal"
                label="Satisfacción"
                value={stats.csatCount ? <AnimatedNumber value={stats.csat} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} /> : "—"}
                sub="/ 5"
                className="px-3 sm:px-5"
              />
              <MiniStat tone="red" label="Quejas" value={<AnimatedNumber value={stats.cases.length} />} sub={`${stats.openCases} abiertas`} className="pl-3 sm:pl-5" />
            </div>
          </GlassCard>

          <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0">
            <p className="text-[14px] font-medium text-ink/70">Servicios por mes · {PERIOD_LABEL[period].toLowerCase()}</p>
            <AnimatedNumber value={bars[highlight]?.value ?? 0} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
            <p className="mt-2 text-[14px] text-ink/70">
              en {bars[highlight] ? MONTHS_LONG[Number(bars[highlight].key.slice(5)) - 1].toLowerCase() : "—"} · {plural(allTime.services.length, "servicio", "servicios")} en total con Pulkro
            </p>
            <PillBars key={period} data={bars} highlight={highlight} onSelect={setMonth} className="mt-6 flex-1" height={200} />
          </div>
        </div>
      </AuroraPanel>

      <section className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 space-y-10 lg:border-r lg:border-hairline lg:pr-10">
          <ClientOpenOrders orders={stats.openOrders} jornadas={jornadas} now={now} />
          <ClientHistory stats={allTime} jornadas={jornadas} surveys={surveys} cases={cases} photos={photos} />
        </div>
        <div className="min-w-0 lg:pl-10">
          <ClientAside stats={allTime} surveys={surveys} />
        </div>
      </section>
    </div>
  );
}
