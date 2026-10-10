import type {
  CaseCategory,
  CaseChannel,
  CaseStatus,
  IncidentType,
  OrderStatus,
  PhotoKind,
  Role,
  Severity,
  ShareChannel,
} from "./types";

/** Tone → Tailwind classes. Every status in the app maps to one of these tones. */
export type Tone = "blue" | "amber" | "red" | "teal" | "violet" | "slate" | "navy" | "sky";

export const toneDot: Record<Tone, string> = {
  blue: "bg-st-blue",
  amber: "bg-st-amber",
  red: "bg-st-red",
  teal: "bg-st-teal",
  violet: "bg-st-violet",
  slate: "bg-st-slate",
  navy: "bg-brand",
  sky: "bg-sky",
};

export const toneText: Record<Tone, string> = {
  blue: "text-link",
  amber: "text-amber-fg",
  red: "text-red-fg",
  teal: "text-teal-fg",
  violet: "text-violet-fg",
  slate: "text-subtle",
  navy: "text-brand-ink",
  sky: "text-sky-fg",
};

export const toneSoftBg: Record<Tone, string> = {
  blue: "bg-blue-soft",
  amber: "bg-amber-soft",
  red: "bg-red-soft",
  teal: "bg-teal-soft",
  violet: "bg-violet-soft",
  slate: "bg-tile",
  navy: "bg-press",
  sky: "bg-sky-soft",
};

/** Solid tone colors as CSS variables (they re-theme in dark mode). Use in inline `style` / SVG, never as a literal hex. */
export const toneHex: Record<Tone, string> = {
  blue: "var(--st-blue)",
  amber: "var(--st-amber)",
  red: "var(--st-red)",
  teal: "var(--st-teal)",
  violet: "var(--st-violet)",
  slate: "var(--st-slate)",
  navy: "var(--brand)",
  sky: "var(--sky)",
};

export type StatusMeta = {
  label: string;
  tone: Tone;
  /** Short hint used in tooltips and empty states. */
  hint: string;
  /** Live states pulse their dot. */
  live?: boolean;
};

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  borrador: { label: "Borrador", tone: "slate", hint: "Alta incompleta, aún no programada" },
  programada: { label: "Programada", tone: "blue", hint: "Cuadrilla y jornadas asignadas" },
  en_ejecucion: { label: "En ejecución", tone: "blue", hint: "Jornada en curso", live: true },
  jornada_cerrada: { label: "Jornada cerrada", tone: "sky", hint: "Quedan jornadas pendientes" },
  pendiente_validacion: {
    label: "Pendiente de validación",
    tone: "amber",
    hint: "Ejecución terminada, falta validar cierre",
  },
  finalizada: { label: "Finalizada", tone: "navy", hint: "Cierre validado por supervisor" },
  reporte_enviado: { label: "Reporte enviado", tone: "teal", hint: "Envío manual iniciado" },
  seguimiento: { label: "Seguimiento postventa", tone: "violet", hint: "Encuesta o caso abierto" },
  archivada: { label: "Archivada", tone: "slate", hint: "Ciclo completo" },
  cancelada: { label: "Cancelada", tone: "slate", hint: "Orden cancelada con motivo" },
  reprogramada: { label: "Reprogramada", tone: "amber", hint: "Fechas movidas con motivo" },
  con_incidencia: { label: "Con incidencia", tone: "red", hint: "Incidencia abierta que bloquea" },
  reabierta: { label: "Reabierta", tone: "violet", hint: "Edición posterior al cierre" },
};

/** Main lifecycle (doc §3) in order — used by timelines, funnels and steppers. */
export const ORDER_FLOW: OrderStatus[] = [
  "borrador",
  "programada",
  "en_ejecucion",
  "jornada_cerrada",
  "pendiente_validacion",
  "finalizada",
  "reporte_enviado",
  "seguimiento",
  "archivada",
];

export const OPEN_STATUSES: OrderStatus[] = [
  "borrador",
  "programada",
  "en_ejecucion",
  "jornada_cerrada",
  "pendiente_validacion",
  "con_incidencia",
  "reprogramada",
  "reabierta",
];

export const DONE_STATUSES: OrderStatus[] = [
  "finalizada",
  "reporte_enviado",
  "seguimiento",
  "archivada",
];

export const INCIDENT_TYPE: Record<IncidentType, { label: string; tone: Tone; icon: string }> = {
  danos: { label: "Daños", tone: "red", icon: "Hammer" },
  faltante_material: { label: "Faltante de material", tone: "amber", icon: "PackageX" },
  faltante_personal: { label: "Faltante de personal", tone: "amber", icon: "UserX" },
  trabajo_adicional: { label: "Trabajo adicional", tone: "blue", icon: "PlusCircle" },
  retraso_ausencia: { label: "Retraso / ausencia", tone: "violet", icon: "Clock" },
  solicitud_queja: { label: "Solicitud o queja en sitio", tone: "red", icon: "MessageSquareWarning" },
  otra: { label: "Otra", tone: "slate", icon: "CircleHelp" },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  baja: { label: "Baja", tone: "slate" },
  media: { label: "Media", tone: "amber" },
  alta: { label: "Alta", tone: "red" },
};

export const PHOTO_KIND: Record<PhotoKind, { label: string; tone: Tone }> = {
  antes: { label: "Antes", tone: "amber" },
  despues: { label: "Después", tone: "teal" },
  incidencia: { label: "Incidencia", tone: "red" },
  postventa: { label: "Postventa", tone: "violet" },
};

export const CASE_STATUS: Record<CaseStatus, StatusMeta> = {
  abierto: { label: "Abierto", tone: "red", hint: "Sin atender" },
  en_proceso: { label: "En proceso", tone: "amber", hint: "Responsable asignado", live: true },
  resuelto: { label: "Resuelto", tone: "teal", hint: "Resolución registrada" },
  cerrado: { label: "Cerrado", tone: "slate", hint: "Confirmado con el cliente" },
};

export const CASE_CATEGORY: Record<CaseCategory, string> = {
  calidad: "Calidad del servicio",
  puntualidad: "Puntualidad",
  personal: "Conducta del personal",
  danos: "Daños a instalaciones",
  faltante: "Trabajo incompleto",
  facturacion: "Facturación",
  otro: "Otro",
};

export const CASE_CHANNEL: Record<CaseChannel, string> = {
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  correo: "Correo",
  encuesta: "Encuesta",
  presencial: "Presencial",
};

export const SHARE_CHANNEL: Record<ShareChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Correo",
  descarga: "Descarga",
};

export const ROLE_LABEL: Record<Role, string> = {
  direccion: "Dirección",
  administracion: "Administración",
  supervisor: "Supervisor",
};
