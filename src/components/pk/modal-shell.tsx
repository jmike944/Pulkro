"use client";

/**
 * ModalShell — the one modal chrome of the app (audit 2026-10-10, cross-cutting #1).
 *
 *   desktop (≥ lg)  centered Dialog (size sm | md | lg)   or a right Sheet   (`desktop="sheet"`)
 *   phone   (< lg)  bottom sheet (default)                or a FlowScreen    (`phone="flow"`)
 *
 * Same everywhere: serif 26px title, 28px corners, 44px "Cerrar" at the top-right, a body that scrolls, a sticky
 * footer that stays above the keyboard and the home indicator, a footer hint that says what is still missing, and
 * an optional `dirty` guard that asks "¿Descartar cambios?" before Esc / outside tap / X throw work away.
 */
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { SheetContent } from "@/components/ui/sheet";
import { FlowScreen, MODAL_DESKTOP_QUERY, MODAL_SCRIM, useDiscardGuard, useKeyboardInset } from "./mobile";

export { MODAL_DESKTOP_QUERY, MODAL_SCRIM, useDiscardGuard, useKeyboardInset };

export type ModalSize = "sm" | "md" | "lg";

/** Everything about the chrome; `ModalShell` adds open state, the discard guard and the phone mode. */
export type ModalChromeProps = {
  /** serif title (also the accessible name) */
  title: React.ReactNode;
  /** one or two sentences under the title; `<b>` renders in ink */
  description?: React.ReactNode;
  /** small uppercase line above the title ("FOTO ANTES · JORNADA 2") */
  eyebrow?: React.ReactNode;
  /** tile above the title (`<IconTile>`, `<PulkroMark>`) */
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** footer actions (secondary first, primary last). For forms whose state lives in the body use `<ModalFooter>` there instead. */
  footer?: React.ReactNode;
  /** what is still missing before the primary action is enabled ("Indique el motivo"); see `firstMissing` */
  footerHint?: React.ReactNode;
  /** desktop width: sm 480 · md 560 (default) · lg 640 (right sheet: 440 · 520 · 600) */
  size?: ModalSize;
  /** desktop presentation: centered dialog (default) or right sheet */
  desktop?: "dialog" | "sheet";
  /** wraps the modal in a `<form noValidate>`: Enter and `type="submit"` buttons call it */
  onSubmit?: () => void;
  /** classes for the panel */
  className?: string;
  /** classes for the scrolling body */
  bodyClassName?: string;
};

export type ModalShellProps = ModalChromeProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** unsaved work: Esc, outside tap, the X and `<ModalCancel>` ask "¿Descartar cambios?" first */
  dirty?: boolean;
  /** phone presentation (< lg): bottom sheet (default) or full-screen FlowScreen for multi-step tasks */
  phone?: "flow" | "sheet";
};

const DIALOG_WIDTH: Record<ModalSize, string> = {
  sm: "sm:max-w-[480px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[640px]",
};
const SHEET_WIDTH: Record<ModalSize, string> = {
  sm: "data-[side=right]:sm:max-w-[440px]",
  md: "data-[side=right]:sm:max-w-[520px]",
  lg: "data-[side=right]:sm:max-w-[600px]",
};

const TITLE_CLS = "font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] text-ink";
const CLOSE_CLS =
  "absolute right-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full bg-sand text-ink outline-none transition hover:bg-sand-deep focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95";

/* ───────────── footer slot (body content portals its actions into the sticky footer) ───────────── */

/** `undefined` = not inside a ModalShell; `null` = inside, footer element not mounted yet. */
const FooterSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Responsive modal. Owns the Radix root, so pass `open` / `onOpenChange` here (not to a `<Dialog>`).
 *
 * @example
 * <ModalShell open={open} onOpenChange={setOpen} title="Cancelar OS-1042" description="…" size="sm" dirty={reason.length > 0}
 *   footer={<><ModalCancel /><Button disabled={!valid} onClick={submit}>Cancelar orden</Button></>}
 *   footerHint={firstMissing([!reasonOk(reason), "Indique el motivo"], [!confirmed, "Confirme la cancelación"])}>
 *   <ReasonField value={reason} onChange={setReason} />
 * </ModalShell>
 */
export function ModalShell({ open, onOpenChange, dirty, phone = "sheet", ...chrome }: ModalShellProps) {
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const guard = useDiscardGuard(dirty, onOpenChange);

  if (!isDesktop && phone === "flow")
    return (
      <>
        <ModalFlow open={open} onOpenChange={guard.onOpenChange} {...chrome} />
        {guard.prompt}
      </>
    );

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={guard.onOpenChange}>
        <ModalShellContent {...chrome} />
      </DialogPrimitive.Root>
      {guard.prompt}
    </>
  );
}

/**
 * The chrome without a Radix root: render it inside an existing `<Dialog open onOpenChange>` (that is how the
 * postventa `DialogPanel` works). Centered dialog / right sheet at lg+, bottom sheet below. No discard guard
 * here: the guard needs the root's onOpenChange, so use `ModalShell` when the form can hold unsaved work.
 */
export function ModalShellContent({
  title,
  description,
  eyebrow,
  icon,
  children,
  footer,
  footerHint,
  size = "md",
  desktop = "dialog",
  onSubmit,
  className,
  bodyClassName,
}: ModalChromeProps) {
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const keyboard = useKeyboardInset();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const lifted = !isDesktop && keyboard > 0;
  const describedBy = description ? {} : { "aria-describedby": undefined };

  const inner = (
    <>
      <header
        className={cn(
          "relative shrink-0 border-b px-5 pb-4 pr-[68px] pt-6 transition-colors lg:px-7 lg:pr-[76px] lg:pt-7",
          scrolled ? "border-hairline" : "border-transparent",
        )}
      >
        <ShellHeading title={title} description={description} eyebrow={eyebrow} icon={icon} />
        <DialogPrimitive.Close aria-label="Cerrar" className={CLOSE_CLS}>
          <X className="size-[18px]" aria-hidden />
        </DialogPrimitive.Close>
      </header>
      <div
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 lg:px-7 lg:pb-7",
          lifted ? "pb-6" : "pb-[max(24px,env(safe-area-inset-bottom))]",
          bodyClassName,
        )}
      >
        <FooterSlot.Provider value={slot}>
          {children}
          {(footer || footerHint) && <ModalFooter hint={footerHint}>{footer}</ModalFooter>}
        </FooterSlot.Provider>
      </div>
      <div
        ref={setSlot}
        data-slot="modal-footer"
        className={cn(
          "shrink-0 space-y-3 border-t border-hairline bg-wash px-5 pt-4 empty:hidden lg:px-7 lg:pb-4",
          lifted ? "pb-4" : "pb-[max(16px,env(safe-area-inset-bottom))]",
        )}
      />
    </>
  );
  const panel = onSubmit ? (
    <form
      noValidate
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {inner}
    </form>
  ) : (
    inner
  );

  if (!isDesktop)
    return (
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName={MODAL_SCRIM}
        style={lifted ? { bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard + 24}px)` } : undefined}
        // a bottom sheet is always full width: drop any desktop max-width the caller set for the dialog
        className={cn("max-h-[92dvh] gap-0 overflow-hidden rounded-t-[28px] bg-surface p-0 text-ink data-[side=bottom]:border-t-0", className, "max-w-none sm:max-w-none")}
        {...describedBy}
      >
        {panel}
      </SheetContent>
    );

  if (desktop === "sheet")
    return (
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName={MODAL_SCRIM}
        className={cn("gap-0 overflow-hidden bg-surface p-0 text-ink data-[side=right]:w-full", SHEET_WIDTH[size], className)}
        {...describedBy}
      >
        {panel}
      </SheetContent>
    );

  return (
    <DialogContent
      showCloseButton={false}
      overlayClassName={MODAL_SCRIM}
      className={cn(
        "flex max-h-[min(90dvh,900px)] flex-col gap-0 overflow-hidden rounded-[28px] bg-surface p-0 text-ink shadow-lift ring-1 ring-edge duration-200",
        DIALOG_WIDTH[size],
        className,
      )}
      {...describedBy}
    >
      {panel}
    </DialogContent>
  );
}

/** Phone flow: FlowScreen (X bar, inset panel, keyboard-aware footer) with the shell's heading and footer slot. */
function ModalFlow({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  icon,
  children,
  footer,
  footerHint,
  onSubmit,
  className,
  bodyClassName,
}: ModalChromeProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      description={description}
      heading={<ShellHeading className="mb-6" title={title} description={description} eyebrow={eyebrow} icon={icon} />}
      footerSlot={setSlot}
      onSubmit={onSubmit}
      className={className}
    >
      <FooterSlot.Provider value={slot}>
        {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
        {(footer || footerHint) && <ModalFooter hint={footerHint}>{footer}</ModalFooter>}
      </FooterSlot.Provider>
    </FlowScreen>
  );
}

function ShellHeading({
  title,
  description,
  eyebrow,
  icon,
  className,
}: Pick<ModalChromeProps, "title" | "description" | "eyebrow" | "icon"> & { className?: string }) {
  return (
    <div className={className}>
      {icon && <div className="mb-4">{icon}</div>}
      {eyebrow && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{eyebrow}</p>}
      <DialogPrimitive.Title className={TITLE_CLS}>{title}</DialogPrimitive.Title>
      {description && (
        <DialogPrimitive.Description asChild>
          <div className="mt-2 text-[14.5px] leading-relaxed text-subtle [&_b]:font-semibold [&_b]:text-ink">{description}</div>
        </DialogPrimitive.Description>
      )}
    </div>
  );
}

/* ───────────── footer ───────────── */

/**
 * Sticky footer row: optional hint + actions (secondary first, primary last; on phones they stack full width with
 * the primary on top). Render it anywhere inside a ModalShell body — it portals into the shell's footer, so forms
 * keep their state in the body. Outside a shell it renders inline at the end of the content.
 */
export function ModalFooter({ children, hint, className }: { children?: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  const slot = useContext(FooterSlot);
  const row = (
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4", className)}>
      <p aria-live="polite" className={cn("text-center text-[13px] leading-snug text-subtle lg:mr-auto lg:text-left", !hint && "sr-only")}>
        <AnimatePresence mode="wait" initial={false}>
          {hint ? (
            <motion.span
              key={typeof hint === "string" ? hint : "hint"}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
              className="inline-block"
            >
              {hint}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </p>
      {children ? <div className="flex flex-col-reverse gap-2 lg:ml-auto lg:flex-row lg:items-center">{children}</div> : null}
    </div>
  );
  if (slot === undefined) return <div className="mt-6 border-t border-hairline pt-4">{row}</div>;
  return slot ? createPortal(row, slot) : null;
}

/** Secondary "Cancelar" (or any label) that closes through the shell, so a `dirty` modal asks first. */
export function ModalCancel({ children = "Cancelar", className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <DialogPrimitive.Close asChild>
      <Button type="button" variant="outline" className={cn("h-11 rounded-[12px] border-line px-5 text-[14px] font-semibold", className)} {...props}>
        {children}
      </Button>
    </DialogPrimitive.Close>
  );
}

/**
 * The one validation pattern: keep the primary button disabled and say what is missing in the footer.
 * Returns the message of the first check that is still missing (or undefined when everything is ready).
 *
 * @example footerHint={firstMissing([!reasonOk(reason), "Indique el motivo (mínimo 5 caracteres)"], [!confirmed, "Marque la casilla de confirmación"])}
 */
export function firstMissing(...checks: ReadonlyArray<readonly [missing: unknown, message: string]>): string | undefined {
  for (const [missing, message] of checks) if (missing) return message;
  return undefined;
}
