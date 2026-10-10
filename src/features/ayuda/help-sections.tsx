"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  CloudOff,
  FileClock,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  Phone,
  PhoneCall,
  Send,
  Split,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DocTag, SearchField, norm } from "@/features/configuracion/shared";
import { PULKRO_CONTACT } from "@/features/configuracion/privacy-notice";
import { BUSINESS_RULES, FAQ, PENDING_QUESTIONS, type RuleIcon } from "./help-content";

const RULE_ICON: Record<RuleIcon, { icon: React.ReactNode; tone: React.ComponentProps<typeof IconTile>["tone"] }> = {
  jornadas: { icon: <Split />, tone: "sky" },
  gps: { icon: <MapPin />, tone: "sky" },
  fotos: { icon: <Camera />, tone: "amber" },
  incidencia: { icon: <TriangleAlert />, tone: "red" },
  envio: { icon: <Send />, tone: "teal" },
  offline: { icon: <CloudOff />, tone: "violet" },
  version: { icon: <FileClock />, tone: "navy" },
};

/* ───────────── §8 business rules ───────────── */

export function BusinessRules() {
  return (
    <motion.ul
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {BUSINESS_RULES.map((r, i) => {
        const ic = RULE_ICON[r.icon];
        const wide = i === BUSINESS_RULES.length - 1 && BUSINESS_RULES.length % 3 === 1;
        return (
          <motion.li
            key={r.title}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
            whileHover={{ y: -3 }}
            className={cn(
              "group flex flex-col rounded-[22px] border border-hairline bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift",
              wide && "sm:col-span-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-8 xl:col-span-3",
            )}
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <IconTile tone={ic.tone} className="size-10 rounded-[12px] [&_svg]:size-5">
                  {ic.icon}
                </IconTile>
                <span className={cn("font-serif text-[22px] leading-none text-ghost tabular", wide && "sm:hidden")}>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[16px] font-semibold text-ink">
                {r.title}
                {r.pending && <DocTag status="pendiente" />}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-subtle">{r.rule}</p>
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col", wide && "sm:justify-center")}>
              <p className="mt-4 rounded-[14px] bg-blue-wash px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">
                <span className="font-semibold">En el prototipo: </span>
                {r.how}
              </p>
              <Link href={r.href} className="group/link mt-auto inline-flex w-fit items-center gap-1.5 pt-4 text-[13.5px] font-semibold text-link">
                {r.linkLabel}
                <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-0.5" />
              </Link>
            </div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

/* ───────────── §11 pending decisions ───────────── */

export function PendingQuestions() {
  return (
    <motion.ul
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="grid gap-3 md:grid-cols-2"
    >
      {PENDING_QUESTIONS.map((p, i) => (
        <motion.li
          key={p.q}
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
          className="relative flex flex-col overflow-hidden rounded-[20px] bg-amber-soft p-4 ring-1 ring-amber-line sm:p-5"
        >
          <span aria-hidden className="pointer-events-none absolute -top-4 right-4 select-none font-serif text-[84px] leading-none text-[#f3d9a6]/60">
            ?
          </span>
          <div className="relative flex items-center gap-2">
            <DocTag status="pendiente" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-amber-ink/80">
              {String(i + 1).padStart(2, "0")} · {p.topic}
            </span>
          </div>
          <p className="relative mt-3 text-[15.5px] font-semibold leading-snug text-ink">{p.q}</p>
          <p className="relative mt-2 text-[13.5px] leading-relaxed text-ink/70">
            <span className="font-semibold text-ink/85">Supuesto del prototipo: </span>
            {p.now}
          </p>
          {p.href && (
            <Link href={p.href} className="group relative mt-auto inline-flex w-fit items-center gap-1.5 pt-3 text-[13px] font-semibold text-amber-ink hover:text-ink">
              {p.linkLabel}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}

/* ───────────── FAQ ───────────── */

export function Faq() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(FAQ[0].q);
  const list = useMemo(() => {
    const term = norm(q.trim());
    return term ? FAQ.filter((f) => norm(`${f.q} ${f.a}`).includes(term)) : FAQ;
  }, [q]);

  return (
    <div>
      <SearchField value={q} onChange={setQ} placeholder="Buscar en preguntas frecuentes" className="mb-4 max-w-md" />
      {list.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong px-5 py-8 text-center text-[14px] text-subtle">
          Sin resultados para «{q}». Llama a la Matriz si necesitas ayuda directa.
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[22px] border border-hairline bg-surface shadow-soft">
          {list.map((f) => {
            const isOpen = open === f.q;
            return (
              <li key={f.q}>
                <Collapsible open={isOpen} onOpenChange={(v) => setOpen(v ? f.q : null)}>
                  <CollapsibleTrigger className="group flex min-h-14 w-full items-center gap-4 px-5 py-4 text-left outline-none focus-visible:bg-muted sm:px-6">
                    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors", isOpen ? "bg-brand-deep text-white" : "bg-tile text-ink")}>
                      <MessageCircleQuestion className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-[15.5px] font-semibold leading-snug text-ink">{f.q}</span>
                    <ChevronDown className={cn("size-[18px] shrink-0 text-subtle transition-transform duration-300", isOpen && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
                    <div className="pb-5 pl-[68px] pr-5 text-[14.5px] leading-relaxed text-ink/80 sm:pl-[72px] sm:pr-8">
                      <p>{f.a}</p>
                      {f.href && (
                        <Link href={f.href} className="group mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-link">
                          {f.linkLabel}
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────── contact ───────────── */

export function ContactCard() {
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pulkro, ${PULKRO_CONTACT.address}`)}`;
  return (
    <div className="bg-aurora-frame grain rounded-[28px] p-2.5 shadow-lift">
      <div className="relative z-[2] grid overflow-hidden rounded-[22px] bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="p-6 sm:p-8">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
            <Building2 className="size-3.5" /> Pulkro · desde 1985
          </p>
          <h3 className="mt-3 font-serif text-[30px] font-medium leading-tight text-ink">{PULKRO_CONTACT.unit}</h3>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink/80">{PULKRO_CONTACT.address}</p>
          <dl className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-hairline pb-3 text-[14.5px]">
              <dt className="flex items-center gap-2 text-subtle">
                <Phone className="size-4" /> Conmutador
              </dt>
              <dd>
                <a href={PULKRO_CONTACT.phoneHref} className="font-semibold text-ink tabular hover:text-link">
                  {PULKRO_CONTACT.phone}
                </a>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 text-[14.5px]">
              <dt className="flex items-center gap-2 text-subtle">
                <PhoneCall className="size-4" /> Sin costo
              </dt>
              <dd>
                <a href={PULKRO_CONTACT.tollFreeHref} className="font-semibold text-ink tabular hover:text-link">
                  {PULKRO_CONTACT.tollFree}
                </a>
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button asChild className="h-11 rounded-[12px] px-5 text-[14.5px] font-semibold">
              <a href={PULKRO_CONTACT.phoneHref}>
                <Phone className="size-4" /> Llamar a la Matriz
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-[12px] border-line px-5 text-[14.5px] font-semibold">
              <a href={directions} target="_blank" rel="noopener noreferrer">
                <Navigation className="size-4" /> Cómo llegar
              </a>
            </Button>
          </div>
        </div>
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir la ubicación de la Matriz en mapas"
          className="group relative block min-h-[240px] p-2.5 md:p-3 md:pl-0"
        >
          <MatrizIllustration />
        </a>
      </div>
    </div>
  );
}

/** Stylised street map of the Matriz surroundings (no tiles, so it never breaks offline). */
function MatrizIllustration() {
  return (
    <div className="relative h-full min-h-[240px] overflow-hidden rounded-[18px] bg-well ring-1 ring-edge">
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="pk-blocks" width="46" height="38" patternUnits="userSpaceOnUse">
            <rect x="3" y="3" width="40" height="32" rx="5" fill="#e3eaf2" />
          </pattern>
        </defs>
        <rect width="400" height="260" fill="url(#pk-blocks)" />
        {/* park */}
        <rect x="282" y="168" width="86" height="66" rx="10" fill="#d9efe6" />
        {/* railway (Col. Terminal) */}
        <path d="M -10 52 L 410 30" stroke="#c4cfdb" strokeWidth="10" />
        <path d="M -10 52 L 410 30" stroke="#ffffff" strokeWidth="2" strokeDasharray="6 6" />
        {/* avenues */}
        <path d="M -10 128 L 410 116" stroke="#ffffff" strokeWidth="16" />
        <path d="M 196 -10 L 206 270" stroke="#ffffff" strokeWidth="14" />
        <path d="M 60 -10 L 76 270" stroke="#ffffff" strokeWidth="8" />
        <path d="M -10 206 L 410 196" stroke="#ffffff" strokeWidth="8" />
        <text x="18" y="112" fontSize="10" fontWeight="600" fill="#8b98a9" letterSpacing="1.2">AV. COLÓN</text>
        <text x="205" y="258" fontSize="8.5" fontWeight="700" fill="#8b98a9" letterSpacing="1" transform="rotate(-88 205 258)">D. DE MONTEMAYOR</text>
        <text x="300" y="22" fontSize="9" fontWeight="600" fill="#9aa7b7" letterSpacing="1">COL. TERMINAL</text>
        {/* route from the corner to the door */}
        <path d="M 120 124 Q 150 122 196 121 L 203 150" fill="none" stroke="#1667e0" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
      </svg>
      <div className="absolute left-[52%] top-[57%] -translate-x-1/2 -translate-y-full">
        <div className="relative flex flex-col items-center">
          <span className="mb-1.5 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink shadow-[0_6px_18px_-8px_rgb(2_58_99/0.5)] transition group-hover:-translate-y-0.5">
            Pulkro · Matriz
          </span>
          <span className="relative inline-flex size-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-brand/30 animate-ping-soft" />
            <span className="relative size-3.5 rounded-full border-[3px] border-surface bg-brand-deep shadow-[0_4px_10px_rgb(2_58_99/0.45)]" />
          </span>
        </div>
      </div>
      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-[10px] bg-surface/90 px-2.5 py-1.5 text-[12px] font-semibold text-ink shadow-soft backdrop-blur transition group-hover:bg-brand-deep group-hover:text-white">
        <Navigation className="size-3.5" /> Abrir en mapas
      </span>
      <span className="absolute bottom-3 left-3 rounded-md bg-surface/80 px-2 py-1 text-[11px] text-subtle backdrop-blur">Croquis ilustrativo</span>
    </div>
  );
}
