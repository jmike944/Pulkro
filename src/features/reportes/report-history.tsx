"use client";

import { motion } from "motion/react";
import { Download, Info, LoaderCircle, Mail, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, plural } from "@/lib/format";
import type { Report, ShareAttempt, ShareChannel, User } from "@/lib/types";
import { IconTile } from "@/components/pk/bits";
import { SoftBadge } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { CHANNEL_TO_LABEL } from "./share";
import { WithReason } from "./guard";

export const CHANNEL_ICON: Record<ShareChannel, typeof Send> = { whatsapp: MessageCircle, email: Mail, descarga: Download };
export const CHANNEL_TILE: Record<ShareChannel, "teal" | "sky" | "violet"> = { whatsapp: "teal", email: "sky", descarga: "violet" };

const shortName = (u?: User) => (u ? `${u.name.split(" ")[0]} ${u.name.split(" ")[1]?.[0] ?? ""}.`.trim() : "Usuario");

/** Every generated version (v1, v2…) — editing after closure creates a new one (doc §8). */
export function VersionsList({
  reports,
  users,
  busyId,
  downloadReason,
  onDownload,
  className,
}: {
  reports: Report[];
  users: Map<string, User>;
  busyId?: string | null;
  /** why downloads are disabled (permission or pending sync) */
  downloadReason?: string | null;
  onDownload: (r: Report) => void;
  className?: string;
}) {
  if (!reports.length)
    return (
      <p className={cn("rounded-[16px] border border-dashed border-[#d9dfe7] px-4 py-5 text-center text-[14px] text-subtle", className)}>
        Aún no hay versiones. La primera se crea al generar el PDF.
      </p>
    );
  return (
    <motion.ul variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show" className={className}>
      {reports.map((r, i) => (
        <motion.li key={r.id} variants={rowVariants} layout className="flex items-center gap-3.5 border-b border-hairline py-3.5 last:border-0">
          <span
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold tabular",
              i === 0 ? "bg-brand-deep text-white" : "bg-[#f2f4f7] text-subtle",
            )}
          >
            v{r.version}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-ink lg:text-[14.5px]">
              Versión {r.version}
              {i === 0 && <SoftBadge tone="navy">Actual</SoftBadge>}
            </p>
            <p className="truncate text-[13.5px] text-subtle lg:text-[13px]">
              {shortName(users.get(r.generatedBy))} · {fmtDateTime(r.generatedAt)}
            </p>
            <p className="truncate text-[12.5px] text-subtle">
              {plural(r.photoIds.length, "foto", "fotos")} · {r.shares.length ? plural(r.shares.length, "envío iniciado", "envíos iniciados") : "sin envíos"}
            </p>
          </div>
          <WithReason reason={downloadReason}>
            <Button
              variant="outline"
              size="icon-lg"
              disabled={!!downloadReason || busyId === r.id}
              onClick={() => onDownload(r)}
              aria-label={`Descargar PDF versión ${r.version}`}
              className="size-11 rounded-[12px] border-[#dfe3ea] lg:size-10"
            >
              {busyId === r.id ? <LoaderCircle className="animate-spin" /> : <Download />}
            </Button>
          </WithReason>
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** "Historial de envíos": each manual attempt with its exact no-delivery note. */
export function ShareHistory({ reports, users, className }: { reports: Report[]; users: Map<string, User>; className?: string }) {
  const items = reports
    .flatMap((r) => r.shares.map((s) => ({ s, version: r.version })))
    .sort((a, b) => b.s.at.localeCompare(a.s.at));
  if (!items.length)
    return (
      <div className={cn("flex gap-3 rounded-[16px] bg-[#f4f8fd] p-4 text-[14px] leading-relaxed text-ink", className)}>
        <IconTile>
          <Send />
        </IconTile>
        <p>
          Aún no hay envíos. Cada vez que comparta el PDF quedará registrado aquí, con quién lo inició y cuándo. <span className="text-subtle">Pulkro nunca afirma la entrega.</span>
        </p>
      </div>
    );
  return (
    <motion.ul variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show" className={className}>
      {items.map(({ s, version }) => (
        <ShareRow key={s.id} s={s} version={version} by={users.get(s.by)} />
      ))}
    </motion.ul>
  );
}

function ShareRow({ s, version, by }: { s: ShareAttempt; version: number; by?: User }) {
  const Icon = CHANNEL_ICON[s.channel];
  return (
    <motion.li variants={rowVariants} layout className="flex gap-3.5 border-b border-hairline py-3.5 last:border-0">
      <IconTile tone={CHANNEL_TILE[s.channel]} className="size-10 rounded-[12px]">
        <Icon />
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] font-semibold text-ink lg:text-[14.5px]">
            {CHANNEL_TO_LABEL[s.channel]} <span className="font-normal text-subtle">· {s.to}</span>
          </span>
          <span className="shrink-0 text-[12.5px] text-subtle tabular">{fmtDateTime(s.at)}</span>
        </p>
        <p className="mt-0.5 text-[13px] text-subtle">
          v{version} · inició {shortName(by)}
        </p>
        <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-[#8a5300]">
          <Info className="mt-px size-3.5 shrink-0" />
          {s.note}
        </p>
      </div>
    </motion.li>
  );
}

export function HistoryHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-[19px] font-medium tracking-[-0.01em] text-ink">
        <span className="text-subtle [&_svg]:size-[18px]">{icon}</span>
        {title}
      </h2>
      {count !== undefined && <span className="text-[13px] text-subtle tabular">{count}</span>}
    </div>
  );
}

