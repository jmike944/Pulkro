"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Loader2, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Tone } from "@/lib/status";
import type { Role } from "@/lib/types";
import { IconTile } from "@/components/pk/bits";
import { ReasonTip } from "@/components/pk/reason-tip";
import { SoftBadge } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { ModalCancel, ModalFooter, ModalShell } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/* ───────────── doc scope tags (CONFIRMADO / PROPUESTO / PENDIENTE) ───────────── */

export type DocStatus = "confirmado" | "propuesto" | "pendiente";

export const DOC_STATUS: Record<DocStatus, { label: string; tone: Tone; hint: string }> = {
  confirmado: { label: "CONFIRMADO", tone: "teal", hint: "Decisión expresamente seleccionada por Pulkro" },
  propuesto: { label: "PROPUESTO", tone: "blue", hint: "Recomendación funcional sujeta a aprobación" },
  pendiente: { label: "PENDIENTE", tone: "amber", hint: "Definición necesaria para cotizar o implementar" },
};

export function DocTag({ status, className }: { status: DocStatus; className?: string }) {
  const m = DOC_STATUS[status];
  return (
    <SoftBadge tone={m.tone} className={cn("h-[21px] px-1.5 text-[10.5px] tracking-[0.08em]", className)}>
      {m.label}
    </SoftBadge>
  );
}

/* ───────────── roles ───────────── */

export const ROLE_TONE: Record<Role, Tone> = { direccion: "navy", administracion: "violet", supervisor: "blue" };
export const ROLE_SHORT: Record<Role, string> = { direccion: "Dir.", administracion: "Adm.", supervisor: "Sup." };
export const ROLES: Role[] = ["direccion", "administracion", "supervisor"];

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <SoftBadge tone={ROLE_TONE[role]} className={className}>
      {ROLE_LABEL[role]}
    </SoftBadge>
  );
}

/* ───────────── permission gate ───────────── */

/**
 * Renders the action disabled with a tooltip (tap bubble on touch) explaining who can do it.
 * Disabled buttons swallow pointer events, so the tip hangs off a focusable wrapper.
 */
export function GatedButton({
  allowed,
  reason,
  lockIcon,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  allowed: boolean;
  reason: string;
  /** shown instead of the padlock when the action is unavailable for another reason (e.g. no connection) */
  lockIcon?: React.ReactNode;
}) {
  const button = (
    <Button {...props} disabled={!allowed || props.disabled} className={cn("h-11 rounded-[12px] px-4 text-[14px] font-semibold lg:h-10", className)}>
      {!allowed && (lockIcon ?? <Lock className="size-3.5" />)}
      {children}
    </Button>
  );
  if (allowed) return button;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[260px] text-[12.5px] leading-snug">
      <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={reason}>
        {button}
      </span>
    </ReasonTip>
  );
}

export const NO_CATALOGS = "Solo Dirección y Administración administran catálogos.";
export const NO_USERS = "Solo Dirección administra usuarios y permisos.";
export const NO_EXCEL = "Exportar a Excel está disponible para Dirección y Administración.";

/** Soft banner that tells mobile users (no hover tooltips) why controls are read-only. */
export function ReadOnlyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-[16px] bg-soft px-4 py-3 text-[13.5px] text-subtle", className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-ink/60" />
      <p>{children}</p>
    </div>
  );
}

/* ───────────── forms ───────────── */

/** Text inputs: 16px below lg so iOS does not zoom on focus (overrides the shadcn `md:text-sm`). */
export const inputCls = "h-11 rounded-[12px] px-3.5 text-[16px] md:text-[16px] lg:text-[14.5px]";
export const selectTriggerCls = "w-full rounded-[12px] px-3.5 text-[14.5px] data-[size=default]:h-11";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </Label>
      {children}
      {error ? (
        <motion.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] font-medium text-red-fg" role="alert">
          {error}
        </motion.p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** Small chip selector (segment, unit of measure…) with ≥44px tap targets on phones. */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-[12px] border px-3.5 text-[14px] transition lg:h-10",
              active ? "border-brand-deep bg-brand-deep font-semibold text-white shadow-[0_6px_14px_-8px_rgb(2_58_99/0.7)]" : "border-hairline bg-surface text-ink hover:border-line-strong",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Form modal: a thin wrapper over the shared `ModalShell` (centered dialog at lg+, bottom sheet on phones) wrapped in a
 * `<form noValidate>` — Enter submits, "Cancelar" closes through the shell (so `dirty` asks before discarding).
 * `footerNote` sits in the footer hint slot: use it to say what is still missing while `submitDisabled`.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  iconTone = "sky",
  children,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled,
  footerNote,
  className,
  dirty,
  phone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: React.ComponentProps<typeof IconTile>["tone"];
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  footerNote?: React.ReactNode;
  className?: string;
  /** unsaved work: Esc / outside tap / X / Cancelar ask "¿Descartar cambios?" first */
  dirty?: boolean;
  /** phone presentation: bottom sheet (default) or full-screen flow */
  phone?: "flow" | "sheet";
}) {
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={icon ? <ModalIcon tone={iconTone}>{icon}</ModalIcon> : undefined}
      onSubmit={onSubmit}
      dirty={dirty}
      phone={phone}
      className={className}
      footerHint={footerNote}
      footer={
        <>
          <ModalCancel />
          <Button type="submit" disabled={submitDisabled} className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
            {submitLabel}
          </Button>
        </>
      }
    >
      {children}
    </ModalShell>
  );
}

function ModalIcon({ tone, children }: { tone?: React.ComponentProps<typeof IconTile>["tone"]; children: React.ReactNode }) {
  return (
    <IconTile tone={tone} className="size-11 rounded-[14px] [&_svg]:size-5">
      {children}
    </IconTile>
  );
}

/* ───────────── confirmation dialog (key-value summary + explicit checkbox) ───────────── */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  iconTone = "amber",
  rows,
  checkboxLabel,
  confirmLabel,
  confirmDisabled,
  disabledHint,
  busyLabel,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: React.ComponentProps<typeof IconTile>["tone"];
  rows: { k: React.ReactNode; v: React.ReactNode }[];
  checkboxLabel: string;
  confirmLabel: string;
  /** Keeps the confirm button off whatever the checkbox says (a precondition the dialog explains in its children). */
  confirmDisabled?: boolean;
  /** footer hint while `confirmDisabled` ("Necesita conexión") */
  disabledHint?: string;
  /** confirm label while an async `onConfirm` runs ("Desactivando…") */
  busyLabel?: string;
  destructive?: boolean;
  /**
   * Sync: the dialog closes right after. Async (a server call): the dialog stays open, busy, until it settles; it closes
   * unless the promise resolves to `false` (the caller shows why in `children` and the person can try again).
   */
  onConfirm: () => unknown;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <ModalShell
      open={open}
      onOpenChange={(v) => {
        if (!v && busy) return;
        onOpenChange(v);
      }}
      size="sm"
      title={title}
      description={description}
      icon={icon ? <ModalIcon tone={iconTone}>{icon}</ModalIcon> : undefined}
    >
      <ConfirmBody
        rows={rows}
        checkboxLabel={checkboxLabel}
        confirmLabel={busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        confirmDisabled={confirmDisabled || busy}
        disabledHint={busy ? undefined : disabledHint}
        busy={busy}
        destructive={destructive}
        onConfirm={() => {
          const pending = onConfirm();
          if (!(pending instanceof Promise)) {
            onOpenChange(false);
            return;
          }
          setBusy(true);
          void pending
            .then((keepOpen) => {
              if (keepOpen !== false) onOpenChange(false);
            })
            .finally(() => setBusy(false));
        }}
      >
        {children}
      </ConfirmBody>
    </ModalShell>
  );
}

/** Mounted only while the dialog is open, so the checkbox resets every time. */
function ConfirmBody({
  rows,
  checkboxLabel,
  confirmLabel,
  confirmDisabled,
  disabledHint,
  busy,
  destructive,
  onConfirm,
  children,
}: Pick<React.ComponentProps<typeof ConfirmDialog>, "rows" | "checkboxLabel" | "confirmLabel" | "confirmDisabled" | "disabledHint" | "destructive" | "children"> & {
  busy: boolean;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <dl className="mt-2 divide-y divide-hairline rounded-[18px] border border-hairline">
        {rows.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.05 + i * 0.04 }}
            className="flex items-baseline justify-between gap-6 px-4 py-3 text-[14px]"
          >
            <dt className="shrink-0 text-subtle">{r.k}</dt>
            <dd className="min-w-0 text-right font-semibold text-ink tabular">{r.v}</dd>
          </motion.div>
        ))}
      </dl>
      {children && <div className="mt-4">{children}</div>}
      <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] bg-soft px-4 py-3 text-[14px] text-ink">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5 size-[18px] rounded-[5px]" />
        <span className="leading-snug">{checkboxLabel}</span>
      </label>
      <ModalFooter hint={confirmDisabled ? disabledHint : !checked ? "Marque la casilla de confirmación" : undefined}>
        <ModalCancel disabled={busy} />
        <Button
          type="button"
          disabled={!checked || confirmDisabled}
          onClick={onConfirm}
          className={cn("h-11 rounded-[12px] px-5 text-[14px] font-semibold", destructive && "bg-st-red text-white hover:bg-st-red/90")}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {confirmLabel}
        </Button>
      </ModalFooter>
    </>
  );
}

/* ───────────── dialog target (keeps content mounted while the close animation runs) ───────────── */

/**
 * Dialog state for "edit this record" flows. The target stays set after closing so the exit
 * animation shows real content; `key` changes on every open so each opening starts a fresh form.
 */
export function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return {
    target,
    open,
    key,
    show: (t: T) => {
      setTarget(t);
      setKey((k) => k + 1);
      setOpen(true);
    },
    onOpenChange: setOpen,
  };
}

/* ───────────── small utils ───────────── */

export function initialsOf(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  const letters = (parts.length ? parts : name.trim().split(/\s+/)).slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

/** Stable 0–359 hue from any string (avatar tints for new records). */
export function hueFrom(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const phoneDigits = (v: string) => v.replace(/\D/g, "").length;

export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Normalizes text for accent-insensitive search. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Search input with icon, consistent across catalog lists. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("relative flex h-11 min-w-0 items-center rounded-[14px] border border-hairline bg-surface pl-10 pr-3 transition focus-within:border-sky focus-within:ring-3 focus-within:ring-sky/30", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="absolute left-3.5 size-[17px] text-subtle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint lg:text-[14.5px]"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="-mr-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Table header row shared by the settings lists (hidden on phones, where rows become cards). */
export function ListHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("hidden gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle lg:grid", className)}>{children}</div>;
}

/**
 * Inline switch with a ≥40px hit area and an accessible label. `busy` (a change on its way): the same element stays, focused
 * and in the tab order, but ignores clicks — `disabled` would drop the keyboard focus and swap in the reason tooltip.
 */
export function InlineSwitch({
  checked,
  onChange,
  label,
  disabled,
  busy,
  reason,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  reason?: string;
}) {
  const sw = (
    <label
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-1.5 lg:min-h-10 lg:min-w-10",
        disabled ? "cursor-not-allowed" : busy ? "cursor-progress" : "cursor-pointer hover:bg-muted",
      )}
    >
      <SwitchLite checked={checked} onChange={onChange} disabled={disabled} busy={busy} label={label} />
    </label>
  );
  if (!disabled || !reason) return sw;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[240px] text-[12.5px] leading-snug">
      <span tabIndex={0} className="inline-flex outline-none">
        {sw}
      </span>
    </ReasonTip>
  );
}

/** Brand switch with a springy thumb (navy when on). `busy`: shown dimmed and inert (aria-disabled), still focusable. */
export function SwitchLite({
  checked,
  onChange,
  disabled,
  busy,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full p-[3px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        busy && "opacity-50",
        checked ? "bg-brand-deep" : "bg-line",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={cn("block size-[18px] rounded-full bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.25)]", checked ? "ml-auto" : "mr-auto")}
      />
    </button>
  );
}
