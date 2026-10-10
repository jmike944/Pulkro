"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

/** Required "motivo" (doc §3: every change records user, date and reason) with quick suggestions. */
export function MotivoField({
  id,
  value,
  onChange,
  suggestions,
  placeholder = "¿Por qué se hace el cambio?",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block text-[13px] text-subtle">
        Motivo <span className="text-red-fg">*</span>
      </Label>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {suggestions.map((s) => {
          const on = value === s;
          return (
            <motion.button
              key={s}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(s)}
              aria-pressed={on}
              className={cn(
                "h-10 rounded-full border px-3.5 text-[13px] transition-colors sm:h-9",
                on ? "border-ink bg-ink text-on-ink" : "border-hairline bg-surface text-ink hover:bg-muted",
              )}
            >
              {s}
            </motion.button>
          );
        })}
      </div>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[76px] rounded-[14px] text-[15px]" />
      <p className="mt-1.5 text-[12px] text-subtle">Queda en la bitácora de la orden con tu usuario y la fecha.</p>
    </div>
  );
}

/** Explicit confirmation checkbox (the "Submit claim" pattern). */
export function ConfirmCheck({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-[16px] p-4 text-[13.5px] leading-snug text-ink transition-colors", checked ? "bg-blue-soft" : "bg-blue-wash")}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5 size-5 rounded-[6px]" />
      <span>{children}</span>
    </label>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] text-subtle">
      {children}
    </Label>
  );
}

/** Native date/time inputs — the phone's own pickers are the best UX in the field. */
export function DateTimeInput({ className, invalid, ...props }: React.ComponentProps<typeof Input> & { invalid?: boolean }) {
  return <Input {...props} aria-invalid={invalid || undefined} className={cn("h-11 rounded-[12px] bg-surface text-[15px] tabular", className)} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-[12.5px] font-medium text-red-fg">
      {children}
    </motion.p>
  );
}
