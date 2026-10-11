"use client";

import { useAppStore, useCurrentUser, useLookups, useScopedAudit } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { PageHeader } from "@/components/pk/page";
import { AuditLog } from "./audit-log";

/**
 * /bitacora — every change the current role may read (useScopedAudit: visible orders plus the catalog / user records in scope;
 * supervisors only their own orders and actions), with who made it, when and why. Excel export follows `export.excel`.
 */
export function BitacoraView() {
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const lk = useLookups();
  const audit = useScopedAudit();

  const scope =
    user.role === "administracion"
      ? (lk.units.get(user.unitId)?.name ?? "Su unidad")
      : user.role === "direccion"
        ? unitFilter === "all"
          ? "Todas las unidades"
          : (lk.units.get(unitFilter)?.name ?? "Unidad seleccionada")
        : null;

  const description =
    user.role === "supervisor" ? (
      <>
        <b>{plural(audit.length, "movimiento", "movimientos")}</b> en sus órdenes asignadas y los que usted registró. Cada cambio guarda usuario, hora y motivo.
      </>
    ) : (
      <>
        {scope}: <b>{plural(audit.length, "movimiento", "movimientos")}</b> en la bitácora. Cada cambio guarda usuario, hora y motivo.
      </>
    );

  return (
    <div>
      <PageHeader title="Bitácora" description={description} />
      <AuditLog />
    </div>
  );
}
