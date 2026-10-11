"use client";

/**
 * Mobile/PWA design language (from the "Today · Labor breakdown · Sent" reference screens):
 * sand chrome, time tiles, chevron list rows, an aurora-framed next-step card, full-screen flows
 * with a centered title + sticky primary action, steppers, total cards and success screens.
 */
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Check, ChevronRight, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { d } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { useMediaQuery } from "@/lib/hooks";
import { StatusDot } from "./status";
import { AnimatedNumber } from "./bits";
import { EASE } from "./motion";

/* ───────────── time tile ("9:00 / AM") ───────────── */

export function TimeTile({ date, className, tone }: { date: string | Date; className?: string; tone?: "live" | "done" }) {
  const dt = d(date);
  const h = dt.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return (
    <div
      className={cn(
        "flex size-[54px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-sand leading-none",
        tone === "live" && "bg-blue-tint",
        className,
      )}
    >
      <span className="text-[16px] font-semibold text-ink tabular">
        {h12}:{String(dt.getMinutes()).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10.5px] font-semibold tracking-wide text-subtle">{h < 12 ? "a. m." : "p. m."}</span>
    </div>
  );
}

/* ───────────── list row with chevron ───────────── */

export function MobileRow({
  href,
  onClick,
  leading,
  title,
  meta,
  status,
  trailing,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  status?: { tone: Tone; label: React.ReactNode; live?: boolean };
  trailing?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[16px] font-semibold leading-snug text-ink">{title}</span>
        {meta && <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[13.5px] text-subtle">{meta}</span>}
        {status && (
          <span className="mt-1 flex items-center gap-2 text-[13.5px] text-ink/80">
            <StatusDot tone={status.tone} live={status.live} />
            {status.label}
          </span>
        )}
      </span>
      {trailing ?? <ChevronRight className="size-[18px] shrink-0 text-faint" />}
    </>
  );
  const cls = cn("flex w-full items-center gap-4 border-b border-hairline py-3.5 text-left last:border-0 active:bg-sand/60", className);
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/* ───────────── next-step card (aurora frame) ───────────── */

export function NextStepCard({
  avatar,
  name,
  sub,
  value,
  message,
  action,
  className,
}: {
  avatar: React.ReactNode;
  name: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  message: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      className={cn("bg-aurora-frame grain rounded-[28px] p-2.5 shadow-lift", className)}
    >
      <div className="relative z-[2] rounded-[22px] bg-surface p-5 shadow-[0_1px_0_var(--hl)_inset]">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-ink">{name}</p>
            {sub && <p className="truncate text-[13.5px] text-subtle">{sub}</p>}
          </div>
          {value && <span className="shrink-0 text-[17px] font-medium text-ink tabular">{value}</span>}
        </div>
        <div className="mt-3.5 text-[15.5px] leading-relaxed text-ink-soft">{message}</div>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </motion.div>
  );
}

/** Full-width navy action used inside mobile cards and flow footers. */
export function BigButton({
  children,
  href,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const cls = cn(
    "inline-flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[14px] text-[17px] font-semibold transition active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5",
    variant === "primary" ? "bg-brand-deep text-white shadow-[0_10px_24px_-12px_rgb(7_36_63/0.7)] hover:bg-brand-hover" : "border border-line-strong bg-surface text-ink hover:bg-sand/50",
    className,
  );
  if (href && !disabled)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/* ───────────── modal plumbing shared with ModalShell ───────────── */

/** Breakpoint where modals stop being phone flows / bottom sheets (the shell switches to the desktop panel here too). */
export const MODAL_DESKTOP_QUERY = "(min-width: 1024px)";

/** Scrim behind centered modals. Token-based: `--ink` in light, a deeper black in dark. */
export const MODAL_SCRIM = "bg-ink/35 backdrop-blur-[2px] dark:bg-black/60";

function subscribeViewport(cb: () => void) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", cb);
  vv.addEventListener("scroll", cb);
  return () => {
    vv.removeEventListener("resize", cb);
    vv.removeEventListener("scroll", cb);
  };
}

function readKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv || vv.scale > 1.01) return 0; // pinch-zoom is not a keyboard
  const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
  return inset > 80 ? inset : 0;
}

/**
 * Height of the on-screen keyboard that overlaps the layout viewport (iOS Safari, which ignores
 * `interactive-widget=resizes-content`). 0 where the browser already resizes the page (Android) or on desktop.
 * Lift fixed bottom UI by this amount so sticky footers stay above the keyboard.
 */
export function useKeyboardInset() {
  return useSyncExternalStore(subscribeViewport, readKeyboardInset, () => 0);
}

/**
 * "¿Descartar cambios?" guard for modals holding unsaved work. Wrap the modal's onOpenChange with it: while `dirty`,
 * Esc, an outside tap, the X and any `<DialogClose>` ask first instead of closing. Render `prompt` next to the modal.
 * Programmatic closes (calling your own onOpenChange(false) after saving) are never intercepted.
 */
export function useDiscardGuard(dirty: boolean | undefined, onOpenChange: (open: boolean) => void) {
  const [asking, setAsking] = useState(false);
  const requestClose = () => (dirty ? setAsking(true) : onOpenChange(false));
  return {
    /** pass to the Radix root instead of the raw onOpenChange */
    onOpenChange: (v: boolean) => (v ? onOpenChange(true) : requestClose()),
    requestClose,
    prompt: (
      <DiscardDialog
        open={asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false);
          onOpenChange(false);
        }}
      />
    ),
  };
}

/** Small alert stacked above the modal. "Seguir editando" is the focused, safe default. */
function DiscardDialog({ open, onKeep, onDiscard }: { open: boolean; onKeep: () => void; onDiscard: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onKeep()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/25 duration-150 dark:bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            keepRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[60] w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-surface p-6 text-ink shadow-lift outline-none ring-1 ring-edge duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <DialogPrimitive.Title className="font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">¿Descartar cambios?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-[14.5px] leading-relaxed text-subtle">
            Lo que capturó en este formulario no se ha guardado y se perderá.
          </DialogPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex h-12 items-center justify-center rounded-[12px] border border-red-line bg-surface px-5 text-[15px] font-semibold text-red-fg outline-none transition hover:bg-red-wash focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-11 sm:text-[14px]"
            >
              Descartar
            </button>
            <button
              ref={keepRef}
              type="button"
              onClick={onKeep}
              className="inline-flex h-12 items-center justify-center rounded-[12px] bg-brand-deep px-5 text-[15px] font-semibold text-white outline-none transition hover:bg-brand-hover focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-11 sm:text-[14px]"
            >
              Seguir editando
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ───────────── full-screen flow ("Labor breakdown") ───────────── */

/**
 * Full-screen task flow on phones (inset white panel, X + centered title, scroll body, sticky footer above the
 * keyboard and the home indicator); a page sheet on tablets and a centered card dialog from `lg`.
 * Accessible (Radix Dialog: focus trap, Esc, aria). Pass `dirty` to ask before unsaved work is thrown away.
 */
export function FlowScreen({
  open,
  onOpenChange,
  title,
  children,
  footer,
  closeSide = "left",
  className,
  description,
  dirty,
  heading,
  footerSlot,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** small centered header title (e.g. "Desglose de horas"); omit for success screens */
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeSide?: "left" | "right";
  className?: string;
  /** screen-reader description (with `heading`, the heading renders it visibly; pass it here too so it is announced) */
  description?: React.ReactNode;
  /** unsaved work: Esc / X / `<DialogClose>` ask "¿Descartar cambios?" first */
  dirty?: boolean;
  /** heading block at the top of the body that renders its own `DialogPrimitive.Title` (ModalShell uses it) */
  heading?: React.ReactNode;
  /** ref to the footer element so content can be portalled into it (ModalShell's `ModalFooter`) */
  footerSlot?: (el: HTMLDivElement | null) => void;
  /** wraps the panel in a `<form>` so Enter and `type="submit"` buttons submit */
  onSubmit?: () => void;
}) {
  const desktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const tablet = useMediaQuery("(min-width: 768px)") && !desktop;
  const keyboard = useKeyboardInset();
  const guard = useDiscardGuard(dirty, onOpenChange);
  const lifted = !desktop && keyboard > 0;

  const footerCls = cn(
    "shrink-0 border-t border-transparent bg-surface px-5 pt-3 sm:px-6",
    desktop || lifted ? "pb-4" : "pb-[max(16px,calc(env(safe-area-inset-bottom)-8px))]",
    tablet && "md:px-8",
  );
  const panel = (
    <>
      <div className={cn("relative flex min-h-[68px] shrink-0 items-center px-4 pt-3", title ? "justify-center" : closeSide === "right" ? "justify-end" : "justify-start")}>
        <DialogPrimitive.Close
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-[12px] border border-hairline bg-surface text-ink outline-none transition hover:bg-sand focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95",
            title && (closeSide === "left" ? "absolute left-4 top-3" : "absolute right-4 top-3"),
          )}
          aria-label="Cerrar"
        >
          <X className="size-[18px]" />
        </DialogPrimitive.Close>
        {heading ? null : title ? (
          <DialogPrimitive.Title className="max-w-[calc(100%-120px)] truncate text-[16px] font-semibold text-ink">{title}</DialogPrimitive.Title>
        ) : (
          <DialogPrimitive.Title className="sr-only">{description ?? "Detalle"}</DialogPrimitive.Title>
        )}
        {!heading && description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-3 sm:px-6", tablet && "md:px-8")}>
        {heading}
        {children}
      </div>
      {footerSlot ? (
        <div ref={footerSlot} className={cn(footerCls, "empty:hidden")}>
          {footer}
        </div>
      ) : (
        footer && <div className={footerCls}>{footer}</div>
      )}
    </>
  );

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={guard.onOpenChange}>
        <AnimatePresence>
          {open && (
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn("fixed inset-0 z-50", desktop || tablet ? MODAL_SCRIM : "bg-canvas")}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content asChild forceMount {...(description ? {} : { "aria-describedby": undefined })}>
                <motion.div
                  initial={desktop ? { opacity: 0, scale: 0.96, y: 10 } : { y: "100%" }}
                  animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
                  exit={desktop ? { opacity: 0, scale: 0.97, y: 6 } : { y: "100%" }}
                  transition={desktop ? { duration: 0.28, ease: EASE } : { type: "spring", stiffness: 340, damping: 36 }}
                  style={lifted ? { bottom: 8 + keyboard } : undefined}
                  className={cn(
                    "fixed z-50 flex flex-col overflow-hidden bg-surface text-ink outline-none",
                    desktop
                      ? "left-1/2 top-1/2 max-h-[88dvh] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] shadow-lift"
                      : tablet
                        ? "bottom-4 left-1/2 top-[max(16px,env(safe-area-inset-top))] w-[min(620px,calc(100vw-48px))] -translate-x-1/2 rounded-[28px] shadow-lift"
                        : "inset-x-2 bottom-2 top-[max(8px,env(safe-area-inset-top))] rounded-[28px]",
                    className,
                  )}
                >
                  {onSubmit ? (
                    <form
                      noValidate
                      className="contents"
                      onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit();
                      }}
                    >
                      {panel}
                    </form>
                  ) : (
                    panel
                  )}
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          )}
        </AnimatePresence>
      </DialogPrimitive.Root>
      {guard.prompt}
    </>
  );
}

/** Heading block inside a flow: eyebrow (logo + "Job #4801 · Sep 12"), serif title, description. */
export function FlowHeading({ eyebrow, title, children, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6", className)}>
      {eyebrow && <div className="mb-1.5 flex items-center gap-2 text-[14px] text-subtle">{eyebrow}</div>}
      <h2 className="font-serif text-[30px] font-medium leading-[1.12] tracking-[-0.01em] text-ink">{title}</h2>
      {children && <div className="mt-2.5 text-[15.5px] leading-relaxed text-subtle">{children}</div>}
    </div>
  );
}

/* ───────────── stepper ( − 0.5 h + ) ───────────── */

export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 24,
  suffix = " h",
  decimals = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
  label?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-[14px] bg-sand p-1" role="group" aria-label={label}>
      <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => set(value - step)} disabled={value <= min} aria-label="Disminuir" className="inline-flex size-9 items-center justify-center rounded-[10px] bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.06)] disabled:opacity-40">
        <Minus className="size-4" />
      </motion.button>
      <span className="min-w-[64px] text-center text-[16px] font-semibold text-ink">
        <AnimatedNumber value={value} format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }} suffix={suffix} />
      </span>
      <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => set(value + step)} disabled={value >= max} aria-label="Aumentar" className="inline-flex size-9 items-center justify-center rounded-[10px] bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.06)] disabled:opacity-40">
        <Plus className="size-4" />
      </motion.button>
    </div>
  );
}

/** Row: bold label + hint on the left, control on the right. */
export function StepperRow({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Light-blue total card: "Total · Clock time 5 h 10 min ........ 5.0 h" */
export function TotalCard({ label, sub, value, tone = "blue", className }: { label: React.ReactNode; sub?: React.ReactNode; value: React.ReactNode; tone?: "blue" | "amber"; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-[20px] px-5 py-5", tone === "blue" ? "bg-blue-soft" : "bg-amber-soft", className)}>
      <div>
        <p className="text-[16px] font-semibold text-ink">{label}</p>
        {sub && <p className="mt-0.5 text-[14px] text-subtle">{sub}</p>}
      </div>
      <span className="text-[30px] font-medium tracking-[-0.02em] text-ink tabular">{value}</span>
    </div>
  );
}

/** Uppercase field label: "NOTA PARA MARIANA · OPCIONAL" */
export function FieldCaption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle", className)}>{children}</p>;
}

/** Sand input with a leading icon. */
export function SandInput({ icon, className, ...props }: React.ComponentProps<"input"> & { icon?: React.ReactNode }) {
  return (
    <label className={cn("flex h-[54px] items-center gap-3 rounded-[14px] border border-field-line bg-field px-4 focus-within:border-sky focus-within:ring-3 focus-within:ring-sky/30", className)}>
      {icon && <span className="text-subtle [&_svg]:size-[18px]">{icon}</span>}
      <input className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" {...props} />
    </label>
  );
}

/* ───────────── success ("Sent to Nizam") ───────────── */

export function SuccessHero({ title, children, icon }: { title: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <motion.span
        initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
        className="relative inline-flex size-[72px] items-center justify-center rounded-[20px] bg-[linear-gradient(140deg,#a9d4ff,#6aa9f7)] text-on-light shadow-[0_14px_30px_-14px_rgb(47_128_237/0.8)] dark:bg-[linear-gradient(140deg,var(--azure),var(--brand-deep))] dark:text-white dark:ring-1 dark:ring-edge-strong"
      >
        <span className="absolute inset-0 rounded-[20px] bg-white/30 animate-ping-soft dark:bg-white/15" />
        {icon ?? (
          <span className="relative inline-flex size-9 items-center justify-center rounded-full border-[2.5px] border-brand-deep dark:border-white">
            <Check className="size-5" strokeWidth={2.6} />
          </span>
        )}
      </motion.span>
      <motion.h2
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
        className="mt-6 font-serif text-[32px] font-medium leading-tight text-ink"
      >
        {title}
      </motion.h2>
      {children && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 max-w-[340px] text-[16px] leading-relaxed text-subtle">
          {children}
        </motion.div>
      )}
    </div>
  );
}

/** Bordered item card: logo · title · sub · value · status pill */
export function ItemCard({ leading, title, sub, value, status, className }: { leading?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; status?: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.45 }}
      className={cn("flex items-center gap-4 rounded-[20px] border border-hairline bg-surface p-4", className)}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-[16px] font-semibold text-ink">{title}</p>
          {value && <span className="shrink-0 text-[16px] font-medium text-ink tabular">{value}</span>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          {sub && <p className="truncate text-[13.5px] text-subtle">{sub}</p>}
          {status}
        </div>
      </div>
    </motion.div>
  );
}

/** Aurora-framed stat ("Your evidence this year · $18,420"). */
export function AuroraStat({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.55 }}
      className={cn("bg-aurora-frame grain rounded-[28px] p-2.5 shadow-lift", className)}
    >
      <div className="relative z-[2] rounded-[22px] bg-surface px-5 py-5">
        <p className="text-[14px] text-subtle">{label}</p>
        <div className="mt-2 text-[44px] font-medium leading-none tracking-[-0.035em] text-ink">{value}</div>
        {sub && <p className="mt-3 text-[14px] leading-snug text-subtle">{sub}</p>}
      </div>
    </motion.div>
  );
}

/** Date eyebrow + serif greeting + round avatar (Today header). */
export function MobileGreeting({ eyebrow, title, avatar }: { eyebrow: React.ReactNode; title: React.ReactNode; avatar?: React.ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14.5px] text-subtle first-letter:uppercase">{eyebrow}</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium leading-[1.1] tracking-[-0.01em] text-ink">{title}</h1>
      </div>
      {avatar}
    </motion.header>
  );
}
