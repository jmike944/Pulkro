"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Mail, MessageSquare, ShieldAlert, Signature, TriangleAlert, WifiOff, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useIsOffline } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtHours, plural } from "@/lib/format";
import type { Conformity } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOrder, type OrderDetail } from "./order-context";
import { CONFORMITY_LABEL } from "./orden-format";
import { SignaturePad } from "./signature-pad";
import { ConfirmCheck, DialogActions, Field, OrderDialog, SummaryRows, inputClass } from "./ui";

type CheckState = "ok" | "block" | "warn" | "excepted";
type CheckRow = { id: string; label: string; state: CheckState; detail?: string; links?: { label: string; href: string }[] };

const METHODS: { value: Conformity["method"]; icon: LucideIcon; hint: string }[] = [
  { value: "firma", icon: Signature, hint: "El cliente firma en este dispositivo" },
  { value: "verbal", icon: MessageSquare, hint: "Aceptó en sitio de palabra" },
  { value: "correo", icon: Mail, hint: "Confirmó por correo electrónico" },
];

/** Builds the closure checklist from domain.closureBlockers() (doc §8). */
function checklist(d: OrderDetail, hasException: boolean): { rows: CheckRow[]; hardBlock: boolean; photosMissing: boolean } {
  const { blockers, jornadas, openIncidents } = d;
  const jornadaBlock = blockers.find((b) => b.id === "jornadas");
  const antes = blockers.filter((b) => b.id.startsWith("antes-"));
  const despues = blockers.filter((b) => b.id.startsWith("despues-"));
  const incBlock = blockers.filter((b) => openIncidents.some((i) => i.id === b.id) && b.severity === "block");
  const incWarn = blockers.filter((b) => openIncidents.some((i) => i.id === b.id) && b.severity === "warn");
  const sync = blockers.find((b) => b.id === "sync");
  const photosMissing = antes.length + despues.length > 0;
  const photoState = (n: number): CheckState => (n === 0 ? "ok" : hasException ? "excepted" : "block");
  const linksOf = (bs: typeof antes) =>
    bs.map((b) => ({ label: `Capturar en ${b.label.replace(/^Falta foto (ANTES|DESPUÉS) · /, "")}`, href: b.href ?? "#" }));

  const rows: CheckRow[] = [
    {
      id: "jornadas",
      label: `Jornadas con salida registrada · ${jornadas.filter((j) => j.status === "cerrada").length}/${jornadas.length}`,
      state: jornadaBlock || jornadas.length === 0 ? "block" : "ok",
      detail: jornadaBlock?.label ?? (jornadas.length === 0 ? "No hay jornadas registradas" : undefined),
    },
    {
      id: "antes",
      label: "Fotos ANTES en cada jornada",
      state: photoState(antes.length),
      detail: antes.length ? `Falta en ${antes.length === 1 ? "1 jornada" : `${antes.length} jornadas`}` : undefined,
      links: linksOf(antes),
    },
    {
      id: "despues",
      label: "Fotos DESPUÉS en cada jornada",
      state: photoState(despues.length),
      detail: despues.length ? `Falta en ${despues.length === 1 ? "1 jornada" : `${despues.length} jornadas`}` : undefined,
      links: linksOf(despues),
    },
    {
      id: "incidencias",
      label: "Sin incidencias que impidan el cierre",
      state: incBlock.length ? "block" : incWarn.length ? "warn" : "ok",
      detail: incBlock.length
        ? `${incBlock.map((b) => b.label.replace("Incidencia abierta ", "")).join(", ")} debe resolverse primero`
        : incWarn.length
          ? `${plural(incWarn.length, "abierta", "abiertas")} sin bloqueo: se incluirá en el reporte`
          : undefined,
      links: incBlock.map((b) => ({ label: `Resolver ${b.label.replace("Incidencia abierta ", "")}`, href: b.href ?? "#" })),
    },
    {
      id: "sync",
      label: "Registros sincronizados",
      state: sync ? "warn" : "ok",
      detail: sync ? `${sync.label}. ${sync.detail ?? ""}` : undefined,
    },
  ];
  return { rows, hardBlock: !!jornadaBlock || jornadas.length === 0 || incBlock.length > 0, photosMissing };
}

/** Closure validation modal ("Submit claim" reference). Only the supervisor authorizes (doc §2). */
export function ClosureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<PulkroMark className="size-11 rounded-[13px]" />}
      title={`Validar cierre de ${d.order.folio}`}
      description={
        <>
          Revise la evidencia y registre la conformidad del cliente. Al validar, la orden pasa a <b>Finalizada</b> y queda lista para generar el{" "}
          <b>reporte único</b> del servicio{d.reports.length ? ` (v${d.reports[0].version + 1})` : ""}.
        </>
      }
    >
      {/* Body is remounted on every open, so the form starts fresh. */}
      <ClosureForm onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function ClosureForm({ onDone }: { onDone: () => void }) {
  const { d, ui } = useOrder();
  const { order, serviceType, site, evidence, jornadas, openIncidents, realMinutes, pendingSync, user } = d;
  const router = useRouter();
  const offline = useIsOffline();
  const validateClosure = useAppStore((s) => s.validateClosure);

  const [method, setMethod] = useState<Conformity["method"]>("firma");
  const [name, setName] = useState(order.siteContact.name);
  const [role, setRole] = useState("Contacto en sitio");
  const [signature, setSignature] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(
    order.closure?.summary ??
      `Se realizó ${serviceType.name.toLowerCase()} en ${site.name} conforme a la orden ${order.folio}. ${order.activities.slice(0, 3).join(". ")}${order.activities.length ? "." : ""}`,
  );
  const [exception, setException] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const exceptionOk = exception.trim().length >= 15;
  const { rows, hardBlock, photosMissing } = checklist(d, exceptionOk);
  const conformityOk = name.trim().length >= 3 && (method !== "firma" || !!signature);
  const valid = !hardBlock && (!photosMissing || exceptionOk) && conformityOk && summary.trim().length >= 10 && confirmed;

  const missingReason = hardBlock
    ? "Resuelva los bloqueos para continuar"
    : photosMissing && !exceptionOk
      ? "Justifique la excepción de evidencia"
      : !conformityOk
        ? method === "firma" && !signature
          ? "Falta la firma del cliente"
          : "Indique quién dio la conformidad"
        : summary.trim().length < 10
          ? "Escriba la descripción para el reporte"
          : !confirmed
            ? "Confirme la declaración"
            : null;

  const submit = () => {
    if (!valid) return;
    const at = new Date().toISOString();
    validateClosure(order.id, {
      summary: summary.trim(),
      conformity: {
        method,
        name: name.trim(),
        role: role.trim() || undefined,
        signatureDataUrl: method === "firma" ? (signature ?? undefined) : undefined,
        at,
        comment: comment.trim() || undefined,
      },
      exception: photosMissing ? { reason: exception.trim(), authorizedBy: user.id, at } : undefined,
    });
    useUi.getState().fireCelebrate();
    toast.success(`Cierre de ${order.folio} validado`, {
      description: offline ? "Guardado en el dispositivo; se sincroniza al reconectar." : "La orden quedó Finalizada.",
      action: { label: "Generar reporte", onClick: () => router.push(`/ordenes/${order.folio}/reporte`) },
      duration: 8000,
    });
    onDone();
  };

  return (
    <div className="space-y-6">
      {/* checklist */}
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <ChecklistRow key={r.id} row={r} index={i} onNavigate={onDone} />
        ))}
      </ul>

      <SummaryRows
        rows={[
          { k: "Jornadas", v: `${jornadas.filter((j) => j.status === "cerrada").length}/${jornadas.length}`, tone: jornadas.some((j) => j.status !== "cerrada") ? "bad" : "ok" },
          { k: "Evidencia", v: `${evidence.present}/${evidence.required}`, tone: evidence.complete ? "ok" : "warn" },
          { k: "Incidencias abiertas", v: openIncidents.length, tone: openIncidents.some((i) => i.blocksClosure) ? "bad" : openIncidents.length ? "warn" : "ok" },
          { k: "Horas reales", v: fmtHours(realMinutes) },
          {
            k: "Sincronización",
            v: pendingSync.length ? `${plural(pendingSync.length, "pendiente", "pendientes")}` : offline ? "Sin conexión" : "Al día",
            tone: pendingSync.length || offline ? "warn" : "ok",
          },
        ]}
      />

      {/* evidence exception — doc §8: only documented and authorized */}
      <AnimatePresence initial={false}>
        {photosMissing && !hardBlock && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-[18px] border border-[#f3d7a1] bg-[#fffaf0] p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-[#8a5300]">
                <ShieldAlert className="size-4" /> Excepción autorizada
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#8a5300]/90">
                Faltan fotografías obligatorias. Solo puede cerrar con una justificación documentada; quedará autorizada por <b className="font-semibold">{user.name}</b>{" "}
                y visible en el reporte y la auditoría.
              </p>
              <textarea
                value={exception}
                onChange={(e) => setException(e.target.value)}
                rows={3}
                placeholder="Ej. El cliente bloqueó el área al terminar; se envió confirmación por correo."
                aria-label="Justificación de la excepción"
                className="mt-3 w-full resize-none rounded-[14px] border border-[#f0d39c] bg-white px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-[#c9a86a] focus-visible:border-st-amber focus-visible:ring-3 focus-visible:ring-st-amber/25"
              />
              <p className={cn("mt-1 text-[12px]", exceptionOk ? "text-st-teal" : "text-[#b86e00]")}>
                {exceptionOk ? "Justificación lista" : `Mínimo 15 caracteres · ${exception.trim().length}/15`}
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {hardBlock && (
        <div className="flex gap-3 rounded-[18px] bg-[#fdeeee] p-4 text-[13.5px] text-[#9b1c1f]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Las jornadas sin salida y las incidencias que impiden el cierre <b className="font-semibold">no admiten excepción</b>. Resuélvalas y vuelva a validar.
            {openIncidents.some((i) => i.blocksClosure) && (
              <button
                type="button"
                onClick={() => {
                  onDone();
                  ui.setTab("incidencias", { scroll: true });
                }}
                className="ml-1 font-semibold underline underline-offset-2"
              >
                Ir a incidencias
              </button>
            )}
          </p>
        </div>
      )}

      {/* conformity */}
      <section>
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Conformidad del cliente</p>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as Conformity["method"])} className="grid gap-2 sm:grid-cols-3" aria-label="Método de conformidad">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = method === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  "relative flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[16px] border p-3 transition sm:flex-col sm:items-start sm:gap-2",
                  active ? "border-transparent bg-[#f2f8fe] ring-2 ring-[#1667e0]" : "border-hairline hover:bg-muted",
                  "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/60",
                )}
              >
                <RadioGroupItem value={m.value} className="sr-only" />
                <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]", active ? "bg-[#1667e0] text-white" : "bg-[#f2f4f7] text-ink")}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-tight text-ink">{CONFORMITY_LABEL[m.value]}</span>
                  <span className="block text-[12px] leading-snug text-subtle">{m.hint}</span>
                </span>
              </label>
            );
          })}
        </RadioGroup>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de quien acepta" htmlFor="conf-name">
            <input id="conf-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" />
          </Field>
          <Field label="Puesto o relación" htmlFor="conf-role">
            <input id="conf-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} placeholder="Gerente de mantenimiento" autoComplete="off" />
          </Field>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {method === "firma" ? (
            <motion.div key="firma" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4">
              <SignaturePad onChange={setSignature} />
            </motion.div>
          ) : (
            <motion.div key="nota" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4">
              <Field label={method === "correo" ? "Referencia del correo (opcional)" : "Comentario (opcional)"} htmlFor="conf-comment">
                <input
                  id="conf-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className={inputClass}
                  placeholder={method === "correo" ? "Asunto o fecha del correo de conformidad" : "Ej. Recorrido final con el contacto"}
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* summary for the report */}
      <Field label="Descripción para el reporte" htmlFor="closure-summary" hint="Aparece en el PDF que recibe el cliente.">
        <textarea
          id="closure-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-[14px] border border-input bg-white px-3.5 py-3 text-[15px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </Field>

      {offline && (
        <p className="flex items-center gap-2 rounded-[14px] bg-[#f2f4f7] px-3.5 py-2.5 text-[13px] text-subtle">
          <WifiOff className="size-4 shrink-0" /> Sin conexión: el cierre se guarda en el dispositivo y se sincroniza después.
        </p>
      )}

      <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
        Confirmo que el servicio se ejecutó conforme a la orden y que la evidencia es correcta.
      </ConfirmCheck>

      <DialogActions hint={missingReason}>
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-[#dfe3ea] px-5 font-semibold">
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          <Check className="size-4" /> Validar cierre
        </Button>
      </DialogActions>
    </div>
  );
}

function ChecklistRow({ row, index, onNavigate }: { row: CheckRow; index: number; onNavigate: () => void }) {
  const tone = {
    ok: { bg: "bg-[#e7f7f4]", fg: "text-st-teal", icon: <Check className="size-3.5" strokeWidth={3} /> },
    block: { bg: "bg-[#fdeeee]", fg: "text-st-red", icon: <X className="size-3.5" strokeWidth={3} /> },
    warn: { bg: "bg-[#fff6e6]", fg: "text-[#b86e00]", icon: <span className="text-[13px] font-bold leading-none">!</span> },
    excepted: { bg: "bg-[#fff6e6]", fg: "text-[#b86e00]", icon: <ShieldAlert className="size-3.5" /> },
  }[row.state];
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.07 }}
      className="flex gap-3 rounded-[14px] px-1 py-2"
    >
      <motion.span
        key={row.state}
        initial={{ scale: 0.3, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.12 + index * 0.07 }}
        className={cn("mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full", tone.bg, tone.fg)}
        aria-hidden
      >
        {tone.icon}
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14.5px]", row.state === "ok" ? "text-ink" : "font-medium text-ink")}>
          {row.label}
          <span className="sr-only">
            {row.state === "ok" ? " · cumplido" : row.state === "block" ? " · bloquea" : row.state === "excepted" ? " · con excepción" : " · aviso"}
          </span>
        </p>
        {row.detail && <p className={cn("mt-0.5 text-[13px]", row.state === "block" ? "text-st-red" : "text-subtle")}>{row.state === "excepted" ? `${row.detail} · cubierto por la excepción` : row.detail}</p>}
        {row.links && row.links.length > 0 && row.state !== "ok" && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {row.links.map((l) => (
              <Link key={l.href + l.label} href={l.href} onClick={onNavigate} className="group inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-link">
                {l.label} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}
