"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eraser, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number; w: number };
type Stroke = Point[];

const INK = "#07243f";
const MIN_W = 1.3;
const MAX_W = 3.4;

/**
 * Client signature on the supervisor's device (doc §11: "firma presencial en dispositivo").
 * Canvas + pointer events (mouse, touch, pen with pressure), retina scaling, smooth quadratic strokes.
 * Emits a PNG data URL after each stroke, or null when cleared.
 */
export function SignaturePad({
  onChange,
  className,
  label = "Firma del cliente",
}: {
  onChange: (dataUrl: string | null) => void;
  className?: string;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<{ stroke: Stroke; lastT: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  /** Draw one stroke segment-by-segment with midpoint quadratic curves. */
  const drawStroke = useCallback((c: CanvasRenderingContext2D, s: Stroke, from = 1) => {
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (s.length === 1) {
      c.beginPath();
      c.arc(s[0].x, s[0].y, s[0].w / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    for (let i = Math.max(1, from); i < s.length; i++) {
      const p0 = s[i - 2] ?? s[i - 1];
      const p1 = s[i - 1];
      const p2 = s[i];
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      c.lineWidth = (p1.w + p2.w) / 2;
      c.beginPath();
      c.moveTo(m1.x, m1.y);
      c.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
      c.stroke();
    }
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const c = ctx();
    if (!canvas || !c) return;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.restore();
    strokes.current.forEach((s) => drawStroke(c, s));
  }, [drawStroke]);

  // Retina scaling + keep the drawing when the pad is resized (rotation, dialog resize).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let prevW = 0;
    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const scale = prevW ? rect.width / prevW : 1;
      if (prevW && scale !== 1) strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * scale, y: p.y * scale, w: p.w })));
      prevW = rect.width;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx()?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  const pointFrom = (e: PointerEvent | React.PointerEvent, prev?: Point, dt = 16): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let w: number;
    if (e.pointerType === "pen" && e.pressure > 0) w = MIN_W + (MAX_W - MIN_W) * e.pressure;
    else if (prev) {
      // faster strokes draw thinner lines, like a real pen
      const v = Math.hypot(x - prev.x, y - prev.y) / Math.max(1, dt);
      const target = Math.max(MIN_W, Math.min(MAX_W, MAX_W - v * 1.1));
      w = prev.w * 0.6 + target * 0.4;
    } else w = (MIN_W + MAX_W) / 2;
    return { x, y, w };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    current.current = { stroke: [p], lastT: e.timeStamp };
    const c = ctx();
    if (c) drawStroke(c, [p]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = current.current;
    if (!cur) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const c = ctx();
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const prev = cur.stroke[cur.stroke.length - 1];
      const dt = ev.timeStamp - cur.lastT;
      const p = pointFrom(ev, prev, dt);
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.6) continue;
      cur.stroke.push(p);
      cur.lastT = ev.timeStamp;
      if (c) drawStroke(c, cur.stroke, cur.stroke.length - 1);
    }
  };

  const end = () => {
    const cur = current.current;
    if (!cur) return;
    current.current = null;
    strokes.current = [...strokes.current, cur.stroke];
    setHasInk(true);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">
          {label} <span className="text-st-red">*</span>
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold text-subtle transition hover:bg-muted hover:text-ink disabled:opacity-40"
        >
          <Eraser className="size-4" /> Borrar
        </button>
      </div>
      <div
        ref={wrapRef}
        className={cn(
          "relative h-[170px] overflow-hidden rounded-[18px] border bg-[linear-gradient(180deg,#fbfcfe,#f5f8fc)] transition-colors",
          hasInk ? "border-[#bcd8fb]" : "border-dashed border-[#cfd6df]",
        )}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={(e) => e.buttons === 0 && end()}
          role="img"
          aria-label={hasInk ? "Firma capturada" : "Área para firmar con el dedo o el mouse"}
        />
        {/* baseline + "X" like a paper form */}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 flex items-end gap-2 text-[#b8c2cf]" aria-hidden>
          <span className="font-serif text-[20px] leading-none">×</span>
          <span className="mb-[3px] h-px flex-1 bg-[#d5dce5]" />
        </div>
        <AnimatePresence>
          {!hasInk && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-[#98a2b3]"
            >
              <PenLine className="size-4" /> Firme aquí
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
