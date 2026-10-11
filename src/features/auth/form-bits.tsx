"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/pk/motion";
import { PASSWORD_RULES } from "./password-policy";

const FIELD_CLS =
  "flex h-[54px] items-center gap-3 rounded-[14px] border border-field-line bg-field px-4 focus-within:border-sky focus-within:ring-3 focus-within:ring-sky/30";
const INPUT_CLS = "h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint";

/** Visible label over a sand input (16px text: phones do not zoom in). */
export function AuthField({ id, label, icon, ...props }: React.ComponentProps<"input"> & { id: string; label: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <div className={FIELD_CLS}>
        {icon && <span className="text-subtle [&_svg]:size-[18px]">{icon}</span>}
        <input id={id} className={INPUT_CLS} {...props} />
      </div>
    </div>
  );
}

/** Password input with a 44px show / hide toggle. */
export function PasswordField({ id, label, icon, ...props }: Omit<React.ComponentProps<"input">, "type"> & { id: string; label: string; icon?: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <div className={cn(FIELD_CLS, "pr-1")}>
        {icon && <span className="text-subtle [&_svg]:size-[18px]">{icon}</span>}
        <input id={id} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={INPUT_CLS} {...props} />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={shown}
          aria-controls={id}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] text-subtle outline-none transition hover:text-ink focus-visible:ring-3 focus-visible:ring-sky/40"
        >
          {shown ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
    </div>
  );
}

/** Error / notice under a form; announced to screen readers. */
export function FormMessage({ tone = "error", children }: { tone?: "error" | "info" | "success"; children?: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.p
          role={tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className={cn(
            "overflow-hidden rounded-[14px] px-4 py-3 text-[13.5px] leading-snug",
            tone === "error" && "bg-red-soft text-red-ink",
            tone === "info" && "bg-blue-wash text-blue-ink",
            tone === "success" && "bg-teal-soft text-teal-fg",
          )}
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** Text-styled secondary action with a 44px tap target. */
export function TextAction({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-1 text-[14.5px] font-semibold text-link underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-sky/40 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Live checks of the password policy (each line says whether it is met, not only by color). */
export function PasswordChecklist({ password, confirmation }: { password: string; confirmation: string }) {
  const lines = [
    ...PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) })),
    { id: "match", label: "Las dos contraseñas coinciden", ok: password.length > 0 && password === confirmation },
  ];
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Requisitos de la contraseña">
      {lines.map((l) => (
        <li key={l.id} className={cn("flex items-center gap-2 text-[13.5px] transition-colors", l.ok ? "text-teal-fg" : "text-subtle")}>
          <span
            className={cn(
              "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors",
              l.ok ? "bg-teal-soft" : "",
            )}
          >
            {l.ok ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-3" />}
          </span>
          {l.label}
          <span className="sr-only">{l.ok ? ": cumple" : ": falta"}</span>
        </li>
      ))}
    </ul>
  );
}
