/**
 * Deterministic demo dataset anchored to "today".
 * Historical orders since Jan 1 feed the indicators; a handcrafted set of live
 * scenarios around today exercises every lifecycle state from doc §3.
 * Client names are fictional.
 */
import { addDays, addMinutes, isSunday, setHours, setMinutes, startOfDay, startOfYear, differenceInCalendarDays, format } from "date-fns";
import type {
  AuditEntry,
  Client,
  DataSnapshot,
  Incident,
  IncidentType,
  Jornada,
  Material,
  Order,
  OrderStatus,
  Photo,
  PostSaleCase,
  Report,
  SceneKind,
  ServiceType,
  Site,
  Survey,
  Unit,
  User,
  Worker,
  CaseCategory,
  CaseChannel,
  Severity,
  Conformity,
} from "./types";

export const SEED_VERSION = 6;

/* ───────────── deterministic random ───────────── */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(1985); // Pulkro founded in 1985
const rand = () => rnd();
const rint = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
function pickWeighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}
function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const token = () => Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[rint(0, 30)]).join("");
const initials = (name: string) =>
  name
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/* ───────────── catalogs ───────────── */

export const UNITS: Unit[] = [
  { id: "u_mty", name: "Matriz Monterrey", code: "MTY", city: "Monterrey, N.L." },
  { id: "u_apo", name: "Apodaca", code: "APO", city: "Apodaca, N.L." },
  { id: "u_sal", name: "Saltillo", code: "SAL", city: "Saltillo, Coah." },
];

const USERS: User[] = [
  { id: "usr_dir", name: "Alejandro Garza Lozano", role: "direccion", title: "Director de operaciones", unitId: "u_mty", hue: 214 },
  { id: "usr_adm_mty", name: "Mariana Treviño Ríos", role: "administracion", title: "Coordinadora administrativa", unitId: "u_mty", hue: 330 },
  { id: "usr_adm_apo", name: "Luis Cantú Medina", role: "administracion", title: "Administración Apodaca", unitId: "u_apo", hue: 30 },
  { id: "usr_adm_sal", name: "Fernanda Ramos Aguirre", role: "administracion", title: "Administración Saltillo", unitId: "u_sal", hue: 280 },
  { id: "sup_daniela", name: "Daniela Ortiz Peña", role: "supervisor", title: "Supervisora de operaciones", unitId: "u_mty", hue: 196 },
  { id: "sup_jorge", name: "Jorge Villarreal Cano", role: "supervisor", title: "Supervisor de operaciones", unitId: "u_mty", hue: 150 },
  { id: "sup_sofia", name: "Sofía Elizondo Luna", role: "supervisor", title: "Supervisora de operaciones", unitId: "u_mty", hue: 350 },
  { id: "sup_hector", name: "Héctor Leal Garza", role: "supervisor", title: "Supervisor de operaciones", unitId: "u_apo", hue: 45 },
  { id: "sup_paola", name: "Paola Cavazos Ruiz", role: "supervisor", title: "Supervisora de operaciones", unitId: "u_apo", hue: 265 },
  { id: "sup_emilio", name: "Emilio Saucedo Valdés", role: "supervisor", title: "Supervisor de operaciones", unitId: "u_sal", hue: 175 },
  { id: "sup_regina", name: "Regina Flores Dávila", role: "supervisor", title: "Supervisora de operaciones", unitId: "u_sal", hue: 10 },
].map((u) => ({
  ...u,
  role: u.role as User["role"],
  initials: initials(u.name),
  email: `${u.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${u.name.split(" ")[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@pulkro.com.mx`,
  phone: `+52 81 0000 ${rint(1000, 9999)}`,
  active: true,
}));

/** Demo identities used by the role switcher. */
export const DEMO_USER_BY_ROLE = {
  direccion: "usr_dir",
  administracion: "usr_adm_mty",
  supervisor: "sup_daniela",
} as const;

const FIRST = ["Juan", "María", "José", "Guadalupe", "Luis", "Rosa", "Carlos", "Ana", "Miguel", "Laura", "Pedro", "Verónica", "Raúl", "Claudia", "Javier", "Patricia", "Arturo", "Norma", "Ernesto", "Leticia", "Ramón", "Silvia", "Óscar", "Alejandra", "Fernando", "Gabriela", "Rubén", "Adriana", "Sergio", "Martha", "Iván", "Brenda", "Hugo", "Karla", "Mario", "Diana", "Tomás", "Elena", "Rogelio", "Yesenia", "Alfredo", "Lucía"];
const LAST = ["Hernández", "Martínez", "García", "Rodríguez", "López", "González", "Pérez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Reyes", "Morales", "Cruz", "Ortiz", "Gutiérrez", "Chávez", "Ramos", "Mendoza", "Ruiz", "Aguilar", "Castillo", "Jiménez", "Moreno", "Romero", "Alvarado", "Vázquez", "Salazar", "Rocha", "Ibarra", "Tamez", "Cárdenas", "Benavides"];
const SPECIALTIES = ["Limpieza general", "Pulido de pisos", "Trabajo en altura", "Desengrase industrial", "Sanitización", "Lavado de alfombras", "Operador de máquina", "Jefe de cuadrilla"];

export const SERVICE_TYPES: ServiceType[] = [
  { id: "st_prof", name: "Limpieza profunda", short: "Profunda", hue: 205, defaultHoursPerDay: 8 },
  { id: "st_ind", name: "Limpieza industrial", short: "Industrial", hue: 222, defaultHoursPerDay: 9 },
  { id: "st_pis", name: "Mantenimiento de pisos", short: "Pisos", hue: 190, defaultHoursPerDay: 6 },
  { id: "st_vid", name: "Lavado de vidrios en altura", short: "Vidrios", hue: 178, defaultHoursPerDay: 7 },
  { id: "st_obr", name: "Limpieza post-obra", short: "Post-obra", hue: 32, defaultHoursPerDay: 8 },
  { id: "st_san", name: "Sanitización y desinfección", short: "Sanitización", hue: 160, defaultHoursPerDay: 5 },
  { id: "st_alf", name: "Lavado de alfombras y tapicería", short: "Alfombras", hue: 262, defaultHoursPerDay: 6 },
  { id: "st_coc", name: "Desengrase de cocinas industriales", short: "Cocinas", hue: 14, defaultHoursPerDay: 7 },
];

export const MATERIALS: Material[] = [
  { id: "m_eco", name: "Limpiador multiusos eco-friendly", unit: "L" },
  { id: "m_desg", name: "Desengrasante industrial", unit: "L" },
  { id: "m_desi", name: "Desinfectante cuaternario", unit: "L" },
  { id: "m_sanit", name: "Sanitizante grado alimenticio", unit: "L" },
  { id: "m_cera", name: "Cera acrílica para pisos", unit: "L" },
  { id: "m_sell", name: "Sellador para mármol", unit: "L" },
  { id: "m_vid", name: "Limpiavidrios concentrado", unit: "L" },
  { id: "m_shamp", name: "Shampoo para alfombras", unit: "L" },
  { id: "m_pads", name: "Pads de pulido", unit: "pza" },
  { id: "m_micro", name: "Paños de microfibra", unit: "pza" },
  { id: "m_bolsas", name: "Bolsas para basura industrial", unit: "pza" },
  { id: "m_guantes", name: "Guantes de nitrilo", unit: "caja" },
];

const SERVICE_MATERIALS: Record<string, string[]> = {
  st_prof: ["m_eco", "m_desi", "m_micro", "m_bolsas"],
  st_ind: ["m_desg", "m_eco", "m_bolsas", "m_guantes"],
  st_pis: ["m_cera", "m_pads", "m_sell"],
  st_vid: ["m_vid", "m_micro"],
  st_obr: ["m_eco", "m_desg", "m_bolsas", "m_micro"],
  st_san: ["m_desi", "m_sanit", "m_guantes"],
  st_alf: ["m_shamp", "m_micro"],
  st_coc: ["m_desg", "m_sanit", "m_guantes"],
};

const ACTIVITIES: Record<string, string[]> = {
  st_prof: ["Barrido y trapeado de áreas comunes", "Limpieza profunda de baños y sanitarios", "Desempolvado de mobiliario y luminarias", "Limpieza de cristales interiores", "Retiro de residuos y reposición de bolsas"],
  st_ind: ["Barrido mecánico de nave", "Desengrase de pisos de producción", "Limpieza de racks y estructuras", "Limpieza de andenes de carga", "Retiro de residuos industriales no peligrosos"],
  st_pis: ["Decapado de cera anterior", "Lavado con máquina rotativa", "Aplicación de 3 capas de cera acrílica", "Pulido a alta velocidad", "Sellado de juntas en mármol"],
  st_vid: ["Instalación de equipo de trabajo en altura", "Lavado de cancelería exterior", "Limpieza de marcos y pretiles", "Secado y revisión de manchas"],
  st_obr: ["Retiro de escombro fino y polvo de construcción", "Limpieza de residuos de pintura y yeso", "Lavado de pisos y zoclos", "Limpieza de ventanas y cancelería", "Detallado final para entrega"],
  st_san: ["Nebulización de áreas", "Desinfección de superficies de alto contacto", "Sanitización de baños y comedor", "Registro de productos aplicados"],
  st_alf: ["Aspirado profundo", "Pre-tratamiento de manchas", "Lavado por extracción", "Secado acelerado con ventiladores"],
  st_coc: ["Desengrase de campanas y ductos", "Limpieza de estufas y planchas", "Lavado de pisos antiderrapantes", "Sanitización de superficies de preparación"],
};

export const SCENES_BY_SERVICE: Record<string, SceneKind[]> = {
  st_prof: ["oficina", "bano", "lobby", "cocina"],
  st_ind: ["bodega", "piso"],
  st_pis: ["piso", "lobby"],
  st_vid: ["ventanal"],
  st_obr: ["oficina", "escalera", "piso"],
  st_san: ["bano", "oficina", "cocina"],
  st_alf: ["oficina", "lobby"],
  st_coc: ["cocina"],
};

export const SCENE_AREAS: Record<SceneKind, string[]> = {
  oficina: ["Oficinas piso 3", "Sala de juntas", "Área administrativa", "Recepción"],
  bano: ["Baños planta baja", "Sanitarios de personal", "Baños piso 2"],
  piso: ["Piso de producción", "Pasillo central", "Nave 2"],
  ventanal: ["Fachada norte", "Ventanales del lobby", "Cancelería piso 8"],
  cocina: ["Comedor de personal", "Cocina industrial", "Campana de extracción"],
  bodega: ["Andén de carga", "Almacén general", "Racks zona B"],
  lobby: ["Lobby principal", "Vestíbulo", "Área de espera"],
  escalera: ["Escaleras de emergencia", "Escalera principal", "Cubo de escaleras"],
};

type ClientSeed = Omit<Client, "id" | "siteIds" | "contactPhone" | "contactEmail" | "since" | "hue"> & {
  sites: Omit<Site, "id" | "clientId">[];
  services: string[];
  domain: string;
};

// Real Pulkro clients (pulkro.com.mx) + a few fictional residential/institutional accounts.
// Contacts are fictional; addresses are area-level only.
const CLIENT_SEEDS: ClientSeed[] = [
  {
    name: "Hilton Monterrey", shortName: "Hilton", segment: "Comercial", unitId: "u_mty", contactName: "Lic. Andrea Montemayor", domain: "hilton",
    services: ["st_prof", "st_alf", "st_vid", "st_coc"],
    sites: [{ name: "Hotel Valle Oriente", address: "Zona Valle Oriente", municipality: "San Pedro Garza García", lat: 25.6479, lng: -100.3367 }],
  },
  {
    name: "Megacable", shortName: "Megacable", segment: "Comercial", unitId: "u_mty", contactName: "Ing. Rodrigo Salinas", domain: "megacable",
    services: ["st_prof", "st_vid", "st_pis", "st_san"],
    sites: [
      { name: "Oficinas regionales", address: "Zona Centro", municipality: "Monterrey", lat: 25.6741, lng: -100.3184 },
      { name: "Centro de atención Contry", address: "Col. Contry", municipality: "Monterrey", lat: 25.6297, lng: -100.2803 },
    ],
  },
  {
    name: "Hospital San Rafael del Norte", shortName: "Hospital San Rafael", segment: "Comercial", unitId: "u_mty", contactName: "Dra. Cecilia Guerra", domain: "sanrafael",
    services: ["st_san", "st_prof", "st_pis"],
    sites: [{ name: "Edificio de consultorios", address: "Av. Constitución, Centro", municipality: "Monterrey", lat: 25.6699, lng: -100.3016 }],
  },
  {
    name: "Vitro", shortName: "Vitro", segment: "Industrial", unitId: "u_mty", contactName: "Ing. Marco Tijerina", domain: "vitro",
    services: ["st_ind", "st_pis", "st_coc"],
    sites: [
      { name: "Planta Monterrey", address: "Zona industrial norte", municipality: "Monterrey", lat: 25.7134, lng: -100.3021 },
      { name: "Corporativo", address: "Zona Valle", municipality: "San Pedro Garza García", lat: 25.6531, lng: -100.3526 },
    ],
  },
  {
    name: "Bonafont", shortName: "Bonafont", segment: "Industrial", unitId: "u_mty", contactName: "Lic. Gerardo Peña", domain: "bonafont",
    services: ["st_ind", "st_san", "st_coc"],
    sites: [{ name: "Planta embotelladora", address: "Parque industrial", municipality: "Guadalupe", lat: 25.6812, lng: -100.2366 }],
  },
  {
    name: "Colegio Bilingüe Del Valle", shortName: "Colegio Del Valle", segment: "Comercial", unitId: "u_mty", contactName: "Mtra. Ximena Lozano", domain: "colegiodelvalle",
    services: ["st_prof", "st_san", "st_alf", "st_vid"],
    sites: [{ name: "Campus San Pedro", address: "Calz. del Valle", municipality: "San Pedro Garza García", lat: 25.6574, lng: -100.3618 }],
  },
  {
    name: "Residencial Las Misiones", shortName: "Res. Las Misiones", segment: "Residencial", unitId: "u_mty", contactName: "Adm. Patricia Garza", domain: "lasmisiones",
    services: ["st_prof", "st_obr", "st_pis"],
    sites: [{ name: "Casa club y áreas comunes", address: "Carretera Nacional", municipality: "Monterrey", lat: 25.5591, lng: -100.2449 }],
  },
  {
    name: "Terza", shortName: "Terza", segment: "Industrial", unitId: "u_mty", contactName: "Lic. Ernesto Ochoa", domain: "terza",
    services: ["st_pis", "st_ind", "st_prof"],
    sites: [{ name: "Planta y oficinas", address: "Zona industrial", municipality: "General Escobedo", lat: 25.7966, lng: -100.3195 }],
  },
  {
    name: "PepsiCo", shortName: "PepsiCo", segment: "Industrial", unitId: "u_apo", contactName: "Ing. Daniel Arredondo", domain: "pepsico",
    services: ["st_ind", "st_pis"],
    sites: [{ name: "Centro de distribución", address: "Parque industrial, Blvd. Aeropuerto", municipality: "Apodaca", lat: 25.7713, lng: -100.1709 }],
  },
  {
    name: "Sanhua", shortName: "Sanhua", segment: "Industrial", unitId: "u_apo", contactName: "Ing. Karina Zavala", domain: "sanhua",
    services: ["st_ind", "st_coc", "st_san"],
    sites: [
      { name: "Planta de manufactura", address: "Parque industrial", municipality: "Apodaca", lat: 25.7569, lng: -100.1625 },
      { name: "Comedor industrial", address: "Parque industrial", municipality: "Apodaca", lat: 25.7575, lng: -100.1633 },
    ],
  },
  {
    name: "Viakem", shortName: "Viakem", segment: "Industrial", unitId: "u_apo", contactName: "Ing. Óscar Leal", domain: "viakem",
    services: ["st_ind", "st_san"],
    sites: [{ name: "Planta química", address: "Zona industrial", municipality: "General Escobedo", lat: 25.8095, lng: -100.2962 }],
  },
  {
    name: "Oster", shortName: "Oster", segment: "Comercial", unitId: "u_apo", contactName: "Lic. Mauricio Rangel", domain: "oster",
    services: ["st_pis", "st_vid", "st_prof"],
    sites: [{ name: "Centro logístico", address: "Carr. Miguel Alemán", municipality: "Apodaca", lat: 25.7786, lng: -100.1069 }],
  },
  {
    name: "Torre Habitacional Lumina", shortName: "Torre Lumina", segment: "Residencial", unitId: "u_apo", contactName: "Adm. Sergio Elizondo", domain: "torrelumina",
    services: ["st_prof", "st_vid", "st_obr"],
    sites: [{ name: "Torre Lumina", address: "Av. Pablo Livas", municipality: "Guadalupe", lat: 25.6926, lng: -100.2223 }],
  },
  {
    name: "Lear", shortName: "Lear", segment: "Industrial", unitId: "u_sal", contactName: "Ing. Brenda Valdés", domain: "lear",
    services: ["st_ind", "st_pis", "st_coc"],
    sites: [{ name: "Planta Ramos Arizpe", address: "Parque industrial", municipality: "Ramos Arizpe", lat: 25.5418, lng: -100.9473 }],
  },
  {
    name: "Motherson", shortName: "Motherson", segment: "Industrial", unitId: "u_sal", contactName: "Lic. Rebeca Aguirre", domain: "motherson",
    services: ["st_ind", "st_alf", "st_coc"],
    sites: [{ name: "Planta Saltillo", address: "Zona industrial", municipality: "Saltillo", lat: 25.4483, lng: -100.9827 }],
  },
  {
    name: "Gunderson-GIMSA", shortName: "Gunderson-GIMSA", segment: "Industrial", unitId: "u_sal", contactName: "Ing. Arturo Galindo", domain: "gimsa",
    services: ["st_san", "st_ind"],
    sites: [{ name: "Planta Coahuila", address: "Zona industrial", municipality: "Frontera, Coah.", lat: 26.9286, lng: -101.4510 }],
  },
  {
    name: "Fraccionamiento Los Pinos", shortName: "Fracc. Los Pinos", segment: "Residencial", unitId: "u_sal", contactName: "Adm. Lorena Fuentes", domain: "lospinos",
    services: ["st_obr", "st_prof"],
    sites: [{ name: "Áreas comunes", address: "Blvd. Los Pinos", municipality: "Saltillo", lat: 25.3988, lng: -100.9612 }],
  },
];

const INCIDENT_TEXT: Record<IncidentType, string[]> = {
  danos: ["Se detectó un rayón en piso de mármol del vestíbulo al mover mobiliario.", "Cristal de ventana con estrelladura previa reportada por el cliente.", "Se desprendió un zoclo durante el lavado; se documentó con foto."],
  faltante_material: ["Se agotó la cera acrílica antes de la tercera capa.", "No llegó el desengrasante en la entrega de la mañana.", "Faltaron pads de pulido para la máquina rotativa."],
  faltante_personal: ["Dos integrantes no se presentaron; se reforzó con personal de otra cuadrilla.", "Un trabajador se retiró por motivos de salud a medio turno."],
  trabajo_adicional: ["El cliente solicitó limpiar también la sala de juntas del piso 4.", "Se pidió lavar la cancelería del área de comedor.", "Solicitud de limpieza adicional en estacionamiento."],
  retraso_ausencia: ["Acceso a planta retrasado 45 minutos por protocolo de seguridad.", "El contacto en sitio no estaba disponible para abrir el área.", "Tráfico en Av. Constitución retrasó la llegada de la cuadrilla."],
  solicitud_queja: ["El encargado solicitó repasar los baños del segundo piso.", "Se recibió comentario sobre ruido de la máquina en horario de oficina."],
  otra: ["Corte de agua en el edificio durante 30 minutos.", "Alarma contra incendios activada por mantenimiento externo."],
};

const CASE_TEXT: Record<CaseCategory, string[]> = {
  calidad: ["El cliente reporta manchas en el piso del lobby dos días después del servicio.", "Los vidrios del piso 8 quedaron con marcas de agua."],
  puntualidad: ["La cuadrilla llegó 40 minutos tarde y el cliente tenía evento programado.", "No se respetó el horario acordado de inicio."],
  personal: ["Comentario sobre trato poco cordial con el personal de recepción."],
  danos: ["Reportan daño en una puerta de vidrio del comedor.", "Se reporta rayón en mueble de recepción."],
  faltante: ["Faltó limpiar el área de casilleros incluida en la orden.", "El cliente indica que no se lavaron las escaleras de emergencia."],
  facturacion: ["Solicitan aclaración del alcance cobrado frente a lo ejecutado."],
  otro: ["El cliente pide cambiar el contacto para futuros servicios."],
};

const SURVEY_COMMENTS_GOOD = ["Excelente servicio, muy puntuales.", "La cuadrilla fue muy respetuosa y ordenada.", "Quedó impecable el lobby, gracias.", "Muy buen trabajo, los volveremos a llamar.", "Rápidos y limpios, el reporte con fotos nos ayudó mucho.", "Todo en orden, gracias Daniela por la coordinación."];
const SURVEY_COMMENTS_MEH = ["Bien en general, pero tardaron en iniciar.", "Faltaron algunos detalles en baños.", "El servicio bien, la comunicación puede mejorar."];

const CONFORMITY_NAMES = ["Laura Benavides", "Roberto Garza", "Ana Sofía Cantú", "Marco Treviño", "Gabriela Ríos", "Jesús Salazar", "Patricia Leal", "Iván Montemayor"];

/* ───────────── generator ───────────── */

export function generateSeed(now: Date = new Date()): DataSnapshot & { seededAt: string } {
  rnd = mulberry32(1985);
  const today = startOfDay(now);
  const iso = (dt: Date) => dt.toISOString();
  const at = (day: Date, h: number, m = 0) => setMinutes(setHours(day, h), m);

  const users = USERS;
  const supervisorsByUnit = (unitId: string) => users.filter((u) => u.role === "supervisor" && u.unitId === unitId);
  const adminOf = (unitId: string) => users.find((u) => u.role === "administracion" && u.unitId === unitId)!;

  // workers — 14 per unit
  const workers: Worker[] = [];
  UNITS.forEach((unit, ui) => {
    for (let i = 0; i < 14; i++) {
      const name = `${FIRST[(ui * 14 + i) % FIRST.length]} ${LAST[(ui * 11 + i * 3) % LAST.length]} ${LAST[(ui * 5 + i * 7 + 4) % LAST.length]}`;
      workers.push({
        id: `wrk_${unit.code.toLowerCase()}_${pad(i + 1, 2)}`,
        name,
        initials: initials(name),
        unitId: unit.id,
        specialty: i === 0 ? "Jefe de cuadrilla" : pick(SPECIALTIES),
        phone: `+52 81 0000 ${rint(1000, 9999)}`,
        hue: rint(0, 359),
        active: i !== 13 || unit.code !== "MTY",
      });
    }
  });
  const workersOf = (unitId: string) => workers.filter((w) => w.unitId === unitId && w.active);

  // clients + sites
  const clients: Client[] = [];
  const sites: Site[] = [];
  CLIENT_SEEDS.forEach((cs, ci) => {
    const id = `cli_${pad(ci + 1, 2)}`;
    const siteIds: string[] = [];
    cs.sites.forEach((s, si) => {
      const sid = `${id}_s${si + 1}`;
      siteIds.push(sid);
      sites.push({ ...s, id: sid, clientId: id });
    });
    clients.push({
      id,
      name: cs.name,
      shortName: cs.shortName,
      segment: cs.segment,
      unitId: cs.unitId,
      contactName: cs.contactName,
      contactPhone: `+52 ${cs.unitId === "u_sal" ? "844" : "81"} 0000 ${rint(1000, 9999)}`,
      contactEmail: `contacto.${cs.domain}@ejemplo.mx`,
      since: iso(addDays(today, -rint(200, 2400))),
      hue: [205, 222, 190, 178, 32, 160, 262, 14, 340, 120, 48, 290, 70, 230, 0, 150, 260][ci % 17],
      siteIds,
    });
  });
  const clientServices = (clientId: string) => CLIENT_SEEDS[parseInt(clientId.slice(4)) - 1].services;

  const orders: Order[] = [];
  const jornadas: Jornada[] = [];
  const photos: Photo[] = [];
  const incidents: Incident[] = [];
  const reports: Report[] = [];
  const cases: PostSaleCase[] = [];
  const surveys: Survey[] = [];
  const audit: AuditEntry[] = [];

  let orderN = 0;
  let jorN = 0;
  let photoN = 0;
  let incN = 0;
  let caseN = 0;
  let repN = 0;
  let surN = 0;
  let audN = 0;
  let shareN = 0;
  let folioN = 24120;

  const auditPush = (e: Omit<AuditEntry, "id">) => audit.push({ ...e, id: `aud_${pad(++audN, 5)}` });

  const addPhotos = (o: Order, j: Jornada, kind: "antes" | "despues", count: number, base: Date, by: string, site: Site) => {
    const scenes = SCENES_BY_SERVICE[o.serviceTypeId];
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const scene = scenes[(i + (kind === "despues" ? 0 : 0)) % scenes.length];
      const id = `pho_${pad(++photoN, 5)}`;
      ids.push(id);
      photos.push({
        id,
        orderId: o.id,
        jornadaId: j.id,
        kind,
        area: SCENE_AREAS[scene][(i + j.dayIndex) % SCENE_AREAS[scene].length],
        takenAt: iso(addMinutes(base, i * rint(3, 9))),
        by,
        lat: site.lat + (rand() - 0.5) * 0.0006,
        lng: site.lng + (rand() - 0.5) * 0.0006,
        // Same seed for antes/después of the same area → the before/after slider lines up.
        source: { type: "scene", scene, seed: (parseInt(o.id.slice(4)) * 7 + i * 13 + j.dayIndex) % 997 },
        selectedForReport: i < 2,
      });
    }
    return ids;
  };

  type Build = {
    unitId?: string;
    clientId?: string;
    serviceTypeId?: string;
    supervisorId?: string;
    start: Date; // first day start time
    days?: number;
    status: OrderStatus;
    /** how many jornadas are executed (closed) */
    executedDays?: number;
    /** current jornada in progress (index, 0-based) */
    inProgressDay?: number;
    checkInAt?: Date; // for in-progress
    missingDespues?: boolean;
    openBlockingIncident?: boolean;
    incidents?: number;
    withReport?: boolean;
    shared?: boolean;
    survey?: "none" | "sent" | "answered";
    caseStatus?: PostSaleCase["status"];
    priority?: Order["priority"];
    noCrew?: boolean;
    title?: string;
    createdOffsetDays?: number;
    auditDetail?: boolean;
    exception?: boolean;
    surveyScore?: "good" | "meh" | "bad";
  };

  const buildOrder = (b: Build): Order => {
    const unitId = b.unitId ?? pickWeighted([["u_mty", 0.55], ["u_apo", 0.28], ["u_sal", 0.17]] as const);
    const unitClients = clients.filter((c) => c.unitId === unitId);
    const client = b.clientId ? clients.find((c) => c.id === b.clientId)! : pick(unitClients);
    const siteId = pick(client.siteIds);
    const site = sites.find((s) => s.id === siteId)!;
    const serviceTypeId = b.serviceTypeId ?? pick(clientServices(client.id));
    const st = SERVICE_TYPES.find((s) => s.id === serviceTypeId)!;
    const supervisor = b.supervisorId ? users.find((u) => u.id === b.supervisorId)! : pick(supervisorsByUnit(client.unitId));
    const admin = adminOf(client.unitId);
    const days = b.days ?? pickWeighted([[1, 0.7], [2, 0.22], [3, 0.08]] as const);
    const id = `ord_${pad(++orderN, 4)}`;
    const folio = `OS-${++folioN}`;
    const createdAt = addDays(b.start, -(b.createdOffsetDays ?? rint(2, 7)));
    const hoursPerDay = st.defaultHoursPerDay + rint(-1, 1);

    // working days (skip Sundays)
    const dayDates: Date[] = [];
    let cursor = startOfDay(b.start);
    while (dayDates.length < days) {
      if (!isSunday(cursor)) dayDates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    const startH = b.start.getHours();
    const startM = b.start.getMinutes();

    const crewSize = serviceTypeId === "st_ind" ? rint(4, 7) : rint(2, 5);
    const crew = b.noCrew ? [] : sample(workersOf(client.unitId), crewSize).map((w) => w.id);

    const order: Order = {
      id,
      folio,
      unitId: client.unitId,
      clientId: client.id,
      siteId: site.id,
      serviceTypeId,
      supervisorId: supervisor.id,
      status: b.status,
      title: b.title ?? `${st.name} · ${site.name}`,
      activities: sample(ACTIVITIES[serviceTypeId], rint(3, ACTIVITIES[serviceTypeId].length)),
      materials: SERVICE_MATERIALS[serviceTypeId].map((m) => ({ materialId: m, qty: rint(2, 20) })),
      specialInstructions: pick([
        "Acceso por andén 3. Presentar identificación y EPP completo.",
        "Trabajar en horario sin pacientes en el área de espera.",
        "No mover mobiliario de dirección sin autorización.",
        "Usar productos sin aroma en áreas de alimentos.",
        "Coordinar con seguridad del edificio para el uso del montacargas.",
        "",
      ]),
      siteContact: { name: pick(CONFORMITY_NAMES), phone: `+52 81 0000 ${rint(1000, 9999)}` },
      scheduledStart: iso(at(dayDates[0], startH, startM)),
      scheduledEnd: iso(addMinutes(at(dayDates[dayDates.length - 1], startH, startM), hoursPerDay * 60)),
      plannedDays: days,
      commercialRef: `COT-${format(createdAt, "yyyy")}-${pad(rint(1000, 1999), 4)}`,
      crewHistory: b.noCrew ? [] : [{ at: iso(addMinutes(createdAt, rint(60, 600))), workerIds: crew, by: supervisor.id, reason: "Asignación inicial" }],
      createdAt: iso(at(createdAt, rint(9, 17), rint(0, 59))),
      createdBy: admin.id,
      updatedAt: iso(createdAt),
      priority: b.priority ?? (chance(0.12) ? "alta" : "normal"),
    };
    orders.push(order);

    if (b.auditDetail !== false) {
      auditPush({ at: order.createdAt, by: admin.id, entity: "orden", entityId: id, orderId: id, action: "Alta manual de orden de servicio", reason: `Trabajo autorizado ${order.commercialRef}` });
      if (!b.noCrew) {
        auditPush({ at: order.crewHistory[0].at, by: supervisor.id, entity: "orden", entityId: id, orderId: id, action: `Asignó cuadrilla de ${crew.length} personas` });
        auditPush({ at: order.crewHistory[0].at, by: supervisor.id, entity: "orden", entityId: id, orderId: id, action: "Cambió estado a Programada" });
      }
    }

    const executed = b.executedDays ?? 0;
    let lastCheckout: Date | null = null;
    dayDates.forEach((dd, idx) => {
      const plannedStart = at(dd, startH, startM);
      const plannedEnd = addMinutes(plannedStart, hoursPerDay * 60);
      const j: Jornada = {
        id: `jor_${pad(++jorN, 5)}`,
        orderId: id,
        dayIndex: idx + 1,
        date: format(dd, "yyyy-MM-dd"),
        plannedStart: iso(plannedStart),
        plannedEnd: iso(plannedEnd),
        workerIds: crew,
        status: "pendiente",
        log: [],
      };
      const geo = (t: Date) => ({
        deviceAt: iso(t),
        serverAt: iso(addMinutes(t, rint(0, 3))),
        lat: site.lat + (rand() - 0.5) * 0.0004,
        lng: site.lng + (rand() - 0.5) * 0.0004,
        accuracy: rint(4, 18),
        by: supervisor.id,
        offline: chance(0.12),
        source: "gps" as const,
      });

      if (idx < executed) {
        const inAt = addMinutes(plannedStart, rint(-12, 28));
        const outAt = addMinutes(inAt, hoursPerDay * 60 + rint(-50, 70));
        j.checkIn = geo(inAt);
        j.checkOut = geo(outAt);
        j.status = "cerrada";
        j.log.push({ at: iso(addMinutes(inAt, 5)), by: supervisor.id, text: "Inicio de jornada con cuadrilla completa." });
        j.log.push({ at: iso(addMinutes(outAt, -10)), by: supervisor.id, text: "Revisión final de áreas con contacto en sitio." });
        if (chance(0.6)) {
          // split clock time across the order's activities, rounded to half hours
          const totalH = Math.round(((outAt.getTime() - inAt.getTime()) / 3_600_000) * 2) / 2;
          const weights = order.activities.map(() => 0.5 + rand());
          const wsum = weights.reduce((a, b) => a + b, 0);
          const parts = weights.map((w) => Math.max(0.5, Math.round((totalH * w) / wsum * 2) / 2));
          const diff = totalH - parts.reduce((a, b) => a + b, 0);
          parts[0] = Math.max(0.5, parts[0] + diff);
          j.breakdown = order.activities.map((activity, k) => ({ activity, hours: parts[k] }));
        }
        addPhotos(order, j, "antes", rint(2, 3), addMinutes(inAt, 6), supervisor.id, site);
        const isLast = idx === dayDates.length - 1;
        if (!(b.missingDespues && isLast) && !(b.exception && isLast)) addPhotos(order, j, "despues", rint(2, 3), addMinutes(outAt, -25), supervisor.id, site);
        lastCheckout = outAt;
        if (b.auditDetail !== false) {
          auditPush({ at: j.checkIn.deviceAt, by: supervisor.id, entity: "jornada", entityId: j.id, orderId: id, action: `Registro de entrada · Jornada ${idx + 1} (GPS ±${j.checkIn.accuracy} m)` });
          auditPush({ at: j.checkOut.deviceAt, by: supervisor.id, entity: "jornada", entityId: j.id, orderId: id, action: `Registro de salida · Jornada ${idx + 1} (GPS ±${j.checkOut.accuracy} m)` });
        }
      } else if (b.inProgressDay === idx) {
        const inAt = b.checkInAt ?? addMinutes(plannedStart, rint(-5, 15));
        j.checkIn = { ...geo(inAt), offline: false };
        j.status = "en_curso";
        j.log.push({ at: iso(addMinutes(inAt, 4)), by: supervisor.id, text: "Inicio de jornada. Se entregaron EPP a la cuadrilla." });
        addPhotos(order, j, "antes", 3, addMinutes(inAt, 8), supervisor.id, site);
        if (b.auditDetail !== false)
          auditPush({ at: j.checkIn.deviceAt, by: supervisor.id, entity: "jornada", entityId: j.id, orderId: id, action: `Registro de entrada · Jornada ${idx + 1} (GPS ±${j.checkIn.accuracy} m)` });
      }
      jornadas.push(j);
    });

    // incidents
    const incCount = b.incidents ?? (chance(0.28) ? (chance(0.25) ? 2 : 1) : 0);
    const orderJornadas = jornadas.filter((jj) => jj.orderId === id && jj.checkIn);
    for (let k = 0; k < incCount && orderJornadas.length; k++) {
      const jj = pick(orderJornadas);
      const type = pickWeighted([
        ["faltante_material", 22], ["retraso_ausencia", 20], ["trabajo_adicional", 18], ["danos", 12], ["faltante_personal", 12], ["solicitud_queja", 10], ["otra", 6],
      ] as const) as IncidentType;
      const createdAt = addMinutes(new Date(jj.checkIn!.deviceAt), rint(40, 240));
      const isOpenBlocking = b.openBlockingIncident && k === 0;
      const incId = `inc_${pad(++incN, 4)}`;
      const incPhotoIds: string[] = [];
      if (type === "danos" || chance(0.4)) {
        const pid = `pho_${pad(++photoN, 5)}`;
        incPhotoIds.push(pid);
        const scene = SCENES_BY_SERVICE[serviceTypeId][0];
        photos.push({ id: pid, orderId: id, jornadaId: jj.id, incidentId: incId, kind: "incidencia", area: SCENE_AREAS[scene][0], takenAt: iso(addMinutes(createdAt, 2)), by: supervisor.id, source: { type: "scene", scene, seed: rint(0, 996) }, selectedForReport: true, lat: site.lat, lng: site.lng });
      }
      incidents.push({
        id: incId,
        folio: `INC-${pad(300 + incN, 4)}`,
        orderId: id,
        jornadaId: jj.id,
        type: isOpenBlocking ? "danos" : type,
        severity: isOpenBlocking ? "alta" : pickWeighted([["baja", 45], ["media", 40], ["alta", 15]] as const) as Severity,
        description: isOpenBlocking ? "Se detectó un rayón en piso de mármol del vestíbulo al mover mobiliario. El cliente solicita valoración antes del cierre." : pick(INCIDENT_TEXT[type]),
        photoIds: incPhotoIds,
        status: isOpenBlocking ? "abierta" : "resuelta",
        blocksClosure: !!isOpenBlocking,
        createdAt: iso(createdAt),
        createdBy: supervisor.id,
        ...(isOpenBlocking
          ? {}
          : { resolution: pick(["Se resolvió en sitio y se informó al contacto.", "Se repuso material con entrega urgente.", "Se acordó con el cliente atenderlo en la misma jornada.", "Documentado; sin impacto en el alcance."]), resolvedAt: iso(addMinutes(createdAt, rint(30, 300))), resolvedBy: supervisor.id }),
      });
      if (b.auditDetail !== false) auditPush({ at: iso(createdAt), by: supervisor.id, entity: "incidencia", entityId: incId, orderId: id, action: `Registró incidencia: ${type.replace("_", " ")}` });
    }

    // closure
    const closedStatuses: OrderStatus[] = ["finalizada", "reporte_enviado", "seguimiento", "archivada"];
    if (closedStatuses.includes(b.status) && lastCheckout) {
      const validatedAt = addMinutes(lastCheckout, rint(20, 1600));
      const method = pickWeighted([["firma", 80], ["verbal", 12], ["correo", 8]] as const) as Conformity["method"];
      order.closure = {
        validatedAt: iso(validatedAt),
        validatedBy: supervisor.id,
        summary: `Se realizó ${st.name.toLowerCase()} en ${site.name} conforme a la orden ${folio}. ${order.activities.slice(0, 2).join(". ")}.`,
        conformity: { method, name: order.siteContact.name, role: "Contacto en sitio", at: iso(addMinutes(lastCheckout, -5)) },
        ...(b.exception ? { exception: { reason: "El área quedó bloqueada por el cliente al terminar; fotografía DESPUÉS no disponible. Se envió confirmación por correo.", authorizedBy: supervisor.id, at: iso(validatedAt) } } : {}),
      };
      if (b.auditDetail !== false) auditPush({ at: iso(validatedAt), by: supervisor.id, entity: "orden", entityId: id, orderId: id, action: "Validó cierre definitivo", reason: b.exception ? "Excepción autorizada por falta de foto DESPUÉS" : undefined });

      if (b.withReport !== false) {
        const genAt = addMinutes(validatedAt, rint(10, 900));
        const sel = photos.filter((p) => p.orderId === id && p.selectedForReport && (p.kind === "antes" || p.kind === "despues")).map((p) => p.id);
        const rep: Report = { id: `rep_${pad(++repN, 4)}`, orderId: id, version: 1, generatedAt: iso(genAt), generatedBy: supervisor.id, photoIds: sel, summary: order.closure.summary, shares: [] };
        if (b.shared !== false && b.status !== "finalizada") {
          const ch = chance(0.7) ? "whatsapp" : "email";
          rep.shares.push({ id: `shr_${pad(++shareN, 4)}`, channel: ch, to: ch === "whatsapp" ? order.siteContact.phone : client.contactEmail, at: iso(addMinutes(genAt, rint(2, 40))), by: supervisor.id, note: "Envío iniciado desde el dispositivo · sin confirmación de entrega" });
          if (chance(0.15)) rep.shares.push({ id: `shr_${pad(++shareN, 4)}`, channel: "email", to: client.contactEmail, at: iso(addMinutes(genAt, rint(45, 120))), by: supervisor.id, note: "Envío iniciado desde el dispositivo · sin confirmación de entrega" });
        }
        reports.push(rep);
        if (b.auditDetail !== false) {
          auditPush({ at: rep.generatedAt, by: supervisor.id, entity: "reporte", entityId: rep.id, orderId: id, action: `Generó reporte PDF v${rep.version}` });
          rep.shares.forEach((s) => auditPush({ at: s.at, by: supervisor.id, entity: "reporte", entityId: rep.id, orderId: id, action: `Inició envío por ${s.channel === "whatsapp" ? "WhatsApp" : "correo"}` }));
        }

        // survey
        const surveyMode = b.survey ?? (b.status === "finalizada" ? "none" : chance(0.82) ? (chance(0.7) ? "answered" : "sent") : "none");
        if (surveyMode !== "none" && rep.shares.length) {
          const sentAt = addMinutes(new Date(rep.shares[0].at), rint(60, 1440));
          const sv: Survey = { id: `sur_${pad(++surN, 4)}`, token: token(), orderId: id, clientId: client.id, sentAt: iso(sentAt), sentBy: supervisor.id, channel: rep.shares[0].channel, manual: false };
          if (surveyMode === "answered") {
            const mood = b.surveyScore ?? pickWeighted([["good", 78], ["meh", 17], ["bad", 5]] as const);
            const base = mood === "good" ? 5 : mood === "meh" ? 4 : 2;
            const s = () => Math.max(1, Math.min(5, base - (chance(0.3) ? 1 : 0)));
            sv.respondedAt = iso(addMinutes(sentAt, rint(90, 4000)));
            sv.answers = {
              overall: s(), quality: s(), punctuality: s(), staff: s(),
              nps: mood === "good" ? rint(9, 10) : mood === "meh" ? rint(7, 8) : rint(3, 6),
              comment: chance(0.7) ? (mood === "good" ? pick(SURVEY_COMMENTS_GOOD) : pick(SURVEY_COMMENTS_MEH)) : undefined,
            };
            sv.respondentName = order.siteContact.name;
            sv.manual = chance(0.12);
          }
          surveys.push(sv);
        }
      }

      // post-sale case
      const wantCase = b.caseStatus ? true : chance(0.07);
      if (wantCase) {
        const category = pickWeighted([["calidad", 35], ["puntualidad", 18], ["faltante", 18], ["danos", 12], ["personal", 8], ["facturacion", 5], ["otro", 4]] as const) as CaseCategory;
        const createdAtC = addMinutes(new Date(order.closure.validatedAt), rint(600, 4000));
        const status = b.caseStatus ?? pickWeighted([["cerrado", 60], ["resuelto", 25], ["en_proceso", 10], ["abierto", 5]] as const);
        const owner = chance(0.5) ? supervisor.id : admin.id;
        const pc: PostSaleCase = {
          id: `cas_${pad(++caseN, 4)}`,
          folio: `PV-${pad(40 + caseN, 4)}`,
          orderId: id,
          clientId: client.id,
          category,
          severity: pickWeighted([["baja", 30], ["media", 50], ["alta", 20]] as const) as Severity,
          channel: pickWeighted([["telefono", 30], ["whatsapp", 35], ["correo", 15], ["encuesta", 15], ["presencial", 5]] as const) as CaseChannel,
          description: pick(CASE_TEXT[category]),
          ownerId: owner,
          dueDate: iso(addDays(createdAtC, rint(2, 7))),
          status,
          photoIds: [],
          createdAt: iso(createdAtC),
          createdBy: admin.id,
          updatedAt: iso(addMinutes(createdAtC, rint(60, 3000))),
          timeline: [{ at: iso(createdAtC), by: admin.id, text: "Caso registrado y asignado." }],
          ...(status === "resuelto" || status === "cerrado" ? { resolution: pick(["Se programó repaso sin costo y el cliente quedó conforme.", "Se aclaró el alcance con el cliente.", "Se reemplazó la pieza dañada.", "Se ajustó la cuadrilla para futuros servicios."]) } : {}),
        };
        if (status !== "abierto") pc.timeline.push({ at: iso(addMinutes(createdAtC, rint(30, 600))), by: owner, text: "Se contactó al cliente para revisar el caso." });
        if (status === "resuelto" || status === "cerrado") pc.timeline.push({ at: pc.updatedAt, by: owner, text: "Resolución registrada." });
        cases.push(pc);
        if (b.auditDetail !== false) auditPush({ at: pc.createdAt, by: admin.id, entity: "caso", entityId: pc.id, orderId: id, action: `Abrió caso postventa ${pc.folio}` });
      }
    }

    if (b.status === "cancelada") {
      auditPush({ at: iso(addDays(createdAt, 1)), by: admin.id, entity: "orden", entityId: id, orderId: id, action: "Canceló la orden", reason: pick(["El cliente pospuso indefinidamente el servicio.", "Duplicada con otra orden.", "El cliente canceló por cambio de proveedor de mantenimiento."]) });
    }
    return order;
  };

  /* ── historical orders: Jan 1 → today-8 with a growth trend ── */
  const yearStart = startOfYear(today);
  const histEnd = addDays(today, -8);
  const totalDays = Math.max(1, differenceInCalendarDays(histEnd, yearStart));
  for (let i = 0; i <= totalDays; i++) {
    const day = addDays(yearStart, i);
    if (isSunday(day)) continue;
    const lambda = 0.55 + 1.15 * (i / totalDays);
    const count = Math.floor(lambda + rand());
    for (let k = 0; k < count; k++) {
      const age = differenceInCalendarDays(today, day);
      const cancelled = chance(0.03);
      const days = pickWeighted([[1, 0.7], [2, 0.22], [3, 0.08]] as const);
      const status: OrderStatus = cancelled ? "cancelada" : age > 30 ? (chance(0.9) ? "archivada" : "seguimiento") : chance(0.55) ? "seguimiento" : "reporte_enviado";
      buildOrder({
        start: at(day, pick([7, 7, 8, 8, 9, 14]), pick([0, 0, 30])),
        days,
        status,
        executedDays: cancelled ? 0 : days,
        auditDetail: age < 60,
        exception: !cancelled && chance(0.05),
      });
    }
  }

  /* ── live scenarios around today ── */
  const T = today;
  const back = (n: number) => {
    let dt = addDays(T, -n);
    while (isSunday(dt)) dt = addDays(dt, -1);
    return dt;
  };
  const fwd = (n: number) => {
    let dt = addDays(T, n);
    while (isSunday(dt)) dt = addDays(dt, 1);
    return dt;
  };
  const tday = isSunday(T) ? fwd(1) : T;
  // Live scenarios follow the wall clock: crews that checked in ~2.5 h ago, and work starting in ~2 h.
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const liveMin = Math.max(0, Math.floor((minsNow - 150) / 15) * 15);
  const laterMin = Math.min(23 * 60 + 30, Math.ceil((Math.max(minsNow + 90, 8 * 60)) / 30) * 30);
  const live = (offset = 0) => addMinutes(at(tday, 0, 0), liveMin + offset);
  const later = (offset = 0) => addMinutes(at(tday, 0, 0), laterMin + offset);
  const liveCheckIn = (offset: number) => {
    const t = addMinutes(at(tday, 0, 0), liveMin + offset);
    return t > addMinutes(now, -5) ? addMinutes(now, -5) : t;
  };

  // Past week: various late states
  buildOrder({ clientId: "cli_02", serviceTypeId: "st_vid", supervisorId: "sup_daniela", start: at(back(6), 8), days: 1, status: "reporte_enviado", executedDays: 1, survey: "sent" });
  buildOrder({ clientId: "cli_06", serviceTypeId: "st_san", supervisorId: "sup_daniela", start: at(back(5), 15), days: 1, status: "seguimiento", executedDays: 1, survey: "answered", surveyScore: "good" });
  buildOrder({ clientId: "cli_08", serviceTypeId: "st_pis", supervisorId: "sup_jorge", start: at(back(5), 21), days: 2, status: "seguimiento", executedDays: 2, survey: "answered", surveyScore: "meh", caseStatus: "en_proceso" });
  buildOrder({ clientId: "cli_04", serviceTypeId: "st_ind", supervisorId: "sup_sofia", start: at(back(4), 7), days: 1, status: "reporte_enviado", executedDays: 1, survey: "none" });
  buildOrder({ clientId: "cli_09", serviceTypeId: "st_ind", supervisorId: "sup_hector", start: at(back(4), 7), days: 1, status: "seguimiento", executedDays: 1, survey: "answered", surveyScore: "bad", caseStatus: "abierto" });
  buildOrder({ clientId: "cli_15", serviceTypeId: "st_alf", supervisorId: "sup_regina", start: at(back(3), 9), days: 1, status: "reporte_enviado", executedDays: 1, survey: "sent" });
  buildOrder({ clientId: "cli_10", serviceTypeId: "st_coc", supervisorId: "sup_paola", start: at(back(3), 22), days: 1, status: "finalizada", executedDays: 1, withReport: false });

  // ★ Ready to validate — all evidence complete (the hero "Listo para cierre")
  buildOrder({
    clientId: "cli_01", serviceTypeId: "st_prof", supervisorId: "sup_daniela", start: at(back(1), 8), days: 2, status: "pendiente_validacion", executedDays: 2,
    title: "Limpieza profunda de lobby, baños y restaurante", priority: "alta", incidents: 1, createdOffsetDays: 6,
  });
  // Missing DESPUÉS photos on last jornada
  buildOrder({ clientId: "cli_03", serviceTypeId: "st_san", supervisorId: "sup_daniela", start: at(back(1), 15), days: 1, status: "pendiente_validacion", executedDays: 1, missingDespues: true, incidents: 0 });
  // Open blocking incident
  buildOrder({ clientId: "cli_02", serviceTypeId: "st_pis", supervisorId: "sup_jorge", start: at(back(2), 20), days: 1, status: "con_incidencia", executedDays: 1, openBlockingIncident: true, incidents: 1, priority: "alta" });
  // Finalized, report not generated yet
  buildOrder({ clientId: "cli_06", serviceTypeId: "st_alf", supervisorId: "sup_daniela", start: at(back(2), 9), days: 1, status: "finalizada", executedDays: 1, withReport: false, incidents: 0 });
  // Finalized, report generated but not shared
  buildOrder({ clientId: "cli_13", serviceTypeId: "st_vid", supervisorId: "sup_paola", start: at(back(2), 8), days: 1, status: "finalizada", executedDays: 1, shared: false });

  // ★ In progress today — day 2 of 3, checked in this morning
  const multi = buildOrder({
    clientId: "cli_05", serviceTypeId: "st_ind", supervisorId: "sup_daniela", start: addDays(live(), -1), days: 3, status: "en_ejecucion", executedDays: 1, inProgressDay: 1,
    title: "Limpieza industrial de nave de envasado", checkInAt: liveCheckIn(6), incidents: 1, createdOffsetDays: 8,
  });
  void multi;
  buildOrder({ clientId: "cli_11", serviceTypeId: "st_san", supervisorId: "sup_hector", start: live(-30), days: 1, status: "en_ejecucion", executedDays: 0, inProgressDay: 0, checkInAt: liveCheckIn(-19), incidents: 0 });
  buildOrder({ clientId: "cli_14", serviceTypeId: "st_ind", supervisorId: "sup_emilio", start: live(), days: 1, status: "en_ejecucion", executedDays: 0, inProgressDay: 0, checkInAt: liveCheckIn(18), incidents: 0 });

  // Multi-day: first jornada closed, next one tomorrow
  buildOrder({ clientId: "cli_07", serviceTypeId: "st_obr", supervisorId: "sup_sofia", start: at(back(1), 8), days: 3, status: "jornada_cerrada", executedDays: 1, incidents: 1 });

  // ★ Scheduled today — needs check-in
  buildOrder({ clientId: "cli_08", serviceTypeId: "st_prof", supervisorId: "sup_daniela", start: later(), days: 1, status: "programada", executedDays: 0, incidents: 0, title: "Limpieza profunda de comedor y oficinas" });
  buildOrder({ clientId: "cli_04", serviceTypeId: "st_coc", supervisorId: "sup_jorge", start: later(60), days: 1, status: "programada", executedDays: 0, incidents: 0 });
  buildOrder({ clientId: "cli_16", serviceTypeId: "st_san", supervisorId: "sup_regina", start: later(30), days: 1, status: "programada", executedDays: 0, incidents: 0 });

  // Reprogrammed
  const repro = buildOrder({ clientId: "cli_12", serviceTypeId: "st_pis", supervisorId: "sup_paola", start: at(fwd(3), 20), days: 1, status: "reprogramada", executedDays: 0, incidents: 0 });
  auditPush({ at: iso(addDays(T, -1)), by: "usr_adm_apo", entity: "orden", entityId: repro.id, orderId: repro.id, action: "Reprogramó la orden", reason: "El cliente movió la fecha por su inventario anual." });

  // Drafts (admin created, no crew yet)
  buildOrder({ clientId: "cli_17", serviceTypeId: "st_obr", supervisorId: "sup_emilio", start: at(fwd(4), 8), days: 2, status: "borrador", executedDays: 0, noCrew: true, incidents: 0, createdOffsetDays: 0 });
  buildOrder({ clientId: "cli_01", serviceTypeId: "st_coc", supervisorId: "sup_daniela", start: at(fwd(2), 23), days: 1, status: "borrador", executedDays: 0, noCrew: true, incidents: 0, createdOffsetDays: 0, title: "Desengrase de cocina del restaurante" });

  // Upcoming two weeks
  const upcomingPlan: [number, number, string?][] = [
    [1, 7, "sup_daniela"], [1, 8], [1, 15], [2, 7], [2, 9, "sup_daniela"], [3, 8], [4, 7, "sup_daniela"], [4, 14], [5, 8], [6, 7],
    [6, 9, "sup_daniela"], [7, 8], [8, 7], [8, 14], [9, 8, "sup_daniela"], [10, 7], [11, 9], [12, 8], [13, 7, "sup_daniela"],
  ];
  upcomingPlan.forEach(([off, h, sup]) => {
    const supervisorId = sup;
    const unitId = sup ? "u_mty" : undefined;
    buildOrder({ unitId, supervisorId, start: at(fwd(off), h), days: pickWeighted([[1, 0.65], [2, 0.25], [3, 0.1]] as const), status: "programada", executedDays: 0, incidents: 0 });
  });

  // Sort newest first for convenience
  orders.sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
  audit.sort((a, b) => b.at.localeCompare(a.at));

  return {
    seededAt: now.toISOString(),
    units: UNITS,
    users,
    workers,
    clients,
    sites,
    serviceTypes: SERVICE_TYPES,
    materials: MATERIALS,
    orders,
    jornadas,
    photos,
    incidents,
    reports,
    cases,
    surveys,
    audit,
  };
}

/** Shift every ISO datetime in a snapshot by N days (keeps the demo anchored to today). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/;
export function shiftSnapshotDates<T>(value: T, days: number): T {
  if (days === 0) return value;
  const shift = (v: unknown): unknown => {
    if (typeof v === "string" && ISO_RE.test(v)) {
      if (v.length === 10) return format(addDays(new Date(`${v}T12:00:00`), days), "yyyy-MM-dd");
      return addDays(new Date(v), days).toISOString();
    }
    if (Array.isArray(v)) return v.map(shift);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = k === "signatureDataUrl" ? val : shift(val);
      return out;
    }
    return v;
  };
  return shift(value) as T;
}
