"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowRight, Camera, ChevronLeft, CircleHelp, Clock, Hammer, ImagePlus, Loader2, MessageSquareWarning, PackageX, PlusCircle, UserX, Wand2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attempt, PermissionDeniedError, useAppStore } from "@/lib/store";
import { useDemoSession } from "@/lib/hooks";
import type { CaptureInput } from "@/lib/photo-store";
import { useMediaQuery, useOrderBundle, type OrderBundle } from "@/lib/hooks";
import { fmtDay, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneDot, toneSoftBg, toneText } from "@/lib/status";
import type { Incident, IncidentType, Jornada, OrderStatus, Photo, Severity } from "@/lib/types";
import { TEXT_LIMITS } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ClientMark } from "./client-mark";
import { BigButton, FlowHeading, FlowScreen, ItemCard, SuccessHero } from "./mobile";
import { MODAL_DESKTOP_QUERY, ModalCancel, ModalShell, firstMissing } from "./modal-shell";
import { EASE } from "./motion";
import { usePhotoCapture, type CaptureMeta } from "./photo-capture";
import { ReasonField, reasonOk } from "./reason-field";
import { PhotoThumb } from "./scene-photo";
import { OrderStatusPill, TonePill } from "./status";

const NO_JORNADAS: Jornada[] = [];
const TYPES = Object.keys(INCIDENT_TYPE) as IncidentType[];
const SEVERITIES = Object.keys(SEVERITY) as Severity[];

/** Shorter descriptions are not registered (same rule as before the redesign). */
const DESCRIPTION_MIN = 6;
const DESCRIPTION_HINT = `Describa lo ocurrido (mínimo ${DESCRIPTION_MIN} caracteres)`;
const CAPTURING_HINT = "Espere a que termine de guardarse la foto";

const LABEL = "mb-2.5 block text-[13px] font-semibold text-ink";

export const INCIDENT_ICONS: Record<IncidentType, LucideIcon> = {
  danos: Hammer,
  faltante_material: PackageX,
  faltante_personal: UserX,
  trabajo_adicional: PlusCircle,
  retraso_ausencia: Clock,
  solicitud_queja: MessageSquareWarning,
  otra: CircleHelp,
};

type Step = "orden" | "tipo" | "detalle" | "listo";
type Created = Pick<Incident, "id" | "folio" | "type" | "blocksClosure"> & { photos: number };

const PHONE_DESCRIPTION: Record<Step, string> = {
  orden: "Elegir la orden donde ocurrió la incidencia",
  tipo: "Tipo y severidad de la incidencia",
  detalle: "Descripción y fotos de la incidencia",
  listo: "Incidencia registrada",
};

/** Steps slide in the direction of travel: forward from the right, back from the left. */
const STEP_MOTION: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28 }),
};

/**
 * "Registrar incidencia" (doc §4.2): type, severity, jornada, description, photos and whether it blocks closure.
 * Shared by the field screen, order detail and the incidents page.
 *
 *   phone / tablet (< lg)  one FlowScreen: [orden] → tipo y severidad → descripción y fotos → success
 *   desktop (≥ lg)         centered dialog (ModalShell, like Nuevo caso): [orden] → the whole form on one page; toast + `onCreated`
 *
 * The order step only exists when no `orderId` is given and `pickOrder` draws the choices. Unsaved photos or text
 * ask "¿Descartar cambios?" before Esc / X / Cancelar throw them away, and draft photos are deleted when the draft is.
 */
export function IncidentSheet({
  orderId,
  jornadaId,
  open,
  onOpenChange,
  onCreated,
  pickOrder,
  doneLabel = "Volver",
}: {
  orderId?: string;
  jornadaId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** After the incident is saved: right away on desktop; on phones when the success screen closes. */
  onCreated?: (incidentId: string) => void;
  /** No fixed order: the flow opens on an order step. Render the choices and call `pick(orderId)` to continue. */
  pickOrder?: (pick: (orderId: string) => void, currentId: string | null) => React.ReactNode;
  /** Button of the phone success screen (it also runs `onCreated`, so name where that leads). */
  doneLabel?: string;
}) {
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const addIncident = useAppStore((s) => s.addIncident);
  const updateIncident = useAppStore((s) => s.updateIncident);
  const updatePhoto = useAppStore((s) => s.updatePhoto);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const { capture, simulate } = usePhotoCapture();
  const demo = useDemoSession();

  const choosing = !orderId && !!pickOrder;
  const [picked, setPicked] = useState<string | null>(null);
  // Scoped read (doc §2): an order outside the role's scope resolves to null, whoever mounts the flow.
  const bundle = useOrderBundle(orderId ?? picked ?? "");
  const order = bundle?.order;
  const jornadas = bundle?.jornadas ?? NO_JORNADAS;

  const [step, setStep] = useState<Step>(choosing ? "orden" : "tipo");
  const [dir, setDir] = useState(1);
  const [type, setType] = useState<IncidentType>("faltante_material");
  const [severity, setSeverity] = useState<Severity>("media");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState(false);
  const [jId, setJId] = useState<string | undefined>(jornadaId);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [created, setCreated] = useState<Created | null>(null);
  /** Captures still being saved (compressing, reading the position). Their photos join the draft only when they finish. */
  const [capturing, setCapturing] = useState(0);
  /** Changes whenever the draft is thrown away (the flow opens or closes, another order is picked): a capture that
   *  finishes under an older value belongs to a draft that no longer exists, so its photos are deleted.
   *  Bumped in an effect (never in `applyPick`): `pickOrder` receives `choose` during render. */
  const draftRef = useRef(0);
  /** Another order tapped while photos of the current one exist: confirm before they are deleted. The snapshot keeps
   *  the dialog's text intact while it animates out. */
  const [switchAsk, setSwitchAsk] = useState<{ to: string; open: boolean; folio: string; photos: Photo[] } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Every time the flow opens it starts from a clean draft (state adjusted during render, not in an effect).
  // Closing changes nothing, so the last screen stays intact while it animates out.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(choosing ? "orden" : "tipo");
      setDir(1);
      setType("faltante_material");
      setSeverity("media");
      setDescription("");
      setBlocks(false);
      setJId(jornadaId);
      setPhotoIds([]);
      setPicked(null);
      setCreated(null);
      setSwitchAsk(null);
    }
  }

  const orderKey = order?.id;
  useEffect(() => {
    draftRef.current += 1;
  }, [open, orderKey]);

  // The jornada defaults to the one in progress, else the last one (until the user picks another).
  const jornadaIdNow = jId ?? (jornadas.find((j) => j.status === "en_curso") ?? jornadas.at(-1))?.id;
  const jornada = jornadas.find((j) => j.id === jornadaIdNow);
  const photos = photoIds.map((id) => bundle?.photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);
  const descOk = reasonOk(description, DESCRIPTION_MIN);
  const capturingNow = capturing > 0;
  const canSave = descOk && !capturingNow && !created;
  const saveHint = firstMissing([!descOk, DESCRIPTION_HINT], [capturingNow, CAPTURING_HINT]);
  // A photo still being saved counts as unsaved work too: leaving then asks first (and its photo is deleted when it lands).
  const dirty = step !== "listo" && (photoIds.length > 0 || capturingNow || description.trim().length > 0);

  if (!order && !choosing) return null;
  // Without an order (none picked yet, or it left the role's scope) only the order step makes sense.
  const view: Step = order ? step : "orden";

  const go = (next: Step, direction: 1 | -1) => {
    setDir(direction);
    setStep(next);
  };

  /** The step that leaves is gone: start the next one at the top of the scroller. */
  const scrollToTop = () => {
    for (let el = topRef.current?.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop = 0;
        return;
      }
    }
  };

  /** Every close goes through here (the discard guard already asked when there was unsaved work). */
  const close = (v: boolean) => {
    if (v) return onOpenChange(true);
    if (created) onCreated?.(created.id);
    else photoIds.forEach((id) => deletePhoto(id)); // draft photos never outlive the draft
    onOpenChange(false);
  };

  const applyPick = (id: string) => {
    if (id !== picked) setJId(undefined); // a different order brings its own jornadas
    setPicked(id);
    go("tipo", 1);
  };
  const choose = (id: string) => {
    if (order && picked && id !== picked && photoIds.length > 0) setSwitchAsk({ to: id, open: true, folio: order.folio, photos });
    else applyPick(id);
  };
  const closeSwitchAsk = () => setSwitchAsk((x) => x && { ...x, open: false });
  const confirmSwitch = () => {
    photoIds.forEach((id) => deletePhoto(id)); // they were taken for the previous order
    setPhotoIds([]);
    if (switchAsk) applyPick(switchAsk.to);
    closeSwitchAsk();
  };

  const removePhoto = (id: string) => {
    deletePhoto(id);
    // The store refuses (and says why) when the photo can't be edited: then it stays in the draft.
    if (!useAppStore.getState().photos.some((p) => p.id === id)) setPhotoIds((xs) => xs.filter((x) => x !== id));
  };

  const photoMeta: CaptureMeta | undefined = order && {
    orderId: order.id,
    jornadaId: jornadaIdNow,
    kind: "incidencia",
    area: INCIDENT_TYPE[type].label,
    serviceTypeId: order.serviceTypeId,
    selectedForReport: true,
  };

  /** Saves the picked files; Registrar waits for it, so the photos are in `photoIds` before the incident is created. */
  const addFiles = async (files: File[], input: CaptureInput) => {
    if (!photoMeta) return;
    const draft = draftRef.current;
    setCapturing((n) => n + 1);
    try {
      const ids = await capture(files, photoMeta, input);
      if (draft === draftRef.current) setPhotoIds((xs) => [...xs, ...ids]);
      else ids.forEach((id) => deletePhoto(id)); // the draft was discarded meanwhile: its photos never outlive it
    } finally {
      setCapturing((n) => n - 1);
    }
  };

  const addSample = () => {
    if (!photoMeta) return;
    try {
      const id = simulate(photoMeta);
      setPhotoIds((xs) => [...xs, id]);
      toast.success("Foto de ejemplo agregada");
    } catch (e) {
      if (!(e instanceof PermissionDeniedError)) throw e;
    }
  };

  const save = () => {
    // Once created (phone success screen) the form can never submit a second incident, whatever the breakpoint.
    if (!order || !canSave) return;
    // A refusal was already toasted by the store: keep the draft.
    const inc = attempt(() =>
      addIncident({ orderId: order.id, jornadaId: jornadaIdNow, type, severity, description: description.trim(), photoIds, blocksClosure: blocks }),
    );
    if (!inc) return;
    photoIds.forEach((pid) => updatePhoto(pid, { incidentId: inc.id }));
    if (photoIds.length) updateIncident(inc.id, { photoIds });
    if (isDesktop) {
      toast.success(`Incidencia ${inc.folio} registrada`, { description: blocks ? "La orden quedó marcada “Con incidencia”." : undefined });
      onCreated?.(inc.id);
      onOpenChange(false);
      return;
    }
    setCreated({ id: inc.id, folio: inc.folio, type: inc.type, blocksClosure: inc.blocksClosure, photos: photoIds.length });
    go("listo", 1);
  };

  /* ───────────── shared pieces ───────────── */

  const typeFields = (
    <>
      <TypePicker value={type} onChange={setType} />
      <SeverityPicker value={severity} onChange={setSeverity} />
      {jornadas.length > 1 && <JornadaPicker jornadas={jornadas} value={jornadaIdNow} onChange={setJId} />}
    </>
  );

  const detailFields = order && (
    <>
      <ReasonField
        id="inc-desc"
        label="Descripción"
        value={description}
        onChange={setDescription}
        min={DESCRIPTION_MIN}
        max={TEXT_LIMITS.description.max}
        rows={4}
        placeholder="¿Qué pasó, dónde y qué se hizo al respecto?"
        hint="Se guarda con su usuario, la fecha y la hora."
      />
      <PhotoField photos={photos} busy={capturingNow} onFiles={(files, input) => void addFiles(files, input)} onSample={demo ? addSample : undefined} onRemove={removePhoto} />
      <BlocksToggle checked={blocks} onChange={setBlocks} status={order.status} />
    </>
  );

  const switchDialog = switchAsk && (
    <ModalShell
      open={switchAsk.open}
      onOpenChange={(v) => !v && closeSwitchAsk()}
      size="sm"
      title="¿Cambiar de orden?"
      description={
        switchAsk.photos.length === 1 ? (
          <>
            La foto que tomó es de <b>{switchAsk.folio}</b> y se eliminará. La descripción se conserva.
          </>
        ) : (
          <>
            Las {switchAsk.photos.length} fotos que tomó son de <b>{switchAsk.folio}</b> y se eliminarán. La descripción se conserva.
          </>
        )
      }
      footer={
        <>
          <ModalCancel>Seguir con {switchAsk.folio}</ModalCancel>
          <Button type="button" onClick={confirmSwitch} className="h-11 rounded-[12px] bg-st-red px-5 font-semibold text-white hover:bg-st-red/90">
            {switchAsk.photos.length === 1 ? "Eliminar foto y cambiar" : "Eliminar fotos y cambiar"}
          </Button>
        </>
      }
    >
      <ul className="grid grid-cols-4 gap-2" aria-label="Fotos que se eliminarán">
        {switchAsk.photos.map((p) => (
          <li key={p.id}>
            <PhotoThumb photo={p} meta={false} flags={false} className="rounded-[12px]" />
          </li>
        ))}
      </ul>
    </ModalShell>
  );

  const stepBody = (key: string, children: React.ReactNode) => (
    <AnimatePresence mode="wait" initial={false} custom={dir} onExitComplete={scrollToTop}>
      <motion.div key={key} custom={dir} variants={STEP_MOTION} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: EASE }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );

  /** Shown once the incident exists: on phones right after saving, and on desktop when the window grew past the
   *  breakpoint with that screen open (the form must not come back: it would register the incident twice). */
  const successBody = created && order && (
    <>
      <SuccessHero title="Incidencia registrada">
        {created.blocksClosure ? (
          <>
            <b className="font-semibold text-ink">{order.folio}</b> queda “Con incidencia” y no se puede cerrar hasta resolverla.
          </>
        ) : (
          <>
            Queda abierta en <b className="font-semibold text-ink">{order.folio}</b> sin impedir el cierre.
          </>
        )}
      </SuccessHero>
      <ItemCard
        className="mt-8"
        leading={<TypeIcon type={created.type} className="size-11 rounded-[14px] [&_svg]:size-5" />}
        title={INCIDENT_TYPE[created.type].label}
        sub={`${created.folio} · ${created.photos ? plural(created.photos, "foto", "fotos") : "sin fotos"}`}
        status={
          <TonePill tone="red" live={created.blocksClosure}>
            Abierta
          </TonePill>
        }
      />
    </>
  );

  /* ───────────── desktop: centered dialog (same shape as Nuevo caso / Validar cierre) ───────────── */

  if (isDesktop) {
    const done = view === "listo";
    const form = view !== "orden" && !done && !!bundle;
    return (
      <>
        <ModalShell
          open={open}
          onOpenChange={close}
          dirty={dirty}
          desktop="dialog"
          size="lg"
          title="Registrar incidencia"
          description={
            done
              ? undefined
              : form
                ? "Queda en la bitácora de la orden con su usuario, la fecha y las fotos."
                : "Elija la orden donde ocurrió; después indicará el tipo, la severidad y las fotos."
          }
          footerHint={form ? saveHint : undefined}
          footer={
            done ? (
              <Button type="button" onClick={() => close(false)} className="h-11 rounded-[12px] px-5 font-semibold">
                {doneLabel}
              </Button>
            ) : form ? (
              <>
                <ModalCancel />
                <Button type="button" onClick={save} disabled={!canSave} className="h-11 rounded-[12px] px-5 font-semibold">
                  Registrar incidencia
                </Button>
              </>
            ) : undefined
          }
        >
          <div ref={topRef} />
          {/* Desktop swaps steps in place (no exit-then-enter slide, which left the dialog blank between steps). */}
          {done ? (
            successBody
          ) : form ? (
            <div className="space-y-7">
              <OrderLine bundle={bundle} jornada={jornada} onChange={choosing ? () => go("orden", -1) : undefined} />
              {typeFields}
              {detailFields}
            </div>
          ) : (
            pickOrder?.(choose, picked)
          )}
        </ModalShell>
        {switchDialog}
      </>
    );
  }

  /* ───────────── phone / tablet: one full-screen flow ───────────── */

  const steps = choosing ? ["Orden", "Tipo y severidad", "Descripción y fotos"] : ["Tipo y severidad", "Descripción y fotos"];
  const stepIndex = view === "orden" ? 0 : (choosing ? 1 : 0) + (view === "detalle" ? 1 : 0);
  const eyebrow = bundle && (
    <>
      <ClientMark name={bundle.client.name} hue={bundle.client.hue} size={22} className="rounded-[6px]" />
      <span className="truncate tabular">
        {bundle.order.folio}
        {jornada ? ` · Jornada ${jornada.dayIndex}` : ""}
      </span>
    </>
  );

  const footer =
    view === "listo" ? (
      <BigButton variant="outline" onClick={() => close(false)}>
        {doneLabel}
      </BigButton>
    ) : view === "tipo" ? (
      <FlowActions onBack={choosing ? () => go("orden", -1) : undefined}>
        <BigButton onClick={() => go("detalle", 1)}>Continuar</BigButton>
      </FlowActions>
    ) : view === "detalle" ? (
      <FlowActions hint={saveHint} onBack={() => go("tipo", -1)}>
        <BigButton onClick={save} disabled={!canSave}>
          Registrar incidencia
        </BigButton>
      </FlowActions>
    ) : undefined;

  return (
    <>
      <FlowScreen
        open={open}
        onOpenChange={close}
        dirty={dirty}
        title={view === "listo" ? undefined : "Registrar incidencia"}
        description={PHONE_DESCRIPTION[view]}
        footer={footer}
      >
        <div ref={topRef} />
        {view !== "listo" && <StepTrack steps={steps} current={stepIndex} />}
        {stepBody(
          view,
          view === "orden" ? (
            <>
              <FlowHeading title="¿En qué orden ocurrió?">Elija la orden; después indicará el tipo, la severidad y las fotos.</FlowHeading>
              {pickOrder?.(choose, picked)}
            </>
          ) : view === "tipo" ? (
            <>
              <FlowHeading eyebrow={eyebrow} title="¿Qué pasó?">
                Elija el tipo de incidencia y qué tan grave es.
              </FlowHeading>
              <div className="space-y-7">{typeFields}</div>
            </>
          ) : view === "detalle" ? (
            <>
              <FlowHeading eyebrow={eyebrow} title={INCIDENT_TYPE[type].label}>
                Severidad {SEVERITY[severity].label.toLowerCase()}. Describa lo ocurrido y agregue fotos como evidencia.
              </FlowHeading>
              <div className="space-y-7">{detailFields}</div>
            </>
          ) : (
            successBody
          ),
        )}
      </FlowScreen>
      {switchDialog}
    </>
  );
}

/* ───────────── pieces ───────────── */

/** Thin progress bars + "Paso 2 de 3" (the flow is a real sequence). Stays mounted so the bars fill as the user moves. */
function StepTrack({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-track">
            <motion.span
              className="block h-full origin-left rounded-full bg-brand-deep"
              initial={false}
              animate={{ scaleX: i <= current ? 1 : 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </span>
        ))}
      </div>
      <p className="shrink-0 text-[12.5px] font-medium text-subtle tabular">
        Paso {current + 1} de {steps.length}
        <span className="sr-only">: {steps[current]}</span>
      </p>
    </div>
  );
}

/** Phone footer: what is still missing, then a back chevron (when there is a step behind) and the primary action. */
function FlowActions({ hint, onBack, children }: { hint?: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <p aria-live="polite" className={cn("mb-2.5 text-center text-[13px] leading-snug text-subtle", !hint && "sr-only")}>
        {hint}
      </p>
      <div className="flex gap-2.5">
        {onBack && (
          // a square chevron keeps the whole width for the primary label ("Registrar incidencia" at 375px)
          <BigButton variant="outline" onClick={onBack} className="w-[54px] shrink-0">
            <ChevronLeft aria-hidden />
            <span className="sr-only">Volver</span>
          </BigButton>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Desktop: the order the incident goes to, with "Cambiar orden" when the flow started by choosing it. */
function OrderLine({ bundle, jornada, onChange }: { bundle: OrderBundle; jornada?: Jornada; onChange?: () => void }) {
  const { order, client } = bundle;
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-hairline p-3 pl-3.5">
      <ClientMark name={client.name} hue={client.hue} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{order.title}</p>
        <p className="truncate text-[13px] text-subtle tabular">
          {order.folio} · {client.shortName}
          {jornada ? ` · Jornada ${jornada.dayIndex}` : ""}
        </p>
      </div>
      {onChange && (
        <Button type="button" variant="outline" onClick={onChange} className="h-10 shrink-0 rounded-[12px] border-line px-3.5 font-semibold">
          Cambiar orden
        </Button>
      )}
    </div>
  );
}

function TypeIcon({ type, className }: { type: IncidentType; className?: string }) {
  const meta = INCIDENT_TYPE[type];
  const Icon = INCIDENT_ICONS[type];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", toneSoftBg[meta.tone], toneText[meta.tone], className)}>
      <Icon aria-hidden />
    </span>
  );
}

/** Toggle tiles (type, severity): pressed = blue wash + azure ring, so the state never rests on color alone. */
const choice = (on: boolean) =>
  cn(
    "border outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
    on ? "border-transparent bg-blue-wash font-semibold ring-2 ring-azure" : "border-hairline hover:bg-soft",
  );

function TypePicker({ value, onChange }: { value: IncidentType; onChange: (t: IncidentType) => void }) {
  const id = useId();
  return (
    <div>
      <p id={id} className={LABEL}>
        Tipo
      </p>
      <div role="group" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={value === t}
            className={cn("flex min-h-14 items-center gap-2.5 rounded-[14px] p-2.5 text-left text-[14px] leading-tight text-ink lg:text-[13.5px]", choice(value === t))}
          >
            <TypeIcon type={t} className="size-8 rounded-[10px] [&_svg]:size-4" />
            <span className="min-w-0">{INCIDENT_TYPE[t].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SeverityPicker({ value, onChange }: { value: Severity; onChange: (s: Severity) => void }) {
  const id = useId();
  return (
    <div>
      <p id={id} className={LABEL}>
        Severidad
      </p>
      <div role="group" aria-labelledby={id} className="grid grid-cols-3 gap-2">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={value === s}
            className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-[14px] text-[15px] text-ink lg:h-11 lg:text-[14px]", choice(value === s))}
          >
            <span className={cn("size-2 rounded-full", toneDot[SEVERITY[s].tone])} aria-hidden />
            {SEVERITY[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function JornadaPicker({ jornadas, value, onChange }: { jornadas: Jornada[]; value?: string; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div>
      <p id={id} className={LABEL}>
        Jornada
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {jornadas.map((j) => {
          const on = value === j.id;
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => onChange(j.id)}
              aria-pressed={on}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                on ? "border-ink bg-ink font-semibold text-on-ink" : "border-hairline bg-surface text-ink hover:bg-soft",
              )}
            >
              Jornada {j.dayIndex}
              <span className={cn("font-normal tabular", on ? "opacity-70" : "text-subtle")}>· {fmtDay(j.date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Capture buttons (44px) + the draft's photos, each with "Quitar foto". Same controls as `PhotoCaptureButtons`, but the
 * sheet runs the capture (`onFiles`) so it knows one is still being saved and can hold Registrar until it lands.
 */
function PhotoField({
  photos,
  busy,
  onFiles,
  onSample,
  onRemove,
}: {
  photos: Photo[];
  busy: boolean;
  onFiles: (files: File[], input: CaptureInput) => void;
  /** "Simular": demo sessions only. */
  onSample?: () => void;
  onRemove: (id: string) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const onPick = (input: CaptureInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // the File objects stay valid; the same picture can be chosen again
    if (files.length) onFiles(files, input);
  };
  return (
    <div>
      <p className={LABEL}>
        Fotos <span className="font-normal text-subtle">· opcional</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick("camera")} />
        <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={onPick("gallery")} />
        <Button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="h-11 rounded-[12px] px-4 font-semibold">
          {busy ? <Loader2 className="animate-spin" /> : <Camera />} Tomar foto
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => galRef.current?.click()} className="h-11 rounded-[12px] px-3.5">
          <ImagePlus /> Galería
        </Button>
        {onSample && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onSample}
            className="h-11 rounded-[12px] px-3 text-subtle"
            title="Agregar una foto de ejemplo (demo sin cámara)"
          >
            <Wand2 /> Simular
          </Button>
        )}
      </div>
      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Fotos de la incidencia">
          {photos.map((p, i) => (
            <li key={p.id}>
              <PhotoThumb photo={p} meta={false}>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-[16px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition group-hover:bg-black/70">
                    <X className="size-4" aria-hidden />
                  </span>
                </button>
              </PhotoThumb>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Impide el cierre": when on, shows the exact status change the order will take. */
function BlocksToggle({ checked, onChange, status }: { checked: boolean; onChange: (v: boolean) => void; status: OrderStatus }) {
  const already = status === "con_incidencia";
  return (
    <label className={cn("block cursor-pointer rounded-[18px] p-4 ring-1 transition-colors", checked ? "bg-red-wash ring-red-line" : "bg-soft ring-transparent")}>
      <span className="flex items-start gap-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Impide el cierre</span>
          <span className="mt-0.5 block text-[13.5px] leading-snug text-subtle">La orden pasa a “Con incidencia” y no se puede cerrar hasta resolverla.</span>
        </span>
        <Switch checked={checked} onCheckedChange={onChange} aria-label="Impide el cierre" className="mt-1" />
      </span>
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            key="estado"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="block overflow-hidden"
          >
            <span className="flex flex-wrap items-center gap-2 pt-3 text-[13px] text-ink">
              {already ? (
                <>
                  La orden ya está <OrderStatusPill status={status} />
                </>
              ) : (
                <>
                  <OrderStatusPill status={status} />
                  <ArrowRight className="size-4 text-subtle" aria-hidden />
                  <span className="sr-only">pasa a</span>
                  <OrderStatusPill status="con_incidencia" />
                </>
              )}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
}
