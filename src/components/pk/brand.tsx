import { cn } from "@/lib/utils";

/**
 * Pulkro mark: navy tile with a sky "clean swirl" (echoes the circular swirl in the Pulkro logo).
 */
export function PulkroMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-brand-deep shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_6px_14px_-6px_rgb(2_58_99/0.6)]",
        className,
      )}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[radial-gradient(80%_80%_at_20%_15%,rgb(122_209_244/0.35),transparent_60%)]" />
      <svg viewBox="0 0 32 32" className={cn("relative size-[68%]", animated && "animate-[spin_9s_linear_infinite]")}>
        <defs>
          <linearGradient id="pk-swirl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#bfeaff" />
            <stop offset="1" stopColor="#7ad1f4" />
          </linearGradient>
        </defs>
        <path
          d="M16 4.5a11.5 11.5 0 1 0 11.5 11.5"
          fill="none"
          stroke="url(#pk-swirl)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path d="M16 10.2a5.8 5.8 0 1 1-5.8 5.8" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.9" fill="#7ad1f4" />
      </svg>
    </span>
  );
}

export function PulkroWordmark({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="font-brand text-[19px] font-extrabold tracking-[0.18em] text-brand-deep">PULKRO</span>
      {sub && <span className="mt-1 text-[10.5px] font-medium tracking-wide text-subtle">Cuadrillas · Operación y postventa</span>}
    </span>
  );
}
