import { cn } from "@/lib/utils";

/** Official monochrome Pulkro emblem on the app's navy brand tile. */
export function PulkroMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-deep dark:ring-1 dark:ring-white/10", className)} aria-hidden>
      <PulkroEmblem className={cn("size-[78%] text-white", animated && "motion-safe:animate-[spin_9s_linear_infinite]")} />
    </span>
  );
}

/** Official Pulkro emblem (vectorized, one colour). Tinted with the current text colour via a CSS mask. */
export function PulkroEmblem({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-9 shrink-0 bg-current [mask:url(/brand/pulkro-emblem.svg)_center/contain_no-repeat]", className)}
    />
  );
}

/** "PULKRO" lettering from the original logo (vectorized, one colour). */
export function PulkroLetters({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Pulkro"
      className={cn("inline-block aspect-[309/44] h-[15px] shrink-0 bg-current [mask:url(/brand/pulkro-letters.svg)_center/contain_no-repeat]", className)}
    />
  );
}

export function PulkroWordmark({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="font-brand text-[19px] font-extrabold tracking-[0.18em] text-brand-ink">PULKRO</span>
      {sub && <span className="mt-1 text-[10.5px] font-medium tracking-wide text-subtle">Cuadrillas · Operación y postventa</span>}
    </span>
  );
}

/** Full official logo: emblem and original vector lettering, in one theme-aware colour. */
export function PulkroLogo({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Pulkro" className={cn("inline-flex items-center gap-4 text-brand-ink", className)}>
      <PulkroEmblem className="size-14" />
      <span aria-hidden className="inline-block aspect-[309/44] h-6 bg-current [mask:url(/brand/pulkro-letters.svg)_center/contain_no-repeat]" />
    </span>
  );
}
