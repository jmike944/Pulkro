"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { closedAt } from "@/lib/metrics";
import { useScopedData } from "@/lib/hooks";
import { AnimatedNumber, IconTile } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { DocTag } from "./shared";

const SIZES = [
  { value: "250", label: "250 KB" },
  { value: "380", label: "380 KB" },
  { value: "800", label: "800 KB" },
] as const;
type SizeKey = (typeof SIZES)[number]["value"];

const SIZE_HINT: Record<SizeKey, string> = {
  "250": "Compresión alta (1280 px)",
  "380": "Configuración actual (1600 px · JPEG 82%)",
  "800": "Sin compresión adicional",
};

/**
 * "Almacenamiento estimado por mes" is PENDIENTE (doc §6). This calculator starts from the volumes
 * in the data the user can see, so the decision meeting has a concrete number to discuss.
 */
export function StorageCalculator() {
  const { orders, photos } = useScopedData();
  const baseline = useMemo(() => {
    const now = new Date();
    const closed = orders.filter((o) => {
      const c = closedAt(o);
      return c && c.getFullYear() === now.getFullYear();
    });
    const perMonth = Math.max(10, Math.round(closed.length / (now.getMonth() + 1)));
    const closedIds = new Set(closed.map((o) => o.id));
    const photosOnClosed = photos.filter((p) => closedIds.has(p.orderId)).length;
    const perService = closed.length ? Math.max(2, Math.round(photosOnClosed / closed.length)) : 8;
    return { perMonth, perService };
  }, [orders, photos]);

  const [services, setServices] = useState(baseline.perMonth);
  const [perService, setPerService] = useState(baseline.perService);
  const [size, setSize] = useState<SizeKey>("380");

  const monthGb = (services * perService * Number(size)) / 1024 / 1024;
  const yearGb = monthGb * 12;

  return (
    <div className="rounded-[22px] border border-hairline bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile>
            <Calculator />
          </IconTile>
          <div>
            <p className="text-[15px] font-semibold text-ink">Almacenamiento estimado</p>
            <p className="text-[12.5px] text-subtle">Para dimensionar nube o servidor propio</p>
          </div>
        </div>
        <DocTag status="pendiente" />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-8">
        <div className="space-y-5">
          <Slider label="Servicios por mes" value={services} min={10} max={400} step={5} onChange={setServices} suffix="servicios" />
          <Slider label="Fotos por servicio" value={perService} min={2} max={40} onChange={setPerService} suffix="fotos" />
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink">Peso por foto</p>
            <Segmented<SizeKey> id="calc-size" value={size} onChange={setSize} items={SIZES.map((s) => ({ value: s.value, label: s.label }))} />
            <p className="mt-2 text-[12.5px] text-subtle">{SIZE_HINT[size]}</p>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-[18px] bg-blue-wash p-5">
          <div>
            <p className="text-[13px] text-subtle">Fotos por mes</p>
            <AnimatedNumber value={monthGb} format={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }} suffix=" GB" className="text-[40px] font-medium leading-none tracking-[-0.04em] text-ink" />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-blue-mid pt-4">
            <div>
              <p className="text-[12.5px] text-subtle">Al año</p>
              <AnimatedNumber value={yearGb} format={{ maximumFractionDigits: 0 }} suffix=" GB" className="text-[20px] font-medium tracking-[-0.02em] text-ink" />
            </div>
            <div>
              <p className="text-[12.5px] text-subtle">3 años de retención</p>
              <AnimatedNumber value={yearGb * 3} format={{ maximumFractionDigits: 0 }} suffix=" GB" className="text-[20px] font-medium tracking-[-0.02em] text-ink" />
            </div>
          </div>
          <p className="text-[12px] leading-snug text-subtle">
            Base: {baseline.perMonth} servicios/mes y {baseline.perService} fotos por servicio en los datos que ve. No incluye reportes PDF ni respaldos.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-[14px] font-semibold text-ink tabular">
          {value} <span className="font-normal text-subtle">{suffix}</span>
        </span>
      </span>
      <span className="relative mt-1 block h-10">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-well" />
        <span aria-hidden className="absolute left-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-azure" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-10 w-full cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-brand-deep [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-brand-deep [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(2_58_99/0.4)]"
        />
      </span>
    </label>
  );
}
