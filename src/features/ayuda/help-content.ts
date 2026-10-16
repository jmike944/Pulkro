/**
 * Help-center content distilled from docs/requisitos.md (§8 reglas, §10 criterios, §11 preguntas).
 * Copy is short on purpose: each card says the rule and how the prototype applies it.
 */
export type RuleIcon = "jornadas" | "gps" | "fotos" | "incidencia" | "envio" | "offline" | "version";

export const BUSINESS_RULES: {
  icon: RuleIcon;
  title: string;
  rule: string;
  how: string;
  href: string;
  linkLabel: string;
  pending?: boolean;
}[] = [
  {
    icon: "jornadas",
    title: "Varias jornadas, un solo cierre",
    rule: "Una orden puede tener múltiples jornadas y cambios de personal; el historial se registra por fecha.",
    how: "Cada jornada guarda su entrada, salida, fotos y bitácora; los cambios de cuadrilla quedan con motivo.",
    href: "/agenda",
    linkLabel: "Agenda",
  },
  {
    icon: "gps",
    title: "Entrada y salida coherentes",
    rule: "Entrada y salida pertenecen a la misma jornada; se valida la secuencia temporal y los duplicados.",
    how: "No hay salida sin entrada ni registros repetidos; la salida siempre es posterior a la entrada.",
    href: "/agenda",
    linkLabel: "Jornadas",
  },
  {
    icon: "fotos",
    title: "ANTES y DESPUÉS obligatorias",
    rule: "Las fotografías antes y después son requisito de cierre, con excepción documentada y autorizada.",
    how: "El cierre se bloquea y muestra qué falta por jornada; la excepción exige motivo y queda en el reporte.",
    href: "/evidencias",
    linkLabel: "Evidencias",
  },
  {
    icon: "fotos",
    title: "Evidencia con metadatos",
    rule: "Cada foto debe poder rastrearse: quién la tomó, cuándo y dónde.",
    how: "Guarda la hora real de la toma, si es de cámara o de galería y su ubicación (la de la foto o, si no la trae, la del teléfono al adjuntarla). Una foto fuera del horario de la jornada queda marcada para revisión.",
    href: "/evidencias",
    linkLabel: "Evidencias",
  },
  {
    icon: "gps",
    title: "Supervisión remota",
    rule: "Si el supervisor no está en el sitio, puede registrar la entrada o salida de la cuadrilla con una justificación.",
    how: "Es una opción aparte, con nota obligatoria: guarda la ubicación del supervisor, no la del sitio, y el reporte la marca como supervisión remota.",
    href: "/agenda",
    linkLabel: "Jornadas",
  },
  {
    icon: "incidencia",
    title: "Incidencias que bloquean",
    rule: "Con una incidencia abierta, el supervisor decide si impide el cierre; los criterios están por definir.",
    how: "Al registrarla se marca si bloquea; al resolverla, la orden regresa al estado que le corresponde.",
    href: "/incidencias",
    linkLabel: "Incidencias",
    pending: true,
  },
  {
    icon: "envio",
    title: "Envío manual, sin afirmar entrega",
    rule: "Compartir por WhatsApp o correo es manual: se guarda cuándo y quién lo inició.",
    how: "Cada intento queda con la nota «sin confirmación de entrega»; nunca se marca como recibido.",
    href: "/reportes",
    linkLabel: "Reportes",
  },
  {
    icon: "offline",
    title: "Sin conexión, con marca de pendiente",
    rule: "Se permite capturar sin conexión; el PDF definitivo se bloquea mientras falten datos por sincronizar.",
    how: "Todo entra a la cola local y se envía al volver la señal; el reporte avisa si hay pendientes.",
    href: "/configuracion?tab=sincronizacion",
    linkLabel: "Sincronización",
  },
  {
    icon: "version",
    title: "Cambios después del cierre",
    rule: "Las ediciones posteriores al cierre generan nueva versión y trazabilidad.",
    how: "Reabrir exige motivo; el siguiente reporte sale como v2, v3… y el cambio queda en bitácora.",
    href: "/bitacora",
    linkLabel: "Bitácora",
  },
];

export const PENDING_QUESTIONS: { topic: string; q: string; now: string; href?: string; linkLabel?: string }[] = [
  { topic: "Plataforma", q: "¿Android, iOS o ambas? ¿Una sola app multiplataforma?", now: "Prototipo como app web instalable que funciona en ambos desde el navegador del teléfono." },
  { topic: "Conformidad", q: "¿Cómo se capturará la conformidad o firma del cliente si no usa la app?", now: "Firma en el teléfono del supervisor, o conformidad verbal o por correo con nombre de quien acepta.", href: "/ordenes", linkLabel: "Órdenes" },
  { topic: "Indicadores", q: "¿Qué significa «productividad por trabajador»: servicios, horas o rendimiento?", now: "Se muestran jornadas y horas por persona como referencia, sin indicador formal.", href: "/equipo", linkLabel: "Equipo" },
  { topic: "Costos", q: "¿Qué datos y fórmulas alimentarán costos, ingreso, utilidad y consumo de materiales?", now: "Fuera del prototipo: requiere un módulo de captura o una integración.", href: "/indicadores", linkLabel: "Indicadores" },
  { topic: "Administración", q: "¿Quién administra catálogos, usuarios y recuperación de cuentas?", now: "Dirección administra usuarios; Dirección y Administración, los catálogos.", href: "/configuracion", linkLabel: "Configuración" },
  { topic: "Postventa", q: "¿Cómo se gestionarán quejas por teléfono o WhatsApp y encuestas por enlace?", now: "Casos con folio, canal, responsable y fecha compromiso; encuesta pública sin cuenta.", href: "/postventa", linkLabel: "Postventa" },
  { topic: "GPS", q: "¿Cuál es la política de GPS, precisión, permisos, ausencia de señal y privacidad?", now: "Se guarda la precisión; sin señal se pide justificación; la ubicación se toma en entrada y salida y al adjuntar cada foto. Sin estar en el sitio, queda la opción de supervisión remota, justificada.", href: "/configuracion?tab=privacidad", linkLabel: "Privacidad" },
  { topic: "Almacenamiento", q: "¿Qué almacenamiento y respaldo convienen por volumen de fotos?", now: "Hay una calculadora con los volúmenes reales para llevar a la reunión.", href: "/configuracion?tab=sincronizacion", linkLabel: "Calculadora" },
  { topic: "Envíos", q: "¿Compartir el PDF desde el teléfono o envío integrado con comprobante de entrega?", now: "Hoja de compartir del teléfono (WhatsApp o correo), sin comprobante de entrega.", href: "/reportes", linkLabel: "Reportes" },
  { topic: "Unidades", q: "¿Se requiere multiunidad o multiciudad desde el inicio?", now: "El prototipo ya separa Matriz Monterrey, Apodaca y Saltillo con permisos por unidad.", href: "/indicadores", linkLabel: "Indicadores" },
];

export const FAQ: { q: string; a: string; href?: string; linkLabel?: string }[] = [
  {
    q: "¿Qué pasa si me quedo sin señal en el sitio?",
    a: "Siga capturando. Entrada, salida, fotos e incidencias se guardan en el teléfono con marca de pendiente y se envían solas al recuperar la conexión.",
    href: "/configuracion?tab=sincronizacion",
    linkLabel: "Ver la cola de sincronización",
  },
  {
    q: "¿Puedo cerrar una orden sin foto DESPUÉS?",
    a: "Solo con una excepción autorizada y justificada. El cierre muestra qué falta en cada jornada; la excepción queda en la bitácora y en el reporte.",
    href: "/evidencias",
    linkLabel: "Revisar evidencias",
  },
  {
    q: "¿El cliente necesita descargar algo?",
    a: "No. Recibe el reporte por WhatsApp o correo y responde la encuesta desde un enlace, sin cuenta ni app.",
  },
  {
    q: "¿Por qué no veo órdenes de otra unidad?",
    a: "Cada rol ve solo lo autorizado: Supervisor, sus asignaciones; Administración, su unidad; Dirección, todas o la unidad que elija.",
    href: "/configuracion",
    linkLabel: "Ver mis permisos",
  },
  {
    q: "¿Dirección y Administración pueden ver una jornada?",
    a: "Sí, en modo consulta: horario, entrada y salida con su ubicación, cuadrilla, fotos, incidencias y bitácora. Se abre desde la pestaña Jornadas de cada orden. Solo el supervisor captura, asigna la cuadrilla y valida el cierre.",
    href: "/ordenes",
    linkLabel: "Ver órdenes",
  },
  {
    q: "¿La app confirma que el cliente recibió el reporte?",
    a: "No. El envío es manual: se registra quién lo inició y cuándo, pero nunca se afirma la entrega ni la lectura.",
  },
  {
    q: "¿Cómo corrijo algo después de cerrar una orden?",
    a: "Reabra la orden e indique el motivo. Al generar de nuevo el reporte se emite una nueva versión y el cambio queda en la bitácora.",
  },
  {
    q: "¿Los trabajadores de la cuadrilla usan la app?",
    a: "No es obligatorio. El supervisor captura por ellos y puede cambiar la cuadrilla entre jornadas; cada cambio guarda el motivo.",
  },
  {
    q: "¿Cómo pruebo la app con otro rol?",
    a: "En el menú de su usuario o en su perfil elija «Ver la app como» Dirección, Administración o Supervisor. Para volver al escenario inicial, restablezca los datos de demostración.",
    href: "/configuracion?tab=sincronizacion",
    linkLabel: "Restablecer datos",
  },
];
