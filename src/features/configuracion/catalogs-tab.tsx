"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore, useCan, useShallow } from "@/lib/hooks";
import { Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { DocTag, NO_CATALOGS, ReadOnlyNote } from "./shared";
import { useCatalogUnit } from "./use-catalog-unit";
import { ClientsCatalog } from "./catalog-clients";
import { ServiceTypesCatalog } from "./catalog-service-types";
import { MaterialsCatalog } from "./catalog-materials";
import { WorkersCatalog } from "./catalog-workers";

type CatalogKey = "clientes" | "servicios" | "materiales" | "personal";

export function CatalogsTab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canEdit = useCan("catalogs.admin");
  const unit = useCatalogUnit();
  const { clients, serviceTypes, materials, workers } = useAppStore(
    useShallow((s) => ({ clients: s.clients, serviceTypes: s.serviceTypes, materials: s.materials, workers: s.workers })),
  );

  const counts = useMemo(
    () => ({
      clientes: clients.filter((c) => unit === "all" || c.unitId === unit).length,
      servicios: serviceTypes.length,
      materiales: materials.length,
      personal: workers.filter((w) => unit === "all" || w.unitId === unit).length,
    }),
    [clients, serviceTypes, materials, workers, unit],
  );

  const raw = params.get("cat");
  const cat: CatalogKey = raw === "servicios" || raw === "materiales" || raw === "personal" ? raw : "clientes";
  const setCat = (v: CatalogKey) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", "catalogos");
    sp.set("cat", v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none -mx-1 overflow-x-auto px-1 pb-1">
          <Segmented<CatalogKey>
            id="catalog-tabs"
            value={cat}
            onChange={setCat}
            items={[
              { value: "clientes", label: `Clientes y sitios · ${counts.clientes}` },
              { value: "servicios", label: `Tipos de servicio · ${counts.servicios}` },
              { value: "materiales", label: `Materiales · ${counts.materiales}` },
              { value: "personal", label: `Personal · ${counts.personal}` },
            ]}
            className="whitespace-nowrap"
          />
        </div>
        <p className="flex items-center gap-2 text-[13px] text-subtle">
          <DocTag status="pendiente" /> Catálogos por definir con Pulkro; el prototipo los propone editables.
        </p>
      </div>

      {!canEdit && <ReadOnlyNote className="mt-5">{NO_CATALOGS}</ReadOnlyNote>}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={cat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25, ease: EASE }} className="mt-8">
          {cat === "clientes" && <ClientsCatalog />}
          {cat === "servicios" && <ServiceTypesCatalog />}
          {cat === "materiales" && <MaterialsCatalog />}
          {cat === "personal" && <WorkersCatalog />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
