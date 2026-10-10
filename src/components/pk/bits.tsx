"use client";

import Link from "next/link";
import NumberFlow, { type Format } from "@number-flow/react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMonthShort, d } from "@/lib/format";
import { toneDot, type Tone } from "@/lib/status";
import { EASE } from "./motion";

/* ───────────── numbers ───────────── */

/** Animated number (counts on mount / change). Spanish-MX grouping. */
export function AnimatedNumber({
  value,
  className,
  format,
  prefix,
  suffix,
}: {
  value: number;
  className?: string;
  format?: Format;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <NumberFlow
      value={value}
      locales="es-MX"
      format={format}
      prefix={prefix}
      suffix={suffix}
      className={cn("tabular", className)}
      willChange
    />
  );
}

/* ───────────── date badge ───────────── */

/** "OCT / 9" tile used as the first column of work lists. */
export function DateBadge({ date, className, tone }: { date: string | Date; className?: string; tone?: "today" | "late" }) {
  const dt = d(date);
  return (
    <div
      className={cn(
        "flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[14px] border bg-white shadow-[0_1px_2px_rgb(16_24_40/0.04)]",
        tone === "today" && "border-sky bg-sky-soft",
        tone === "late" && "border-[#f7c8ca] bg-[#fff5f5]",
        className,
      )}
    >
      <span className="text-[10.5px] font-semibold tracking-[0.08em] text-subtle">{fmtMonthShort(dt)}</span>
      <span className="text-[19px] font-semibold leading-none text-ink tabular">{dt.getDate()}</span>
    </div>
  );
}

/* ───────────── avatars ───────────── */

export function PersonAvatar({
  name,
  initials,
  hue = 210,
  size = 32,
  className,
  ring,
}: {
  name?: string;
  initials: string;
  hue?: number;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide", ring && "ring-2 ring-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.34),
        background: `oklch(0.95 0.03 ${hue})`,
        color: `oklch(0.38 0.08 ${hue})`,
      }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
  className,
}: {
  people: { id: string; name: string; initials: string; hue: number }[];
  max?: number;
  size?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((p, i) => (
        <PersonAvatar key={p.id} name={p.name} initials={p.initials} hue={p.hue} size={size} ring className={i ? "-ml-2" : ""} />
      ))}
      {rest > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-semibold text-subtle ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ───────────── section header ───────────── */

/** "Recover $12,410 at risk ............ Review all →" */
export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "Ver todo",
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[13.5px] text-subtle">{subtitle}</p>}
      </div>
      {action}
      {href && <UnderlineLink href={href}>{linkLabel}</UnderlineLink>}
    </div>
  );
}

export function UnderlineLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex shrink-0 items-center gap-1.5 border-b-2 border-ink pb-1 text-[14px] font-medium text-ink transition-colors hover:border-link hover:text-link",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function CornerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-full bg-[#f2f4f7] text-ink transition hover:bg-brand-deep hover:text-white"
    >
      <ArrowUpRight className="size-4" />
    </Link>
  );
}

/* ───────────── bar list ───────────── */

/** "Why claims get denied" horizontal bars: first bar strong blue, rest light. */
export function BarList({
  items,
  className,
  showCount,
}: {
  items: { label: string; value: number; pct: number; sub?: string }[];
  className?: string;
  showCount?: boolean;
}) {
  const max = Math.max(0.0001, ...items.map((i) => i.pct));
  return (
    <ul className={cn("space-y-[18px]", className)}>
      {items.map((it, i) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-4">
          <div className="min-w-0">
            <p className="truncate text-[14px] text-ink">{it.label}</p>
            {it.sub && <p className="text-[12px] text-subtle">{it.sub}</p>}
          </div>
          <div className="h-[7px] w-full">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(it.pct / max) * 100}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.07 }}
              className={cn("h-full rounded-full", i === 0 ? "bg-[#1667e0]" : "bg-[#b9d8fb]")}
            />
          </div>
          <span className="text-right text-[14px] font-semibold text-ink tabular">
            {showCount ? it.value : `${Math.round(it.pct * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── progress ───────────── */

export function ProgressLine({ value, className, tone = "blue" }: { value: number; className?: string; tone?: "blue" | "amber" | "red" | "teal" }) {
  const color = { blue: "bg-[#1667e0]", amber: "bg-st-amber", red: "bg-st-red", teal: "bg-st-teal" }[tone];
  return (
    <div className={cn("h-[6px] w-full overflow-hidden rounded-full bg-[#eef1f5]", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
  );
}

/* ───────────── stat ───────────── */

/** Small labeled stat: "• Pending  $31.2K  22 claims" */
export function MiniStat({ tone, label, value, sub, className }: { tone: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-2 whitespace-nowrap text-[12.5px] text-subtle sm:text-[13px]">
        <span className={cn("size-[6px] shrink-0 rounded-full", toneDot[tone])} />
        {label}
      </p>
      <p className="mt-1.5 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
        <span className="text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink tabular">{value}</span>
        {sub && <span className="truncate text-[12.5px] text-subtle sm:text-[13px]">{sub}</span>}
      </p>
    </div>
  );
}

/** Icon tile used in card headers ("Recovered this month" icon). */
export function IconTile({ children, className, tone = "sky" }: { children: React.ReactNode; className?: string; tone?: "sky" | "navy" | "amber" | "red" | "teal" | "violet" }) {
  const t = {
    sky: "bg-[#e3f1fd] text-[#1667e0]",
    navy: "bg-brand-deep text-white",
    amber: "bg-[#fff1d6] text-[#b86e00]",
    red: "bg-[#fde4e4] text-st-red",
    teal: "bg-[#dcf4ef] text-st-teal",
    violet: "bg-[#ebe5ff] text-st-violet",
  }[tone];
  return <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-[17px]", t, className)}>{children}</span>;
}

/* ───────────── insight callout ───────────── */

export function Insight({ icon, children, href, linkLabel, className }: { icon: React.ReactNode; children: React.ReactNode; href?: string; linkLabel?: string; className?: string }) {
  return (
    <div className={cn("flex gap-4 rounded-[20px] bg-[#f4f8fd] p-5", className)}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#cfe6fd] text-[#1667e0] [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 text-[14px] leading-relaxed text-ink">
        {children}
        {href && (
          <Link href={href} className="group mt-1.5 flex w-fit items-center gap-1.5 font-semibold text-link">
            {linkLabel}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ───────────── key-value list ───────────── */

export function KeyValues({ title, rows, className }: { title?: string; rows: { k: React.ReactNode; v: React.ReactNode }[]; className?: string }) {
  return (
    <div className={className}>
      {title && <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{title}</p>}
      <dl className="space-y-3.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-6 text-[14px]">
            <dt className="shrink-0 text-subtle">{r.k}</dt>
            <dd className="min-w-0 text-right font-medium text-ink">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ───────────── panel ───────────── */

/** Plain white bordered card for secondary content blocks. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[22px] border border-hairline bg-white p-5 shadow-soft sm:p-6", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle", className)}>{children}</p>;
}
