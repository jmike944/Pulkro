"use client";

/**
 * Single client-side store (offline-first, doc §6): all capture happens locally and is
 * queued for sync. Persisted to IndexedDB. Every mutation writes an audit entry
 * (user, date, reason — doc §3) and a sync-queue item.
 *
 * ⚠️ zustand v5: selectors must return stable references. Select raw slices
 *    (`useAppStore(s => s.orders)`) and derive with useMemo, or wrap with `useShallow`.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore as createIdbStore, del, get, set } from "idb-keyval";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { DEMO_USER_BY_ROLE, SEED_VERSION, generateSeed, shiftSnapshotDates } from "./seed";
import type {
  AuditEntity,
  CaseStatus,
  Client,
  Closure,
  DataSnapshot,
  GeoStamp,
  Incident,
  Jornada,
  Material,
  Order,
  OrderStatus,
  Photo,
  PostSaleCase,
  Report,
  Role,
  ServiceType,
  ShareChannel,
  Site,
  Survey,
  SurveyAnswers,
  SyncItem,
  User,
  Worker,
} from "./types";

/* ───────────── persistence (IndexedDB, debounced writes) ───────────── */
const idb = typeof indexedDB !== "undefined" ? createIdbStore("pulkro-cuadrillas", "state") : undefined;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const idbStorage: StateStorage = {
  getItem: async (name) => (idb ? ((await get<string>(name, idb)) ?? null) : null),
  setItem: (name, value) => {
    if (!idb) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => void set(name, value, idb), 350);
  },
  removeItem: async (name) => {
    if (idb) await del(name, idb);
  },
};

/* ───────────── helpers ───────────── */
const nowIso = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const nextFolio = (items: { folio: string }[], prefix: string, width: number) => {
  const max = items.reduce((m, x) => Math.max(m, parseInt(x.folio.split("-")[1] ?? "0", 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
};
const surveyToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

export type NewOrderInput = {
  clientId: string;
  siteId: string;
  serviceTypeId: string;
  supervisorId: string;
  title: string;
  activities: string[];
  materials: { materialId: string; qty: number }[];
  specialInstructions: string;
  siteContact: { name: string; phone: string };
  commercialRef: string;
  priority: Order["priority"];
  /** yyyy-MM-dd + HH:mm */
  days: { date: string; start: string; end: string }[];
  workerIds: string[];
};

export type GeoInput = Pick<GeoStamp, "lat" | "lng" | "accuracy" | "source"> & { note?: string };

type Session = {
  signedIn: boolean;
  userId: string;
  unitFilter: string | "all";
};

type SyncSlice = {
  forcedOffline: boolean;
  browserOffline: boolean;
  queue: SyncItem[];
  lastSyncAt: string;
  processing: boolean;
};

export type AppState = DataSnapshot & {
  meta: { seededAt: string; seedVersion: number };
  session: Session;
  sync: SyncSlice;
  hydrated: boolean;

  /* session */
  signIn: (userId: string) => void;
  signOut: () => void;
  switchRole: (role: Role) => void;
  setUnitFilter: (unit: string | "all") => void;

  /* orders */
  createOrder: (input: NewOrderInput) => Order;
  updateOrder: (orderId: string, patch: Partial<Order>, action?: string, reason?: string) => void;
  setOrderStatus: (orderId: string, status: OrderStatus, reason?: string) => void;
  cancelOrder: (orderId: string, reason: string) => void;
  reopenOrder: (orderId: string, reason: string) => void;
  archiveOrder: (orderId: string) => void;

  /* scheduling */
  assignCrew: (orderId: string, workerIds: string[], reason: string, jornadaId?: string) => void;
  scheduleJornadas: (orderId: string, days: { date: string; start: string; end: string }[], reason?: string) => void;

  /* field execution */
  checkIn: (jornadaId: string, geo: GeoInput) => void;
  checkOut: (jornadaId: string, geo: GeoInput) => void;
  addJornadaNote: (jornadaId: string, text: string) => void;
  /** Save the activity-hours split for a jornada (mobile "Desglose de horas" flow). */
  setJornadaBreakdown: (jornadaId: string, breakdown: { activity: string; hours: number }[], note?: string) => void;
  addPhoto: (photo: Omit<Photo, "id" | "by" | "takenAt"> & { takenAt?: string; bytes?: number }) => string;
  updatePhoto: (photoId: string, patch: Partial<Photo>) => void;
  deletePhoto: (photoId: string) => void;
  togglePhotoForReport: (photoId: string) => void;

  /* incidents */
  addIncident: (input: Omit<Incident, "id" | "folio" | "status" | "createdAt" | "createdBy">) => Incident;
  updateIncident: (incidentId: string, patch: Partial<Incident>) => void;
  resolveIncident: (incidentId: string, resolution: string) => void;

  /* closure + report */
  validateClosure: (orderId: string, closure: Omit<Closure, "validatedAt" | "validatedBy">) => void;
  generateReport: (orderId: string, photoIds: string[], summary: string) => Report;
  logShare: (reportId: string, channel: ShareChannel, to: string) => void;

  /* post-sale */
  createCase: (input: Omit<PostSaleCase, "id" | "folio" | "createdAt" | "createdBy" | "updatedAt" | "timeline" | "status"> & { status?: CaseStatus }) => PostSaleCase;
  updateCase: (caseId: string, patch: Partial<PostSaleCase>, note?: string) => void;
  addCaseNote: (caseId: string, text: string) => void;
  createSurvey: (orderId: string, channel: ShareChannel) => Survey;
  submitSurvey: (token: string, answers: SurveyAnswers, respondentName?: string) => boolean;
  recordManualSurvey: (orderId: string, answers: SurveyAnswers, respondentName: string) => Survey;

  /* catalogs */
  upsertClient: (client: Client) => void;
  upsertSite: (site: Site) => void;
  upsertWorker: (worker: Worker) => void;
  upsertUser: (user: User) => void;
  upsertServiceType: (st: ServiceType) => void;
  upsertMaterial: (m: Material) => void;

  /* sync */
  setForcedOffline: (v: boolean) => void;
  setBrowserOffline: (v: boolean) => void;
  processSyncQueue: () => Promise<void>;
  retrySync: () => void;

  /* demo */
  resetDemo: () => void;
  ensureSeeded: () => void;
};

/* Fields that are persisted (actions + transient flags are excluded). */
const DATA_KEYS = [
  "units", "users", "workers", "clients", "sites", "serviceTypes", "materials", "orders", "jornadas",
  "photos", "incidents", "reports", "cases", "surveys", "audit", "meta", "session", "sync",
] as const;

const emptyData: DataSnapshot = {
  units: [], users: [], workers: [], clients: [], sites: [], serviceTypes: [], materials: [],
  orders: [], jornadas: [], photos: [], incidents: [], reports: [], cases: [], surveys: [], audit: [],
};

export const isOffline = (s: Pick<AppState, "sync">) => s.sync.forcedOffline || s.sync.browserOffline;

export const useAppStore = create<AppState>()(
  persist(
    (setState, getState) => {
      /* internal: audit + sync enqueue */
      const record = (
        entity: AuditEntity,
        entityId: string,
        action: string,
        opts: { orderId?: string; reason?: string; syncLabel?: string; bytes?: number } = {},
      ) => {
        const s = getState();
        const at = nowIso();
        const entry = { id: uid("aud"), at, by: s.session.userId, entity, entityId, orderId: opts.orderId, action, reason: opts.reason };
        const item: SyncItem = {
          id: uid("syn"), at, label: opts.syncLabel ?? action, entity, entityId, orderId: opts.orderId,
          state: "pendiente", bytes: opts.bytes,
        };
        setState((st) => ({ audit: [entry, ...st.audit], sync: { ...st.sync, queue: [...st.sync.queue, item] } }));
        if (!isOffline(getState())) queueMicrotask(() => void getState().processSyncQueue());
      };

      const folioOf = (orderId: string) => getState().orders.find((o) => o.id === orderId)?.folio ?? "";

      const patchOrder = (orderId: string, patch: Partial<Order>) =>
        setState((st) => ({
          orders: st.orders.map((o) => (o.id === orderId ? { ...o, ...patch, updatedAt: nowIso() } : o)),
        }));

      const patchJornada = (jornadaId: string, patch: Partial<Jornada>) =>
        setState((st) => ({ jornadas: st.jornadas.map((j) => (j.id === jornadaId ? { ...j, ...patch } : j)) }));

      const statusLabel: Record<OrderStatus, string> = {
        borrador: "Borrador", programada: "Programada", en_ejecucion: "En ejecución", jornada_cerrada: "Jornada cerrada",
        pendiente_validacion: "Pendiente de validación", finalizada: "Finalizada", reporte_enviado: "Reporte enviado",
        seguimiento: "Seguimiento postventa", archivada: "Archivada", cancelada: "Cancelada", reprogramada: "Reprogramada",
        con_incidencia: "Con incidencia", reabierta: "Reabierta",
      };

      const changeStatus = (orderId: string, status: OrderStatus, reason?: string) => {
        const order = getState().orders.find((o) => o.id === orderId);
        if (!order || order.status === status) return;
        patchOrder(orderId, { status });
        record("orden", orderId, `Cambió estado a ${statusLabel[status]}`, { orderId, reason, syncLabel: `Estado ${statusLabel[status]} · ${order.folio}` });
      };

      const geoStamp = (geo: GeoInput): GeoStamp => {
        const s = getState();
        const offline = isOffline(s);
        const t = nowIso();
        return { ...geo, deviceAt: t, serverAt: offline ? undefined : t, by: s.session.userId, offline };
      };

      return {
        ...emptyData,
        meta: { seededAt: "", seedVersion: 0 },
        session: { signedIn: false, userId: DEMO_USER_BY_ROLE.supervisor, unitFilter: "all" },
        sync: { forcedOffline: false, browserOffline: false, queue: [], lastSyncAt: nowIso(), processing: false },
        hydrated: false,

        /* ── session ── */
        signIn: (userId) => setState((st) => ({ session: { ...st.session, signedIn: true, userId, unitFilter: "all" } })),
        signOut: () => setState((st) => ({ session: { ...st.session, signedIn: false } })),
        switchRole: (role) =>
          setState((st) => ({ session: { ...st.session, userId: DEMO_USER_BY_ROLE[role], unitFilter: "all" } })),
        setUnitFilter: (unit) => setState((st) => ({ session: { ...st.session, unitFilter: unit } })),

        /* ── orders ── */
        createOrder: (input) => {
          const s = getState();
          const id = uid("ord");
          const folio = nextFolio(s.orders, "OS", 5);
          const at = nowIso();
          const sorted = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
          const toIso = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString();
          const hasPlan = sorted.length > 0 && input.workerIds.length > 0;
          const order: Order = {
            id, folio, unitId: s.clients.find((c) => c.id === input.clientId)?.unitId ?? "u_mty",
            clientId: input.clientId, siteId: input.siteId, serviceTypeId: input.serviceTypeId, supervisorId: input.supervisorId,
            status: hasPlan ? "programada" : "borrador",
            title: input.title, activities: input.activities, materials: input.materials,
            specialInstructions: input.specialInstructions, siteContact: input.siteContact,
            scheduledStart: sorted[0] ? toIso(sorted[0].date, sorted[0].start) : at,
            scheduledEnd: sorted.length ? toIso(sorted[sorted.length - 1].date, sorted[sorted.length - 1].end) : at,
            plannedDays: Math.max(1, sorted.length), commercialRef: input.commercialRef,
            crewHistory: input.workerIds.length ? [{ at, workerIds: input.workerIds, by: s.session.userId, reason: "Asignación inicial" }] : [],
            createdAt: at, createdBy: s.session.userId, updatedAt: at, priority: input.priority,
          };
          const jornadas: Jornada[] = sorted.map((d, i) => ({
            id: uid("jor"), orderId: id, dayIndex: i + 1, date: d.date,
            plannedStart: toIso(d.date, d.start), plannedEnd: toIso(d.date, d.end),
            workerIds: input.workerIds, status: "pendiente", log: [],
          }));
          setState((st) => ({ orders: [order, ...st.orders], jornadas: [...st.jornadas, ...jornadas] }));
          record("orden", id, "Alta manual de orden de servicio", { orderId: id, reason: input.commercialRef ? `Trabajo autorizado ${input.commercialRef}` : undefined, syncLabel: `Nueva orden ${folio}` });
          return order;
        },

        updateOrder: (orderId, patch, action = "Editó datos de la orden", reason) => {
          patchOrder(orderId, patch);
          record("orden", orderId, action, { orderId, reason, syncLabel: `Edición · ${folioOf(orderId)}` });
        },

        setOrderStatus: (orderId, status, reason) => changeStatus(orderId, status, reason),

        cancelOrder: (orderId, reason) => changeStatus(orderId, "cancelada", reason),

        reopenOrder: (orderId, reason) => {
          const o = getState().orders.find((x) => x.id === orderId);
          if (!o) return;
          patchOrder(orderId, { previousStatus: o.status });
          changeStatus(orderId, "reabierta", reason);
        },

        archiveOrder: (orderId) => changeStatus(orderId, "archivada", "Ciclo postventa completo"),

        /* ── scheduling ── */
        assignCrew: (orderId, workerIds, reason, jornadaId) => {
          const s = getState();
          const at = nowIso();
          const order = s.orders.find((o) => o.id === orderId);
          if (!order) return;
          setState((st) => ({
            jornadas: st.jornadas.map((j) =>
              j.orderId === orderId && (jornadaId ? j.id === jornadaId : j.status === "pendiente") ? { ...j, workerIds } : j,
            ),
          }));
          patchOrder(orderId, {
            crewHistory: [...order.crewHistory, { at, workerIds, by: s.session.userId, reason, jornadaId }],
          });
          record("orden", orderId, `Asignó cuadrilla de ${workerIds.length} personas`, { orderId, reason, syncLabel: `Cuadrilla · ${order.folio}` });
          const hasJornadas = getState().jornadas.some((j) => j.orderId === orderId);
          if (order.status === "borrador" && workerIds.length && hasJornadas) changeStatus(orderId, "programada");
        },

        scheduleJornadas: (orderId, days, reason) => {
          const s = getState();
          const order = s.orders.find((o) => o.id === orderId);
          if (!order) return;
          const kept = s.jornadas.filter((j) => j.orderId === orderId && j.status !== "pendiente");
          const crew = order.crewHistory.at(-1)?.workerIds ?? [];
          const toIso = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString();
          const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
          const fresh: Jornada[] = sorted.map((d, i) => ({
            id: uid("jor"), orderId, dayIndex: kept.length + i + 1, date: d.date,
            plannedStart: toIso(d.date, d.start), plannedEnd: toIso(d.date, d.end), workerIds: crew, status: "pendiente", log: [],
          }));
          const all = [...kept, ...fresh];
          setState((st) => ({ jornadas: [...st.jornadas.filter((j) => !(j.orderId === orderId && j.status === "pendiente")), ...fresh] }));
          patchOrder(orderId, {
            plannedDays: all.length,
            scheduledStart: all.map((j) => j.plannedStart).sort()[0] ?? order.scheduledStart,
            scheduledEnd: all.map((j) => j.plannedEnd).sort().at(-1) ?? order.scheduledEnd,
          });
          record("orden", orderId, `Programó ${fresh.length} jornada(s)`, { orderId, reason, syncLabel: `Agenda · ${order.folio}` });
          if (order.status === "borrador" && crew.length) changeStatus(orderId, "programada");
          if (order.status === "reprogramada") changeStatus(orderId, "programada", reason);
        },

        /* ── field execution ── */
        checkIn: (jornadaId, geo) => {
          const j = getState().jornadas.find((x) => x.id === jornadaId);
          if (!j || j.checkIn) return;
          const stamp = geoStamp(geo);
          patchJornada(jornadaId, { checkIn: stamp, status: "en_curso" });
          record("jornada", jornadaId, `Registro de entrada · Jornada ${j.dayIndex} (GPS ±${Math.round(geo.accuracy)} m)`, {
            orderId: j.orderId, reason: geo.note, syncLabel: `Entrada GPS · ${folioOf(j.orderId)}`,
          });
          const o = getState().orders.find((x) => x.id === j.orderId);
          if (o && o.status !== "con_incidencia") changeStatus(j.orderId, "en_ejecucion");
        },

        checkOut: (jornadaId, geo) => {
          const j = getState().jornadas.find((x) => x.id === jornadaId);
          if (!j || !j.checkIn || j.checkOut) return;
          const stamp = geoStamp(geo);
          if (stamp.deviceAt < j.checkIn.deviceAt) return; // secuencia temporal inválida
          patchJornada(jornadaId, { checkOut: stamp, status: "cerrada" });
          record("jornada", jornadaId, `Registro de salida · Jornada ${j.dayIndex} (GPS ±${Math.round(geo.accuracy)} m)`, {
            orderId: j.orderId, reason: geo.note, syncLabel: `Salida GPS · ${folioOf(j.orderId)}`,
          });
          const remaining = getState().jornadas.filter((x) => x.orderId === j.orderId && x.status === "pendiente").length;
          const o = getState().orders.find((x) => x.id === j.orderId);
          if (o && o.status !== "con_incidencia") changeStatus(j.orderId, remaining > 0 ? "jornada_cerrada" : "pendiente_validacion");
        },

        addJornadaNote: (jornadaId, text) => {
          const s = getState();
          const j = s.jornadas.find((x) => x.id === jornadaId);
          if (!j) return;
          patchJornada(jornadaId, { log: [...j.log, { at: nowIso(), by: s.session.userId, text }] });
          record("jornada", jornadaId, "Agregó nota a la bitácora", { orderId: j.orderId, syncLabel: `Bitácora · ${folioOf(j.orderId)}` });
        },

        setJornadaBreakdown: (jornadaId, breakdown, note) => {
          const j = getState().jornadas.find((x) => x.id === jornadaId);
          if (!j) return;
          const total = breakdown.reduce((sum, b) => sum + b.hours, 0);
          patchJornada(jornadaId, { breakdown, breakdownNote: note?.trim() || undefined });
          record("jornada", jornadaId, `Registró desglose de horas · Jornada ${j.dayIndex} (${total.toFixed(1)} h)`, {
            orderId: j.orderId, reason: note?.trim() || undefined, syncLabel: `Desglose de horas · ${folioOf(j.orderId)}`,
          });
        },

        addPhoto: (photo) => {
          const s = getState();
          const id = uid("pho");
          const { bytes, ...rest } = photo;
          const p: Photo = { ...rest, id, by: s.session.userId, takenAt: photo.takenAt ?? nowIso() };
          setState((st) => ({ photos: [...st.photos, p] }));
          const kindLabel = { antes: "ANTES", despues: "DESPUÉS", incidencia: "incidencia", postventa: "postventa" }[p.kind];
          record("foto", id, `Adjuntó foto ${kindLabel} · ${p.area}`, { orderId: p.orderId, syncLabel: `Foto ${kindLabel} · ${folioOf(p.orderId)}`, bytes: bytes ?? 380_000 });
          return id;
        },

        updatePhoto: (photoId, patch) =>
          setState((st) => ({ photos: st.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) })),

        deletePhoto: (photoId) => {
          const p = getState().photos.find((x) => x.id === photoId);
          setState((st) => ({ photos: st.photos.filter((x) => x.id !== photoId) }));
          if (p) record("foto", photoId, `Eliminó foto · ${p.area}`, { orderId: p.orderId });
        },

        togglePhotoForReport: (photoId) =>
          setState((st) => ({ photos: st.photos.map((p) => (p.id === photoId ? { ...p, selectedForReport: !p.selectedForReport } : p)) })),

        /* ── incidents ── */
        addIncident: (input) => {
          const s = getState();
          const inc: Incident = {
            ...input, id: uid("inc"), folio: nextFolio(s.incidents, "INC", 4), status: "abierta",
            createdAt: nowIso(), createdBy: s.session.userId,
          };
          setState((st) => ({ incidents: [inc, ...st.incidents] }));
          record("incidencia", inc.id, `Registró incidencia ${inc.folio}`, { orderId: inc.orderId, syncLabel: `Incidencia ${inc.folio}` });
          if (inc.blocksClosure) {
            const o = getState().orders.find((x) => x.id === inc.orderId);
            if (o && o.status !== "con_incidencia") {
              patchOrder(o.id, { previousStatus: o.status });
              changeStatus(o.id, "con_incidencia", inc.description);
            }
          }
          return inc;
        },

        updateIncident: (incidentId, patch) => {
          const inc = getState().incidents.find((i) => i.id === incidentId);
          setState((st) => ({ incidents: st.incidents.map((i) => (i.id === incidentId ? { ...i, ...patch } : i)) }));
          if (inc) record("incidencia", incidentId, `Actualizó incidencia ${inc.folio}`, { orderId: inc.orderId });
        },

        resolveIncident: (incidentId, resolution) => {
          const s = getState();
          const inc = s.incidents.find((i) => i.id === incidentId);
          if (!inc) return;
          setState((st) => ({
            incidents: st.incidents.map((i) =>
              i.id === incidentId ? { ...i, status: "resuelta", resolution, resolvedAt: nowIso(), resolvedBy: s.session.userId } : i,
            ),
          }));
          record("incidencia", incidentId, `Resolvió incidencia ${inc.folio}`, { orderId: inc.orderId, reason: resolution });
          const stillBlocking = getState().incidents.some((i) => i.orderId === inc.orderId && i.status === "abierta" && i.blocksClosure);
          const o = getState().orders.find((x) => x.id === inc.orderId);
          if (o && o.status === "con_incidencia" && !stillBlocking) {
            const js = getState().jornadas.filter((j) => j.orderId === o.id);
            const fallback: OrderStatus = js.some((j) => j.status === "en_curso")
              ? "en_ejecucion"
              : js.some((j) => j.status === "pendiente")
                ? js.some((j) => j.status === "cerrada") ? "jornada_cerrada" : "programada"
                : "pendiente_validacion";
            // Execution states are recomputed from the jornadas; anything else resumes where it was.
            const resumable: OrderStatus[] = ["finalizada", "reabierta", "reprogramada"];
            const next = o.previousStatus && resumable.includes(o.previousStatus) ? o.previousStatus : fallback;
            changeStatus(o.id, next, "Incidencia resuelta");
          }
        },

        /* ── closure + report ── */
        validateClosure: (orderId, closure) => {
          const s = getState();
          const full: Closure = { ...closure, validatedAt: nowIso(), validatedBy: s.session.userId };
          patchOrder(orderId, { closure: full });
          record("orden", orderId, "Validó cierre definitivo", {
            orderId, reason: closure.exception ? `Excepción: ${closure.exception.reason}` : undefined, syncLabel: `Cierre · ${folioOf(orderId)}`,
          });
          changeStatus(orderId, "finalizada");
        },

        generateReport: (orderId, photoIds, summary) => {
          const s = getState();
          const prev = s.reports.filter((r) => r.orderId === orderId);
          const rep: Report = {
            id: uid("rep"), orderId, version: prev.length + 1, generatedAt: nowIso(), generatedBy: s.session.userId,
            photoIds, summary, shares: [],
          };
          setState((st) => ({ reports: [rep, ...st.reports] }));
          record("reporte", rep.id, `Generó reporte PDF v${rep.version}`, { orderId, syncLabel: `Reporte v${rep.version} · ${folioOf(orderId)}`, bytes: 1_200_000 });
          const o = getState().orders.find((x) => x.id === orderId);
          if (o?.status === "reabierta") changeStatus(orderId, "finalizada", "Nueva versión del reporte");
          return rep;
        },

        logShare: (reportId, channel, to) => {
          const s = getState();
          const rep = s.reports.find((r) => r.id === reportId);
          if (!rep) return;
          const share = {
            id: uid("shr"), channel, to, at: nowIso(), by: s.session.userId,
            note: "Envío iniciado desde el dispositivo · sin confirmación de entrega",
          };
          setState((st) => ({ reports: st.reports.map((r) => (r.id === reportId ? { ...r, shares: [...r.shares, share] } : r)) }));
          const label = channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "correo" : "descarga";
          record("reporte", reportId, `Inició envío por ${label}`, { orderId: rep.orderId, reason: to });
          const o = getState().orders.find((x) => x.id === rep.orderId);
          if (o?.status === "finalizada") changeStatus(rep.orderId, "reporte_enviado");
        },

        /* ── post-sale ── */
        createCase: (input) => {
          const s = getState();
          const at = nowIso();
          const c: PostSaleCase = {
            ...input, status: input.status ?? "abierto", id: uid("cas"), folio: nextFolio(s.cases, "PV", 4),
            createdAt: at, createdBy: s.session.userId, updatedAt: at,
            timeline: [{ at, by: s.session.userId, text: "Caso registrado y asignado." }],
          };
          setState((st) => ({ cases: [c, ...st.cases] }));
          record("caso", c.id, `Abrió caso postventa ${c.folio}`, { orderId: c.orderId, syncLabel: `Caso ${c.folio}` });
          const o = getState().orders.find((x) => x.id === c.orderId);
          if (o && (o.status === "reporte_enviado" || o.status === "archivada")) changeStatus(o.id, "seguimiento", `Caso ${c.folio}`);
          return c;
        },

        updateCase: (caseId, patch, note) => {
          const s = getState();
          const c = s.cases.find((x) => x.id === caseId);
          if (!c) return;
          const at = nowIso();
          const timeline = note ? [...c.timeline, { at, by: s.session.userId, text: note }] : c.timeline;
          setState((st) => ({ cases: st.cases.map((x) => (x.id === caseId ? { ...x, ...patch, timeline, updatedAt: at } : x)) }));
          record("caso", caseId, note ?? `Actualizó caso ${c.folio}`, { orderId: c.orderId });
        },

        addCaseNote: (caseId, text) => getState().updateCase(caseId, {}, text),

        createSurvey: (orderId, channel) => {
          const s = getState();
          const o = s.orders.find((x) => x.id === orderId)!;
          const sv: Survey = {
            id: uid("sur"), token: surveyToken(), orderId, clientId: o.clientId, sentAt: nowIso(), sentBy: s.session.userId,
            channel, manual: false,
          };
          setState((st) => ({ surveys: [sv, ...st.surveys] }));
          record("encuesta", sv.id, "Generó enlace de encuesta", { orderId, syncLabel: `Encuesta · ${o.folio}` });
          if (o.status === "reporte_enviado") changeStatus(orderId, "seguimiento", "Encuesta enviada");
          return sv;
        },

        submitSurvey: (token, answers, respondentName) => {
          const sv = getState().surveys.find((x) => x.token === token);
          if (!sv || sv.respondedAt) return false;
          setState((st) => ({
            surveys: st.surveys.map((x) => (x.token === token ? { ...x, answers, respondentName, respondedAt: nowIso() } : x)),
          }));
          const a = getState().audit;
          setState({ audit: [{ id: uid("aud"), at: nowIso(), by: "cliente", entity: "encuesta", entityId: sv.id, orderId: sv.orderId, action: `Cliente respondió encuesta (${answers.overall}/5)` }, ...a] });
          return true;
        },

        recordManualSurvey: (orderId, answers, respondentName) => {
          const s = getState();
          const o = s.orders.find((x) => x.id === orderId)!;
          const existing = s.surveys.find((x) => x.orderId === orderId && !x.respondedAt);
          const at = nowIso();
          const sv: Survey = existing
            ? { ...existing, answers, respondentName, respondedAt: at, manual: true }
            : { id: uid("sur"), token: surveyToken(), orderId, clientId: o.clientId, sentAt: at, sentBy: s.session.userId, channel: "descarga", manual: true, answers, respondentName, respondedAt: at };
          setState((st) => ({ surveys: existing ? st.surveys.map((x) => (x.id === sv.id ? sv : x)) : [sv, ...st.surveys] }));
          record("encuesta", sv.id, "Registró respuesta de encuesta manualmente", { orderId });
          return sv;
        },

        /* ── catalogs ── */
        upsertClient: (client) => {
          setState((st) => ({ clients: st.clients.some((c) => c.id === client.id) ? st.clients.map((c) => (c.id === client.id ? client : c)) : [...st.clients, client] }));
          record("catalogo", client.id, `Guardó cliente ${client.shortName}`);
        },
        upsertSite: (site) => {
          setState((st) => ({ sites: st.sites.some((c) => c.id === site.id) ? st.sites.map((c) => (c.id === site.id ? site : c)) : [...st.sites, site] }));
          record("catalogo", site.id, `Guardó sitio ${site.name}`);
        },
        upsertWorker: (worker) => {
          setState((st) => ({ workers: st.workers.some((c) => c.id === worker.id) ? st.workers.map((c) => (c.id === worker.id ? worker : c)) : [...st.workers, worker] }));
          record("catalogo", worker.id, `Guardó trabajador ${worker.name}`);
        },
        upsertUser: (user) => {
          setState((st) => ({ users: st.users.some((c) => c.id === user.id) ? st.users.map((c) => (c.id === user.id ? user : c)) : [...st.users, user] }));
          record("usuario", user.id, `Guardó usuario ${user.name}`);
        },
        upsertServiceType: (stype) => {
          setState((st) => ({ serviceTypes: st.serviceTypes.some((c) => c.id === stype.id) ? st.serviceTypes.map((c) => (c.id === stype.id ? stype : c)) : [...st.serviceTypes, stype] }));
          record("catalogo", stype.id, `Guardó tipo de servicio ${stype.name}`);
        },
        upsertMaterial: (m) => {
          setState((st) => ({ materials: st.materials.some((c) => c.id === m.id) ? st.materials.map((c) => (c.id === m.id ? m : c)) : [...st.materials, m] }));
          record("catalogo", m.id, `Guardó material ${m.name}`);
        },

        /* ── sync engine (simulated server round-trips) ── */
        setForcedOffline: (v) => {
          setState((st) => ({ sync: { ...st.sync, forcedOffline: v } }));
          if (!v) void getState().processSyncQueue();
        },
        setBrowserOffline: (v) => {
          setState((st) => ({ sync: { ...st.sync, browserOffline: v } }));
          if (!v) void getState().processSyncQueue();
        },
        retrySync: () => {
          setState((st) => ({ sync: { ...st.sync, queue: st.sync.queue.map((q) => (q.state === "error" ? { ...q, state: "pendiente" } : q)) } }));
          void getState().processSyncQueue();
        },
        processSyncQueue: async () => {
          if (getState().sync.processing) return;
          setState((st) => ({ sync: { ...st.sync, processing: true } }));
          try {
            for (;;) {
              const s = getState();
              if (isOffline(s)) break;
              const next = s.sync.queue.find((q) => q.state === "pendiente");
              if (!next) break;
              const mark = (state: SyncItem["state"]) =>
                setState((st) => ({ sync: { ...st.sync, queue: st.sync.queue.map((q) => (q.id === next.id ? { ...q, state } : q)) } }));
              mark("sincronizando");
              await new Promise((r) => setTimeout(r, 380 + Math.min(1400, (next.bytes ?? 0) / 900)));
              if (isOffline(getState())) {
                mark("pendiente");
                break;
              }
              mark("sincronizado");
              const serverAt = nowIso();
              // stamp server time on GPS records captured offline
              if (next.entity === "jornada") {
                setState((st) => ({
                  jornadas: st.jornadas.map((j) =>
                    j.id === next.entityId
                      ? {
                          ...j,
                          checkIn: j.checkIn && !j.checkIn.serverAt ? { ...j.checkIn, serverAt } : j.checkIn,
                          checkOut: j.checkOut && !j.checkOut.serverAt ? { ...j.checkOut, serverAt } : j.checkOut,
                        }
                      : j,
                  ),
                }));
              }
              setState((st) => ({ sync: { ...st.sync, lastSyncAt: serverAt } }));
            }
          } finally {
            // keep the most recent 60 synced items for the activity view
            setState((st) => {
              const pending = st.sync.queue.filter((q) => q.state !== "sincronizado");
              const synced = st.sync.queue.filter((q) => q.state === "sincronizado").slice(-60);
              return { sync: { ...st.sync, processing: false, queue: [...synced, ...pending] } };
            });
          }
        },

        /* ── demo data ── */
        resetDemo: () => {
          const seed = generateSeed(new Date());
          const { seededAt, ...data } = seed;
          setState((st) => ({
            ...data,
            meta: { seededAt, seedVersion: SEED_VERSION },
            sync: { ...st.sync, queue: [], lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(), processing: false },
          }));
        },

        ensureSeeded: () => {
          const s = getState();
          if (!s.meta.seededAt || s.meta.seedVersion !== SEED_VERSION || s.orders.length === 0) {
            getState().resetDemo();
            return;
          }
          // Re-anchor the demo dataset to today so "Hoy" always has live work.
          const delta = differenceInCalendarDays(startOfDay(new Date()), startOfDay(parseISO(s.meta.seededAt)));
          if (delta > 0) {
            const data: DataSnapshot = {
              units: s.units, users: s.users, workers: s.workers, clients: s.clients, sites: s.sites,
              serviceTypes: s.serviceTypes, materials: s.materials, orders: s.orders, jornadas: s.jornadas,
              photos: s.photos, incidents: s.incidents, reports: s.reports, cases: s.cases, surveys: s.surveys, audit: s.audit,
            };
            const shifted = shiftSnapshotDates(data, delta);
            // Live jornadas keep their time of day; never leave a check-in in the future.
            const limit = Date.now() - 5 * 60_000;
            shifted.jornadas = shifted.jornadas.map((j) =>
              j.status === "en_curso" && j.checkIn && new Date(j.checkIn.deviceAt).getTime() > limit
                ? { ...j, checkIn: { ...j.checkIn, deviceAt: new Date(Date.now() - 135 * 60_000).toISOString() } }
                : j,
            );
            setState({ ...shifted, meta: { ...s.meta, seededAt: new Date().toISOString() } });
          }
        },
      };
    },
    {
      name: "pulkro-cuadrillas",
      version: SEED_VERSION,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => {
        const out: Record<string, unknown> = {};
        for (const k of DATA_KEYS) out[k] = s[k];
        out.sync = { ...s.sync, processing: false, browserOffline: false };
        return out as Partial<AppState>;
      },
      migrate: () => ({}) as AppState, // version bump → reseed
    },
  ),
);

/** Called once on the client: rehydrate from IndexedDB, then seed / re-anchor. */
export async function bootstrapStore() {
  if (useAppStore.getState().hydrated) return;
  await useAppStore.persist.rehydrate();
  useAppStore.getState().ensureSeeded();
  useAppStore.setState({ hydrated: true });
  if (typeof navigator !== "undefined") useAppStore.getState().setBrowserOffline(!navigator.onLine);
}

export const todayKey = () => format(new Date(), "yyyy-MM-dd");
