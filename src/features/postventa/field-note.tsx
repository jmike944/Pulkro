import { cn } from "@/lib/utils";

/**
 * Line under a field that says how to fix it ("Escriba al menos 10 caracteres (le faltan 4).").
 * Same voice and colors as the shared `ReasonField`, for the fields that are not a reason.
 *
 * Always render it and pass the text only while the field is invalid (`<FieldNote>{short && "…"}</FieldNote>`):
 * a live region has to be in the page before its text changes, or screen readers can miss the first announcement.
 * Empty, it takes no space.
 */
export function FieldNote({ id, children, className }: { id?: string; children?: React.ReactNode; className?: string }) {
  return (
    <p id={id} aria-live="polite" className={cn("mt-1.5 text-[12.5px] font-medium leading-snug text-amber-fg empty:mt-0", className)}>
      {children}
    </p>
  );
}

/** Amber (not destructive red) outline for a field that is still short; matches the `FieldNote` under it, in both themes. */
export const FIELD_WARN =
  "aria-invalid:border-amber-line-strong aria-invalid:ring-amber-line/30 dark:aria-invalid:border-amber-line-strong dark:aria-invalid:ring-amber-line/30";

/** "le falta 1" / "le faltan 4" */
export const missingChars = (n: number) => (n === 1 ? "le falta 1" : `le faltan ${n}`);
