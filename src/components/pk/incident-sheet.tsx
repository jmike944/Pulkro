"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleHelp, Clock, Hammer, MessageSquareWarning, PackageX, PlusCircle, UserX, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useMediaQuery } from "@/lib/hooks";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import type { IncidentType, Severity } from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Segmented } from "./page";
import { PhotoCaptureButtons } from "./photo-capture";
import { PhotoThumb } from "./scene-photo";

export const INCIDENT_ICONS: Record<IncidentType, LucideIcon> = {
  danos: Hammer,
  faltante_material: PackageX,
  faltante_personal: UserX,
  trabajo_adicional: PlusCircle,
  retraso_ausencia: Clock,
  solicitud_queja: MessageSquareWarning,
  otra: CircleHelp,
};

/**
 * Register an incident (doc §4.2): type, severity, description, photos, and whether it blocks closure.
 * Shared by the field screen, order detail and the incidents page.
 */
export function IncidentSheet({
  orderId,
  jornadaId,
  open,
  onOpenChange,
  onCreated,
}: {
  orderId: string;
  jornadaId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (incidentId: string) => void;
}) {
  const order = useAppStore((s) => s.orders.find((o) => o.id === orderId));
  const allJornadas = useAppStore((s) => s.jornadas);
  const allPhotos = useAppStore((s) => s.photos);
  const addIncident = useAppStore((s) => s.addIncident);
  const updateIncident = useAppStore((s) => s.updateIncident);
  const updatePhoto = useAppStore((s) => s.updatePhoto);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const jornadas = useMemo(() => allJornadas.filter((j) => j.orderId === orderId).sort((a, b) => a.dayIndex - b.dayIndex), [allJornadas, orderId]);
  const [type, setType] = useState<IncidentType>("faltante_material");
  const [severity, setSeverity] = useState<Severity>("media");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState(false);
  const [jId, setJId] = useState<string | undefined>(jornadaId);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const photos = allPhotos.filter((p) => photoIds.includes(p.id));

  useEffect(() => {
    if (open) {
      setType("faltante_material");
      setSeverity("media");
      setDescription("");
      setBlocks(false);
      setPhotoIds([]);
      setJId(jornadaId ?? jornadas.find((j) => j.status === "en_curso")?.id ?? jornadas.at(-1)?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!order) return null;

  const cancel = () => {
    photoIds.forEach((id) => deletePhoto(id)); // discard draft photos
    onOpenChange(false);
  };

  const save = () => {
    if (description.trim().length < 6) {
      toast.error("Describe la incidencia (mínimo 6 caracteres)");
      return;
    }
    const inc = addIncident({ orderId, jornadaId: jId, type, severity, description: description.trim(), photoIds, blocksClosure: blocks });
    photoIds.forEach((pid) => updatePhoto(pid, { incidentId: inc.id }));
    if (photoIds.length) updateIncident(inc.id, { photoIds });
    toast.success(`Incidencia ${inc.folio} registrada`, { description: blocks ? "La orden quedó marcada “Con incidencia”." : undefined });
    onCreated?.(inc.id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(v) : cancel())}>
      <SheetContent side={isDesktop ? "right" : "bottom"} className={cn("gap-0 p-0", isDesktop ? "w-full sm:max-w-[480px]" : "max-h-[92dvh] rounded-t-[24px]")}>
        <SheetHeader className="border-b border-hairline p-6">
          <SheetTitle className="font-serif text-[26px] font-medium">Registrar incidencia</SheetTitle>
          <SheetDescription>
            {order.folio} · {order.title}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <Label className="mb-3 block text-[13px] text-subtle">Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(INCIDENT_TYPE) as IncidentType[]).map((t) => {
                const meta = INCIDENT_TYPE[t];
                const Icon = INCIDENT_ICONS[t];
                const active = type === t;
                return (
                  <motion.button
                    key={t}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setType(t)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[14px] border p-3 text-left text-[13.5px] transition",
                      active ? "border-transparent bg-[#f2f8fe] font-semibold text-ink ring-2 ring-[#1667e0]" : "border-hairline text-ink hover:bg-muted",
                    )}
                  >
                    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]", toneSoftBg[meta.tone], toneText[meta.tone])}>
                      <Icon className="size-4" />
                    </span>
                    <span className="leading-tight">{meta.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="text-[13px] text-subtle">Severidad</Label>
            <Segmented
              id="sev"
              items={(Object.keys(SEVERITY) as Severity[]).map((s) => ({ value: s, label: SEVERITY[s].label }))}
              value={severity}
              onChange={setSeverity}
            />
          </div>

          {jornadas.length > 1 && (
            <div>
              <Label className="mb-2 block text-[13px] text-subtle">Jornada</Label>
              <div className="flex flex-wrap gap-2">
                {jornadas.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setJId(j.id)}
                    className={cn("rounded-[10px] border px-3 py-1.5 text-[13px]", jId === j.id ? "border-ink bg-ink text-white" : "border-hairline hover:bg-muted")}
                  >
                    Jornada {j.dayIndex}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="inc-desc" className="mb-2 block text-[13px] text-subtle">
              Descripción
            </Label>
            <Textarea
              id="inc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué pasó, dónde y qué se hizo al respecto?"
              className="min-h-[110px] rounded-[14px] text-[15px]"
            />
          </div>

          <div>
            <Label className="mb-2 block text-[13px] text-subtle">Fotos</Label>
            <PhotoCaptureButtons
              compact
              meta={{ orderId, jornadaId: jId, kind: "incidencia", area: INCIDENT_TYPE[type].label, serviceTypeId: order.serviceTypeId, selectedForReport: true }}
              onCaptured={(ids) => setPhotoIds((p) => [...p, ...ids])}
            />
            <AnimatePresence>
              {photos.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <PhotoThumb key={p.id} photo={p} meta={false} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-[16px] bg-[#fdf3f3] p-4">
            <span className="text-[14px]">
              <span className="block font-semibold text-ink">Impide el cierre</span>
              <span className="text-subtle">La orden pasa a “Con incidencia” hasta resolverla.</span>
            </span>
            <Switch checked={blocks} onCheckedChange={setBlocks} />
          </label>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-hairline p-4">
          <Button variant="outline" onClick={cancel} className="h-11 rounded-[12px] px-5">
            Cancelar
          </Button>
          <Button onClick={save} className="h-11 rounded-[12px] px-5 font-semibold">
            Registrar incidencia
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
