"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/pk/motion";
import type { ReportModel } from "./report-model";
import { DraftWatermark, PaperFooter, PaperRunningHeader, type PaperBlock } from "./paper-blocks";
import { SqueegeeSweep } from "./fx";

/** A4 at 96 dpi. */
export const PAGE_W = 794;
export const PAGE_H = 1123;
const PAD_X = 56;
const TOP_FIRST = 54;
const TOP_REST = 80;
const BOTTOM = 96;
const CONTENT_W = PAGE_W - PAD_X * 2;
const CAP_FIRST = PAGE_H - TOP_FIRST - BOTTOM;
const CAP_REST = PAGE_H - TOP_REST - BOTTOM;

export type Zoom = "fit" | "real";

/** Greedy packing of measured atomic blocks into A4 pages (headings stay with what follows). */
function paginate(blocks: PaperBlock[], heights: Record<string, number>) {
  const pages: number[][] = [[]];
  let used = 0;
  blocks.forEach((b, i) => {
    const page = pages[pages.length - 1];
    const cap = pages.length === 1 ? CAP_FIRST : CAP_REST;
    const h = heights[b.key] ?? 0;
    const gap = page.length ? b.gap : 0;
    let need = gap + h;
    const next = blocks[i + 1];
    if (b.keepWithNext && next) need += next.gap + (heights[next.key] ?? 0);
    if (page.length && used + need > cap) {
      pages.push([i]);
      used = h;
    } else {
      page.push(i);
      used += gap + h;
    }
  });
  return pages;
}

export function PaperPreview({
  model,
  blocks,
  zoom,
  sweepKey,
  rasterRootRef,
  onPages,
  className,
}: {
  model: ReportModel;
  blocks: PaperBlock[];
  zoom: Zoom;
  /** increment to replay the squeegee pass (after a version is generated) */
  sweepKey: number;
  /** element whose rendered <svg> photos are rasterized for the PDF */
  rasterRootRef?: RefObject<HTMLDivElement | null>;
  onPages?: (n: number) => void;
  className?: string;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number> | null>(null);
  const [width, setWidth] = useState(0);

  // Measure every block offscreen at the real content width; ResizeObserver reports on observe().
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      Array.from(el.children).forEach((c) => {
        const key = (c as HTMLElement).dataset.block;
        if (key) next[key] = (c as HTMLElement).offsetHeight;
      });
      setHeights((prev) => {
        if (prev) {
          const keys = Object.keys(next);
          if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return prev;
        }
        return next;
      });
    });
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [blocks]);

  useLayoutEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = useMemo(() => (heights ? paginate(blocks, heights) : []), [blocks, heights]);
  useEffect(() => {
    if (pages.length) onPages?.(pages.length);
  }, [pages.length, onPages]);

  const scale = zoom === "real" ? 1 : width > 0 ? Math.min(1, width / PAGE_W) : 0.5;

  return (
    <div className={cn("relative", className)}>
      {/* offscreen measurer */}
      <div aria-hidden className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <div ref={measureRef} className="theme-light invisible" style={{ width: CONTENT_W }}>
          {blocks.map((b) => (
            <div key={b.key} data-block={b.key} className="flow-root">
              {b.render("measure")}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={rasterRootRef}
        className={cn(
          "rounded-[24px] bg-press bg-[radial-gradient(circle_at_1px_1px,rgb(16_24_40/0.06)_1px,transparent_0)] bg-[length:18px_18px] p-3 sm:p-5 dark:bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.05)_1px,transparent_0)]",
          zoom === "real" ? "overflow-x-auto overscroll-x-contain" : "overflow-hidden",
        )}
      >
        <div ref={deskRef} className="w-full">
          {!heights ? (
            <div className="theme-light mx-auto aspect-[210/297] w-full max-w-[794px] rounded-[4px] bg-white shimmer" />
          ) : (
            pages.map((idxs, pi) => (
              <motion.div
                key={pi}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE, delay: Math.min(pi, 4) * 0.08 }}
                className="mx-auto [&+&]:mt-5"
                style={{ width: PAGE_W * scale, height: PAGE_H * scale }}
              >
                <div
                  className="theme-light relative origin-top-left overflow-hidden rounded-[3px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06),0_22px_44px_-22px_rgb(2_58_99/0.38)] ring-1 ring-black/[0.04]"
                  style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
                  aria-label={`Página ${pi + 1} de ${pages.length}`}
                >
                  {model.draft && <DraftWatermark />}
                  {pi > 0 && <PaperRunningHeader m={model} />}
                  <div className="absolute" style={{ left: PAD_X, right: PAD_X, top: pi === 0 ? TOP_FIRST : TOP_REST }}>
                    {idxs.map((bi, k) => {
                      const b = blocks[bi];
                      const style = { marginTop: k === 0 ? 0 : b.gap };
                      return b.animate ? (
                        <motion.div
                          key={b.key}
                          className="flow-root"
                          style={style}
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        >
                          {b.render("page")}
                        </motion.div>
                      ) : (
                        <div key={b.key} className="flow-root" style={style}>
                          {b.render("page")}
                        </div>
                      );
                    })}
                  </div>
                  <PaperFooter m={model} page={pi + 1} total={pages.length} />
                  {sweepKey > 0 && <SqueegeeSweep key={sweepKey} delay={Math.min(pi, 3) * 0.12} />}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
