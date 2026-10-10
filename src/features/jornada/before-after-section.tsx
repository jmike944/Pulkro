"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoveHorizontal } from "lucide-react";
import type { Photo } from "@/lib/types";
import { BeforeAfter } from "@/components/pk/scene-photo";
import { EASE } from "@/components/pk/motion";
import { Chip, FieldSectionTitle } from "./field-bits";
import type { FieldReady } from "./use-field-state";

type Pair = { area: string; before: Photo; after: Photo };

/** Squeegee comparison for every area that has both an ANTES and a DESPUÉS shot in this jornada. */
export function BeforeAfterSection({ f }: { f: FieldReady }) {
  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    const seen = new Set<string>();
    for (const before of f.antes) {
      if (seen.has(before.area)) continue;
      const afters = f.despues.filter((p) => p.area === before.area);
      const after = afters.at(-1);
      if (after) {
        out.push({ area: before.area, before, after });
        seen.add(before.area);
      }
    }
    return out;
  }, [f.antes, f.despues]);
  const [selected, setSelected] = useState<string | null>(null);

  if (!pairs.length) return null;
  const pair = pairs.find((p) => p.area === selected) ?? pairs[0];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <FieldSectionTitle
        title="Antes y después"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <MoveHorizontal className="size-4" /> Desliza el jalador para comparar · {pairs.length} {pairs.length === 1 ? "área" : "áreas"}
          </span>
        }
      />
      {pairs.length > 1 && (
        <div className="scrollbar-none -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {pairs.map((p) => (
            <Chip key={p.area} active={p.area === pair.area} onClick={() => setSelected(p.area)}>
              {p.area}
            </Chip>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={pair.area} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.3, ease: EASE }}>
          <BeforeAfter before={pair.before} after={pair.after} className="shadow-soft" />
          <p className="mt-2.5 text-center text-[13px] text-subtle">{pair.area}</p>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}
