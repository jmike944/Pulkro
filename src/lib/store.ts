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
import { toast } from "sonner";
import { DEMO_USER_BY_ROLE, SEED_VERSION, generateSeed, shiftSnapshotDates } from "./seed";
import { can, canSeeOrder, canSeeUnit, type Action } from "./permissions";
import {
  CASE_RESOLUTION_MIN,
  GEO_NOTE_MIN,
  SERVICE_HOURS_MAX,
  SERVICE_HOURS_MIN,
  closureBlockers,
  derivedExecutionStatus,
  isStrongSurveyToken,
  photoTimingIssues,
} from "./domain";
import { plural } from "./format";
import { DONE_STATUSES, OPEN_STATUSES } from "./status";
import { DEMO_ENABLED, DEMO_SIGN_IN } from "./demo";
import { clearPhotoFiles, deletePhotoFile } from "./photo-store";
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
  Unit,
  User,
  Worker,
} from "./types";

/* ───────────── persistence (IndexedDB, debounced writes) ───────────── */
const idb = typeof indexedDB !== "undefined" ? createIdbStore("pulkro-cuadrillas", "state") : undefined;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let pendingWrite: { name: string; value: string } | null = null;
let pendingSince = 0;
const flushWrite = () => {
  clearTimeout(writeTimer);
  if (!idb || !pendingWrite) return;
  const { name, value } = pendingWrite;
  pendingWrite = null;
  void set(name, value, idb);
};
// A reload / app switch right after a capture must not lose the debounced write (the service worker may hard-navigate offline).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWrite);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrite();
  });
}
const idbStorage: StateStorage = {
  getItem: async (name) => (idb ? ((await get<string>(name, idb)) ?? null) : null),
  setItem: (name, value) => {
    if (!idb) return;
    const waiting = pendingWrite !== null;
    pendingWrite = { name, value };
    // Debounce 350 ms, but never let a stream of updates postpone the write by more than ~1 s (a sign-in or a capture
    // followed by constant store activity used to stay unsaved until the stream stopped).
    if (!waiting) pendingSince = Date.now();
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrite, Date.now() - pendingSince >= 1000 ? 0 : 350);
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
/** 256-bit survey link token (43 base64url characters): the server refuses shorter or structured tokens (isStrongSurveyToken). */
const surveyToken = (): string => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (isStrongSurveyToken(token)) return token;
  }
  throw new Error("No se pudo generar un enlace de encuesta seguro en este dispositivo.");
};
const omit = <T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;

/** Thrown by value-returning actions when the session may not perform them (the UI should have hidden the control). */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Runs a value-returning action (createOrder, addIncident, createCase…). When the store refuses it the user has already been
 * told why (toast), so this resolves to `undefined` instead of an uncaught exception in the event handler.
 */
export function attempt<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (e) {
    if (e instanceof PermissionDeniedError) return undefined;
    throw e;
  }
}

const OUT_OF_SCOPE = "No encontrado o fuera de su alcance.";
const CLOSED_ORDER = "Orden cerrada: reábrala para hacer cambios (se generará una nueva versión del reporte).";

/** Why a role can't do an action — the store's guard messages (the UI's tooltips say the same). */
export const DENIED_REASON: Partial<Record<Action, string>> = {
  "order.create": "Solo Administración da de alta órdenes.",
  "order.edit": "Solo Administración edita los datos generales de la orden.",
  "order.editOperational": "Su rol solo consulta esta orden.",
  "order.reschedule": "Solo el supervisor reprograma jornadas y confirma fechas.",
  "order.reopen": "Solo el supervisor de la orden puede reabrirla.",
  "order.archive": "Su rol no archiva órdenes.",
  "crew.assign": "Solo el supervisor asigna la cuadrilla.",
  "field.capture": "Solo el supervisor captura en campo.",
  "closure.authorize": "Solo el supervisor autoriza el cierre.",
  "report.share": "Solo el supervisor genera y comparte el reporte con el cliente.",
  "postventa.manage": "Su rol solo consulta la postventa.",
  "users.admin": "Su rol no administra usuarios.",
  "catalogs.admin": "Su rol no administra catálogos.",
  "view.allUnits": "Su rol solo ve su propio alcance.",
};

/** Fields a supervisor (order.editOperational) may change; order.edit adds the general data. */
const OPERATIONAL_FIELDS: (keyof Order)[] = ["specialInstructions", "siteContact", "activities", "materials"];
const FULL_EDIT_FIELDS: (keyof Order)[] = [...OPERATIONAL_FIELDS, "title", "priority", "commercialRef", "serviceTypeId", "siteId", "supervisorId"];
const REOPENABLE: OrderStatus[] = ["finalizada", "reporte_enviado", "seguimiento"];
const CLOSABLE: OrderStatus[] = ["pendiente_validacion", "reabierta", "con_incidencia"];
const ARCHIVABLE: OrderStatus[] = ["reporte_enviado", "seguimiento"];
const REPORTABLE: OrderStatus[] = ["finalizada", "reporte_enviado", "seguimiento"];
/** Statuses a supervisor may set by hand (the rest are derived from jornadas, closure, incidents and reports). */
const RESCHEDULE_TARGETS: OrderStatus[] = ["reprogramada", "programada", "en_ejecucion", "jornada_cerrada"];
const isTerminal = (st: OrderStatus) => DONE_STATUSES.includes(st) || st === "cancelada";

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

/** What addPhoto accepts: capture metadata (EXIF time, origin, position) is kept as given; `by`/`uploadedAt` are stamped. */
export type NewPhotoInput = Omit<Photo, "id" | "by" | "takenAt" | "uploadedAt"> & { takenAt?: string; bytes?: number };

type Session = {
  signedIn: boolean;
  userId: string;
  unitFilter: string | "all";
  /**
   * "demo": the role picker over the local demo dataset. "supabase": a real account (signed in with Supabase Auth, profile
   * read from public.profiles); the demo dataset and the demo controls never apply to it.
   */
  mode: "demo" | "supabase";
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
  /** Demo role picker. Returns whether the session started (a refusal is toasted). */
  signIn: (userId: string) => boolean;
  /** Demo sign-out (keeps the device data). An account session signs out through useSignOut (features/auth). */
  signOut: () => void;
  /**
   * Starts an account session for a verified, active profile. The same account keeps its device data; anything else on the
   * device (the demo dataset, another account's data) is replaced by an empty dataset holding only this profile and unit.
   * The caller confirms first when another account still has unsent changes (otherAccountOnDevice, features/auth/session).
   */
  startSupabaseSession: (user: User, unit?: Unit) => void;
  /** Wipes the device after an account sign-out: data, queue and photo blobs (IndexedDB), then the demo seed if offered. */
  clearDeviceData: () => void;
  /** Demo only (NEXT_PUBLIC_DEMO ≠ "0"). */
  switchRole: (role: Role) => void;
  /** No-op for roles without view.allUnits. */
  setUnitFilter: (unit: string | "all") => void;

  /* orders */
  createOrder: (input: NewOrderInput) => Order;
  updateOrder: (orderId: string, patch: Partial<Order>, action?: string, reason?: string) => void;
  setOrderStatus: (orderId: string, status: OrderStatus, reason?: string) => void;
  cancelOrder: (orderId: string, reason: string) => void;
  /** Reabrir (order.reopen): the next report version needs a fresh validateClosure. */
  /** Returns whether the order was reopened (a refusal is toasted). */
  reopenOrder: (orderId: string, reason: string) => boolean;
  /** Archivar (order.archive): reporte enviado / seguimiento with no open post-sale cases. */
  archiveOrder: (orderId: string, reason?: string) => void;

  /* scheduling */
  assignCrew: (orderId: string, workerIds: string[], reason: string, jornadaId?: string) => void;
  scheduleJornadas: (orderId: string, days: { date: string; start: string; end: string }[], reason?: string) => void;

  /* field execution */
  checkIn: (jornadaId: string, geo: GeoInput) => void;
  checkOut: (jornadaId: string, geo: GeoInput) => void;
  addJornadaNote: (jornadaId: string, text: string) => void;
  /** Audit-only reminder about missing evidence (Evidencias): never writes into the jornada's bitácora. */
  logReminder: (orderId: string, jornadaId?: string, note?: string) => void;
  /** Save the activity-hours split for a jornada (mobile "Desglose de horas" flow). */
  /** Returns whether it was saved (a refusal is toasted). */
  setJornadaBreakdown: (jornadaId: string, breakdown: { activity: string; hours: number }[], note?: string) => boolean;
  addPhoto: (photo: NewPhotoInput) => string;
  updatePhoto: (photoId: string, patch: Partial<Pick<Photo, "area" | "note" | "caseId" | "incidentId">>) => void;
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
  /** Returns whether the case was updated (a refusal is toasted). */
  updateCase: (caseId: string, patch: Partial<PostSaleCase>, note?: string) => boolean;
  addCaseNote: (caseId: string, text: string) => void;
  createSurvey: (orderId: string, channel: ShareChannel) => Survey;
  /** Public: the client answers. Refused (false) while a staff session is signed in on the device, or when already answered. */
  submitSurvey: (token: string, answers: SurveyAnswers, respondentName?: string) => boolean;
  recordManualSurvey: (orderId: string, answers: SurveyAnswers, respondentName: string) => Survey;

  /* catalogs */
  upsertClient: (client: Client) => void;
  upsertSite: (site: Site) => void;
  upsertWorker: (worker: Worker) => void;
  /** users.admin, or self-service on one's own record limited to the phone (role, unit, e-mail and active never change here). */
  upsertUser: (user: User) => void;
  /** Self-service "Mis datos": the phone of the signed-in user (the e-mail is the account's identity: Dirección manages it). */
  updateMyContact: (contact: { phone?: string }) => void;
  upsertServiceType: (st: ServiceType) => void;
  upsertMaterial: (m: Material) => void;

  /* sync */
  setForcedOffline: (v: boolean) => void;
  setBrowserOffline: (v: boolean) => void;
  processSyncQueue: () => Promise<void>;
  retrySync: () => void;

  /* demo */
  /** Demo only (NEXT_PUBLIC_DEMO ≠ "0"); the UI must confirm first (DemoResetDialog). Refused while records are unsynced. */
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

/** Queue items that have not reached the server (pending, sending or failed). */
export const unsentCount = (queue: SyncItem[]) => queue.filter((q) => q.state !== "sincronizado").length;

/** Items that were mid-upload when the app closed go back to "pendiente" so the engine retries them. */
const unstick = (queue: SyncItem[]) => queue.map((q) => (q.state === "sincronizando" ? { ...q, state: "pendiente" as const } : q));

export const useAppStore = create<AppState>()(
  persist(
    (setState, getState) => {
      /* internal: audit + sync enqueue */
      const record = (
        entity: AuditEntity,
        entityId: string,
        action: string,
        opts: { orderId?: string; reason?: string; syncLabel?: string; bytes?: number; by?: string } = {},
      ) => {
        const s = getState();
        const at = nowIso();
        const entry = { id: uid("aud"), at, by: opts.by ?? s.session.userId, entity, entityId, orderId: opts.orderId, action, reason: opts.reason };
        const item: SyncItem = {
          id: uid("syn"), at, label: opts.syncLabel ?? action, entity, entityId, orderId: opts.orderId,
          state: "pendiente", bytes: opts.bytes,
        };
        setState((st) => ({ audit: [entry, ...st.audit], sync: { ...st.sync, queue: [...st.sync.queue, item] } }));
        if (!isOffline(getState())) queueMicrotask(() => void getState().processSyncQueue());
      };

      /* internal: permission + scope guards (doc §2). The UI hides what a role can't do; these make it hold for every caller. */
      let lastDenied = "";
      const denied = (message: string): null => {
        lastDenied = message;
        toast.error("Acción no permitida", { id: "pk-denied", description: message });
        return null;
      };
      const CASE_OWNER_RULE = "El responsable del caso debe ser el supervisor de la orden o alguien de Administración de la unidad.";
      const SUPERVISOR_OTHER_UNIT = "Usted ya no pertenece a la unidad de esta orden: pida a Administración que la reasigne antes de reabrirla.";
      const CASE_NEW_STATUS_RULE = "Un caso nuevo empieza abierto o en proceso: regístrelo y después márquelo como resuelto con su resolución.";
      const CASE_RESOLUTION_RULE = `Escriba la resolución (al menos ${CASE_RESOLUTION_MIN} caracteres) para marcar el caso como resuelto o cerrado.`;
      /** Case owners: active Administración of the order's unit, or the order's own supervisor (who can see the case). */
      const isValidCaseOwner = (ownerId: string, order: Order) => {
        const u = getState().users.find((x) => x.id === ownerId);
        return !!u && u.active && u.unitId === order.unitId && (u.role === "administracion" || (u.role === "supervisor" && u.id === order.supervisorId));
      };
      /** For actions that must return a value: stop the caller after telling the user why. */
      const must = <T>(v: T | null): T => {
        if (v === null) throw new PermissionDeniedError(lastDenied || "Acción no permitida");
        return v;
      };
      /** The signed-in, active user. */
      const sessionUser = () => {
        const s = getState();
        return s.session.signedIn ? s.users.find((u) => u.id === s.session.userId && u.active) : undefined;
      };
      /** The user may do any of `actions` (null = any signed-in user). */
      const allowRole = (actions: Action[] | null): User | null => {
        const user = sessionUser();
        if (!user) return denied("Inicie sesión para continuar.");
        if (actions && !actions.some((a) => can(user.role, a))) return denied(DENIED_REASON[actions[0]] ?? "Su rol no permite esta acción.");
        return user;
      };
      /** allowRole + the order exists and is inside the user's scope. */
      const allowOrder = (actions: Action[] | null, orderId: string | undefined): { user: User; order: Order } | null => {
        const user = allowRole(actions);
        if (!user) return null;
        const s = getState();
        const order = orderId ? s.orders.find((o) => o.id === orderId) : undefined;
        if (!order || !canSeeOrder(user, order, s.session.unitFilter)) return denied(OUT_OF_SCOPE);
        return { user, order };
      };
      const allowJornada = (actions: Action[] | null, jornadaId: string) => {
        const jornada = getState().jornadas.find((x) => x.id === jornadaId);
        if (!jornada) return denied(OUT_OF_SCOPE);
        const ok = allowOrder(actions, jornada.orderId);
        return ok ? { ...ok, jornada } : null;
      };
      /** Field photos follow field.capture; post-sale photos follow postventa.manage. */
      const photoAction = (kind: Photo["kind"]): Action => (kind === "postventa" ? "postventa.manage" : "field.capture");
      const allowPhotoEdit = (photoId: string) => {
        const photo = getState().photos.find((p) => p.id === photoId);
        if (!photo) return denied(OUT_OF_SCOPE);
        const ok = allowOrder([photoAction(photo.kind)], photo.orderId);
        if (!ok) return null;
        if (photo.kind !== "postventa" && isTerminal(ok.order.status)) return denied(CLOSED_ORDER);
        return { ...ok, photo };
      };
      /** Catalog writes: catalogs.admin, and Administración only inside its own unit. */
      const allowCatalog = (unitId: string | undefined) => {
        const user = allowRole(["catalogs.admin"]);
        if (!user) return null;
        if (unitId && !canSeeUnit(user, unitId, "all")) return denied("Solo puede modificar el catálogo de su unidad.");
        return user;
      };

      const userName = (id: string) => getState().users.find((u) => u.id === id)?.name ?? id;

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

      /** Internal transition (callers have already been authorized). */
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
        const note = geo.note?.trim() || undefined;
        return { ...geo, note, deviceAt: t, serverAt: offline ? undefined : t, by: s.session.userId, offline };
      };
      const geoLabel = (geo: GeoInput) =>
        geo.source === "remota" ? "supervisión remota" : geo.source === "manual" ? "ubicación manual" : `GPS ±${Math.round(geo.accuracy)} m`;
      /** Manual pins and remote supervision always carry a justification. */
      const geoNoteOk = (geo: GeoInput) =>
        geo.source === "gps" || (geo.note?.trim().length ?? 0) >= GEO_NOTE_MIN
          ? true
          : denied(geo.source === "remota" ? "Explique la supervisión remota (quién está en sitio y cómo se confirmó)." : "Justifique la ubicación manual.");

      const signedOutSession = (): Session => ({ signedIn: false, userId: DEMO_USER_BY_ROLE.supervisor, unitFilter: "all", mode: "demo" });

      const reseed = () => {
        const seed = generateSeed(new Date());
        const { seededAt, ...data } = seed;
        setState((st) => ({
          ...data,
          meta: { seededAt, seedVersion: SEED_VERSION },
          sync: { ...st.sync, queue: [], lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(), processing: false },
        }));
      };

      return {
        ...emptyData,
        meta: { seededAt: "", seedVersion: 0 },
        session: signedOutSession(),
        sync: { forcedOffline: false, browserOffline: false, queue: [], lastSyncAt: nowIso(), processing: false },
        hydrated: false,

        /* ── session ── */
        signIn: (userId) => {
          if (!DEMO_SIGN_IN) {
            denied("Esta versión no tiene demostración: entre con su cuenta.");
            return false;
          }
          // An account's data never turns into a demo session: its owner signs out first (useSignOut checks the queue).
          if (getState().session.mode === "supabase") {
            denied("Hay una cuenta abierta en este dispositivo: cierre su sesión antes de entrar al demo.");
            return false;
          }
          const user = getState().users.find((u) => u.id === userId);
          if (!user || !user.active) {
            denied("La cuenta no existe o está desactivada.");
            return false;
          }
          setState((st) => ({ session: { ...st.session, signedIn: true, userId, unitFilter: "all", mode: "demo" } }));
          return true;
        },
        signOut: () => setState((st) => ({ session: { ...st.session, signedIn: false } })),
        startSupabaseSession: (user, unit) => {
          const s = getState();
          if (s.session.mode === "supabase" && s.session.userId === user.id) {
            // Same account (signed in again on this device): keep its data and unsent queue, refresh its own records.
            setState((st) => ({
              users: st.users.some((u) => u.id === user.id) ? st.users.map((u) => (u.id === user.id ? user : u)) : [...st.users, user],
              units: !unit ? st.units : st.units.some((x) => x.id === unit.id) ? st.units.map((x) => (x.id === unit.id ? unit : x)) : [...st.units, unit],
              session: { ...st.session, signedIn: true, mode: "supabase" },
            }));
            return;
          }
          // Demo data or another account's data never carries over: start from an empty dataset with this profile only,
          // so nobody mistakes demo records for real ones.
          setState((st) => ({
            ...emptyData,
            users: [user],
            units: unit ? [unit] : [],
            meta: { seededAt: "", seedVersion: 0 },
            session: { signedIn: true, userId: user.id, unitFilter: "all", mode: "supabase" },
            sync: { ...st.sync, queue: [], lastSyncAt: nowIso(), processing: false },
          }));
          flushWrite();
          void clearPhotoFiles();
          // TODO(phase 2 — pull, architecture §8): initial load of the account's catalogs and orders in scope, then the
          // incremental cursors. Until then an account session holds only its own profile and unit.
        },
        clearDeviceData: () => {
          setState((st) => ({
            ...emptyData,
            meta: { seededAt: "", seedVersion: 0 },
            session: signedOutSession(),
            sync: { forcedOffline: false, browserOffline: st.sync.browserOffline, queue: [], lastSyncAt: nowIso(), processing: false },
          }));
          // Write the empty state now (not after the debounce): the account's records leave IndexedDB with the sign-out.
          flushWrite();
          void clearPhotoFiles();
          // The login screen's demo picker needs the demo dataset back (when the build offers it).
          getState().ensureSeeded();
        },
        switchRole: (role) => {
          if (!DEMO_ENABLED || getState().session.mode === "supabase") {
            denied("El cambio de rol solo existe en la versión de demostración.");
            return;
          }
          setState((st) => ({ session: { ...st.session, userId: DEMO_USER_BY_ROLE[role], unitFilter: "all" } }));
        },
        setUnitFilter: (unit) => {
          const user = sessionUser();
          if (!user || !can(user.role, "view.allUnits")) {
            if (getState().session.unitFilter !== "all") setState((st) => ({ session: { ...st.session, unitFilter: "all" } }));
            return;
          }
          if (unit !== "all" && !getState().units.some((u) => u.id === unit)) return;
          setState((st) => ({ session: { ...st.session, unitFilter: unit } }));
        },

        /* ── orders ── */
        createOrder: (input) => {
          const user = must(allowRole(["order.create"]));
          const s = getState();
          const found = s.clients.find((c) => c.id === input.clientId);
          const client = must(found && canSeeUnit(user, found.unitId, s.session.unitFilter) ? found : denied("El cliente no existe o está fuera de su alcance."));
          const unitId = client.unitId;
          must(client.siteIds.includes(input.siteId) ? true : denied("El sitio no pertenece al cliente."));
          const supervisor = s.users.find((u) => u.id === input.supervisorId && u.role === "supervisor" && u.active && u.unitId === unitId);
          must(supervisor ? true : denied("El supervisor debe estar activo y pertenecer a la unidad del cliente."));
          if (user.role === "supervisor") must(input.supervisorId === user.id ? true : denied("Un supervisor solo registra órdenes a su cargo."));
          const id = uid("ord");
          const folio = nextFolio(s.orders, "OS", 5);
          const at = nowIso();
          const sorted = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
          const toIso = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString();
          // Only whoever assigns crews can pre-staff the order; anyone else leaves the dates for the supervisor to confirm.
          const pool = new Set(s.workers.filter((w) => w.active && w.unitId === unitId).map((w) => w.id));
          const workerIds = can(user.role, "crew.assign") ? input.workerIds.filter((w) => pool.has(w)) : [];
          const hasPlan = sorted.length > 0 && workerIds.length > 0;
          const order: Order = {
            id, folio, unitId,
            clientId: input.clientId, siteId: input.siteId, serviceTypeId: input.serviceTypeId, supervisorId: input.supervisorId,
            status: hasPlan ? "programada" : "borrador",
            title: input.title, activities: input.activities, materials: input.materials,
            specialInstructions: input.specialInstructions, siteContact: input.siteContact,
            scheduledStart: sorted[0] ? toIso(sorted[0].date, sorted[0].start) : at,
            scheduledEnd: sorted.length ? toIso(sorted[sorted.length - 1].date, sorted[sorted.length - 1].end) : at,
            plannedDays: Math.max(1, sorted.length), commercialRef: input.commercialRef,
            crewHistory: workerIds.length ? [{ at, workerIds, by: user.id, reason: "Asignación inicial" }] : [],
            createdAt: at, createdBy: user.id, updatedAt: at, priority: input.priority,
          };
          const jornadas: Jornada[] = sorted.map((d, i) => ({
            id: uid("jor"), orderId: id, dayIndex: i + 1, date: d.date,
            plannedStart: toIso(d.date, d.start), plannedEnd: toIso(d.date, d.end),
            workerIds, status: "pendiente", log: [],
          }));
          setState((st) => ({ orders: [order, ...st.orders], jornadas: [...st.jornadas, ...jornadas] }));
          record("orden", id, "Alta manual de orden de servicio", { orderId: id, reason: input.commercialRef ? `Trabajo autorizado ${input.commercialRef}` : undefined, syncLabel: `Nueva orden ${folio}` });
          return order;
        },

        updateOrder: (orderId, patch, action = "Editó datos de la orden", reason) => {
          const keys = (Object.keys(patch) as (keyof Order)[]).filter((k) => patch[k] !== undefined);
          if (keys.some((k) => !FULL_EDIT_FIELDS.includes(k))) {
            denied("Ese dato de la orden no se edita aquí.");
            return;
          }
          const general = keys.some((k) => !OPERATIONAL_FIELDS.includes(k));
          const ok = allowOrder(general ? ["order.edit"] : ["order.edit", "order.editOperational"], orderId);
          if (!ok) return;
          const { order } = ok;
          if (isTerminal(order.status)) {
            denied(order.status === "cancelada" ? "La orden está cancelada." : CLOSED_ORDER);
            return;
          }
          const s = getState();
          if (patch.supervisorId && patch.supervisorId !== order.supervisorId) {
            const sup = s.users.find((u) => u.id === patch.supervisorId && u.role === "supervisor" && u.active && u.unitId === order.unitId);
            if (!sup) {
              denied("El supervisor debe estar activo y pertenecer a la unidad de la orden.");
              return;
            }
          }
          if (patch.siteId && !s.clients.find((c) => c.id === order.clientId)?.siteIds.includes(patch.siteId)) {
            denied("El sitio no pertenece al cliente de la orden.");
            return;
          }
          const clean = Object.fromEntries(keys.map((k) => [k, patch[k]])) as Partial<Order>;
          patchOrder(orderId, clean);
          record("orden", orderId, action, { orderId, reason, syncLabel: `Edición · ${order.folio}` });
          if (clean.supervisorId && clean.supervisorId !== order.supervisorId) {
            // Reassignment history (doc §4.1): who had it, who has it now.
            record("orden", orderId, `Reasignó la orden de ${userName(order.supervisorId)} a ${userName(clean.supervisorId)}`, { orderId, reason });
            // Open cases the former supervisor owned follow the order (server: update_order): they would lose sight of them.
            const newSup = clean.supervisorId;
            const at = nowIso();
            const moved = getState().cases.filter(
              (c) => c.orderId === orderId && c.ownerId === order.supervisorId && (c.status === "abierto" || c.status === "en_proceso"),
            );
            if (moved.length) {
              const me = ok.user.id;
              const ids = new Set(moved.map((c) => c.id));
              setState((st) => ({
                cases: st.cases.map((c) =>
                  ids.has(c.id)
                    ? { ...c, ownerId: newSup, updatedAt: at, timeline: [...c.timeline, { at, by: me, text: `Caso reasignado a ${userName(newSup)} junto con la orden.` }] }
                    : c,
                ),
              }));
              moved.forEach((c) => record("caso", c.id, `Reasignó caso ${c.folio} con la orden`, { orderId, reason }));
            }
          }
        },

        setOrderStatus: (orderId, status, reason) => {
          const s = getState();
          const current = s.orders.find((o) => o.id === orderId)?.status;
          if (status === "cancelada") return getState().cancelOrder(orderId, reason ?? "");
          if (status === "reabierta") return getState().reopenOrder(orderId, reason ?? "");
          if (status === "archivada") return getState().archiveOrder(orderId, reason);
          if (!RESCHEDULE_TARGETS.includes(status)) {
            denied("Ese estado lo calcula el sistema a partir de las jornadas, el cierre y el reporte.");
            return;
          }
          const ok = allowOrder(["order.reschedule"], orderId);
          if (!ok) return;
          if (isTerminal(ok.order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          // Confirming dates only leaves "Reprogramada" (the order's own status, or the one it resumes after its incident).
          const rescheduled = current === "reprogramada" || (current === "con_incidencia" && ok.order.previousStatus === "reprogramada");
          if (status !== "reprogramada" && !rescheduled) {
            denied("Solo se confirman fechas de una orden reprogramada.");
            return;
          }
          // The jornadas decide the status when confirming (server: set_order_status), never the requested target.
          const next = status === "reprogramada" ? "reprogramada" : derivedExecutionStatus(orderId, getState().jornadas);
          // An open blocking incident stays authoritative: the order stays con_incidencia and resumes `next` afterwards.
          const blocking = getState().incidents.some((i) => i.orderId === orderId && i.status === "abierta" && i.blocksClosure);
          if (blocking) {
            patchOrder(orderId, { previousStatus: next });
            changeStatus(orderId, "con_incidencia", reason);
            record("orden", orderId, status === "reprogramada" ? "Marcó la orden como reprogramada (sigue con incidencia)" : "Confirmó fechas (sigue con incidencia)", { orderId, reason });
          } else changeStatus(orderId, next, reason);
        },

        cancelOrder: (orderId, reason) => {
          const ok = allowOrder(["order.edit"], orderId);
          if (!ok) return;
          if (!OPEN_STATUSES.includes(ok.order.status)) {
            denied("Solo se cancelan órdenes abiertas.");
            return;
          }
          if (reason.trim().length < 5) {
            denied("Indique el motivo de la cancelación.");
            return;
          }
          changeStatus(orderId, "cancelada", reason.trim());
        },

        reopenOrder: (orderId, reason) => {
          const ok = allowOrder(["order.reopen"], orderId);
          if (!ok) return false;
          const o = ok.order;
          if (!REOPENABLE.includes(o.status)) {
            denied("Solo se reabren órdenes finalizadas o con reporte enviado.");
            return false;
          }
          // A supervisor moved to another unit keeps seeing their closed orders but cannot reopen them (server: reopen_order).
          if (ok.user.unitId !== o.unitId) {
            denied(SUPERVISOR_OTHER_UNIT);
            return false;
          }
          if (reason.trim().length < 5) {
            denied("Indique el motivo para reabrir la orden.");
            return false;
          }
          patchOrder(orderId, { previousStatus: o.status, reopenedAt: nowIso() });
          changeStatus(orderId, "reabierta", reason.trim());
          return true;
        },

        archiveOrder: (orderId, reason) => {
          const ok = allowOrder(["order.archive"], orderId);
          if (!ok) return;
          if (!ARCHIVABLE.includes(ok.order.status)) {
            denied("Solo se archivan órdenes con reporte enviado o en seguimiento.");
            return;
          }
          const open = getState().cases.some((c) => c.orderId === orderId && (c.status === "abierto" || c.status === "en_proceso"));
          if (open) {
            denied("Hay casos postventa abiertos: resuélvalos antes de archivar.");
            return;
          }
          patchOrder(orderId, { archivedAt: nowIso() });
          changeStatus(orderId, "archivada", reason?.trim() || "Ciclo postventa completo");
        },

        /* ── scheduling ── */
        assignCrew: (orderId, workerIds, reason, jornadaId) => {
          const ok = allowOrder(["crew.assign"], orderId);
          if (!ok) return;
          const { user, order } = ok;
          if (isTerminal(order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          const s = getState();
          const target = jornadaId ? s.jornadas.find((j) => j.id === jornadaId && j.orderId === orderId) : undefined;
          if (jornadaId && !target) {
            denied(OUT_OF_SCOPE);
            return;
          }
          // A closed day's crew is the record of who did the work (server: assign_crew → jornada_closed).
          if (target?.status === "cerrada") {
            denied(`La jornada ${target.dayIndex} ya se cerró: su cuadrilla queda como registro de quién hizo el trabajo y no se cambia.`);
            return;
          }
          const pool = new Set(s.workers.filter((w) => w.active && w.unitId === order.unitId).map((w) => w.id));
          if (workerIds.some((w) => !pool.has(w))) {
            denied("La cuadrilla debe ser personal activo de la unidad de la orden.");
            return;
          }
          const at = nowIso();
          setState((st) => ({
            jornadas: st.jornadas.map((j) =>
              j.orderId === orderId && (jornadaId ? j.id === jornadaId : j.status === "pendiente") ? { ...j, workerIds } : j,
            ),
          }));
          patchOrder(orderId, {
            crewHistory: [...order.crewHistory, { at, workerIds, by: user.id, reason, jornadaId }],
          });
          record("orden", orderId, `Asignó cuadrilla de ${workerIds.length} personas`, { orderId, reason, syncLabel: `Cuadrilla · ${order.folio}` });
          const hasJornadas = getState().jornadas.some((j) => j.orderId === orderId);
          if (order.status === "borrador" && workerIds.length && hasJornadas) changeStatus(orderId, "programada");
        },

        scheduleJornadas: (orderId, days, reason) => {
          const ok = allowOrder(["order.reschedule", "crew.assign"], orderId);
          if (!ok) return;
          const { order } = ok;
          if (isTerminal(order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          const s = getState();
          const kept = s.jornadas.filter((j) => j.orderId === orderId && j.status !== "pendiente");
          if (!days.length && !kept.length) {
            denied("Indique al menos una jornada: la orden no puede quedarse sin días por ejecutar.");
            return;
          }
          // New days continue after the highest executed day (a day worked out of order never collides).
          const lastIndex = kept.reduce((m, j) => Math.max(m, j.dayIndex), 0);
          const crew = order.crewHistory.at(-1)?.workerIds ?? [];
          const toIso = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString();
          const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
          const fresh: Jornada[] = sorted.map((d, i) => ({
            id: uid("jor"), orderId, dayIndex: lastIndex + i + 1, date: d.date,
            plannedStart: toIso(d.date, d.start), plannedEnd: toIso(d.date, d.end), workerIds: crew, status: "pendiente", log: [],
          }));
          const all = [...kept, ...fresh];
          setState((st) => ({ jornadas: [...st.jornadas.filter((j) => !(j.orderId === orderId && j.status === "pendiente")), ...fresh] }));
          patchOrder(orderId, {
            plannedDays: all.length,
            scheduledStart: all.map((j) => j.plannedStart).sort()[0] ?? order.scheduledStart,
            scheduledEnd: all.map((j) => j.plannedEnd).sort().at(-1) ?? order.scheduledEnd,
          });
          record("orden", orderId, `Programó ${plural(fresh.length, "jornada", "jornadas")}`, { orderId, reason, syncLabel: `Agenda · ${order.folio}` });
          // Execution states follow the jornadas (server: schedule_jornadas → derived_status).
          const derived: OrderStatus[] = ["borrador", "programada", "en_ejecucion", "jornada_cerrada", "pendiente_validacion", "reprogramada"];
          if (derived.includes(order.status))
            changeStatus(orderId, derivedExecutionStatus(orderId, getState().jornadas), order.status === "reprogramada" ? reason : undefined);
          // Under an open blocking incident the new plan decides the status the order resumes.
          else if (order.status === "con_incidencia" && order.previousStatus && derived.includes(order.previousStatus))
            patchOrder(orderId, { previousStatus: derivedExecutionStatus(orderId, getState().jornadas) });
        },

        /* ── field execution ── */
        checkIn: (jornadaId, geo) => {
          const ok = allowJornada(["field.capture"], jornadaId);
          if (!ok) return;
          const { jornada: j, order } = ok;
          if (j.checkIn) return;
          if (isTerminal(order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          if (!geoNoteOk(geo)) return;
          const stamp = geoStamp(geo);
          patchJornada(jornadaId, { checkIn: stamp, status: "en_curso" });
          record("jornada", jornadaId, `Registro de entrada · Jornada ${j.dayIndex} (${geoLabel(geo)})`, {
            orderId: j.orderId, reason: stamp.note, syncLabel: `Entrada ${geo.source === "remota" ? "remota" : "GPS"} · ${order.folio}`,
          });
          // Under an open blocking incident the order stays con_incidencia and resumes en_ejecucion (server: record_check).
          const o = getState().orders.find((x) => x.id === j.orderId);
          if (o?.status === "con_incidencia") patchOrder(j.orderId, { previousStatus: "en_ejecucion" });
          else if (o) changeStatus(j.orderId, "en_ejecucion");
        },

        checkOut: (jornadaId, geo) => {
          const ok = allowJornada(["field.capture"], jornadaId);
          if (!ok) return;
          const { jornada: j, order } = ok;
          if (!j.checkIn || j.checkOut) return;
          if (isTerminal(order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          if (!geoNoteOk(geo)) return;
          const stamp = geoStamp(geo);
          if (stamp.deviceAt < j.checkIn.deviceAt) {
            denied("La hora de salida no puede ser anterior a la entrada. Revise el reloj del dispositivo.");
            return;
          }
          patchJornada(jornadaId, { checkOut: stamp, status: "cerrada" });
          record("jornada", jornadaId, `Registro de salida · Jornada ${j.dayIndex} (${geoLabel(geo)})`, {
            orderId: j.orderId, reason: stamp.note, syncLabel: `Salida ${geo.source === "remota" ? "remota" : "GPS"} · ${order.folio}`,
          });
          // Another day still in progress keeps the order en_ejecucion (server: record_check → derived_status); under an
          // open blocking incident that status becomes the one the order resumes.
          const o = getState().orders.find((x) => x.id === j.orderId);
          const next = derivedExecutionStatus(j.orderId, getState().jornadas);
          if (o?.status === "con_incidencia") patchOrder(j.orderId, { previousStatus: next });
          else if (o) changeStatus(j.orderId, next);
        },

        addJornadaNote: (jornadaId, text) => {
          const ok = allowJornada(["field.capture"], jornadaId);
          if (!ok) return;
          const { jornada: j, order, user } = ok;
          if (order.status === "cancelada" || order.status === "archivada") {
            denied("La orden ya no admite cambios.");
            return;
          }
          patchJornada(jornadaId, { log: [...j.log, { at: nowIso(), by: user.id, text }] });
          record("jornada", jornadaId, "Agregó nota a la bitácora", { orderId: j.orderId, syncLabel: `Bitácora · ${order.folio}` });
        },

        logReminder: (orderId, jornadaId, note) => {
          const ok = allowOrder(["field.capture"], orderId);
          if (!ok) return;
          const j = jornadaId ? getState().jornadas.find((x) => x.id === jornadaId && x.orderId === orderId) : undefined;
          record(j ? "jornada" : "orden", j?.id ?? orderId, `Envió recordatorio de evidencia${j ? ` · Jornada ${j.dayIndex}` : ""}`, {
            orderId, reason: note?.trim() || undefined, syncLabel: `Recordatorio · ${ok.order.folio}`,
          });
        },

        setJornadaBreakdown: (jornadaId, breakdown, note) => {
          const ok = allowJornada(["field.capture"], jornadaId);
          if (!ok) return false;
          const { jornada: j } = ok;
          if (isTerminal(ok.order.status)) {
            denied(CLOSED_ORDER);
            return false;
          }
          // Every line needs a name and hours; 24 h at most in total (server: set_jornada_breakdown → invalid_breakdown).
          const total = breakdown.reduce((sum, b) => sum + b.hours, 0);
          if (breakdown.some((b) => !b.activity.trim() || !Number.isFinite(b.hours) || b.hours < 0) || total > 24) {
            denied("Cada actividad necesita nombre y horas (0 a 24 en total).");
            return false;
          }
          patchJornada(jornadaId, { breakdown, breakdownNote: note?.trim() || undefined });
          record("jornada", jornadaId, `Registró desglose de horas · Jornada ${j.dayIndex} (${total.toFixed(1)} h)`, {
            orderId: j.orderId, reason: note?.trim() || undefined, syncLabel: `Desglose de horas · ${ok.order.folio}`,
          });
          return true;
        },

        addPhoto: (photo) => {
          const { order, user } = must(allowOrder([photoAction(photo.kind)], photo.orderId));
          // Sample pictures ("Simular") belong to the demo: an account's evidence is always a real capture.
          if (photo.source.type === "scene" && getState().session.mode === "supabase")
            must(denied("Las fotos de ejemplo solo existen en la demostración: tome la foto o elíjala de la galería."));
          if (photo.kind !== "postventa") must(isTerminal(order.status) ? denied(CLOSED_ORDER) : true);
          const s = getState();
          const id = uid("pho");
          const { bytes, ...rest } = photo;
          const at = nowIso();
          const p: Photo = {
            ...rest, id, by: user.id, uploadedAt: at,
            takenAt: photo.takenAt ?? at,
            takenAtSource: rest.takenAtSource ?? (photo.takenAt ? undefined : "device"),
          };
          setState((st) => ({ photos: [...st.photos, p] }));
          const kindLabel = { antes: "ANTES", despues: "DESPUÉS", incidencia: "incidencia", postventa: "postventa" }[p.kind];
          const jornada = p.jornadaId ? s.jornadas.find((j) => j.id === p.jornadaId) : undefined;
          const notes = [
            p.origin === "gallery" ? "Desde galería" : p.origin === "camera" ? "Cámara" : "",
            p.takenAtSource === "exif" ? `tomada ${format(parseISO(p.takenAt), "dd/MM/yyyy HH:mm")}` : "",
            p.takenAtSource === "file" ? `fecha del archivo ${format(parseISO(p.takenAt), "dd/MM/yyyy HH:mm")} (sin fecha de la toma)` : "",
            p.geoSource === "exif" ? "ubicación de la foto" : p.geoSource === "device" ? "ubicación del teléfono al adjuntar" : "",
            ...photoTimingIssues(p, jornada).map((x) => `Advertencia: ${x.label}`),
          ].filter(Boolean);
          record("foto", id, `Adjuntó foto ${kindLabel} · ${p.area}`, {
            orderId: p.orderId, reason: notes.length ? notes.join(" · ") : undefined, syncLabel: `Foto ${kindLabel} · ${order.folio}`, bytes: bytes ?? 380_000,
          });
          return id;
        },

        updatePhoto: (photoId, patch) => {
          const ok = allowPhotoEdit(photoId);
          if (!ok) return;
          const allowed: (keyof Photo)[] = ["area", "note", "caseId", "incidentId"];
          const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k as keyof Photo))) as Partial<Photo>;
          if (!Object.keys(clean).length) return;
          setState((st) => ({ photos: st.photos.map((p) => (p.id === photoId ? { ...p, ...clean } : p)) }));
          record("foto", photoId, `Editó foto · ${clean.area ?? ok.photo.area}`, { orderId: ok.photo.orderId });
        },

        deletePhoto: (photoId) => {
          const ok = allowPhotoEdit(photoId);
          if (!ok) return;
          setState((st) => ({ photos: st.photos.filter((x) => x.id !== photoId) }));
          // The image blob goes with the record (every caller: lightbox delete, discarded drafts, incident/case photos),
          // and only after the permission check passed.
          if (ok.photo.source.type === "idb") void deletePhotoFile(ok.photo.source.key);
          record("foto", photoId, `Eliminó foto · ${ok.photo.area}`, { orderId: ok.photo.orderId });
        },

        togglePhotoForReport: (photoId) => {
          const photo = getState().photos.find((p) => p.id === photoId);
          const ok = allowOrder(["field.capture"], photo?.orderId);
          if (!ok || !photo) return;
          if (ok.order.status === "cancelada" || ok.order.status === "archivada") {
            denied("La orden ya no admite cambios.");
            return;
          }
          const selected = !photo.selectedForReport;
          setState((st) => ({ photos: st.photos.map((p) => (p.id === photoId ? { ...p, selectedForReport: selected } : p)) }));
          record("foto", photoId, `${selected ? "Incluyó" : "Quitó"} foto ${selected ? "en" : "del"} reporte · ${photo.area}`, {
            orderId: photo.orderId, syncLabel: `Selección de fotos · ${ok.order.folio}`,
          });
        },

        /* ── incidents ── */
        addIncident: (input) => {
          const { order, user } = must(allowOrder(["field.capture"], input.orderId));
          must(isTerminal(order.status) ? denied(CLOSED_ORDER) : true);
          const s = getState();
          const inc: Incident = {
            ...input, id: uid("inc"), folio: nextFolio(s.incidents, "INC", 4), status: "abierta",
            createdAt: nowIso(), createdBy: user.id,
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
          const ok = allowOrder(["field.capture"], inc?.orderId);
          if (!ok || !inc) return;
          if (ok.order.status === "cancelada" || ok.order.status === "archivada") {
            denied("La orden ya no admite cambios.");
            return;
          }
          // The report froze the incident: editing it after closure needs a reopen (server: update_incident → assert_open).
          if (isTerminal(ok.order.status)) {
            denied(CLOSED_ORDER);
            return;
          }
          // Identity and authorship never change; resolution goes through resolveIncident.
          const rest = omit(patch, ["id", "folio", "orderId", "createdAt", "createdBy", "status", "resolvedAt", "resolvedBy"]);
          setState((st) => ({ incidents: st.incidents.map((i) => (i.id === incidentId ? { ...i, ...rest } : i)) }));
          record("incidencia", incidentId, `Actualizó incidencia ${inc.folio}`, { orderId: inc.orderId });
          // The blocking flag of an open incident drives Con incidencia, like adding or resolving one (server: update_incident).
          const blocks = rest.blocksClosure ?? inc.blocksClosure;
          if (inc.status !== "abierta" || blocks === inc.blocksClosure) return;
          const o = getState().orders.find((x) => x.id === inc.orderId);
          if (!o) return;
          if (blocks && o.status !== "con_incidencia") {
            patchOrder(o.id, { previousStatus: o.status });
            changeStatus(o.id, "con_incidencia", rest.description ?? inc.description);
          } else if (!blocks && o.status === "con_incidencia") {
            const stillBlocking = getState().incidents.some((i) => i.orderId === inc.orderId && i.status === "abierta" && i.blocksClosure);
            if (stillBlocking) return;
            const resumable: OrderStatus[] = ["finalizada", "reabierta", "reprogramada"];
            const next = o.previousStatus && resumable.includes(o.previousStatus) ? o.previousStatus : derivedExecutionStatus(o.id, getState().jornadas);
            changeStatus(o.id, next, `La incidencia ${inc.folio} ya no bloquea el cierre`);
          }
        },

        resolveIncident: (incidentId, resolution) => {
          const s = getState();
          const inc = s.incidents.find((i) => i.id === incidentId);
          const ok = allowOrder(["field.capture"], inc?.orderId);
          if (!ok || !inc) return;
          if (ok.order.status === "cancelada" || ok.order.status === "archivada") {
            denied("La orden ya no admite cambios.");
            return;
          }
          setState((st) => ({
            incidents: st.incidents.map((i) =>
              i.id === incidentId ? { ...i, status: "resuelta", resolution, resolvedAt: nowIso(), resolvedBy: ok.user.id } : i,
            ),
          }));
          record("incidencia", incidentId, `Resolvió incidencia ${inc.folio}`, { orderId: inc.orderId, reason: resolution });
          const stillBlocking = getState().incidents.some((i) => i.orderId === inc.orderId && i.status === "abierta" && i.blocksClosure);
          const o = getState().orders.find((x) => x.id === inc.orderId);
          if (o && o.status === "con_incidencia" && !stillBlocking) {
            // No days → borrador, never pendiente_validacion (server: resolve_incident → derived_status).
            const fallback = derivedExecutionStatus(o.id, getState().jornadas);
            // Execution states are recomputed from the jornadas; anything else resumes where it was.
            const resumable: OrderStatus[] = ["finalizada", "reabierta", "reprogramada"];
            const next = o.previousStatus && resumable.includes(o.previousStatus) ? o.previousStatus : fallback;
            changeStatus(o.id, next, "Incidencia resuelta");
          }
        },

        /* ── closure + report ── */
        validateClosure: (orderId, closure) => {
          const ok = allowOrder(["closure.authorize"], orderId);
          if (!ok) return;
          const { order, user } = ok;
          if (!CLOSABLE.includes(order.status)) {
            denied(DONE_STATUSES.includes(order.status) ? "El cierre ya fue validado." : "Registre la salida de todas las jornadas antes de validar el cierre.");
            return;
          }
          // Re-check the rules here, not only in the dialog (doc §8): jornadas closed, no blocking incident, ANTES + DESPUÉS
          // per executed jornada unless a justified exception is recorded.
          const s = getState();
          const blockers = closureBlockers(order, s.jornadas, s.photos, s.incidents).filter((b) => b.severity === "block");
          const evidenceOnly = (id: string) => id.startsWith("antes-") || id.startsWith("despues-");
          const hard = blockers.filter((b) => !evidenceOnly(b.id));
          if (hard.length) {
            denied(`No se puede cerrar: ${hard.map((b) => b.label).join(" · ")}.`);
            return;
          }
          const missingEvidence = blockers.filter((b) => evidenceOnly(b.id));
          if (missingEvidence.length && (closure.exception?.reason.trim().length ?? 0) < 15) {
            denied("Faltan fotos ANTES o DESPUÉS: registre una excepción autorizada y justificada para cerrar.");
            return;
          }
          const full: Closure = { ...closure, validatedAt: nowIso(), validatedBy: user.id };
          patchOrder(orderId, { closure: full });
          record("orden", orderId, order.status === "reabierta" ? "Validó de nuevo el cierre (orden reabierta)" : "Validó cierre definitivo", {
            orderId, reason: closure.exception ? `Excepción: ${closure.exception.reason}` : undefined, syncLabel: `Cierre · ${order.folio}`,
          });
          changeStatus(orderId, "finalizada");
        },

        generateReport: (orderId, photoIds, summary) => {
          const { order, user } = must(allowOrder(["report.share"], orderId));
          if (order.status === "reabierta" || (order.reopenedAt && (!order.closure || order.closure.validatedAt < order.reopenedAt)))
            must(denied("La orden se reabrió: valide de nuevo el cierre antes de generar una nueva versión del reporte."));
          if (!REPORTABLE.includes(order.status)) must(denied("El reporte se genera cuando el cierre está validado."));
          const s = getState();
          const own = new Set(s.photos.filter((p) => p.orderId === orderId).map((p) => p.id));
          const prev = s.reports.filter((r) => r.orderId === orderId);
          const rep: Report = {
            id: uid("rep"), orderId, version: prev.length + 1, generatedAt: nowIso(), generatedBy: user.id,
            photoIds: photoIds.filter((id) => own.has(id)), summary, shares: [],
          };
          setState((st) => ({ reports: [rep, ...st.reports] }));
          record("reporte", rep.id, `Generó reporte PDF v${rep.version}`, { orderId, syncLabel: `Reporte v${rep.version} · ${order.folio}`, bytes: 1_200_000 });
          return rep;
        },

        logShare: (reportId, channel, to) => {
          const rep = getState().reports.find((r) => r.id === reportId);
          const ok = allowOrder(["report.share"], rep?.orderId);
          if (!ok || !rep) return;
          const share = {
            id: uid("shr"), channel, to, at: nowIso(), by: ok.user.id,
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
          const { user, order } = must(allowOrder(["postventa.manage"], input.orderId));
          must(isValidCaseOwner(input.ownerId, order) ? true : denied(CASE_OWNER_RULE));
          // A case is resolved with its resolution, after it exists (server: create_case → resolution_required).
          must(!input.status || input.status === "abierto" || input.status === "en_proceso" ? true : denied(CASE_NEW_STATUS_RULE));
          const s = getState();
          const at = nowIso();
          const c: PostSaleCase = {
            ...input, status: input.status ?? "abierto", id: uid("cas"), folio: nextFolio(s.cases, "PV", 4),
            createdAt: at, createdBy: user.id, updatedAt: at,
            timeline: [{ at, by: user.id, text: "Caso registrado y asignado." }],
          };
          setState((st) => ({ cases: [c, ...st.cases] }));
          record("caso", c.id, `Abrió caso postventa ${c.folio}`, { orderId: c.orderId, syncLabel: `Caso ${c.folio}` });
          const o = getState().orders.find((x) => x.id === c.orderId);
          if (o && (o.status === "reporte_enviado" || o.status === "archivada")) changeStatus(o.id, "seguimiento", `Caso ${c.folio}`);
          return c;
        },

        updateCase: (caseId, patch, note) => {
          const c = getState().cases.find((x) => x.id === caseId);
          const ok = allowOrder(["postventa.manage"], c?.orderId);
          if (!ok || !c) return false;
          if (patch.ownerId !== undefined && patch.ownerId !== c.ownerId && !isValidCaseOwner(patch.ownerId, ok.order)) {
            denied(CASE_OWNER_RULE);
            return false;
          }
          // Reopening hands the case back to its owner, who must still be able to see it (server: update_case).
          const reopening = (c.status === "resuelto" || c.status === "cerrado") && (patch.status === "abierto" || patch.status === "en_proceso");
          if (reopening && (note?.trim().length ?? 0) < CASE_RESOLUTION_MIN) {
            denied(`Indique por qué se reabre el caso (al menos ${CASE_RESOLUTION_MIN} caracteres).`);
            return false;
          }
          if (reopening && !isValidCaseOwner(patch.ownerId ?? c.ownerId, ok.order)) {
            denied(`${CASE_OWNER_RULE} Reasigne el caso antes de reabrirlo.`);
            return false;
          }
          // Resolved and closed cases keep what was done for the client (server: update_case → resolution_required).
          if ("status" in patch || "resolution" in patch) {
            const status = patch.status ?? c.status;
            const resolution = ("resolution" in patch ? patch.resolution : c.resolution)?.trim() ?? "";
            if ((status === "resuelto" || status === "cerrado") && resolution.length < CASE_RESOLUTION_MIN) {
              denied(CASE_RESOLUTION_RULE);
              return false;
            }
          }
          const at = nowIso();
          const rest = omit(patch, ["id", "folio", "orderId", "clientId", "createdAt", "createdBy", "timeline"]);
          const timeline = note ? [...c.timeline, { at, by: ok.user.id, text: note }] : c.timeline;
          setState((st) => ({ cases: st.cases.map((x) => (x.id === caseId ? { ...x, ...rest, timeline, updatedAt: at } : x)) }));
          record("caso", caseId, note ?? `Actualizó caso ${c.folio}`, { orderId: c.orderId });
          return true;
        },

        addCaseNote: (caseId, text) => getState().updateCase(caseId, {}, text),

        createSurvey: (orderId, channel) => {
          const { order: o, user } = must(allowOrder(["postventa.manage"], orderId));
          const sv: Survey = {
            id: uid("sur"), token: surveyToken(), orderId, clientId: o.clientId, sentAt: nowIso(), sentBy: user.id,
            channel, manual: false,
          };
          setState((st) => ({ surveys: [sv, ...st.surveys] }));
          record("encuesta", sv.id, "Generó enlace de encuesta", { orderId, syncLabel: `Encuesta · ${o.folio}` });
          if (o.status === "reporte_enviado") changeStatus(orderId, "seguimiento", "Encuesta enviada");
          return sv;
        },

        // Public (/encuesta/[token]): the client answers without a session; the token is the only key.
        submitSurvey: (token, answers, respondentName) => {
          // The answer is recorded as the client's: never from a staff session (the survey screen asks to sign out first).
          if (getState().session.signedIn) {
            denied("Hay una sesión de Pulkro abierta en este dispositivo: ciérrela para responder la encuesta como cliente.");
            return false;
          }
          const sv = getState().surveys.find((x) => x.token === token);
          if (!sv || sv.respondedAt) return false;
          setState((st) => ({
            surveys: st.surveys.map((x) => (x.token === token ? { ...x, answers, respondentName, respondedAt: nowIso() } : x)),
          }));
          record("encuesta", sv.id, `Cliente respondió encuesta (${answers.overall}/5)`, { orderId: sv.orderId, by: "cliente", syncLabel: "Respuesta de encuesta" });
          return true;
        },

        recordManualSurvey: (orderId, answers, respondentName) => {
          const { order: o, user } = must(allowOrder(["postventa.manage"], orderId));
          const s = getState();
          const existing = s.surveys.find((x) => x.orderId === orderId && !x.respondedAt);
          const at = nowIso();
          const sv: Survey = existing
            ? { ...existing, answers, respondentName, respondedAt: at, manual: true }
            : { id: uid("sur"), token: surveyToken(), orderId, clientId: o.clientId, sentAt: at, sentBy: user.id, channel: "descarga", manual: true, answers, respondentName, respondedAt: at };
          setState((st) => ({ surveys: existing ? st.surveys.map((x) => (x.id === sv.id ? sv : x)) : [sv, ...st.surveys] }));
          record("encuesta", sv.id, "Registró respuesta de encuesta manualmente", { orderId });
          return sv;
        },

        /* ── catalogs ── */
        upsertClient: (client) => {
          const prev = getState().clients.find((c) => c.id === client.id);
          if (!allowCatalog(prev?.unitId) || !allowCatalog(client.unitId)) return;
          setState((st) => ({ clients: prev ? st.clients.map((c) => (c.id === client.id ? client : c)) : [...st.clients, client] }));
          record("catalogo", client.id, `Guardó cliente ${client.shortName}`);
        },
        upsertSite: (site) => {
          const s = getState();
          const client = s.clients.find((c) => c.id === site.clientId);
          if (!client) {
            denied(OUT_OF_SCOPE);
            return;
          }
          if (!allowCatalog(client.unitId)) return;
          // An existing site is also guarded by the unit of the client it belongs to today (a payload must not move it across units).
          const prevSite = s.sites.find((x) => x.id === site.id);
          if (prevSite) {
            const prevClient = s.clients.find((c) => c.id === prevSite.clientId);
            if (!prevClient) {
              denied(OUT_OF_SCOPE);
              return;
            }
            if (!allowCatalog(prevClient.unitId)) return;
          }
          setState((st) => ({ sites: st.sites.some((c) => c.id === site.id) ? st.sites.map((c) => (c.id === site.id ? site : c)) : [...st.sites, site] }));
          record("catalogo", site.id, `Guardó sitio ${site.name}`);
        },
        upsertWorker: (worker) => {
          const prev = getState().workers.find((w) => w.id === worker.id);
          if (!allowCatalog(prev?.unitId) || !allowCatalog(worker.unitId)) return;
          setState((st) => ({ workers: prev ? st.workers.map((c) => (c.id === worker.id ? worker : c)) : [...st.workers, worker] }));
          record("catalogo", worker.id, `Guardó trabajador ${worker.name}`);
        },
        upsertUser: (next) => {
          const me = allowRole(null);
          if (!me) return;
          const prev = getState().users.find((u) => u.id === next.id);
          if (!can(me.role, "users.admin")) {
            // Self-service: only one's own phone.
            const sameIdentity =
              !!prev && prev.id === me.id && (Object.keys(next) as (keyof User)[]).every((k) => k === "phone" || next[k] === prev[k]);
            if (!sameIdentity) {
              denied(DENIED_REASON["users.admin"]!);
              return;
            }
          } else if (next.id === me.id && (next.role !== me.role || !next.active || next.unitId !== me.unitId)) {
            denied("No puede cambiar su propio rol, unidad o estado: pídalo a otra persona de Dirección.");
            return;
          }
          setState((st) => ({ users: prev ? st.users.map((c) => (c.id === next.id ? next : c)) : [...st.users, next] }));
          record("usuario", next.id, `Guardó usuario ${next.name}`);
        },
        updateMyContact: (contact) => {
          const me = allowRole(null);
          if (!me) return;
          const patch: Partial<User> = {};
          if (contact.phone !== undefined) patch.phone = contact.phone.trim();
          if (!Object.keys(patch).length) return;
          setState((st) => ({ users: st.users.map((u) => (u.id === me.id ? { ...u, ...patch } : u)) }));
          record("usuario", me.id, "Actualizó sus datos de contacto");
        },
        upsertServiceType: (stype) => {
          if (!allowCatalog(undefined)) return;
          if (!(stype.defaultHoursPerDay >= SERVICE_HOURS_MIN && stype.defaultHoursPerDay <= SERVICE_HOURS_MAX)) {
            denied(`Las horas por día van de ${SERVICE_HOURS_MIN} a ${SERVICE_HOURS_MAX}.`);
            return;
          }
          setState((st) => ({ serviceTypes: st.serviceTypes.some((c) => c.id === stype.id) ? st.serviceTypes.map((c) => (c.id === stype.id ? stype : c)) : [...st.serviceTypes, stype] }));
          record("catalogo", stype.id, `Guardó tipo de servicio ${stype.name}`);
        },
        upsertMaterial: (m) => {
          if (!allowCatalog(undefined)) return;
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
          // Errors go back to the queue; so does anything left "sincronizando" by an interrupted run (nothing is uploading now).
          setState((st) => ({
            sync: {
              ...st.sync,
              queue: st.sync.queue.map((q) => (q.state === "error" || (q.state === "sincronizando" && !st.sync.processing) ? { ...q, state: "pendiente" } : q)),
            },
          }));
          void getState().processSyncQueue();
        },
        processSyncQueue: async () => {
          // The loop below only simulates the server for the demo. An account's changes stay "pendiente" (and count as
          // unsent at sign-out) until the real push exists. TODO(phase 4 — push, architecture §8): send each item as its RPC.
          if (getState().session.mode === "supabase") return;
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
          if (!DEMO_ENABLED || getState().session.mode === "supabase") {
            denied("Restablecer datos solo existe en la versión de demostración.");
            return;
          }
          // A reset would silently throw away captures that never reached the server.
          const unsynced = getState().sync.queue.filter((q) => q.state !== "sincronizado").length;
          if (unsynced > 0) {
            denied(`Hay ${plural(unsynced, "registro", "registros")} sin sincronizar. Espere a que lleguen al servidor (o desactive «Simular sin conexión») antes de restablecer.`);
            return;
          }
          reseed();
        },

        ensureSeeded: () => {
          const s = getState();
          // An account session never gets the demo dataset. TODO(phase 2 — pull): this is where its data will load.
          if (s.session.mode === "supabase") return;
          // A build without the demo sign-in keeps no demo data (nor a demo session left by an earlier demo build).
          if (!DEMO_SIGN_IN) {
            if (s.session.signedIn || s.users.length || s.orders.length) {
              setState({ ...emptyData, meta: { seededAt: "", seedVersion: 0 }, session: signedOutSession(), sync: { ...s.sync, queue: [] } });
            }
            return;
          }
          if (!s.meta.seededAt || s.meta.seedVersion !== SEED_VERSION || s.orders.length === 0) {
            reseed();
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
        out.sync = { ...s.sync, queue: unstick(s.sync.queue), processing: false, browserOffline: false };
        return out as Partial<AppState>;
      },
      // A seed version bump reseeds the demo. An account's data (and its unsent queue) is never thrown away for it.
      migrate: (persisted) =>
        ((persisted as Partial<AppState> | undefined)?.session?.mode === "supabase" ? persisted : {}) as AppState,
    },
  ),
);

/** Called once on the client: rehydrate from IndexedDB, then seed / re-anchor. */
export async function bootstrapStore() {
  if (useAppStore.getState().hydrated) return;
  await useAppStore.persist.rehydrate();
  // A reload in the middle of an upload leaves items "sincronizando": put them back in line (retried once online below).
  // Sessions saved before account sign-in existed have no mode: they are demo sessions.
  useAppStore.setState((st) => ({
    session: { ...st.session, mode: st.session.mode === "supabase" ? "supabase" : "demo" },
    sync: { ...st.sync, processing: false, queue: unstick(st.sync.queue) },
  }));
  useAppStore.getState().ensureSeeded();
  useAppStore.setState({ hydrated: true });
  if (typeof navigator !== "undefined") useAppStore.getState().setBrowserOffline(!navigator.onLine);
}

export const todayKey = () => format(new Date(), "yyyy-MM-dd");
