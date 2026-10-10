"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/**
 * Full-screen squeegee pass: a glassy band sweeps left → right leaving the screen "clean".
 * Increment `trigger` to play. Rendered in a portal so transformed ancestors can't trap it.
 */
export function SqueegeeWipe({ trigger }: { trigger: number }) {
  const [runs, setRuns] = useState<number[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portals need document.body; flag it after the first client commit.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!trigger) return;
    const id = requestAnimationFrame(() => setRuns((r) => [...r, trigger]));
    const t = setTimeout(() => setRuns((r) => r.filter((x) => x !== trigger)), 1500);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [trigger]);

  if (!mounted) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[95] overflow-hidden motion-reduce:hidden">
      <AnimatePresence>
        {runs.map((r) => (
          <motion.div key={r} className="absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {/* wet glass that dries behind the blade */}
            <motion.div
              className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-sky/0 via-sky/10 to-white/0"
              initial={{ x: "-100%", opacity: 0.9 }}
              animate={{ x: "0%", opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
            />
            {/* the blade: its track is one blade wider than the screen, so 0% → 100% enters and leaves fully */}
            <motion.div
              className="absolute inset-y-[-10%] -left-[120px] right-0"
              initial={{ x: "0%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.05, ease: [0.65, 0, 0.35, 1] }}
            >
              <div className="absolute inset-y-0 left-0 w-[120px] -skew-x-6">
                <div className="absolute inset-y-0 right-0 w-[70px] bg-gradient-to-l from-white/85 via-[#e6f5fd]/60 to-transparent backdrop-blur-[2px]" />
                <div className="absolute inset-y-0 right-0 w-[7px] rounded-full bg-gradient-to-b from-brand via-brand-deep to-brand shadow-[0_0_24px_rgb(122_209_244/0.9)]" />
                <div className="absolute inset-y-0 right-[7px] w-[2px] bg-sky/80" />
              </div>
            </motion.div>
            {/* sparkles left behind */}
            {[18, 34, 52, 67, 81, 90].map((left, i) => (
              <motion.span
                key={left}
                className="absolute size-3 rotate-45 rounded-[3px] bg-white shadow-[0_0_14px_rgb(122_209_244)]"
                style={{ left: `${left}%`, top: `${22 + ((i * 29) % 56)}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 0.7, delay: 0.15 + (left / 100) * 0.9, ease: "easeOut" }}
              />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
