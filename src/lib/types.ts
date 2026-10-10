/**
 * Pulkro Cuadrillas — domain model.
 * Mirrors "Documento maestro de requerimientos funcionales v1.0" (8 oct 2026).
 * Every date is an ISO-8601 string. Every id is a stable string.
 */

export type Role = "direccion" | "administracion" | "supervisor";

export type Unit = {
  id: string;
  name: string; // "Matriz Monterrey"
  code: string; // "MTY"
  city: string;
};

export type User = {
  id: string;
  name: string;
  initials: string;
  role: Role;
  title: string; // "Supervisora de operaciones"
  unitId: string;
  email: string;
  phone: string;
  hue: number; // avatar tint 0-360
  active: boolean;
};

/** Cleaning staff. They do NOT use the app — the supervisor captures for them. */
export type Worker = {
  id: string;
  name: string;
  initials: string;
  unitId: string;
  specialty: string; // "Pulido de pisos"
  phone: string;
  hue: number;
  active: boolean;
};

export type ClientSegment = "Industrial" | "Comercial" | "Residencial";

export type Site = {
  id: string;
  clientId: string;
  name: string; // "Planta Escobedo"
  address: string;
  municipality: string;
  lat: number;
  lng: number;
};

export type Client = {
  id: string;
  name: string;
  shortName: string;
  segment: ClientSegment;
  unitId: string;
  contactName: string;
  contactPhone: string; // E.164-ish "+52 81 1234 5678"
  contactEmail: string;
  since: string; // ISO date
  hue: number;
  siteIds: string[];
};

export type ServiceType = {
  id: string;
  name: string; // "Limpieza profunda"
  short: string;
  hue: number;
  defaultHoursPerDay: number;
};

export type Material = {
  id: string;
  name: string;
  unit: string; // "L", "pza", "kg"
};

export type OrderStatus =
  | "borrador"
  | "programada"
  | "en_ejecucion"
  | "jornada_cerrada"
  | "pendiente_validacion"
  | "finalizada"
  | "reporte_enviado"
  | "seguimiento"
  | "archivada"
  // alternos
  | "cancelada"
  | "reprogramada"
  | "con_incidencia"
  | "reabierta";

export type CrewChange = {
  at: string;
  workerIds: string[];
  by: string; // user id
  reason: string;
  jornadaId?: string;
};

export type Conformity = {
  method: "firma" | "verbal" | "correo";
  name: string; // person on site who accepted
  role?: string;
  signatureDataUrl?: string; // PNG data URL from the signature pad
  at: string;
  comment?: string;
};

export type EvidenceException = {
  reason: string;
  authorizedBy: string; // user id
  at: string;
};

export type Closure = {
  validatedAt: string;
  validatedBy: string; // user id (supervisor)
  conformity?: Conformity;
  exception?: EvidenceException;
  summary: string; // description for the report
};

export type Order = {
  id: string;
  folio: string; // "OS-24817"
  unitId: string;
  clientId: string;
  siteId: string;
  serviceTypeId: string;
  supervisorId: string;
  status: OrderStatus;
  /** Status before an alternate state (con_incidencia/reprogramada) so we can resume. */
  previousStatus?: OrderStatus;
  title: string; // "Limpieza profunda de lobby y baños"
  activities: string[];
  materials: { materialId: string; qty: number }[];
  specialInstructions: string;
  siteContact: { name: string; phone: string };
  scheduledStart: string; // first day start
  scheduledEnd: string; // last day end
  plannedDays: number;
  commercialRef: string; // reference in the external commercial system, e.g. "COT-2026-1187"
  crewHistory: CrewChange[];
  closure?: Closure;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  priority: "normal" | "alta";
  /** Set by reopenOrder: a new report version needs a closure validated after this moment. */
  reopenedAt?: string;
  /** Set by archiveOrder (end of the post-sale cycle). */
  archivedAt?: string;
};

/**
 * How a check-in/out location was obtained:
 * gps = device GPS at the site · manual = GPS unavailable, justified pin · remota = "Supervisión remota": the supervisor
 * records the crew's entrada/salida without being on site (own source, mandatory note, never claims "estoy en el sitio").
 */
export type GeoSource = "gps" | "manual" | "remota";

export type GeoStamp = {
  deviceAt: string; // device clock
  serverAt?: string; // set when synced
  lat: number;
  lng: number;
  accuracy: number; // meters
  by: string; // user id
  offline: boolean; // captured without connection
  source: GeoSource;
  note?: string;
};

export type JornadaStatus = "pendiente" | "en_curso" | "cerrada";

export type JornadaLogEntry = { at: string; by: string; text: string };

/** One working day of an order. Multi-day orders keep independent jornadas. */
export type Jornada = {
  id: string;
  orderId: string;
  dayIndex: number; // 1-based
  date: string; // ISO date (yyyy-MM-dd) scheduled
  plannedStart: string; // ISO datetime
  plannedEnd: string; // ISO datetime
  workerIds: string[];
  status: JornadaStatus;
  checkIn?: GeoStamp;
  checkOut?: GeoStamp;
  log: JornadaLogEntry[];
  /** Optional split of the jornada's clock time across the order's activities (captured at salida). */
  breakdown?: { activity: string; hours: number }[];
  breakdownNote?: string;
};

export type PhotoKind = "antes" | "despues" | "incidencia" | "postventa";

export type SceneKind =
  | "oficina"
  | "bano"
  | "piso"
  | "ventanal"
  | "cocina"
  | "bodega"
  | "lobby"
  | "escalera";

/** Photo source: either a procedural seed scene, or a real capture stored in IndexedDB. */
export type PhotoSource =
  | { type: "scene"; scene: SceneKind; seed: number }
  | { type: "idb"; key: string; width: number; height: number };

/** Where a real capture came from: the camera input right now, or picked from the gallery (may be older / taken by someone else). */
export type PhotoOrigin = "camera" | "gallery";

export type Photo = {
  id: string;
  orderId: string;
  jornadaId?: string;
  incidentId?: string;
  caseId?: string;
  kind: PhotoKind;
  area: string; // "Baños planta baja"
  /** When the photo was actually taken: EXIF DateTimeOriginal when present, else the moment it was attached. */
  takenAt: string;
  /**
   * Where takenAt comes from: "exif" = the shot time stored in the file; "file" = the file's last-modified date (gallery pick
   * without EXIF, e.g. HEIC or a stripped copy); "device" = the moment it was attached (camera input without EXIF). Seed photos omit it.
   */
  takenAtSource?: "exif" | "file" | "device";
  /** When it was attached in the app (≠ takenAt for gallery picks). */
  uploadedAt?: string;
  /** Camera vs gallery (real captures only). */
  origin?: PhotoOrigin;
  by: string;
  /** Position: EXIF GPS of the file, else the device position when it was attached (if available). */
  lat?: number;
  lng?: number;
  accuracy?: number;
  geoSource?: "exif" | "device";
  source: PhotoSource;
  selectedForReport: boolean;
  note?: string;
};

export type IncidentType =
  | "danos"
  | "faltante_material"
  | "faltante_personal"
  | "trabajo_adicional"
  | "retraso_ausencia"
  | "solicitud_queja"
  | "otra";

export type Severity = "baja" | "media" | "alta";

export type Incident = {
  id: string;
  folio: string; // "INC-0312"
  orderId: string;
  jornadaId?: string;
  type: IncidentType;
  severity: Severity;
  description: string;
  photoIds: string[];
  status: "abierta" | "resuelta";
  blocksClosure: boolean;
  createdAt: string;
  createdBy: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type ShareChannel = "whatsapp" | "email" | "descarga";

export type ShareAttempt = {
  id: string;
  channel: ShareChannel;
  to: string; // phone or email
  at: string;
  by: string;
  /** Manual sharing never confirms delivery — we only record that it was initiated. */
  note: string;
};

export type Report = {
  id: string;
  orderId: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  photoIds: string[];
  summary: string;
  shares: ShareAttempt[];
};

export type CaseCategory =
  | "calidad"
  | "puntualidad"
  | "personal"
  | "danos"
  | "faltante"
  | "facturacion"
  | "otro";

export type CaseChannel = "telefono" | "whatsapp" | "correo" | "encuesta" | "presencial";

export type CaseStatus = "abierto" | "en_proceso" | "resuelto" | "cerrado";

/** Post-sale case (queja / seguimiento). */
export type PostSaleCase = {
  id: string;
  folio: string; // "PV-0045"
  orderId: string;
  clientId: string;
  category: CaseCategory;
  severity: Severity;
  channel: CaseChannel;
  description: string;
  ownerId: string; // user responsible
  dueDate: string;
  status: CaseStatus;
  photoIds: string[];
  resolution?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  timeline: { at: string; by: string; text: string }[];
};

export type SurveyAnswers = {
  overall: number; // 1-5
  quality: number; // 1-5
  punctuality: number; // 1-5
  staff: number; // 1-5
  nps: number; // 0-10
  comment?: string;
};

export type Survey = {
  id: string;
  token: string; // public link token  /encuesta/[token]
  orderId: string;
  clientId: string;
  sentAt: string;
  sentBy: string;
  channel: ShareChannel;
  respondedAt?: string;
  answers?: SurveyAnswers;
  manual: boolean; // captured manually by staff
  respondentName?: string;
};

export type AuditEntity =
  | "orden"
  | "jornada"
  | "foto"
  | "incidencia"
  | "reporte"
  | "caso"
  | "encuesta"
  | "catalogo"
  | "usuario";

export type AuditEntry = {
  id: string;
  at: string;
  by: string;
  entity: AuditEntity;
  entityId: string;
  orderId?: string;
  action: string; // "Cambió estado a Programada"
  reason?: string;
};

export type SyncState = "pendiente" | "sincronizando" | "sincronizado" | "error";

export type SyncItem = {
  id: string;
  at: string;
  label: string; // "Foto ANTES · OS-24817"
  entity: AuditEntity;
  entityId: string;
  orderId?: string;
  state: SyncState;
  bytes?: number;
};

export type DataSnapshot = {
  units: Unit[];
  users: User[];
  workers: Worker[];
  clients: Client[];
  sites: Site[];
  serviceTypes: ServiceType[];
  materials: Material[];
  orders: Order[];
  jornadas: Jornada[];
  photos: Photo[];
  incidents: Incident[];
  reports: Report[];
  cases: PostSaleCase[];
  surveys: Survey[];
  audit: AuditEntry[];
};
