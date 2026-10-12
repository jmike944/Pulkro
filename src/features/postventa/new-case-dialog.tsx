"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { addDays, format } from "date-fns";
import { Check, ClipboardCheck, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attempt, useAppStore } from "@/lib/store";
import { useLookups, useMediaQuery, useNow, useScopedData } from "@/lib/hooks";
import { daysUntil, firstName, fmtDate, fmtDay, plural } from "@/lib/format";
import { CASE_CATEGORY, CASE_CHANNEL, CASE_STATUS, ROLE_LABEL, SEVERITY, toneDot } from "@/lib/status";
import type { CaseCategory, CaseChannel, Order, PostSaleCase, Severity } from "@/lib/types";
import { TEXT_LIMITS } from "@/lib/domain";
import { ClientMark } from "@/components/pk/client-mark";
import { PersonAvatar } from "@/components/pk/bits";
import { AuroraStat, BigButton, FlowHeading, FlowScreen, ItemCard, SuccessHero } from "@/components/pk/mobile";
import { MODAL_DESKTOP_QUERY, ModalCancel, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { PhotoCaptureButtons } from "@/components/pk/photo-capture";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CASE_CATEGORY_ICON, caseOwnerCandidates } from "./lib";
import { CATEGORY_TONE } from "./case-card";
import { FIELD_WARN, FieldNote, missingChars } from "./field-note";
import { FieldLabel, inputCls, textareaCls } from "./ui";
import { useOpenSession } from "./use-held-target";

export type NewCaseDefaults = { orderId?: string; channel?: CaseChannel; category?: CaseCategory; description?: string };

/** The description has to say enough to act on (unchanged rule). */
const DESCRIPTION_MIN = 10;
/** Orders listed before "Mostrar más" (the list grows in the page: no scroller inside the modal). */
const ORDER_PAGE = 6;
const ORDER_CAP = 40;

/**
 * "Nuevo caso" (doc §4.4 PROPUESTO): folio, categoría, severidad, responsable, fecha compromiso,
 * evidencia y vínculo con la orden original.
 *
 * Desktop (lg+): centered `ModalShell`; on registering it closes and a toast offers "Ver caso".
 * Phone / tablet: a `FlowScreen` that ends in a success screen with "Ver caso".
 * Draft photos are deleted when the form is discarded; Esc / outside tap / X ask first when something would be lost.
 * Stays mounted while it closes (exit animation) and starts a clean form on every opening.
 */
export function NewCaseDialog({ open, defaults, onOpenChange }: { open: boolean; defaults?: NewCaseDefaults; onOpenChange: (open: boolean) => void }) {
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <NewCaseFlow key={session} open={open} defaults={defaults} onOpenChange={onOpenChange} />;
}

const TONE_SOFT: Record<string, string> = {
  sky: "bg-blue-tint text-azure-fg",
  amber: "bg-amber-tint text-amber-fg",
  violet: "bg-violet-tint text-violet-fg",
  red: "bg-red-tint text-red-fg",
  navy: "bg-press text-brand-ink",
  teal: "bg-teal-tint text-teal-fg",
};

const INTRO = "Queja o seguimiento de una orden cerrada. Queda con folio, responsable y fecha compromiso.";

function NewCaseFlow({ open, defaults, onOpenChange }: { open: boolean; defaults?: NewCaseDefaults; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
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
  const [category, setCategory] = useState<CaseCategory>(defaults?.category ?? "calidad");
  const [severity, setSeverity] = useState<Severity>("media");
  const [channel, setChannel] = useState<CaseChannel>(defaults?.channel ?? "telefono");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [ownerPick, setOwnerPick] = useState("");
  /** The commitment date the form opened with (3 days out): `dirty` compares against it. */
  const [initialDue] = useState(() => format(addDays(now, 3), "yyyy-MM-dd"));
  const [due, setDue] = useState(initialDue);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  /** Phone only: the case just registered (drives the success screen, which stays even if the window later grows past `lg`). */
  const [created, setCreated] = useState<PostSaleCase | null>(null);

  const order = closed.find((o) => o.id === orderId) ?? orders.find((o) => o.id === orderId);
  const candidates = useMemo(() => (order ? caseOwnerCandidates(users, order.unitId, order.supervisorId) : []), [users, order]);
  // Default owner = the order's supervisor (or me), unless the user picked someone valid.
  const defaultOwnerId = candidates.some((u) => u.id === order?.supervisorId)
    ? order!.supervisorId
    : (candidates.find((u) => u.id === user.id)?.id ?? candidates[0]?.id ?? "");
  const ownerId = candidates.some((u) => u.id === ownerPick) ? ownerPick : defaultOwnerId;

  const photos = allPhotos.filter((p) => photoIds.includes(p.id));
  const todayKey = format(now, "yyyy-MM-dd");

  const descLength = description.trim().length;
  const descShort = descLength > 0 && descLength < DESCRIPTION_MIN;
  const descOk = descLength >= DESCRIPTION_MIN;
  const dueOk = !!due && due >= todayKey;
  const ready = !!order && descOk && !!ownerId && dueOk;
  const hint = firstMissing(
    [!order, "Elija la orden original"],
    [!descOk, `Describa el caso (al menos ${DESCRIPTION_MIN} caracteres)`],
    [!ownerId, "Elija quién dará seguimiento"],
    [!dueOk, "Elija una fecha compromiso de hoy en adelante"],
  );

  /** Anything changed from how the form opened (order, category, severity, channel, description, owner, due date, photos) that closing would throw away. */
  const dirty =
    !created &&
    (photoIds.length > 0 ||
      description.trim() !== (defaults?.description ?? "").trim() ||
      orderId !== (defaults?.orderId ?? "") ||
      category !== (defaults?.category ?? "calidad") ||
      severity !== "media" ||
      channel !== (defaults?.channel ?? "telefono") ||
      ownerId !== defaultOwnerId ||
      due !== initialDue);

  const handleOpenChange = (v: boolean) => {
    if (v) return;
    // Registered cases keep their photos; a discarded draft must not leave orphan evidence behind.
    if (!created) photoIds.forEach((id) => deletePhoto(id));
    onOpenChange(false);
  };

  const save = () => {
    if (!ready || !order) return;
    // A refusal was already toasted by the store: keep the form open with the draft.
    const c = attempt(() =>
      createCase({
        orderId: order.id,
        clientId: order.clientId,
        category,
        severity,
        channel,
        description: description.trim(),
        ownerId,
        dueDate: new Date(`${due}T18:00:00`).toISOString(),
        photoIds,
      }),
    );
    if (!c) return;
    photoIds.forEach((pid) => updatePhoto(pid, { caseId: c.id }));
    if (!isDesktop) {
      setCreated(c);
      return;
    }
    const owner = lk.users.get(ownerId);
    toast.success(`Caso ${c.folio} registrado`, {
      description: owner && owner.id !== user.id ? `Asignado a ${owner.name} · compromiso ${fmtDay(c.dueDate)}` : `Compromiso ${fmtDay(c.dueDate)}`,
      action: { label: "Ver caso", onClick: () => router.push(`/postventa/${c.folio}`) },
    });
    onOpenChange(false);
  };

  /* ── success (registered on a phone; kept whatever the breakpoint so the form is never shown again and Registrar cannot duplicate the case) ── */
  if (created) {
    const owner = lk.users.get(created.ownerId);
    const client = lk.clients.get(created.clientId);
    const forOrder = orders.find((o) => o.id === created.orderId) ?? order;
    const left = Math.max(0, daysUntil(created.dueDate));
    return (
      <FlowScreen
        open={open}
        onOpenChange={handleOpenChange}
        description="Caso postventa registrado"
        footer={
          <div className="space-y-2.5">
            <BigButton href={`/postventa/${created.folio}`}>Ver caso</BigButton>
            <BigButton variant="outline" onClick={() => handleOpenChange(false)}>
              Volver a Postventa
            </BigButton>
          </div>
        }
      >
        <SuccessHero title="Caso registrado" icon={<ClipboardCheck className="relative size-8" />}>
          {owner && owner.id !== user.id ? `Quedó asignado a ${owner.name}.` : "Usted es el responsable."} El cliente no recibe avisos automáticos.
        </SuccessHero>
        <ItemCard
          className="mt-8"
          leading={client && <ClientMark name={client.name} hue={client.hue} size={44} />}
          title={forOrder?.title ?? created.folio}
          sub={`${created.folio} · ${CASE_CATEGORY[created.category]}`}
          status={<TonePill tone={CASE_STATUS[created.status].tone}>{CASE_STATUS[created.status].label}</TonePill>}
        />
        <AuroraStat
          className="mt-5"
          label="Fecha compromiso"
          value={fmtDay(created.dueDate)}
          sub={left === 0 ? "El plazo para atender el caso vence hoy." : `${left === 1 ? "Queda" : "Quedan"} ${plural(left, "día", "días")} para atenderlo.`}
        />
      </FlowScreen>
    );
  }

  const fields = (
    <div className="space-y-6">
      <OrderField
        closed={closed}
        order={order}
        picking={picking}
        setPicking={setPicking}
        onPick={(id) => {
          setOrderId(id);
          setPicking(false);
        }}
        focusSearch={isDesktop}
      />

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
                  "flex min-h-12 items-center gap-2.5 rounded-[14px] border p-2.5 text-left text-[13.5px] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
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

      <div>
        <FieldLabel>Severidad</FieldLabel>
        <SeverityField value={severity} onChange={setSeverity} />
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
              className={cn(
                "h-11 rounded-full border px-4 text-[13.5px] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-10",
                channel === ch ? "border-ink bg-ink font-semibold text-on-ink" : "border-hairline hover:bg-muted",
              )}
            >
              {CASE_CHANNEL[ch]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="nc-desc">Descripción</FieldLabel>
        <Textarea
          id="nc-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TEXT_LIMITS.description.max}
          placeholder="¿Qué reporta el cliente? ¿Dónde y desde cuándo?"
          aria-required
          aria-invalid={descShort || undefined}
          aria-describedby={descShort ? "nc-desc-note" : undefined}
          className={cn(textareaCls, FIELD_WARN)}
        />
        <FieldNote id="nc-desc-note">{descShort && `Escriba al menos ${DESCRIPTION_MIN} caracteres (${missingChars(DESCRIPTION_MIN - descLength)}).`}</FieldNote>
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
                <SelectItem key={u.id} value={u.id} className="min-h-11 rounded-[10px] text-[14px] lg:min-h-10">
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
          <Input
            id="nc-due"
            type="date"
            min={todayKey}
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-invalid={!dueOk || undefined}
            aria-describedby={dueOk ? undefined : "nc-due-note"}
            className={cn(inputCls, FIELD_WARN)}
          />
          <FieldNote id="nc-due-note">{!dueOk && (due ? "La fecha compromiso no puede ser anterior a hoy." : "Elija una fecha compromiso.")}</FieldNote>
        </div>
      </div>

      <div>
        <FieldLabel hint="Opcional">Evidencia</FieldLabel>
        <PhotoCaptureButtons
          className="[&_button]:h-11"
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
                    className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
                      <X className="size-4" />
                    </span>
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
  );

  /* ── phone / tablet: flow ── */
  if (!isDesktop)
    return (
      <FlowScreen
        open={open}
        onOpenChange={handleOpenChange}
        title="Nuevo caso"
        description="Registrar un caso postventa"
        dirty={dirty}
        footer={
          <div className="space-y-2.5">
            {hint && (
              <p aria-live="polite" className="text-center text-[13px] leading-snug text-subtle">
                {hint}
              </p>
            )}
            <BigButton onClick={save} disabled={!ready}>
              Registrar caso
            </BigButton>
          </div>
        }
      >
        <FlowHeading title="¿Qué reporta el cliente?">{INTRO}</FlowHeading>
        {fields}
      </FlowScreen>
    );

  /* ── desktop: dialog ── */
  return (
    <ModalShell
      open={open}
      onOpenChange={handleOpenChange}
      title="Nuevo caso postventa"
      description={INTRO}
      size="lg"
      dirty={dirty}
      footerHint={hint}
      footer={
        <>
          <ModalCancel />
          <Button onClick={save} disabled={!ready} className="h-11 rounded-[12px] px-5 font-semibold">
            Registrar caso
          </Button>
        </>
      }
    >
      {fields}
    </ModalShell>
  );
}

/* ───────────── order picker ───────────── */

function OrderField({
  closed,
  order,
  picking,
  setPicking,
  onPick,
  focusSearch,
}: {
  closed: Order[];
  order?: Order;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onPick: (id: string) => void;
  /** the order search takes the caret when it appears — desktop only: on a phone the keyboard would cover the form */
  focusSearch: boolean;
}) {
  const lk = useLookups();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(ORDER_PAGE);
  /** the picker unmounts when an order is chosen: hand focus to "Cambiar" so keyboard and screen-reader users are not dropped on the page */
  const refocus = useRef(false);
  const client = order ? lk.clients.get(order.clientId) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? closed.filter((o) => {
          const c = lk.clients.get(o.clientId);
          return [o.folio, o.title, c?.name, c?.shortName].some((x) => x?.toLowerCase().includes(q));
        })
      : closed;
    return list.slice(0, ORDER_CAP);
  }, [closed, query, lk]);
  const shown = matches.slice(0, limit);

  return (
    <div>
      <FieldLabel hint={plural(closed.length, "cerrada", "cerradas")}>Orden original</FieldLabel>
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
              <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink lg:line-clamp-1">{order.title}</p>
              <p className="truncate text-[13px] text-subtle">
                <span className="tabular">{order.folio}</span> · {client?.shortName}
                {order.closure && ` · cerrada ${fmtDate(order.closure.validatedAt)}`}
              </p>
            </div>
            <Button
              ref={(el) => {
                if (el && refocus.current) {
                  refocus.current = false;
                  el.focus();
                }
              }}
              variant="ghost"
              onClick={() => setPicking(true)}
              className="h-11 rounded-[12px] px-3 text-link"
            >
              Cambiar
            </Button>
          </motion.div>
        ) : (
          <motion.div key="picker" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the search appears because the person just opened the form or chose «Cambiar»
                autoFocus={focusSearch}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(ORDER_PAGE);
                }}
                placeholder="Buscar por folio, cliente o servicio"
                aria-label="Buscar orden"
                className={cn(inputCls, "pl-10", order && "pr-12")}
              />
              {order && (
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  aria-label="Conservar la orden elegida"
                  className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-[12px] text-subtle outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <ul role="listbox" aria-label="Órdenes cerradas" className="mt-2 rounded-[16px] border border-hairline p-1">
              {matches.length === 0 && (
                <li className="px-3 py-6 text-center text-[13.5px] leading-snug text-subtle">
                  {closed.length === 0
                    ? "Todavía no hay órdenes cerradas. Un caso postventa nace de una orden con cierre validado."
                    : "Ninguna orden cerrada coincide. Pruebe con el folio o el nombre del cliente."}
                </li>
              )}
              {shown.map((o) => {
                const c = lk.clients.get(o.clientId);
                const on = o.id === order?.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => {
                        refocus.current = true;
                        onPick(o.id);
                      }}
                      className={cn("flex min-h-12 w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50", on ? "bg-sky-soft" : "hover:bg-soft")}
                    >
                      {c && <ClientMark name={c.name} hue={c.hue} size={32} />}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[14px] font-medium leading-snug text-ink lg:line-clamp-1">{o.title}</span>
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
            {matches.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + 10)}
                className="mt-1.5 flex min-h-11 w-full items-center justify-center rounded-[12px] text-[14px] font-semibold text-link outline-none transition hover:bg-sky-soft focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Mostrar más · quedan {matches.length - limit}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Baja / Media / Alta as one 44px segmented control (the shared `Segmented` is 32px tall). */
function SeverityField({ value, onChange }: { value: Severity; onChange: (s: Severity) => void }) {
  return (
    <div role="group" aria-label="Severidad" className="grid grid-cols-3 gap-1 rounded-[14px] bg-tile p-1">
      {(Object.keys(SEVERITY) as Severity[]).map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(s)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-[11px] text-[14px] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08),0_2px_8px_-2px_rgb(16_24_40/0.08)] dark:bg-press" : "text-subtle hover:text-ink",
            )}
          >
            <span aria-hidden className={cn("size-2 rounded-full", toneDot[SEVERITY[s].tone])} />
            {SEVERITY[s].label}
          </button>
        );
      })}
    </div>
  );
}
