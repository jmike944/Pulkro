"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClockSkew } from "@/lib/hooks";
import { fmtDuration, plural } from "@/lib/format";

/** "12 min", "3 h 20 min", "4 días". */
function span(ms: number) {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  return minutes >= 48 * 60 ? plural(Math.round(minutes / 1440), "día", "días") : fmtDuration(minutes);
}

/**
 * Capture screens (check-in/out, photos, notes, incidents, closure): the phone's clock differs from the server's by more
 * than 5 minutes (useClockSkew). Never blocks the capture and never changes the times it records (they are evidence): a
 * time ahead of the server is held in the queue until the server's clock passes it, so the person is asked to fix the
 * phone's date and time. Renders nothing otherwise.
 */
export function ClockWarning({ className }: { className?: string }) {
  const skew = useClockSkew();
  if (skew === undefined) return null;
  const ahead = skew < 0;
  return (
    <p className={cn("flex gap-2.5 rounded-[16px] bg-amber-soft px-3.5 py-3 text-[13.5px] leading-snug text-amber-olive", className)}>
      <Clock className="mt-0.5 size-4 shrink-0 text-amber-fg" aria-hidden />
      <span>
        La hora de su teléfono no coincide con la del servidor (va {span(skew)} {ahead ? "adelantada" : "atrasada"}). Corrija la fecha y
        hora del teléfono para que sus registros {ahead ? "se acepten" : "lleven la hora correcta"}.
      </span>
    </p>
  );
}
