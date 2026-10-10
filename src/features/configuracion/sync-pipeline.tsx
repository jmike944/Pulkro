"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Layers, Server, Smartphone, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { fmtAgo, fmtNum } from "@/lib/format";

type Props = {
  offline: boolean;
  queued: number;
  syncing: boolean;
  stored: number;
  lastSyncAt: string;
};

/**
 * Live diagram of the offline-first model (doc §6): capture on the device → local queue → server.
 * Bubbles flow into the queue at all times; they only leave it when there is connection.
 */
export function SyncPipeline({ offline, queued, syncing, stored, lastSyncAt }: Props) {
  const horizontal = useMediaQuery("(min-width: 640px)");
  const uplinkState = offline ? "offline" : syncing || queued > 0 ? "flowing" : "idle";

  return (
    <div className={cn("flex gap-2", horizontal ? "flex-row items-stretch" : "flex-col")}>
      <Station icon={<Smartphone />} title="En el dispositivo" sub={`${fmtNum(stored)} registros locales`} tone="navy" />
      <Conduit horizontal={horizontal} state="flowing" slow label="Captura siempre disponible" />
      <Station
        icon={<Layers />}
        title="Cola local"
        sub={queued ? `${fmtNum(queued)} por enviar` : "Vacía"}
        tone={queued ? (offline ? "amber" : "sky") : "teal"}
        badge={queued}
      >
        <QueueBubbles count={queued} />
      </Station>
      <Conduit horizontal={horizontal} state={uplinkState} label={offline ? "En espera de red" : uplinkState === "flowing" ? "Enviando" : "Al día"} />
      <Station
        icon={offline ? <WifiOff /> : <Server />}
        title="Servidor Pulkro"
        sub={offline ? "Sin conexión" : `Sincronizado ${fmtAgo(lastSyncAt)}`}
        tone={offline ? "slate" : "teal"}
      />
    </div>
  );
}

const TONES = {
  navy: "bg-brand-deep text-white",
  sky: "bg-[#e3f1fd] text-[#1667e0]",
  amber: "bg-[#fff1d6] text-[#b86e00]",
  teal: "bg-[#dcf4ef] text-st-teal",
  slate: "bg-[#eef1f5] text-subtle",
} as const;

function Station({
  icon,
  title,
  sub,
  tone,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  tone: keyof typeof TONES;
  badge?: number;
  children?: React.ReactNode;
}) {
  return (
    <motion.div layout className="glass-card relative flex min-w-0 flex-1 items-center gap-3 rounded-[18px] p-3.5 sm:flex-col sm:items-stretch sm:p-4">
      <motion.span layout className={cn("relative inline-flex size-10 shrink-0 items-center justify-center self-start rounded-[12px] transition-colors duration-500 [&_svg]:size-5", TONES[tone])}>
        {icon}
        <AnimatePresence>
          {!!badge && (
            <motion.span
              key={badge > 99 ? "99+" : badge}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 24 }}
              className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-st-amber px-1 text-[11px] font-bold text-white ring-2 ring-white tabular"
            >
              {badge > 99 ? "99+" : badge}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{title}</p>
        <p className="truncate text-[12.5px] text-subtle">{sub}</p>
      </div>
      {children}
    </motion.div>
  );
}

/** Stacked bubbles inside the queue station — one per pending record (max 8). */
function QueueBubbles({ count }: { count: number }) {
  const n = Math.min(8, count);
  return (
    <div aria-hidden className="flex h-4 items-end gap-1 overflow-hidden sm:mt-1">
      <AnimatePresence initial={false}>
        {Array.from({ length: n }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, y: 6, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, y: -10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22, delay: i * 0.03 }}
            className="size-3 rounded-full border border-white bg-[radial-gradient(circle_at_30%_30%,#fff,#bfe6fb_55%,#7ad1f4)] shadow-[inset_-1px_-1px_2px_rgb(2_58_99/0.2)]"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Connector with flowing bubbles; dashed amber and paused while offline. */
function Conduit({ horizontal, state, slow, label }: { horizontal: boolean; state: "flowing" | "idle" | "offline"; slow?: boolean; label: string }) {
  const dur = slow ? 3.2 : 1.4;
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center", horizontal ? "w-12 flex-col lg:w-14" : "h-10 flex-row pl-[34px]")}
      role="img"
      aria-label={label}
      title={label}
    >
      <div className={cn("relative overflow-hidden", horizontal ? "h-[3px] w-full" : "h-full w-[3px]")}>
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            state === "offline"
              ? horizontal
                ? "bg-[repeating-linear-gradient(90deg,#f0a020_0_6px,transparent_6px_11px)]"
                : "bg-[repeating-linear-gradient(180deg,#f0a020_0_6px,transparent_6px_11px)]"
              : state === "idle"
                ? "bg-st-teal/50"
                : "bg-white/80",
          )}
        />
      </div>
      {state === "flowing" &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className={cn("absolute", horizontal ? "inset-y-0 left-0 w-full" : "inset-x-0 top-0 h-full pl-[34px]")}
            initial={horizontal ? { x: "-10%" } : { y: "-10%" }}
            animate={horizontal ? { x: ["-10%", "100%"] } : { y: ["-10%", "100%"] }}
            transition={{ duration: dur, repeat: Infinity, ease: "linear", delay: (i * dur) / 3 }}
          >
            <span
              className={cn(
                "absolute size-2.5 rounded-full border border-white bg-[radial-gradient(circle_at_30%_30%,#fff,#bfe6fb_60%,#7ad1f4)] shadow-[0_0_8px_rgb(122_209_244/0.9)]",
                horizontal ? "top-1/2 -translate-y-1/2" : "left-[29px]",
              )}
            />
          </motion.span>
        ))}
      <AnimatePresence>
        {state !== "flowing" && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={cn(
              "absolute inline-flex size-6 items-center justify-center rounded-full ring-2 ring-white",
              state === "offline" ? "bg-[#fff1d6] text-[#b86e00]" : "bg-[#dcf4ef] text-st-teal",
              !horizontal && "left-[22px]",
            )}
          >
            {state === "offline" ? <WifiOff className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
