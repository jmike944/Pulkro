"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { addDays, format } from "date-fns";
import { Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useLookups, useNow, useScopedData } from "@/lib/hooks";
import { firstName, fmtDate, fmtDay } from "@/lib/format";
import { CASE_CATEGORY, CASE_CHANNEL, ROLE_LABEL, SEVERITY } from "@/lib/status";
import type { CaseCategory, CaseChannel, Severity } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { PersonAvatar } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { PhotoCaptureButtons } from "@/components/pk/photo-capture";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CASE_CATEGORY_ICON, caseOwnerCandidates } from "./lib";
import { CATEGORY_TONE } from "./case-card";
import { DialogPanel, FieldLabel, inputCls, textareaCls } from "./ui";

export type NewCaseDefaults = { orderId?: string; channel?: CaseChannel; category?: CaseCategory; description?: string };

/**
 * "Nuevo caso" (doc §4.4 PROPUESTO): folio, categoría, severidad, responsable, fecha compromiso,
 * evidencia y vínculo con la orden original. Draft photos are discarded on cancel.
 */
export function NewCaseDialog({ open, defaults, onOpenChange }: { open: boolean; defaults?: NewCaseDefaults; onOpenChange: (open: boolean) => void }) {
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const [drafts, setDrafts] = useState<string[]>([]);
  const close = (discard: boolean) => {
    if (discard) drafts.forEach((id) => deletePhoto(id));
    setDrafts([]);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close(true))}>
      {open && <NewCaseForm defaults={defaults} photoIds={drafts} setPhotoIds={setDrafts} onCancel={() => close(true)} onCreated={() => close(false)} />}
    </Dialog>
  );
}

const TONE_SOFT: Record<string, string> = {
  sky: "bg-blue-tint text-azure-fg",
  amber: "bg-amber-tint text-amber-fg",
  violet: "bg-violet-tint text-violet-fg",
  red: "bg-red-tint text-red-fg",
  navy: "bg-press text-brand-ink",
  teal: "bg-teal-tint text-teal-fg",
};

function NewCaseForm({
  defaults,
  photoIds,
  setPhotoIds,
  onCancel,
  onCreated,
}: {
  defaults?: NewCaseDefaults;
  photoIds: string[];
  setPhotoIds: (fn: (ids: string[]) => string[]) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const { orders, user } = useScopedData();
  const lk = useLookups();
  const users = useAppStore((s) => s.users);
  const allPhotos = useAppStore((s) => s.photos);
  const createCase = useAppStore((s) => s.createCase);
  const updatePhoto = useAppStore((s) => s.updatePhoto);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const now = useNow(60_000);

  const closed = useMemo(
    () => orders.filter((o) => o.closure && o.status !== "cancelada").sort((a, b) => b.closure!.validatedAt.localeCompare(a.closure!.validatedAt)),
    [orders],
  );

  const [orderId, setOrderId] = useState(defaults?.orderId ?? "");
  const [picking, setPicking] = useState(!defaults?.orderId);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CaseCategory>(defaults?.category ?? "calidad");
  const [severity, setSeverity] = useState<Severity>("media");
  const [channel, setChannel] = useState<CaseChannel>(defaults?.channel ?? "telefono");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [ownerPick, setOwnerPick] = useState("");
  const [due, setDue] = useState(() => format(addDays(now, 3), "yyyy-MM-dd"));

  const order = closed.find((o) => o.id === orderId) ?? orders.find((o) => o.id === orderId);
  const client = order ? lk.clients.get(order.clientId) : undefined;
  const candidates = useMemo(() => (order ? caseOwnerCandidates(users, order.unitId) : []), [users, order]);
  // Default owner = the order's supervisor (or me), unless the user picked someone valid.
  const ownerId = candidates.some((u) => u.id === ownerPick)
    ? ownerPick
    : candidates.some((u) => u.id === order?.supervisorId)
      ? order!.supervisorId
      : (candidates.find((u) => u.id === user.id)?.id ?? candidates[0]?.id ?? "");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? closed.filter((o) => {
          const c = lk.clients.get(o.clientId);
          return [o.folio, o.title, c?.name, c?.shortName].some((x) => x?.toLowerCase().includes(q));
        })
      : closed;
    return list.slice(0, 40);
  }, [closed, query, lk]);

  const photos = allPhotos.filter((p) => photoIds.includes(p.id));
  const todayKey = format(now, "yyyy-MM-dd");

  const problems = [
    !order && "la orden",
    description.trim().length < 10 && "una descripción (mín. 10 caracteres)",
    !ownerId && "el responsable",
    (!due || due < todayKey) && "una fecha compromiso válida",
  ].filter(Boolean) as string[];

  const save = () => {
    if (problems.length || !order) {
      toast.error(`Falta ${problems.join(", ")}`);
      return;
    }
    const c = createCase({
      orderId: order.id,
      clientId: order.clientId,
      category,
      severity,
      channel,
      description: description.trim(),
      ownerId,
      dueDate: new Date(`${due}T18:00:00`).toISOString(),
      photoIds,
    });
    photoIds.forEach((pid) => updatePhoto(pid, { caseId: c.id }));
    const owner = lk.users.get(ownerId);
    toast.success(`Caso ${c.folio} registrado`, {
      description: owner && owner.id !== user.id ? `Asignado a ${owner.name} · compromiso ${fmtDay(c.dueDate)}` : `Compromiso ${fmtDay(c.dueDate)}`,
      action: { label: "Ver caso", onClick: () => router.push(`/postventa/${c.folio}`) },
    });
    onCreated();
  };

  return (
    <DialogPanel
      wide
      title="Nuevo caso postventa"
      description="Queja o seguimiento vinculado a una orden cerrada. Queda con folio, responsable y fecha compromiso."
      footer={
        <>
          <Button variant="outline" onClick={onCancel} className="h-11 rounded-[12px] px-5">
            Cancelar
          </Button>
          <Button onClick={save} className="h-11 rounded-[12px] px-5 font-semibold">
            Registrar caso
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* ── order ── */}
        <div>
          <FieldLabel hint={`${closed.length} cerradas`}>Orden original</FieldLabel>
          <AnimatePresence mode="wait" initial={false}>
            {order && !picking ? (
              <motion.div
                key="picked"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-3 rounded-[16px] border border-hairline bg-wash p-3"
              >
                {client && <ClientMark name={client.name} hue={client.hue} size={40} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{order.title}</p>
                  <p className="truncate text-[13px] text-subtle">
                    <span className="tabular">{order.folio}</span> · {client?.shortName}
                    {order.closure && ` · cerrada ${fmtDate(order.closure.validatedAt)}`}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setPicking(true)} className="h-10 rounded-[12px] px-3 text-link">
                  Cambiar
                </Button>
              </motion.div>
            ) : (
              <motion.div key="picker" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por folio, cliente o servicio"
                    aria-label="Buscar orden"
                    className={cn(inputCls, "pl-10")}
                  />
                  {order && (
                    <button type="button" onClick={() => setPicking(false)} aria-label="Cancelar cambio" className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-subtle hover:bg-muted">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <ul role="listbox" aria-label="Órdenes cerradas" className="mt-2 max-h-56 overflow-y-auto rounded-[16px] border border-hairline p-1">
                  {matches.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-subtle">Sin órdenes cerradas que coincidan.</li>}
                  {matches.map((o) => {
                    const c = lk.clients.get(o.clientId);
                    const on = o.id === orderId;
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => {
                            setOrderId(o.id);
                            setPicking(false);
                          }}
                          className={cn("flex min-h-12 w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition", on ? "bg-sky-soft" : "hover:bg-soft")}
                        >
                          {c && <ClientMark name={c.name} hue={c.hue} size={32} />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium text-ink">{o.title}</span>
                            <span className="block truncate text-[12.5px] text-subtle">
                              <span className="tabular">{o.folio}</span> · {c?.shortName} · {fmtDay(o.closure!.validatedAt)}
                            </span>
                          </span>
                          {on && <Check className="size-4 shrink-0 text-link" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── category ── */}
        <div>
          <FieldLabel>Categoría</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(CASE_CATEGORY) as CaseCategory[]).map((k) => {
              const Icon = CASE_CATEGORY_ICON[k];
              const on = category === k;
              return (
                <motion.button
                  key={k}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setCategory(k)}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-12 items-center gap-2.5 rounded-[14px] border p-2.5 text-left text-[13.5px] transition",
                    on ? "border-transparent bg-blue-wash font-semibold text-ink ring-2 ring-azure" : "border-hairline text-ink hover:bg-muted",
                  )}
                >
                  <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]", TONE_SOFT[CATEGORY_TONE[k]])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="leading-tight">{CASE_CATEGORY[k]}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FieldLabel className="mb-0">Severidad</FieldLabel>
          <Segmented id="nc-sev" items={(Object.keys(SEVERITY) as Severity[]).map((s) => ({ value: s, label: SEVERITY[s].label }))} value={severity} onChange={setSeverity} />
        </div>

        <div>
          <FieldLabel>¿Cómo llegó?</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CASE_CHANNEL) as CaseChannel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                aria-pressed={channel === ch}
                onClick={() => setChannel(ch)}
                className={cn("h-10 rounded-full border px-4 text-[13.5px] transition", channel === ch ? "border-ink bg-ink font-semibold text-on-ink" : "border-hairline hover:bg-muted")}
              >
                {CASE_CHANNEL[ch]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="nc-desc" hint={description.trim().length < 10 ? "Mínimo 10 caracteres" : undefined}>
            Descripción
          </FieldLabel>
          <Textarea
            id="nc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿Qué reporta el cliente? ¿Dónde y desde cuándo?"
            className={textareaCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <FieldLabel>Responsable</FieldLabel>
            <Select value={ownerId} onValueChange={setOwnerPick} disabled={!order}>
              <SelectTrigger className={cn(inputCls, "w-full")} aria-label="Responsable">
                <SelectValue placeholder={order ? "Elegir responsable" : "Primero elija la orden"} />
              </SelectTrigger>
              <SelectContent className="rounded-[14px]">
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="min-h-10 rounded-[10px] text-[14px]">
                    <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={22} />
                    {u.name}
                    <span className="text-[12px] text-subtle">{ROLE_LABEL[u.role]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="nc-due">Fecha compromiso</FieldLabel>
            <Input id="nc-due" type="date" min={todayKey} value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <FieldLabel hint="Opcional">Evidencia</FieldLabel>
          <PhotoCaptureButtons
            compact
            disabled={!order}
            meta={{ orderId: order?.id ?? "", kind: "postventa", area: CASE_CATEGORY[category], serviceTypeId: order?.serviceTypeId, selectedForReport: false }}
            onCaptured={(ids) => setPhotoIds((p) => [...p, ...ids])}
          />
          {!order && <p className="mt-2 text-[12.5px] text-subtle">Elija la orden para adjuntar fotos.</p>}
          <AnimatePresence>
            {photos.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <PhotoThumb key={p.id} photo={p} meta={false}>
                    <button
                      type="button"
                      aria-label="Quitar foto"
                      onClick={() => {
                        deletePhoto(p.id);
                        setPhotoIds((ids) => ids.filter((x) => x !== p.id));
                      }}
                      className="absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60"
                    >
                      <X className="size-4" />
                    </button>
                  </PhotoThumb>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {order && ownerId && (
          <p className="rounded-[14px] bg-blue-wash px-4 py-3 text-[13.5px] text-ink">
            {ownerId === user.id ? "Usted" : <b className="font-semibold">{firstName(lk.users.get(ownerId)?.name ?? "")}</b>} verá el caso en su tablero de Postventa. El cliente no recibe avisos automáticos.
          </p>
        )}
      </div>
    </DialogPanel>
  );
}
