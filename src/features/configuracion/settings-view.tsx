"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CircleHelp } from "lucide-react";
import { useCan, useCurrentUser, useScopedAudit, useScopedCatalog, useScopedData, useSyncSummary } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { PageHeader, UnderlineTabs, type TabItem } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "./profile-card";
import { UsersTab } from "./users-tab";
import { CatalogsTab } from "./catalogs-tab";
import { SyncTab } from "./sync-tab";
import { AuditTab } from "./audit-tab";
import { PrivacyTab } from "./privacy-tab";
import { useCatalogUnit } from "./use-catalog-unit";

export type SettingsTab = "usuarios" | "catalogos" | "sincronizacion" | "auditoria" | "privacidad";

/** /configuracion — settings, catalogs, offline data, audit log and privacy (doc §2, §4.1, §6). */
export function SettingsView() {
  const user = useCurrentUser();
  const canUsers = useCan("users.admin");
  const canCatalogs = useCan("catalogs.admin");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Counts come from what the role may see (doc §2): never the whole company's users, units or clients.
  const { users, units, clients, sites } = useScopedCatalog();
  const { pending } = useSyncSummary();
  const { orders } = useScopedData();
  const audit = useScopedAudit();

  const tabs = useMemo(() => {
    const out: (TabItem & { value: SettingsTab })[] = [];
    if (canUsers) out.push({ value: "usuarios", label: "Usuarios y permisos", count: users.length });
    if (canCatalogs) out.push({ value: "catalogos", label: "Catálogos" });
    out.push({ value: "sincronizacion", label: "Sincronización y datos", count: pending.length || undefined });
    out.push({ value: "auditoria", label: "Bitácora", count: audit.length > 999 ? "999+" : audit.length });
    out.push({ value: "privacidad", label: "Privacidad" });
    return out;
  }, [canUsers, canCatalogs, users.length, pending.length, audit.length]);

  const requested = params.get("tab");
  const tab: SettingsTab = (tabs.find((t) => t.value === requested)?.value ?? tabs[0].value) as SettingsTab;

  const setTab = (v: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", v);
    if (v !== "catalogos") sp.delete("cat");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const catalogUnit = useCatalogUnit();
  const activeUsers = users.filter((u) => u.active).length;
  const description =
    user.role === "supervisor" ? (
      <>
        Tu dispositivo guarda <b>{plural(orders.length, "orden asignada", "órdenes asignadas")}</b>
        {pending.length > 0 ? (
          <>
            {" "}y <b>{plural(pending.length, "registro", "registros")}</b> esperan sincronizar.
          </>
        ) : (
          <> y todo está sincronizado.</>
        )}{" "}
        Revisa tu bitácora y el aviso de privacidad.
      </>
    ) : (
      <>
        <b>{plural(activeUsers, "usuario activo", "usuarios activos")}</b> en <b>{plural(units.length, "unidad", "unidades")}</b>,{" "}
        <b>{plural(clients.length, "cliente", "clientes")}</b> con <b>{plural(sites.length, "sitio", "sitios")}</b> en catálogo
        {catalogUnit !== "all" && <> de {units.find((u) => u.id === catalogUnit)?.name ?? "tu unidad"}</>}.
        {pending.length > 0 && (
          <>
            {" "}
            <b>{plural(pending.length, "registro", "registros")}</b> esperan sincronizar.
          </>
        )}
      </>
    );

  return (
    <div>
      <PageHeader
        title="Configuración"
        description={description}
        actions={
          <Button asChild variant="outline" className="h-10 rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
            <Link href="/ayuda">
              <CircleHelp className="size-4" /> Centro de ayuda
            </Link>
          </Button>
        }
      />

      <ProfileCard />

      <UnderlineTabs id="settings-tabs" items={tabs} value={tab} onChange={setTab} className="mt-8" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="pt-8"
        >
          {tab === "usuarios" && <UsersTab />}
          {tab === "catalogos" && <CatalogsTab />}
          {tab === "sincronizacion" && <SyncTab />}
          {tab === "auditoria" && <AuditTab />}
          {tab === "privacidad" && <PrivacyTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
