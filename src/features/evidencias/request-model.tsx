"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppStore, useCan, useCurrentUser, useJornadaBundle, useLookups, useNow } from "@/lib/hooks";
import { GEO_SOURCE_LABEL, closureBlockers, jornadaMinutes, orderEvidence, orderMinutes, whatsappLink } from "@/lib/domain";
import { firstName, fmtDuration, plural } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { useUi } from "@/lib/ui-store";
import type { Photo, User } from "@/lib/types";
import { areaSuggestions } from "@/components/pk/photo-capture";
import { KIND_LABEL, findPair, type EvidenceRequest } from "./evidence-data";

export const REMINDER_PREFIX = "Recordatorio de evidencia";

export type HistoryItem = { id: string; at: string; title: string; detail?: string; tone: Tone };

const byTakenAt = (a: Photo, b: Photo) => a.takenAt.localeCompare(b.takenAt);
export const unique = (xs: string[]) => Array.from(new Set(xs));

/** "A, B y C" */
export function listEs(xs: string[]) {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`;
}

type Bundle = NonNullable<ReturnType<typeof useJornadaBundle>>;

function buildModel(request: EvidenceRequest, bundle: Bundle, user: User, now: Date, userName: (id: string) => string) {
  const { jornada, order, jornadas, photos, incidents, supervisor } = bundle;
  const kindLabel = KIND_LABEL[request.kind];
  const jPhotos = photos.filter((p) => p.jornadaId === jornada.id);
  const antesOfJornada = jPhotos.filter((p) => p.kind === "antes").sort(byTakenAt);
  const received = jPhotos.filter((p) => p.kind === request.kind).sort(byTakenAt);
  const resolved = received.length > 0;
  const latest = received.at(-1);
  const reference =
    request.kind === "despues" ? antesOfJornada : photos.filter((p) => p.kind === "antes" && p.jornadaId !== jornada.id).sort(byTakenAt);
  const refAreas = unique(reference.map((p) => p.area));
  const areaChoices = unique([...refAreas, ...areaSuggestions(order.serviceTypeId)]).slice(0, 6);
  const blocks = closureBlockers(order, jornadas, photos, incidents).filter((b) => b.severity === "block");
  const evidence = orderEvidence(order, jornadas, photos);
  const reminders = jornada.log.filter((l) => l.text.startsWith(REMINDER_PREFIX));

  const history: HistoryItem[] = [];
  if (jornada.checkIn)
    history.push({
      id: "in", at: jornada.checkIn.deviceAt, title: "Entrada registrada", tone: "blue",
      detail: `${jornada.checkIn.source === "gps" ? `GPS ±${Math.round(jornada.checkIn.accuracy)} m` : GEO_SOURCE_LABEL[jornada.checkIn.source]}${jornada.checkIn.offline ? " · sin conexión" : ""}`,
    });
  if (antesOfJornada[0])
    history.push({
      id: "antes", at: antesOfJornada[0].takenAt, title: "Fotos ANTES", tone: "amber",
      detail: `${plural(antesOfJornada.length, "foto", "fotos")} · ${listEs(unique(antesOfJornada.map((p) => p.area)).slice(0, 2))}`,
    });
  if (jornada.checkOut)
    history.push({
      id: "out", at: jornada.checkOut.deviceAt, title: "Salida registrada", tone: "slate",
      detail: request.kind === "despues" && !resolved ? "Sin foto DESPUÉS al salir" : `${fmtDuration(jornadaMinutes(jornada))} en sitio`,
    });
  reminders.forEach((r, i) =>
    history.push({ id: `rem-${i}`, at: r.at, title: "Recordatorio enviado", tone: "violet", detail: `${userName(r.by)} · WhatsApp manual` }),
  );
  if (request.overdue && !resolved)
    history.push({
      id: "due", at: request.due.toISOString(), title: "Plazo vencido", tone: "red",
      detail: request.kind === "despues" ? "Fin del día siguiente a la salida" : "Fin del día siguiente a la entrada",
    });
  if (resolved)
    history.push({
      id: "ok", at: received[0].takenAt, title: `Foto ${kindLabel} recibida`, tone: "teal",
      detail: `${userName(received[0].by)} · ${received[0].area}`,
    });
  history.sort((a, b) => a.at.localeCompare(b.at));

  return {
    ...bundle,
    request,
    kindLabel,
    received,
    resolved,
    latest,
    pair: latest ? findPair(latest, photos) : null,
    reference,
    refAreas,
    areaChoices,
    isMine: user.id === order.supervisorId,
    executed: jornadas.filter((j) => j.checkIn).length,
    realMinutes: orderMinutes(order.id, jornadas) + (jornada.status === "en_curso" ? jornadaMinutes(jornada, now) : 0),
    blocks,
    evidenceComplete: evidence.complete,
    readyToClose: !order.closure && blocks.length === 0 && (order.status === "pendiente_validacion" || order.status === "reabierta"),
    history,
    roleWord: supervisor?.title.split(" de ")[0] || "Supervisor",
    supFirst: supervisor ? firstName(supervisor.name) : "supervisor",
    statusTone: (resolved ? "teal" : request.overdue ? "red" : "amber") as Tone,
    statusLabel: resolved ? "Recibida" : request.overdue ? "Vencida" : "Abierta",
  };
}

export type RequestModel = ReturnType<typeof buildModel>;

/** Everything the request detail needs (live from the store) plus its two actions. */
export function useRequestModel(request: EvidenceRequest) {
  const bundle = useJornadaBundle(request.jornada.id);
  const user = useCurrentUser();
  const canCapture = useCan("field.capture");
  const canClose = useCan("closure.authorize");
  const lk = useLookups();
  const addJornadaNote = useAppStore((s) => s.addJornadaNote);
  const router = useRouter();
  const now = useNow(60_000);

  const model = bundle ? buildModel(request, bundle, user, now, (id) => lk.users.get(id)?.name ?? "Usuario") : null;

  /** Manual nudge (no automatic alerts in the MVP): opens WhatsApp and logs it in the jornada bitácora. */
  const remind = () => {
    if (!model?.supervisor?.phone) return false;
    const { order, jornada, client, kindLabel, supFirst } = model;
    const text =
      `Hola ${supFirst}, falta la foto ${kindLabel} de la jornada ${jornada.dayIndex} en ${order.folio} (${client.shortName}). ` +
      `¿Podría subirla en Pulkro Cuadrillas? Es requisito para validar el cierre. Gracias.`;
    window.open(whatsappLink(model.supervisor.phone, text), "_blank", "noopener,noreferrer");
    addJornadaNote(jornada.id, `${REMINDER_PREFIX} enviado por ${user.name}`);
    toast.success(`Recordatorio para ${supFirst} iniciado`, {
      description: "Se abrió WhatsApp y quedó en la bitácora de la jornada. Envío manual, sin confirmación de entrega.",
    });
    return true;
  };

  /** After a capture: celebrate and, when the order became closable, offer the closure. */
  const afterCapture = (ids: string[], opts: { toast: boolean }) => {
    if (!ids.length || !model) return;
    useUi.getState().fireCelebrate();
    if (!opts.toast) return;
    const st = useAppStore.getState();
    const { order } = model;
    const complete = orderEvidence(order, st.jornadas, st.photos).complete;
    if (complete && canClose && (order.status === "pendiente_validacion" || order.status === "reabierta")) {
      toast.success("Evidencia completa", {
        description: `${order.folio} ya tiene ANTES y DESPUÉS en cada jornada.`,
        action: { label: "Validar cierre", onClick: () => router.push(`/ordenes/${order.folio}?cerrar=1`) },
      });
    }
  };

  return { model, remind, afterCapture, canCapture, canClose };
}
