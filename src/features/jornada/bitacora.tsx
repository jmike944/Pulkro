"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isSameDay, parseISO } from "date-fns";
import { LogIn, LogOut, NotebookPen, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups } from "@/lib/hooks";
import { fmtAgo, fmtDay, fmtTime } from "@/lib/format";
import { INCIDENT_TYPE } from "@/lib/status";
import { PersonAvatar } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { BigButton, FieldCaption, FlowHeading, FlowScreen } from "@/components/pk/mobile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Chip, FieldSectionTitle, Gate, stampHow } from "./field-bits";
import { FlowEyebrow } from "./flow-bits";
import type { FieldReady } from "./use-field-state";

const TEMPLATES = [
  "Cuadrilla completa en sitio",
  "Se entregó EPP a la cuadrilla",
  "Revisión de áreas con el contacto en sitio",
  "Retiro de residuos completado",
  "Pausa para comida",
];

type Entry = {
  id: string;
  at: string;
  by?: string;
  text: string;
  kind: "nota" | "entrada" | "salida" | "incidencia";
};

/** Note composer (bitácora por jornada, doc §4.2). */
export function NoteComposer({ f }: { f: FieldReady }) {
  const addNote = useAppStore((s) => s.addJornadaNote);
  const [text, setText] = useState("");
  const fieldId = useId();
  const ok = text.trim().length >= 3;

  const save = () => {
    if (!ok) return;
    addNote(f.jornada.id, text.trim());
    setText("");
    toast.success("Nota agregada a la bitácora");
  };

  return (
    <div>
      <label htmlFor={fieldId} className="sr-only">
        Nueva nota de bitácora
      </label>
      <div className="relative">
        <Textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          }}
          placeholder="¿Qué pasó en la jornada? Avances, acuerdos con el cliente, pendientes…"
          className="min-h-[88px] rounded-[16px] bg-surface pb-12 text-[16px] sm:text-[15px]"
        />
        <Button onClick={save} disabled={!ok} className="absolute bottom-2.5 right-2.5 h-10 rounded-[12px] px-4 font-semibold">
          <Send /> Agregar
        </Button>
      </div>
      <div className="scrollbar-none -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {TEMPLATES.map((t) => (
          <Chip key={t} active={text === t} onClick={() => setText(t)}>
            {t}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** One-handed note capture from the hero quick actions. */
export function NoteFlow({ f, open, onOpenChange }: { f: FieldReady; open: boolean; onOpenChange: (v: boolean) => void }) {
  const addNote = useAppStore((s) => s.addJornadaNote);
  const [text, setText] = useState("");
  const ok = text.trim().length >= 3;
  const save = () => {
    if (!ok) return;
    addNote(f.jornada.id, text.trim());
    toast.success("Nota agregada a la bitácora", { description: `Jornada ${f.jornada.dayIndex} · ${f.order.folio}` });
    onOpenChange(false);
  };

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title="Bitácora"
      description="Agregar nota a la bitácora de la jornada"
      dirty={text.trim().length > 0}
      footer={
        <BigButton onClick={save} disabled={!ok}>
          <Send /> Agregar a la bitácora
        </BigButton>
      }
    >
      <FlowHeading eyebrow={<FlowEyebrow f={f} />} title="Nota de bitácora">
        Queda con su nombre y la hora del dispositivo, aunque no haya señal.
      </FlowHeading>
      <FieldCaption>
        <label htmlFor="note-flow">Nota</label>
      </FieldCaption>
      <Textarea
        id="note-flow"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder="Avances, acuerdos con el cliente, pendientes…"
        className="min-h-[132px] rounded-[16px] border-field-line bg-field text-[16px]"
      />
      <FieldCaption className="mt-6">Frecuentes</FieldCaption>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <Chip key={t} active={text === t} onClick={() => setText(t)}>
            {t}
          </Chip>
        ))}
      </div>
    </FlowScreen>
  );
}

/** Timeline of notes merged with the jornada's key events (entrada, incidencias, salida). Newest first. */
export function Bitacora({ f }: { f: FieldReady }) {
  const { users } = useLookups();
  const { jornada } = f;

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = jornada.log.map((l, i) => ({ id: `n-${i}-${l.at}`, at: l.at, by: l.by, text: l.text, kind: "nota" }));
    if (jornada.checkIn)
      out.push({
        id: "in",
        at: jornada.checkIn.deviceAt,
        by: jornada.checkIn.by,
        kind: "entrada",
        text: `Registro de entrada · ${stampHow(jornada.checkIn)}`,
      });
    if (jornada.checkOut)
      out.push({
        id: "out",
        at: jornada.checkOut.deviceAt,
        by: jornada.checkOut.by,
        kind: "salida",
        text: `Registro de salida · ${stampHow(jornada.checkOut)}`,
      });
    f.jIncidents.forEach((i) =>
      out.push({ id: i.id, at: i.createdAt, by: i.createdBy, kind: "incidencia", text: `${i.folio} · ${INCIDENT_TYPE[i.type].label}: ${i.description}` }),
    );
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [jornada.log, jornada.checkIn, jornada.checkOut, f.jIncidents]);

  return (
    <section id="bitacora" className="scroll-mt-24">
      <FieldSectionTitle
        title="Bitácora"
        addon={<span className="text-[14px] font-normal text-subtle tabular">{jornada.log.length} {jornada.log.length === 1 ? "nota" : "notas"}</span>}
        subtitle="Comentarios de la jornada con usuario y hora. Viajan al historial de la orden."
      />
      {f.permissions.capture && (
        <div className="mb-5">
          {f.recordBlock ? (
            <Gate reason={f.recordBlock} className="w-full">
              <p className="w-full rounded-[16px] bg-soft px-4 py-3 text-[13.5px] text-subtle">{f.recordBlock}</p>
            </Gate>
          ) : (
            <NoteComposer f={f} />
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong px-5 py-5 text-[14px] text-subtle">Sin notas todavía. La entrada, la salida y las incidencias aparecerán aquí.</p>
      ) : (
        <ol className="relative">
          <AnimatePresence initial={false}>
            {entries.map((e, i) => {
              const user = e.by ? users.get(e.by) : undefined;
              const last = i === entries.length - 1;
              const sameDay = isSameDay(parseISO(e.at), parseISO(jornada.plannedStart));
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 6) * 0.04 }}
                  className="relative flex gap-3.5 pb-6 last:pb-0"
                >
                  {!last && <span aria-hidden className="absolute bottom-0 left-[17px] top-10 w-px bg-track" />}
                  <EntryIcon kind={e.kind} user={user} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[13.5px] font-semibold text-ink">{user?.name ?? "Sistema"}</p>
                      <time dateTime={e.at} className="text-[12.5px] text-subtle tabular" title={fmtAgo(e.at)}>
                        {sameDay ? fmtTime(e.at) : `${fmtDay(e.at)}, ${fmtTime(e.at)}`}
                      </time>
                    </div>
                    <p className={cn("mt-0.5 text-[14px] leading-relaxed", e.kind === "nota" ? "text-ink" : "text-subtle")}>{e.text}</p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function EntryIcon({ kind, user }: { kind: Entry["kind"]; user?: { name: string; initials: string; hue: number } }) {
  if (kind === "nota" && user) return <PersonAvatar initials={user.initials} hue={user.hue} size={36} name={user.name} className="relative z-[1] ring-4 ring-surface" />;
  const map = {
    nota: { icon: <NotebookPen />, cls: "bg-tile text-subtle" },
    entrada: { icon: <LogIn />, cls: "bg-blue-soft text-azure-fg" },
    salida: { icon: <LogOut />, cls: "bg-teal-soft text-teal-fg" },
    incidencia: { icon: <TriangleAlert />, cls: "bg-red-soft text-red-fg" },
  }[kind];
  return (
    <span className={cn("relative z-[1] inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] ring-4 ring-surface [&_svg]:size-[17px]", map.cls)}>{map.icon}</span>
  );
}
