"use client";

import { useId, useSyncExternalStore } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

/** Claro / Oscuro / Sistema. "Sistema" (the default) follows the device's light/dark setting live. */
export const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

export type ThemeChoice = (typeof THEME_OPTIONS)[number]["value"];

const subscribeNone = () => () => {};

/** True only after hydration: the stored theme is unknown on the server, so nothing theme-dependent renders before. */
function useMounted() {
  return useSyncExternalStore(subscribeNone, () => true, () => false);
}

/** Current choice (light | dark | system), the resolved scheme, and the setter. Safe to render during hydration. */
export function useThemeChoice() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const value: ThemeChoice = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  const resolved: "light" | "dark" | undefined = mounted ? (resolvedTheme === "dark" ? "dark" : "light") : undefined;
  return { value, resolved, setTheme: (v: ThemeChoice) => setTheme(v) };
}

/**
 * Segmented 3-way switch (Claro · Oscuro · Sistema) for the phone Menú and Perfil.
 * `compact` is the slimmer row used inside the Menú sheet; both keep 44px+ tap targets.
 */
export function ThemeSegmented({ className, compact }: { className?: string; compact?: boolean }) {
  const { value, setTheme } = useThemeChoice();
  const id = useId();
  return (
    <LayoutGroup id={`theme-${id}`}>
      <div role="radiogroup" aria-label="Tema" className={cn("grid grid-cols-3 gap-1 rounded-[14px] bg-tile p-1", className)}>
        {THEME_OPTIONS.map(({ value: v, label, icon: Icon }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(v)}
              className={cn(
                "relative inline-flex items-center justify-center gap-1.5 rounded-[11px] px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-azure/60",
                compact ? "h-11 text-[14px]" : "h-12 text-[14.5px]",
                active ? "font-semibold text-ink" : "text-subtle hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="theme-thumb"
                  className="absolute inset-0 rounded-[11px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.08),0_2px_8px_-2px_rgb(16_24_40/0.08)] ring-1 ring-edge dark:bg-press"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <Icon className="relative size-[17px] shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** "Tema" radio group for a DropdownMenuContent (the desktop sidebar's user menu). */
export function ThemeMenuGroup() {
  const { value, setTheme } = useThemeChoice();
  return (
    <>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(v) => setTheme(v as ThemeChoice)}>
        {THEME_OPTIONS.map(({ value: v, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={v} value={v} className="gap-2.5">
            <Icon className="size-4" aria-hidden />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
