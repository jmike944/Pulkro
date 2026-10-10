"use client";

import Link from "next/link";
import { useEffect, useState, type FocusEvent, type PointerEvent } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { toneText } from "@/lib/status";
import type { Client, User } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClientMark } from "@/components/pk/client-mark";
import { GlassCard } from "@/components/pk/aurora";
import { MobileRow, NextStepCard, BigButton } from "@/components/pk/mobile";
import { SoftBadge } from "@/components/pk/status";
import { PersonAvatar } from "@/components/pk/bits";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { KIND_ICON, KIND_SHORT, KIND_SINGULAR, KIND_TONE, kindHex, leadNote, oldestNote, tileTone, whenClass, whenOf, type When } from "./pending-meta";
import type { PendingGroupMeta, PendingItem, PendingKind } from "./use-pending-items";

export type Group = PendingGroupMeta & { items: PendingItem[] };

/* ───────────── small pieces ───────────── */

/** Soft tinted tile with the category icon (same recipe as the rest of the app). */
export function KindTile({ kind, size, className }: { kind: PendingKind; size: number; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", tileTone(KIND_TONE[kind]), className)}
      style={{ width: size, height: size, borderRadius: size >= 50 ? 14 : size >= 40 ? 13 : 11 }}
    >
      <Icon strokeWidth={1.8} style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46) }} />
    </span>
  );
}

/** Dot + text: red past its deadline, amber when it is due or has waited days, grey otherwise. */
function WhenLine({ w, className }: { w: When; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", whenClass(w.level), className)}>
      <span className={cn("size-[6px] shrink-0 rounded-full", w.level === "late" ? "bg-st-red" : w.level === "soon" ? "bg-st-amber" : "bg-[#c5ccd6]")} />
      {w.text}
    </span>
  );
}

/** Who has to act: "A mi cargo" when it is the person's own, otherwise the person or area it sits with. */
function ActorLine({ it, person, className }: { it: PendingItem; person?: User; className?: string }) {
  if (it.actionable) return <SoftBadge tone="blue">A mi cargo</SoftBadge>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {person && <PersonAvatar initials={person.initials} hue={person.hue} size={18} />}
      <span>
        A cargo de <span className="font-medium text-ink/80">{it.actor}</span>
      </span>
    </span>
  );
}

function ClientTile({ it, client, size }: { it: PendingItem; client?: Client; size: number }) {
  if (!client) return <KindTile kind={it.kind} size={size} />;
  return <ClientMark name={client.name} hue={client.hue} size={size} className={size >= 50 ? "rounded-[14px]" : undefined} />;
}

/* ───────────── hero: sentence + proportional bar + legend ───────────── */

/**
 * The queue at a glance. The bar is the page's one orchestrated motion (segments grow in once).
 * Bar segments are a pointer shortcut only (aria-hidden, not tabbable); the legend chips are the accessible
 * buttons — both jump to that group's list and highlight each other, but only for a real mouse or keyboard focus
 * (a tap on a phone must not leave the rest of the legend dimmed).
 */
export function QueueSummary({ sentence, groups, onJump }: { sentence: string; groups: Group[]; onJump: (k: PendingKind) => void }) {
  const [hot, setHot] = useState<PendingKind | null>(null);
  const dim = (k: PendingKind) => hot !== null && hot !== k;
  const hover = (k: PendingKind) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setHot(k);
  };
  const focus = (k: PendingKind) => (e: FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(":focus-visible")) setHot(k);
  };
  return (
    <div className="flex h-full flex-col">
      <p className="font-serif text-[27px] font-medium leading-[1.14] tracking-[-0.018em] text-ink sm:text-[31px] lg:text-[36px] xl:text-[40px]">{sentence}</p>
      <div className="mt-auto pt-8" onPointerLeave={() => setHot(null)}>
        <div aria-hidden className="flex h-11 items-center gap-[3px]">
          {groups.map((g, i) => (
            <button
              key={g.kind}
              type="button"
              tabIndex={-1}
              onClick={() => onJump(g.kind)}
              onPointerEnter={hover(g.kind)}
              title={`${g.label} · ${g.items.length}`}
              style={{ flexGrow: g.items.length }}
              className={cn("group flex h-full min-w-[10px] basis-0 items-center outline-none transition-[flex-grow,opacity] duration-500 motion-reduce:transition-none", dim(g.kind) && "opacity-35")}
            >
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.85, ease: EASE, delay: 0.4 + i * 0.07 }}
                className="block h-[22px] w-full origin-left rounded-full transition-[height] duration-200 group-hover:h-[28px] motion-reduce:transition-none"
                style={{ background: kindHex(g.kind) }}
              />
            </button>
          ))}
        </div>
        <ul aria-label="Pendientes por tipo" className="mt-1.5 flex flex-wrap gap-x-2 gap-y-2">
          {groups.map((g) => (
            <li key={g.kind}>
              <button
                type="button"
                onClick={() => onJump(g.kind)}
                onPointerEnter={hover(g.kind)}
                onFocus={focus(g.kind)}
                onBlur={() => setHot(null)}
                className={cn(
                  "relative inline-flex h-9 items-center gap-2 rounded-full bg-[#f3f5f8] pl-3 pr-3.5 text-[13.5px] text-ink outline-none transition-[background-color,opacity] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-[#e8ecf1] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  dim(g.kind) && "opacity-45",
                )}
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: kindHex(g.kind) }} />
                {KIND_SHORT[g.kind]}
                <span className="font-semibold tabular">{g.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───────────── "first in line" ───────────── */

/** Desktop lead: the single most urgent item with the action it needs, right on the aurora. */
export function LeadCard({ it, now, client, person, className }: { it: PendingItem; now: Date; client?: Client; person?: User; className?: string }) {
  const w = whenOf(it, now);
  return (
    <div className={cn("flex flex-col rounded-[22px] bg-white p-6 shadow-[0_1px_2px_rgb(16_24_40/0.05),0_22px_44px_-24px_rgb(2_58_99/0.45)]", className)}>
      <div className="flex items-start gap-3.5">
        <ClientTile it={it} client={client} size={44} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[14px] font-semibold", toneText[KIND_TONE[it.kind]])}>{KIND_SINGULAR[it.kind]}</p>
          <p className="mt-0.5 truncate text-[13.5px] text-subtle">
            <span className="font-medium text-ink/80 tabular">{it.folio}</span> · {it.client}
            {it.site ? ` · ${it.site}` : ""}
          </p>
        </div>
        <WhenLine w={w} className="shrink-0 pt-0.5 text-[13.5px]" />
      </div>
      <p className="mt-5 line-clamp-3 text-[21px] font-medium leading-[1.25] tracking-[-0.012em] text-ink">{it.title}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-subtle">{leadNote(it)}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 pt-6">
        {it.actionable ? (
          <Button asChild className="h-11 rounded-[12px] px-5 text-[15px] font-semibold">
            <Link href={it.href}>{it.cta}</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="outline" className="h-11 rounded-[12px] border-[#dfe3ea] px-5 text-[15px] font-semibold">
              <Link href={it.href}>Ver detalle</Link>
            </Button>
            <ActorLine it={it} person={person} className="text-[13.5px] text-subtle" />
          </>
        )}
      </div>
    </div>
  );
}

/** The two items right behind the lead: compact, whole row is the link. */
export function FollowList({ items, now, clients }: { items: PendingItem[]; now: Date; clients: Map<string, Client> }) {
  return (
    <GlassCard className="p-1.5">
      <ul className="divide-y divide-hairline">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className="group flex items-center gap-3.5 rounded-[18px] px-3.5 py-3 outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50">
              <ClientTile it={it} client={it.clientId ? clients.get(it.clientId) : undefined} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink group-hover:text-link">{it.title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-subtle">
                  <span className="shrink-0 tabular">{it.folio}</span>·<span className="truncate">{it.client}</span>·
                  <WhenLine w={whenOf(it, now)} className="shrink-0 text-[12.5px]" />
                </span>
              </span>
              <span className="shrink-0 text-[13.5px] font-semibold text-link">{it.actionable ? it.ctaShort : "Ver"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/** Phone lead: the aurora-framed next-step card, same language as Hoy. */
export function LeadNextStep({ it, now, client, person }: { it: PendingItem; now: Date; client?: Client; person?: User }) {
  const w = whenOf(it, now);
  return (
    <NextStepCard
      avatar={<ClientTile it={it} client={client} size={44} />}
      name={KIND_SINGULAR[it.kind]}
      sub={`${it.folio} · ${it.client}`}
      message={
        <>
          <span className="block text-[17px] font-semibold leading-snug text-ink">{it.title}</span>
          <WhenLine w={w} className="mt-2 text-[14px]" />
          <span className="mt-1 block text-[14.5px] leading-relaxed">{leadNote(it)}</span>
          {!it.actionable && <ActorLine it={it} person={person} className="mt-2.5 text-[14px] text-subtle" />}
        </>
      }
      action={
        <BigButton href={it.href} variant={it.actionable ? "primary" : "outline"}>
          {it.actionable ? it.cta : "Ver detalle"}
        </BigButton>
      }
    />
  );
}

/* ───────────── lists ───────────── */

export function GroupSection({
  group,
  now,
  clients,
  people,
  desktop,
  showBadge,
}: {
  group: Group;
  now: Date;
  clients: Map<string, Client>;
  people: Map<string, User>;
  desktop: boolean;
  /** show who acts on every row (Todo view); in "A mi cargo" it would be redundant */
  showBadge: (it: PendingItem) => boolean;
}) {
  // desktop sits under the "En seguimiento · n" h2; phones have no such heading, so the group title is the h2
  const Heading = desktop ? "h3" : "h2";
  return (
    <section id={`pend-${group.kind}`} aria-labelledby={`pend-${group.kind}-title`} tabIndex={-1} className="scroll-mt-4 outline-none not-first:mt-9 lg:scroll-mt-6 lg:not-first:mt-10">
      <header className="flex items-start gap-3.5 border-b border-hairline pb-3.5">
        <KindTile kind={group.kind} size={desktop ? 36 : 40} />
        <div className="min-w-0 flex-1">
          <Heading id={`pend-${group.kind}-title`} className="text-[17px] font-medium tracking-[-0.01em] text-ink">
            {group.label} <span className="ml-1 text-[14px] font-normal text-subtle tabular">{group.items.length}</span>
          </Heading>
          <p className="mt-0.5 text-[13.5px] leading-snug text-subtle">{group.hint}</p>
        </div>
      </header>
      <motion.ul variants={staggerContainer(0.035, 0.05)} initial="hidden" animate="show">
        {group.items.map((it) => (
          <motion.li key={it.id} variants={rowVariants}>
            {desktop ? (
              <DesktopRow it={it} now={now} client={it.clientId ? clients.get(it.clientId) : undefined} person={it.actorId ? people.get(it.actorId) : undefined} badge={showBadge(it)} />
            ) : (
              <PhoneRow it={it} now={now} client={it.clientId ? clients.get(it.clientId) : undefined} badge={showBadge(it)} />
            )}
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

function DesktopRow({ it, now, client, person, badge }: { it: PendingItem; now: Date; client?: Client; person?: User; badge: boolean }) {
  const w = whenOf(it, now);
  return (
    <Link
      href={it.href}
      className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-hairline py-4 outline-none transition-colors focus-visible:bg-sand/50"
    >
      <ClientTile it={it} client={client} size={44} />
      <span className="min-w-0">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-link">{it.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-subtle">
          {it.kind === "incidencia" && it.blocksClosure && <SoftBadge tone="red">Impide el cierre</SoftBadge>}
          <span>
            <span className="font-medium text-ink/80 tabular">{it.folio}</span> · {it.client}
          </span>
          <WhenLine w={w} />
          {badge && <ActorLine it={it} person={person} />}
        </span>
      </span>
      {it.actionable ? (
        <span
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 min-w-[96px] rounded-[12px] border-[#dfe3ea] px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)] group-hover:border-brand-deep group-hover:bg-brand-deep group-hover:text-white",
          )}
        >
          {it.ctaShort}
        </span>
      ) : (
        <span className="inline-flex h-10 min-w-[96px] items-center justify-end text-[14px] font-semibold text-link">Ver</span>
      )}
    </Link>
  );
}

function PhoneRow({ it, now, client, badge }: { it: PendingItem; now: Date; client?: Client; badge: boolean }) {
  const w = whenOf(it, now);
  return (
    <MobileRow
      href={it.href}
      leading={<ClientTile it={it} client={client} size={54} />}
      // MobileRow's own clamp is overridden by its `block`; clamp here so long incident texts stay at two lines
      title={<span className="line-clamp-2">{it.title}</span>}
      // folio line, then one wrapping status line (MobileRow's own status slot would centre its dot between two lines)
      meta={
        <span className="block min-w-0 flex-1 whitespace-normal">
          <span className="block truncate">
            <span className="font-medium text-ink/80 tabular">{it.folio}</span> · {it.client}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {it.kind === "incidencia" && it.blocksClosure && <span className="whitespace-nowrap font-medium text-st-red">Impide el cierre</span>}
            <WhenLine w={w} className="whitespace-nowrap" />
            {it.actionable ? badge && <SoftBadge tone="blue">A mi cargo</SoftBadge> : <span className="whitespace-nowrap">A cargo de {it.actor}</span>}
          </span>
        </span>
      }
    />
  );
}

/* ───────────── desktop rail ───────────── */

/** Sticky "Por tipo" index: counts, how long the oldest has waited, and where you are while scrolling the lists. */
export function TypeRail({ groups, now, active, onJump }: { groups: Group[]; now: Date; active: PendingKind | null; onJump: (k: PendingKind) => void }) {
  return (
    <nav aria-label="Por tipo">
      <ul className="-mx-3">
        {groups.map((g) => {
          const on = active === g.kind;
          return (
            <li key={g.kind}>
              <button
                type="button"
                onClick={() => onJump(g.kind)}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-[#f1f6fd]" : "hover:bg-[#f6f8fa]",
                )}
              >
                <KindTile kind={g.kind} size={36} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[14.5px] text-ink", on ? "font-semibold" : "font-medium")}>{g.label}</span>
                  <span className="block truncate text-[12.5px] text-subtle">{oldestNote(g.kind, g.items, now)}</span>
                </span>
                <span className="text-[17px] font-medium text-ink tabular">{g.items.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Which group's list the reader is in: the last one whose top has passed 40% of the viewport.
 * (That line, not the very top, so a group near the end of the page can still be the current one.)
 */
export function useScrollSpy(kinds: PendingKind[]) {
  const [active, setActive] = useState<PendingKind | null>(null);
  const key = kinds.join("|");
  useEffect(() => {
    const list = key ? (key.split("|") as PendingKind[]) : [];
    if (!list.length) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      let cur: PendingKind | null = null;
      for (const k of list) {
        const el = document.getElementById(`pend-${k}`);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) cur = k;
      }
      setActive(cur);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [key]);
  return active;
}
