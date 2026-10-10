"use client";

import Link from "next/link";
import { motion, LayoutGroup } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderTools } from "@/components/shell/header-tools";
import { EASE } from "./motion";

/**
 * Page header: serif display title, one-line narrative summary with <b> emphasis,
 * search + notifications at the right, optional breadcrumb and actions.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  titleAddon,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  titleAddon?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-7 sm:mb-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {breadcrumb && (
            <motion.nav
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="mb-4 flex items-center gap-2 text-[14px] sm:mb-5"
              aria-label="Ruta"
            >
              {breadcrumb[0]?.href && (
                <Link href={breadcrumb[0].href} aria-label="Regresar" className="-ml-1 rounded-md p-1 text-subtle hover:bg-muted hover:text-ink">
                  <ChevronLeft className="size-4" />
                </Link>
              )}
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[#c5ccd6]">/</span>}
                  {b.href && i < breadcrumb.length - 1 ? (
                    <Link href={b.href} className="text-subtle hover:text-ink">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{b.label}</span>
                  )}
                </span>
              ))}
            </motion.nav>
          )}
          <motion.div
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <h1 className="font-serif text-[32px] font-medium leading-[1.08] tracking-[-0.015em] text-ink sm:text-[40px]">{title}</h1>
            {titleAddon}
          </motion.div>
          {meta && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-subtle"
            >
              {meta}
            </motion.div>
          )}
          {description && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
              className="mt-2.5 hidden max-w-3xl text-[15px] leading-relaxed text-subtle lg:block [&_b]:font-semibold [&_b]:text-ink"
            >
              {description}
            </motion.p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-4">
          <HeaderTools />
          {actions && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
              className="hidden flex-wrap items-center justify-end gap-2.5 sm:flex"
            >
              {actions}
            </motion.div>
          )}
        </div>
      </div>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
          className="mt-2.5 text-[15px] leading-relaxed text-subtle lg:hidden [&_b]:font-semibold [&_b]:text-ink"
        >
          {description}
        </motion.p>
      )}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:hidden">{actions}</div>}
    </header>
  );
}

/* ───────────── underline tabs (Overview · Evidence 9/10 · Activity 6) ───────────── */

export type TabItem = { value: string; label: string; count?: React.ReactNode };

export function UnderlineTabs({
  items,
  value,
  onChange,
  className,
  id = "tabs",
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <LayoutGroup id={id}>
      <div role="tablist" className={cn("scrollbar-none -mx-1 flex gap-7 overflow-x-auto border-b border-hairline px-1", className)}>
        {items.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 pb-3.5 pt-1 text-[15px] transition-colors",
                active ? "font-semibold text-ink" : "text-subtle hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className={cn("text-[12.5px] tabular", active ? "text-subtle" : "text-[#98a2b3]")}>{t.count}</span>}
              {active && (
                <motion.span layoutId="underline" className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/* ───────────── segmented control (Mes · Trimestre · Año) ───────────── */

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  id = "seg",
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  id?: string;
}) {
  return (
    <LayoutGroup id={id}>
      <div className={cn("inline-flex rounded-[12px] bg-[#f2f4f7] p-1", className)}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              onClick={() => onChange(it.value)}
              className={cn("relative rounded-[9px] px-3.5 py-1.5 text-[13.5px] transition-colors", active ? "font-semibold text-ink" : "text-subtle hover:text-ink")}
            >
              {active && (
                <motion.span
                  layoutId="thumb"
                  className="absolute inset-0 rounded-[9px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.08),0_2px_8px_-2px_rgb(16_24_40/0.08)]"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative">{it.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
