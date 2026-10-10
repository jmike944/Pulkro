"use client";

import { useState } from "react";
import { NotebookPen, Timer } from "lucide-react";
import { useAppStore } from "@/lib/hooks";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDuration } from "@/lib/format";
import { ClientMark } from "@/components/pk/client-mark";
import { AnimatedNumber } from "@/components/pk/bits";
import {
  AuroraStat,
  BigButton,
  FieldCaption,
  FlowHeading,
  FlowScreen,
  ItemCard,
  SandInput,
  Stepper,
  StepperRow,
  SuccessHero,
  TotalCard,
} from "@/components/pk/mobile";
import { FlowEyebrow } from "./flow-bits";
import type { FieldReady } from "./use-field-state";

const roundHalf = (h: number) => Math.round(h * 2) / 2;

/** Even split of the clock time across activities, in half hours (remainder on the first one). */
function initialSplit(activities: string[], clockHours: number, existing?: { activity: string; hours: number }[]) {
  if (existing?.length) return activities.map((a) => existing.find((b) => b.activity === a)?.hours ?? 0);
  const n = Math.max(1, activities.length);
  const base = Math.max(0, Math.floor((clockHours / n) * 2) / 2);
  const parts = activities.map(() => base);
  parts[0] = Math.max(0, roundHalf(clockHours - base * (n - 1)));
  return parts;
}

/**
 * "Desglose de horas" (mobile reference: Labor breakdown): split the jornada's real on-site time across
 * the order's activities with ±0.5 h steppers. Optional; stored with the jornada and audited.
 */
export function BreakdownFlow({ f, open, onOpenChange }: { f: FieldReady; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useAppStore((s) => s.setJornadaBreakdown);
  const { jornada, order } = f;
  const minutes = jornadaMinutes(jornada);
  const clockHours = roundHalf(minutes / 60);
  const activities = order.activities;
  const [hours, setHours] = useState<number[]>(() => initialSplit(activities, clockHours, jornada.breakdown));
  const [note, setNote] = useState(jornada.breakdownNote ?? "");
  const [done, setDone] = useState(false);

  const total = hours.reduce((s, h) => s + h, 0);
  const gap = roundHalf(total - minutes / 60);
  const mismatch = Math.abs(gap) >= 0.5;

  const submit = () => {
    save(
      jornada.id,
      activities.map((activity, i) => ({ activity, hours: hours[i] })).filter((b) => b.hours > 0),
      note,
    );
    setDone(true);
  };

  if (done)
    return (
      <FlowScreen
        open={open}
        onOpenChange={onOpenChange}
        description="Desglose guardado"
        footer={
          <BigButton variant="outline" onClick={() => onOpenChange(false)}>
            Volver a la jornada
          </BigButton>
        }
      >
        <SuccessHero title="Desglose guardado" icon={<Timer className="relative size-8" />}>
          Las horas por actividad de la Jornada {jornada.dayIndex} quedan en la orden {order.folio}.
        </SuccessHero>
        <ItemCard
          className="mt-8"
          leading={<ClientMark name={f.client.name} hue={f.client.hue} size={44} />}
          title={order.title}
          sub={`${order.folio} · ${hours.filter((h) => h > 0).length} actividades`}
          value={<span className="tabular">{total.toFixed(1)} h</span>}
        />
        <AuroraStat
          className="mt-5"
          label="Horas registradas"
          value={
            <span className="flex items-baseline gap-2">
              <AnimatedNumber value={total} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />
              <span className="text-[18px] font-normal tracking-normal text-subtle">h</span>
            </span>
          }
          sub={`De ${fmtDuration(minutes)} reales en sitio${mismatch ? ` · diferencia de ${Math.abs(gap).toFixed(1)} h` : ""}.`}
        />
      </FlowScreen>
    );

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title="Desglose de horas"
      description={`Desglose de horas de la Jornada ${jornada.dayIndex}`}
      footer={
        <BigButton onClick={submit} disabled={total <= 0}>
          Guardar desglose
        </BigButton>
      }
    >
      <FlowHeading eyebrow={<FlowEyebrow f={f} />} title="¿En qué se fue el tiempo?">
        Reparte el tiempo real en sitio entre las actividades de la orden. Es opcional y ayuda a medir horas por servicio.
      </FlowHeading>

      <div>
        {activities.map((a, i) => (
          <StepperRow key={a} label={a} hint={i === 0 ? "Ajusta en pasos de media hora" : undefined}>
            <Stepper
              value={hours[i]}
              onChange={(v) => setHours((xs) => xs.map((x, k) => (k === i ? v : x)))}
              label={`Horas · ${a}`}
            />
          </StepperRow>
        ))}
      </div>

      <TotalCard
        className="mt-5"
        tone={mismatch ? "amber" : "blue"}
        label="Total"
        sub={`Tiempo en sitio ${fmtDuration(minutes)}`}
        value={`${total.toFixed(1)} h`}
      />
      {mismatch && (
        <p className="mt-2.5 text-[13.5px] leading-snug text-amber-ink">
          {gap > 0 ? `Sobran ${gap.toFixed(1)} h` : `Faltan ${Math.abs(gap).toFixed(1)} h`} respecto al tiempo entre entrada y salida. Explícalo en la nota si aplica.
        </p>
      )}

      <div className="mt-7">
        <FieldCaption>Nota para administración · opcional</FieldCaption>
        <SandInput icon={<NotebookPen />} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Se adelantó el pulido por lluvia" aria-label="Nota para administración" />
      </div>
    </FlowScreen>
  );
}
