"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, HardDrive, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, useCurrentUser, useLookups, useScopedAudit, useScopedData, useShallow } from "@/lib/hooks";
import { can } from "@/lib/permissions";
import { downloadBlob } from "@/lib/export";
import { fmtNum } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/status";
import { KeyValues, ProgressLine } from "@/components/pk/bits";
import { DemoResetDialog } from "@/components/shell/demo-reset-dialog";
import { useDemoControls } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import { ReadOnlyNote, fmtBytes } from "./shared";
import { SqueegeeWipe } from "./squeegee-wipe";

type Estimate = { usage: number; quota: number };

/** Browser storage estimate + persistence flag (StorageManager API, where available). */
function useStorageInfo(refresh: number) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.storage?.estimate;
  useEffect(() => {
    let alive = true;
    const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
    sm?.estimate?.()
      .then((e) => alive && setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
    sm?.persisted?.()
      .then((p) => alive && setPersisted(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refresh]);
  return { estimate, persisted, supported };
}

/** Right column of the Sincronización tab: storage, record counts, backup and demo reset. */
export function DeviceData() {
  const user = useCurrentUser();
  const demo = useDemoControls();
  const lk = useLookups();
  // Raw slices only feed the backup's catalogs (which are filtered by unit below); every count on screen is scoped.
  const data = useAppStore(
    useShallow((s) => ({
      units: s.units, users: s.users, workers: s.workers, clients: s.clients, sites: s.sites, serviceTypes: s.serviceTypes,
      materials: s.materials, meta: s.meta,
    })),
  );
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const scoped = useScopedData();
  const audit = useScopedAudit();
  const canBackup = can(user.role, "export.backup");
  const [refresh, setRefresh] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wipe, setWipe] = useState(0);
  const { estimate, persisted, supported } = useStorageInfo(refresh);

  const captured = useMemo(() => scoped.photos.filter((p) => p.source.type === "idb").length, [scoped.photos]);

  const exportBackup = () => {
    if (!canBackup) return;
    const full = user.role === "direccion" && unitFilter === "all";
    const unitScope = user.role === "direccion" ? unitFilter : user.unitId;
    const inUnit = <T extends { unitId: string }>(xs: T[]) => (unitScope === "all" ? xs : xs.filter((x) => x.unitId === unitScope));
    const clients = inUnit(data.clients);
    const clientIds = new Set(clients.map((c) => c.id));
    const scopeLabel =
      user.role === "supervisor"
        ? `Órdenes asignadas a ${user.name}`
        : unitScope === "all"
          ? "Todas las unidades"
          : `Unidad ${lk.units.get(unitScope)?.name ?? unitScope}`;
    const snapshot = {
      app: "Pulkro Cuadrillas",
      tipo: "respaldo-local",
      generadoEl: new Date().toISOString(),
      generadoPor: { id: user.id, nombre: user.name, rol: ROLE_LABEL[user.role] },
      alcance: scopeLabel,
      versionDatos: data.meta.seedVersion,
      nota: "Las fotografías capturadas con cámara viven en el almacenamiento del dispositivo y no se incluyen; solo su referencia.",
      catalogos: {
        unidades: full ? data.units : data.units.filter((u) => u.id === unitScope),
        usuarios: full ? data.users : inUnit(data.users).map(({ id, name, role, title, unitId }) => ({ id, name, role, title, unitId })),
        personal: inUnit(data.workers),
        clientes: clients,
        sitios: data.sites.filter((s) => clientIds.has(s.clientId)),
        tiposDeServicio: data.serviceTypes,
        materiales: data.materials,
      },
      datos: {
        ordenes: scoped.orders,
        jornadas: scoped.jornadas,
        fotos: scoped.photos,
        incidencias: scoped.incidents,
        reportes: scoped.reports,
        casos: scoped.cases,
        encuestas: scoped.surveys,
        bitacora: audit,
      },
    };
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `pulkro-respaldo-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`);
    toast.success("Respaldo descargado", { description: `${fmtNum(scoped.orders.length)} órdenes · ${fmtBytes(blob.size)} · ${scopeLabel}` });
  };

  const requestPersist = async () => {
    const ok = await navigator.storage?.persist?.().catch(() => false);
    setRefresh((r) => r + 1);
    if (ok) toast.success("Datos protegidos", { description: "El navegador no borrará la información local por falta de espacio." });
    else toast("El navegador no concedió el almacenamiento persistente", { description: "Instalar la app en el teléfono suele habilitarlo." });
  };

  const usagePct = estimate && estimate.quota ? estimate.usage / estimate.quota : 0;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Almacenamiento local</h2>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-tile text-ink">
            <HardDrive className="size-4" />
          </span>
        </div>
        <p className="mb-5 text-[13.5px] text-subtle">Base de datos del navegador (IndexedDB) en este dispositivo.</p>
        {supported ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-[30px] font-medium tracking-[-0.03em] text-ink tabular">{estimate ? fmtBytes(estimate.usage) : "…"}</span>
              <span className="text-[13.5px] text-subtle">de {estimate ? fmtBytes(estimate.quota) : "…"} disponibles</span>
            </p>
            <ProgressLine value={Math.max(0.015, usagePct)} className="mt-3" tone={usagePct > 0.8 ? "red" : "blue"} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
              <span className="flex items-center gap-2 text-subtle">
                <ShieldCheck className={persisted ? "size-4 text-teal-fg" : "size-4 text-faint"} />
                {persisted === null ? "Comprobando protección…" : persisted ? "Protegido contra borrado automático" : "El navegador puede liberar estos datos si falta espacio"}
              </span>
              {persisted === false && (
                <Button variant="outline" onClick={requestPersist} className="h-10 rounded-[12px] border-line px-4 font-semibold">
                  Proteger datos
                </Button>
              )}
            </div>
            {persisted === false && (
              <p role="note" className="mt-3 rounded-[14px] bg-amber-soft px-4 py-3 text-[13.5px] leading-snug text-amber-olive-ink">
                Los datos sin enviar podrían borrarse si el teléfono se queda sin espacio o si no abre la app en varios días. Instale la app
                en el teléfono (en iPhone: Compartir › Agregar a pantalla de inicio) y envíe lo capturado en cuanto tenga conexión.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-[14px] bg-soft px-4 py-3 text-[13.5px] text-subtle">Este navegador no informa el espacio usado.</p>
        )}
      </section>

      <section>
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Sus registros en este dispositivo</p>
        <KeyValues
          rows={[
            { k: "Órdenes", v: fmtNum(scoped.orders.length) },
            { k: "Jornadas", v: fmtNum(scoped.jornadas.length) },
            { k: "Fotografías", v: <>{fmtNum(scoped.photos.length)} <span className="font-normal text-subtle">· {fmtNum(captured)} con cámara</span></> },
            { k: "Incidencias", v: fmtNum(scoped.incidents.length) },
            { k: "Reportes", v: fmtNum(scoped.reports.length) },
            { k: "Casos y encuestas", v: fmtNum(scoped.cases.length + scoped.surveys.length) },
            { k: "Movimientos en bitácora", v: fmtNum(audit.length) },
          ]}
        />
      </section>

      <section className="space-y-3">
        {canBackup ? (
          <>
            <Button onClick={exportBackup} className="h-11 w-full rounded-[12px] text-[14.5px] font-semibold">
              <Download className="size-4" /> Exportar respaldo (JSON)
            </Button>
            <p className="text-center text-[12.5px] text-subtle">
              Incluye solo la información que su rol puede ver
              {/* the global unit filter narrows Dirección's backup, and on a phone that filter is easy to forget */}
              {user.role === "direccion" && <> · alcance: {unitFilter === "all" ? "todas las unidades" : (lk.units.get(unitFilter)?.name ?? unitFilter)}</>}.
            </p>
          </>
        ) : (
          <ReadOnlyNote>Solo Dirección y Administración exportan respaldos de los datos.</ReadOnlyNote>
        )}
        {demo && (
          <Button variant="outline" onClick={() => setConfirmReset(true)} className="h-11 w-full rounded-[12px] border-line text-[14.5px] font-semibold text-red-fg hover:text-red-fg">
            <RotateCcw className="size-4" /> Restablecer datos de demostración
          </Button>
        )}
      </section>

      {/* the same confirmation the sidebar and Perfil use; it refuses while records are unsynced */}
      <DemoResetDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        // the wipe starts first and the dialog replaces the data under it, so the transition covers the change
        onBeforeReset={() => setWipe((w) => w + 1)}
        onDone={() => setRefresh((r) => r + 1)}
      />

      <SqueegeeWipe trigger={wipe} />
    </div>
  );
}
