/**
 * "Flujo operativo y postventa" (docs/flujo-operativo.png · doc §3 "Flujo principal confirmado").
 * Three columns laid out as a serpentine: 01→05 down, 06→10 up, 11→15 down.
 */
import type { Tone } from "@/lib/status";

export type FlowRole = "Administración" | "Supervisor" | "Decisión" | "Postventa" | "Dirección / Administración";

export type FlowStep = {
  n: number;
  role: FlowRole;
  title: string;
  /** Who does it and how, in one or two sentences. */
  who: string;
  /** Where it happens in the prototype. */
  where: { label: string; href: string }[];
  /** The business rule that governs the step. */
  rule: string;
  /** Decisions only: the two branches. */
  branches?: { label: "Sí" | "No"; to: number; text: string }[];
};

export const FLOW_ROLE_TONE: Record<FlowRole, Tone> = {
  Administración: "violet",
  Supervisor: "blue",
  Decisión: "amber",
  Postventa: "teal",
  "Dirección / Administración": "navy",
};

export const FLOW_PHASES = [
  { title: "Planeación", range: "01–05", hint: "De la autorización a la llegada al sitio" },
  { title: "Ejecución en campo", range: "06–10", hint: "Evidencia, incidencias y jornadas" },
  { title: "Cierre y postventa", range: "11–15", hint: "Validación, reporte y seguimiento" },
] as const;

export const FLOW_STEPS: FlowStep[] = [
  {
    n: 1,
    role: "Administración",
    title: "Inicio: trabajo autorizado",
    who: "Administración recibe un servicio ya autorizado por el sistema comercial externo. La app no cotiza ni autoriza.",
    where: [{ label: "Nueva orden", href: "/ordenes/nueva" }],
    rule: "El ciclo inicia con un servicio autorizado; captación, cotización y autorización comercial quedan fuera del alcance (doc §1).",
  },
  {
    n: 2,
    role: "Administración",
    title: "Alta manual de orden de servicio",
    who: "Administración captura cliente, sitio, tipo de servicio, actividades, materiales, instrucciones especiales y contacto en sitio.",
    where: [
      { label: "Nueva orden", href: "/ordenes/nueva" },
      { label: "Órdenes", href: "/ordenes" },
    ],
    rule: "Alta manual al inicio, preparada para integrarse después con el sistema comercial. Cada orden lleva folio único y su referencia comercial.",
  },
  {
    n: 3,
    role: "Supervisor",
    title: "Asignar supervisor y cuadrilla variable",
    who: "El supervisor arma la cuadrilla para este servicio y puede cambiar personas entre jornadas.",
    where: [
      { label: "Agenda", href: "/agenda" },
      { label: "Equipo", href: "/equipo" },
    ],
    rule: "Cuadrillas variables por servicio. Cada cambio de personal queda en el historial con fecha, usuario y motivo (doc §8).",
  },
  {
    n: 4,
    role: "Supervisor",
    title: "Programar jornada(s) y recursos",
    who: "El supervisor define días, horarios y materiales. Un servicio puede durar uno o varios días.",
    where: [{ label: "Agenda", href: "/agenda" }],
    rule: "Una orden puede tener varias jornadas; cada una conserva su registro independiente y hay un único cierre definitivo.",
  },
  {
    n: 5,
    role: "Supervisor",
    title: "Registro de entrada: hora + GPS",
    who: "Al llegar al sitio, el supervisor marca la entrada desde su teléfono, con o sin conexión.",
    where: [
      { label: "Jornadas de hoy", href: "/" },
      { label: "Agenda", href: "/agenda" },
    ],
    rule: "Se guardan coordenadas, precisión, hora del dispositivo y del servidor. Entrada y salida pertenecen a la misma jornada; se rechazan duplicados.",
  },
  {
    n: 6,
    role: "Supervisor",
    title: "Fotografías ANTES obligatorias",
    who: "El supervisor fotografía cada área antes de empezar a trabajar.",
    where: [{ label: "Evidencias", href: "/evidencias" }],
    rule: "Las fotos ANTES son obligatorias para cerrar; cada foto guarda área, hora y coordenadas.",
  },
  {
    n: 7,
    role: "Supervisor",
    title: "Ejecución y registro de incidencias",
    who: "Durante el trabajo se registran daños, faltantes de material o personal, trabajos adicionales, retrasos y quejas, con fotos.",
    where: [{ label: "Incidencias", href: "/incidencias" }],
    rule: "Si hay una incidencia abierta, el supervisor decide si impide el cierre. Los criterios están PENDIENTES de definir (doc §8).",
  },
  {
    n: 8,
    role: "Supervisor",
    title: "Registro de salida: hora + GPS",
    who: "Al terminar la jornada, el supervisor marca la salida.",
    where: [{ label: "Agenda", href: "/agenda" }],
    rule: "La salida debe ser posterior a la entrada de la misma jornada. Las horas reales suman los intervalos de cada jornada (doc §5).",
  },
  {
    n: 9,
    role: "Supervisor",
    title: "Fotografías DESPUÉS obligatorias",
    who: "El supervisor documenta el resultado de cada área al terminar.",
    where: [{ label: "Evidencias", href: "/evidencias" }],
    rule: "Sin fotos DESPUÉS no se puede finalizar, salvo excepción autorizada y justificada.",
  },
  {
    n: 10,
    role: "Decisión",
    title: "¿Quedan jornadas pendientes?",
    who: "La app lo resuelve con la agenda de la orden: si quedan días programados, la orden pasa a «Jornada cerrada».",
    where: [{ label: "Órdenes", href: "/ordenes" }],
    rule: "Varios días = registros independientes por jornada y un único cierre definitivo (doc §3).",
    branches: [
      { label: "Sí", to: 5, text: "Regresar al registro de entrada de la siguiente jornada." },
      { label: "No", to: 11, text: "La orden queda pendiente de validación." },
    ],
  },
  {
    n: 11,
    role: "Decisión",
    title: "¿Evidencia completa y cierre validado?",
    who: "El supervisor revisa que cada jornada tenga ANTES y DESPUÉS, sin incidencias que bloqueen, y registra la conformidad del cliente.",
    where: [{ label: "Evidencias", href: "/evidencias" }],
    rule: "Si faltan fotos obligatorias, no se permite finalizar sin una excepción autorizada y justificada.",
    branches: [
      { label: "Sí", to: 12, text: "La orden queda finalizada y sigue el reporte." },
      { label: "No", to: 9, text: "Corregir la evidencia antes del cierre o registrar la excepción." },
    ],
  },
  {
    n: 12,
    role: "Supervisor",
    title: "Seleccionar fotos y generar PDF",
    who: "El supervisor elige las mejores fotos antes y después y genera el reporte con marca Pulkro.",
    where: [{ label: "Reportes", href: "/reportes" }],
    rule: "Un reporte final por servicio aunque abarque varias jornadas. Las ediciones posteriores al cierre generan nueva versión.",
  },
  {
    n: 13,
    role: "Supervisor",
    title: "Revisar y compartir WhatsApp / email",
    who: "El supervisor revisa la vista previa y abre WhatsApp o el correo del teléfono para enviarlo.",
    where: [{ label: "Reportes", href: "/reportes" }],
    rule: "El envío es manual: se guarda quién lo inició y cuándo, sin afirmar entrega. Sin sincronizar, el PDF definitivo se bloquea.",
  },
  {
    n: 14,
    role: "Postventa",
    title: "Encuesta, quejas y seguimiento",
    who: "Supervisor y Administración envían la encuesta por enlace y atienden quejas con folio, responsable y fecha compromiso.",
    where: [
      { label: "Postventa", href: "/postventa" },
      { label: "Clientes", href: "/clientes" },
    ],
    rule: "El cliente responde sin instalar nada. Quejas y encuestas quedan ligadas al cliente y a la orden original.",
  },
  {
    n: 15,
    role: "Dirección / Administración",
    title: "Historial, métricas y exportación",
    who: "Dirección y Administración consultan indicadores y exportan PDF y Excel según su alcance.",
    where: [
      { label: "Indicadores", href: "/indicadores" },
      { label: "Bitácora", href: "/configuracion?tab=auditoria" },
    ],
    rule: "Costos, productividad individual y consumo de materiales requieren captura adicional antes de prometerse (doc §5).",
  },
];

/** Grid placement for the serpentine (column, row), 1-based. */
export function flowCell(n: number): { col: number; row: number } {
  if (n <= 5) return { col: 1, row: n };
  if (n <= 10) return { col: 2, row: 11 - n };
  return { col: 3, row: n - 10 };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
