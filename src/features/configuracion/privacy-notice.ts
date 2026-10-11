/**
 * Draft privacy notice (doc §6 PROPUESTO: "consentimiento y aviso de privacidad para fotos, GPS,
 * firmas y datos de clientes"). Plain data so it renders in the UI and exports to text identically.
 */
export type NoticeSection = { title: string; body: string[]; list?: string[]; pending?: boolean };

export const PULKRO_CONTACT = {
  unit: "Matriz Monterrey",
  address: "Diego de Montemayor 1526 Nte., Col. Terminal, Monterrey, N.L.",
  phone: "+52 (81) 8374 5960",
  phoneHref: "tel:+528183745960",
  tollFree: "800 0245 960",
  tollFreeHref: "tel:8000245960",
};

export const PRIVACY_NOTICE: NoticeSection[] = [
  {
    title: "Responsable",
    body: [
      `Pulkro, con domicilio en ${PULKRO_CONTACT.address}, es responsable del tratamiento de los datos personales que se recaban mediante la aplicación interna Pulkro Cuadrillas, conforme a la legislación mexicana aplicable en materia de protección de datos personales.`,
    ],
  },
  {
    title: "Datos que se recaban",
    body: ["Para documentar cada servicio se recaban únicamente los siguientes datos:"],
    list: [
      "De clientes y sus contactos: nombre, puesto, teléfono, correo electrónico y domicilio de los sitios de servicio.",
      "De quien otorga la conformidad en sitio: nombre, cargo y, en su caso, firma trazada en el dispositivo del supervisor.",
      "Del personal de Pulkro: nombre, teléfono, unidad y la ubicación GPS del dispositivo del supervisor al registrar entrada y salida y al adjuntar fotografías.",
      "Fotografías de las instalaciones antes y después del servicio, de incidencias y de seguimiento postventa. Con cada una se guarda la hora real de la toma, si proviene de la cámara o de la galería del dispositivo y su ubicación: la que trae la propia foto o, si no la trae, la del teléfono al adjuntarla.",
    ],
  },
  {
    title: "Datos sensibles",
    body: [
      "No se recaban datos personales sensibles. Las fotografías se enfocan en las áreas de trabajo; se evita captar rostros, documentos, pantallas o placas. Si una imagen los incluye por accidente, se elimina o se excluye del reporte.",
    ],
  },
  {
    title: "Finalidades",
    body: ["Finalidades necesarias para el servicio contratado:"],
    list: [
      "Programar, ejecutar y documentar el servicio y sus jornadas.",
      "Verificar la presencia y los tiempos de la cuadrilla en el sitio.",
      "Generar y compartir el reporte final con fotografías y conformidad.",
      "Atender quejas, incidencias y seguimiento postventa.",
    ],
  },
  {
    title: "Finalidades adicionales",
    body: [
      "Enviar encuestas de satisfacción y elaborar indicadores de calidad. El titular puede negarse a estas finalidades sin que afecte el servicio, respondiendo al medio por el que recibió la encuesta.",
    ],
  },
  {
    title: "Ubicación GPS",
    body: [
      "La aplicación registra la ubicación al marcar entrada y salida de cada jornada, junto con la precisión y la hora, y al adjuntar cada fotografía: la que guarda la propia foto o, si no la trae, la del teléfono en ese momento. En una foto elegida de la galería, esa ubicación puede no ser la de la toma y así se identifica en la aplicación. No realiza rastreo continuo.",
      "Si el GPS no está disponible, se registra una justificación escrita. Si el supervisor registra una entrada o salida sin estar en el sitio (supervisión remota), se guarda su justificación y, si el teléfono la entrega, la ubicación del supervisor: nunca se presenta como una posición en el sitio, y el reporte al cliente lo indica sin mostrar coordenadas.",
    ],
  },
  {
    title: "Transferencias",
    body: [
      "Pulkro no vende ni transfiere datos personales a terceros. El reporte se comparte solo con el contacto del cliente, por WhatsApp o correo, a iniciativa del supervisor. Los proveedores de alojamiento que traten datos por cuenta de Pulkro se definirán junto con la infraestructura.",
    ],
    pending: true,
  },
  {
    title: "Derechos ARCO y revocación",
    body: [
      `El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición, así como revocar su consentimiento, mediante solicitud en la ${PULKRO_CONTACT.unit} o al teléfono ${PULKRO_CONTACT.phone}. El correo electrónico para estas solicitudes está por definir.`,
    ],
    pending: true,
  },
  {
    title: "Conservación",
    body: [
      "Los datos se conservan durante el plazo necesario para cumplir las finalidades y las obligaciones legales aplicables; después se eliminan o anonimizan. El plazo específico por tipo de dato está por definir.",
    ],
    pending: true,
  },
  {
    title: "Cambios al aviso",
    body: ["Cualquier modificación a este aviso se comunicará por los mismos medios en que se dio a conocer."],
  },
];

export function noticeAsText() {
  const lines = ["AVISO DE PRIVACIDAD — PULKRO CUADRILLAS (BORRADOR)", ""];
  PRIVACY_NOTICE.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title.toUpperCase()}${s.pending ? " [PENDIENTE]" : ""}`);
    s.body.forEach((p) => lines.push(p));
    s.list?.forEach((li) => lines.push(`  • ${li}`));
    lines.push("");
  });
  lines.push(`${PULKRO_CONTACT.unit} · ${PULKRO_CONTACT.address} · ${PULKRO_CONTACT.phone} · ${PULKRO_CONTACT.tollFree}`);
  return lines.join("\n");
}
