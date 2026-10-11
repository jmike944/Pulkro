"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Required "motivo" (doc §3). Now the shared field (`@/components/pk/reason-field`): one rule for the whole app,
 * at least `REASON_MIN` (5) characters — gate the submit with `reasonOk(motivo)` so field and button agree.
 */
export { ReasonField as MotivoField, reasonOk, REASON_MIN } from "@/components/pk/reason-field";

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

/** Native date/time inputs — the phone's own pickers are the best UX in the field (16px below lg: no iOS zoom). */
export function DateTimeInput({ className, invalid, ...props }: React.ComponentProps<typeof Input> & { invalid?: boolean }) {
  return <Input {...props} aria-invalid={invalid || undefined} className={cn("h-11 rounded-[12px] bg-surface text-[16px] tabular md:text-[16px] lg:text-[15px]", className)} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-[12.5px] font-medium text-red-fg">
      {children}
    </motion.p>
  );
}
