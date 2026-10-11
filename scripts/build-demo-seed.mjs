// Builds supabase/seed/demo.sql: the app's demo dataset (src/lib/seed.ts → generateSeed) mapped to the database schema
// (supabase/migrations), split into self-contained transactions ("chunks") that register every row they insert in
// private.demo_rows, so `select private.drop_demo_data();` removes the whole demo in one call. See supabase/seed/README.md.
//
// Usage: node scripts/build-demo-seed.mjs
//   DEMO_TZ           wall-clock time zone the dataset is anchored to (default America/Monterrey, where Pulkro operates)
//   DEMO_NOW          ISO instant used as "now" (default: the current time; the app calls generateSeed(new Date()))
//   DEMO_CHUNK_BYTES  maximum size of one chunk (default 45000) so each execute_sql call stays reasonable
//   DEMO_SAMPLE=auto  dry-run aid: only a representative subset of orders, all in ONE transaction that ends in ROLLBACK,
//                     written to DEMO_OUT (required) instead of supabase/seed/demo.sql. Run it on a disposable database (a
//                     branch or a scratch project) without the demo loaded: sequences are not transactional, so it uses up
//                     folio and audit numbers, and it never moves them back — another session may already hold later ones.
//
// Encoding (keeps the file small enough to load through the Supabase MCP): times are Unix epoch seconds (or seconds
// relative to the row's own reference time); app ids are rebuilt from their numbers (12 → 'ord_0012') and mapped with
// private.demo_uuid(); values the seed derives from other values (folios, titles, crew per day, bitácora entries, notes,
// closure summaries, share recipients…) are derived the same way in SQL. Every derivation is asserted here against the
// generated dataset, and the last chunk compares an md5 fingerprint of every loaded table with the one computed here
// from the app dataset itself — so a wrong derivation cannot go unnoticed.
process.env.TZ = process.env.DEMO_TZ || 'America/Monterrey';

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dateFns = require('date-fns');
const { addDays, format, setHours, startOfDay, startOfYear } = dateFns;
const TZ = process.env.TZ;
// TZ is embedded in generated SQL literals and in the file header: an IANA name only (no quotes, no spaces).
assert.match(TZ, /^[A-Za-z0-9_+/.-]+$/, `DEMO_TZ must be an IANA time zone name, got ${JSON.stringify(TZ)}`);

/** Transpiles one TS module and runs it in this realm; `modules` resolves its imports (anything else is an error). */
function load(file, modules = {}) {
  const abs = path.join(root, file);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function (exports, require, module) {\n${js}\n})`, { filename: abs })(
    module.exports,
    (name) => {
      if (name in modules) return modules[name];
      throw new Error(`${file}: unexpected import ${name}`);
    },
    module,
  );
  return module.exports;
}

const { generateSeed, SEED_VERSION } = load('src/lib/seed.ts', { 'date-fns': dateFns });
const { canSeeOrder } = load('src/lib/permissions.ts');

const now = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
assert.ok(!Number.isNaN(now.getTime()), 'DEMO_NOW is not a valid date');
const seed = generateSeed(now);
const SAMPLE = process.env.DEMO_SAMPLE;
if (SAMPLE) {
  assert.ok(process.env.DEMO_OUT, 'DEMO_SAMPLE needs DEMO_OUT (the sample never overwrites supabase/seed/demo.sql)');
  // the first order of each kind: status × bitácora detail, post-sale case status, closure exception, open incident,
  // incident, survey answered manually, cancellation / rescheduling note
  const keep = new Set();
  const seen = new Set();
  for (const o of [...seed.orders].sort((a, b) => a.id.localeCompare(b.id))) {
    const tags = [
      `status:${o.status}:${seed.audit.some((a) => a.orderId === o.id)}`,
      ...seed.cases.filter((c) => c.orderId === o.id).map((c) => `case:${c.status}`),
      ...(o.closure?.exception ? ['exception'] : []),
      ...seed.incidents.filter((i) => i.orderId === o.id).map((i) => `incident:${i.status}`),
      ...seed.surveys.filter((v) => v.orderId === o.id && v.manual).map(() => 'manual survey'),
      ...seed.audit.filter((a) => a.orderId === o.id && /Canceló|Reprogramó/.test(a.action)).map((a) => a.action.split(' ')[0]),
    ];
    if (tags.some((t) => !seen.has(t))) keep.add(o.id);
    tags.forEach((t) => seen.add(t));
  }
  const byOrder = (xs) => xs.filter((x) => keep.has(x.orderId));
  Object.assign(seed, {
    orders: seed.orders.filter((o) => keep.has(o.id)), jornadas: byOrder(seed.jornadas), photos: byOrder(seed.photos),
    incidents: byOrder(seed.incidents), reports: byOrder(seed.reports), cases: byOrder(seed.cases), surveys: byOrder(seed.surveys),
    audit: byOrder(seed.audit),
  });
}
const NOW_MS = now.getTime();
const CHUNK_BYTES = Number(process.env.DEMO_CHUNK_BYTES || 45000);
const DEMO_DOMAIN = 'demo.pulkro.test';
// Units, accounts and catalogs predate the first historical order (Jan 1): stamped the day before, 09:00 local.
const CATALOG_AT = setHours(addDays(startOfYear(startOfDay(now)), -1), 9).toISOString();

/* ───────────── helpers ───────────── */

const NS = '010bd357-25ea-5b0b-9a32-47d44503f380'; // = uuid_v5(DNS, 'demo.pulkro.test'), same as private.demo_uuid()
function uuid(appId) {
  const h = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(NS.replace(/-/g, ''), 'hex'), Buffer.from(appId, 'utf8')])).digest();
  const b = h.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
assert.equal(uuid('sup_daniela'), 'e85de2d4-428a-59fa-8d56-c9db8c46d39d'); // checked against the database

const clamped = new Map(); // "table.column" → how many future "already happened" times were capped at now
const clampedSeen = new Set();
/** Server-side times cannot be in the future: the seed puts some follow-ups (answers, cases…) after "now"; cap them. */
function past(iso, label) {
  if (iso == null) return null;
  const t = new Date(iso).getTime();
  assert.ok(!Number.isNaN(t), `bad date ${iso} (${label})`);
  if (t <= NOW_MS) return iso;
  if (label !== 'x' && !clampedSeen.has(`${label}|${iso}`)) {
    clampedSeen.add(`${label}|${iso}`);
    clamped.set(label, (clamped.get(label) ?? 0) + 1);
  }
  return now.toISOString();
}
const ep = (iso) => (iso == null ? null : Math.floor(new Date(iso).getTime() / 1000));
const ms = (iso) => new Date(iso).getTime();
const maxIso = (...xs) => xs.filter(Boolean).reduce((a, b) => (ms(b) > ms(a) ? b : a));
const localDate = (iso) => format(new Date(iso), 'yyyy-MM-dd');
const num = (id, prefix, width) => {
  assert.match(id, new RegExp(`^${prefix}_\\d{${width}}$`), `id ${id}`);
  return Number(id.slice(prefix.length + 1));
};
const pad = (n, w) => String(n).padStart(w, '0');
const demoEmail = (email) => {
  const [local, domain] = email.split('@');
  assert.ok(local && domain, `bad email ${email}`);
  return `${local}@${DEMO_DOMAIN}`;
};
const PHONE_RE = /^\+52 (81|844) 0000 \d{4}$/; // non-dialable (0000 exchange)
const phone = (p) => {
  assert.match(p, PHONE_RE, `phone ${p} must stay non-dialable`);
  return p;
};
const same = (a, b, msg) => assert.deepEqual(a, b, msg);

/** SQL literal. Strings are standard-conforming ('' escapes a quote); arrays become '{…}' text (cast in SQL). */
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    assert.ok(Number.isFinite(v), 'non-finite number');
    return String(v);
  }
  if (Array.isArray(v)) {
    assert.ok(v.every((x) => typeof x === 'number'), 'only numeric arrays are emitted');
    return `'{${v.join(',')}}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}
const row = (vals) => `(${vals.map(lit).join(', ')})`;
const tsLit = (iso) => `'${new Date(iso).toISOString().replace('.000Z', 'Z')}'`;

/* ───────────── signature placeholder (closures with conformity 'firma' require one) ───────────── */

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A generic pen squiggle (1-bit, transparent background) — clearly a placeholder, nobody's signature. */
function signatureDataUrl() {
  const W = 180, H = 56, stride = Math.ceil(W / 8) + 1;
  const raw = Buffer.alloc(stride * H);
  const dot = (x, y) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.round(x + dx * 0.6), py = Math.round(y + dy * 0.6);
        if (px >= 0 && px < W && py >= 0 && py < H) raw[py * stride + 1 + (px >> 3)] |= 0x80 >> (px & 7);
      }
  };
  for (let i = 0; i <= 2400; i++) {
    const t = i / 2400;
    dot(14 + 146 * t + 8 * Math.sin(2 * Math.PI * 6 * t), 27 + 11 * Math.sin(2 * Math.PI * 3 * t + 0.6) - 7 * Math.cos(2 * Math.PI * 6 * t));
  }
  for (let x = 30; x <= 150; x++) dot(x, 47 + 1.5 * Math.sin(x / 9));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.from([0, 0, 0, W, 0, 0, 0, H, 1, 3, 0, 0, 0])),
    pngChunk('PLTE', Buffer.from([255, 255, 255, 2, 58, 99])), // white (transparent), Pulkro navy #023A63
    pngChunk('tRNS', Buffer.from([0])),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
const SIGNATURE = signatureDataUrl();

/* ───────────── dataset indexes ───────────── */

const users = new Map(seed.users.map((u) => [u.id, u]));
const units = new Map(seed.units.map((u) => [u.id, u]));
const clients = new Map(seed.clients.map((c) => [c.id, c]));
const sites = new Map(seed.sites.map((s) => [s.id, s]));
const sts = new Map(seed.serviceTypes.map((s) => [s.id, s]));
const orders = [...seed.orders].sort((a, b) => num(a.id, 'ord', 4) - num(b.id, 'ord', 4)); // creation order
const ordersById = new Map(orders.map((o) => [o.id, o]));
const group = (xs, key) => {
  const m = new Map();
  for (const x of xs) m.set(x[key], [...(m.get(x[key]) ?? []), x]);
  return m;
};
const jornadasByOrder = group(seed.jornadas, 'orderId');
for (const js of jornadasByOrder.values()) js.sort((a, b) => a.dayIndex - b.dayIndex);
const incidentsByOrder = group(seed.incidents, 'orderId');
const casesByOrder = group(seed.cases, 'orderId');
const reportsByOrder = group(seed.reports, 'orderId');
const surveysByOrder = group(seed.surveys, 'orderId');
const auditByOrder = group(seed.audit.filter((a) => a.orderId), 'orderId');
const unitCode = (unitId) => units.get(unitId).code.toLowerCase();
const adminOf = (unitId) => `usr_adm_${unitCode(unitId)}`;

/* ───────────── server-side times of the mutable rows (shared by the encoder and the fingerprints) ───────────── */

const T = {}; // per order id: { created, updated, crew }
for (const o of orders) {
  const js = jornadasByOrder.get(o.id) ?? [];
  const lastChange = maxIso(
    o.createdAt, ...o.crewHistory.map((c) => c.at), ...js.flatMap((j) => [j.checkIn?.serverAt, j.checkOut?.serverAt]),
    o.closure?.validatedAt, ...(reportsByOrder.get(o.id) ?? []).flatMap((r) => r.shares.map((s) => s.at)),
    ...(casesByOrder.get(o.id) ?? []).map((c) => c.createdAt), ...(auditByOrder.get(o.id) ?? []).map((a) => a.at),
  );
  T[o.id] = {
    created: past(o.createdAt, 'orders.created_at'),
    updated: past(lastChange, 'orders.updated_at'),
    crew: o.crewHistory[0] ? past(o.crewHistory[0].at, 'crew_changes.created_at') : null,
  };
}
const jornadaUpdated = (j) => maxIso(T[j.orderId].created, j.checkIn?.serverAt, j.checkOut?.serverAt);
const closureSummary = (o) => {
  const st = sts.get(o.serviceTypeId), site = sites.get(o.siteId);
  return `Se realizó ${st.name.toLowerCase()} en ${site.name} conforme a la orden ${o.folio}. ${o.activities.slice(0, 2).join('. ')}.`;
};
const lastCheckout = (o) => (jornadasByOrder.get(o.id) ?? []).filter((j) => j.checkOut).map((j) => j.checkOut.deviceAt).reduce((a, b) => (ms(b) > ms(a) ? b : a));
const NOTE_START = 'Inicio de jornada con cuadrilla completa.';
const NOTE_END = 'Revisión final de áreas con contacto en sitio.';
const NOTE_LIVE = 'Inicio de jornada. Se entregaron EPP a la cuadrilla.';
const SHARE_NOTE = 'Envío iniciado desde el dispositivo · sin confirmación de entrega';
const EXCEPTION_REASON = 'El área quedó bloqueada por el cliente al terminar; fotografía DESPUÉS no disponible. Se envió confirmación por correo.';
const EXCEPTION_AUDIT = 'Excepción autorizada por falta de foto DESPUÉS';
const CASE_EVENTS = ['Caso registrado y asignado.', 'Se contactó al cliente para revisar el caso.', 'Resolución registrada.'];

/* ───────────── derivation rules, asserted against the generated dataset ───────────── */

const FOLIO_BASE = Number(orders[0].folio.slice(3)) - num(orders[0].id, 'ord', 4);
const dictAct = new Map(); // service type → activities in first-seen order
const dictMat = new Map(); // service type → material ids
const dictInstr = []; // special instructions (non-empty)
for (const o of orders) {
  const n = num(o.id, 'ord', 4);
  const c = clients.get(o.clientId), site = sites.get(o.siteId), st = sts.get(o.serviceTypeId);
  assert.equal(o.folio, `OS-${FOLIO_BASE + n}`, `${o.id} folio`);
  assert.equal(o.unitId, c.unitId, `${o.id} unit = client unit`);
  assert.equal(o.createdBy, adminOf(o.unitId), `${o.id} created by the unit's Administración`);
  assert.match(o.siteId, new RegExp(`^${o.clientId}_s\\d$`));
  for (const k of ['previousStatus', 'reopenedAt', 'archivedAt']) assert.equal(o[k], undefined, `${o.id}.${k} is not mapped`);
  assert.match(o.siteContact.phone, /^\+52 81 0000 \d{4}$/);
  const acts = dictAct.get(st.id) ?? [];
  for (const a of o.activities) if (!acts.includes(a)) acts.push(a);
  dictAct.set(st.id, acts);
  const mats = o.materials.map((m) => m.materialId);
  if (dictMat.has(st.id)) same(mats, dictMat.get(st.id), `${o.id} materials follow the service type`);
  else dictMat.set(st.id, mats);
  if (o.specialInstructions && !dictInstr.includes(o.specialInstructions)) dictInstr.push(o.specialInstructions);
  assert.ok(o.crewHistory.length <= 1, `${o.id} crew history`);
  const crew = o.crewHistory[0];
  if (crew) {
    assert.equal(crew.reason, 'Asignación inicial');
    assert.equal(crew.by, o.supervisorId);
    assert.equal(crew.jornadaId, undefined);
    for (const w of crew.workerIds) assert.match(w, new RegExp(`^wrk_${unitCode(o.unitId)}_\\d{2}$`));
  }
  const js = jornadasByOrder.get(o.id);
  assert.ok(js?.length, `${o.id} jornadas`);
  assert.equal(o.plannedDays, js.length);
  assert.equal(o.scheduledStart, js[0].plannedStart);
  assert.equal(o.scheduledEnd, js.at(-1).plannedEnd);
  js.forEach((j, i) => {
    assert.equal(j.dayIndex, i + 1);
    num(j.id, 'jor', 5);
    same(j.workerIds, crew ? crew.workerIds : [], `${j.id} crew`);
    assert.equal(j.date, localDate(j.plannedStart), `${j.id} date`);
    assert.equal((ms(j.plannedEnd) - ms(j.plannedStart)) % 60000, 0);
    assert.equal(j.breakdownNote, undefined);
    if (j.breakdown) same(j.breakdown.map((b) => b.activity), o.activities, `${j.id} breakdown follows the activities`);
    assert.equal(j.status, j.checkOut ? 'cerrada' : j.checkIn ? 'en_curso' : 'pendiente', `${j.id} status`);
    for (const g of [j.checkIn, j.checkOut].filter(Boolean)) {
      assert.equal(g.source, 'gps');
      assert.equal(g.by, o.supervisorId);
      assert.equal(g.note, undefined);
      assert.ok(ms(g.deviceAt) <= NOW_MS && ms(g.serverAt) <= NOW_MS, `${j.id} check in the future`);
      const d = ms(g.serverAt) - ms(g.deviceAt);
      assert.ok(d >= 0 && d <= 180000 && d % 60000 === 0, `${j.id} server delay`);
    }
    const expectedLog = j.status === 'cerrada'
      ? [{ at: new Date(ms(j.checkIn.deviceAt) + 5 * 60000).toISOString(), by: o.supervisorId, text: NOTE_START },
        { at: new Date(ms(j.checkOut.deviceAt) - 10 * 60000).toISOString(), by: o.supervisorId, text: NOTE_END }]
      : j.status === 'en_curso'
        ? [{ at: new Date(ms(j.checkIn.deviceAt) + 4 * 60000).toISOString(), by: o.supervisorId, text: NOTE_LIVE }]
        : [];
    same(j.log, expectedLog, `${j.id} bitácora notes`);
  });
  const reps = reportsByOrder.get(o.id) ?? [];
  assert.ok(reps.length <= 1);
  if (o.closure) {
    const cl = o.closure;
    assert.equal(cl.summary, closureSummary(o), `${o.id} closure summary`);
    assert.equal(cl.validatedBy, o.supervisorId);
    same({ name: cl.conformity.name, role: cl.conformity.role, at: cl.conformity.at, sig: cl.conformity.signatureDataUrl },
      { name: o.siteContact.name, role: 'Contacto en sitio', at: new Date(ms(lastCheckout(o)) - 5 * 60000).toISOString(), sig: undefined }, `${o.id} conformity`);
    if (cl.exception) same(cl.exception, { reason: EXCEPTION_REASON, authorizedBy: o.supervisorId, at: cl.validatedAt }, `${o.id} exception`);
  }
  for (const r of reps) {
    num(r.id, 'rep', 4);
    assert.equal(r.version, 1);
    assert.equal(r.generatedBy, o.supervisorId);
    assert.equal(r.summary, o.closure.summary);
    for (const s of r.shares) {
      num(s.id, 'shr', 4);
      assert.equal(s.by, o.supervisorId);
      assert.equal(s.note, SHARE_NOTE);
      assert.equal(s.to, s.channel === 'whatsapp' ? o.siteContact.phone : c.contactEmail, `${s.id} recipient`);
    }
  }
  for (const i of incidentsByOrder.get(o.id) ?? []) {
    assert.equal(i.folio, `INC-${pad(300 + num(i.id, 'inc', 4), 4)}`);
    assert.equal(i.createdBy, o.supervisorId);
    assert.equal(i.status === 'resuelta', !!i.resolvedAt);
    if (i.resolvedAt) assert.equal(i.resolvedBy, o.supervisorId);
    assert.equal(seed.jornadas.find((j) => j.id === i.jornadaId)?.orderId, o.id);
  }
  for (const pc of casesByOrder.get(o.id) ?? []) {
    assert.equal(pc.folio, `PV-${pad(40 + num(pc.id, 'cas', 4), 4)}`);
    assert.equal(pc.clientId, o.clientId);
    assert.equal(pc.createdBy, adminOf(o.unitId));
    if (pc.status === 'resuelto' || pc.status === 'cerrado') assert.ok(pc.resolution?.trim(), `${pc.id} resolution required`);
    const expected = [{ at: pc.createdAt, by: pc.createdBy, text: CASE_EVENTS[0] }];
    if (pc.status !== 'abierto') expected.push({ at: pc.timeline[1]?.at, by: pc.ownerId, text: CASE_EVENTS[1] });
    if (pc.status === 'resuelto' || pc.status === 'cerrado') expected.push({ at: pc.updatedAt, by: pc.ownerId, text: CASE_EVENTS[2] });
    same(pc.timeline, expected, `${pc.id} timeline`);
    assert.ok(ms(pc.updatedAt) >= ms(pc.createdAt));
  }
  for (const s of surveysByOrder.get(o.id) ?? []) {
    num(s.id, 'sur', 4);
    assert.equal(s.clientId, o.clientId);
    assert.equal(s.sentBy, o.supervisorId);
    assert.equal(s.respondentName, s.respondedAt ? o.siteContact.name : undefined);
    if (s.manual) assert.ok(s.respondedAt);
  }
}

// Bitácora: what the app writes for each event of an order with detail (historical orders ≥ 60 days old have none),
// plus the few entries that are not derivable (cancellations, the rescheduling note).
const incidentAuditType = new Map(); // incidents whose bitácora line keeps the type first reported (seed quirk)
for (const a of seed.audit) {
  const m = a.entity === 'incidencia' && /^Registró incidencia: (.+)$/.exec(a.action);
  if (!m) continue;
  const i = seed.incidents.find((x) => x.id === a.entityId);
  if (m[1] !== i.type.replace('_', ' ')) incidentAuditType.set(i.id, m[1].replace(' ', '_'));
}
const auditKey = (e) => [ep(past(e.at, 'x')), e.by, e.entity, e.entityId, e.orderId, e.action, e.reason ?? ''].join('|');
const derivedAudit = (o) => {
  const out = [];
  const add = (at, by, entity, entityId, action, reason) => out.push({ at, by, entity, entityId, orderId: o.id, action, reason });
  add(o.createdAt, o.createdBy, 'orden', o.id, 'Alta manual de orden de servicio', `Trabajo autorizado ${o.commercialRef}`);
  for (const c of o.crewHistory) {
    add(c.at, c.by, 'orden', o.id, `Asignó cuadrilla de ${c.workerIds.length} personas`);
    add(c.at, c.by, 'orden', o.id, 'Cambió estado a Programada');
  }
  for (const j of jornadasByOrder.get(o.id))
    for (const [kind, g] of [['entrada', j.checkIn], ['salida', j.checkOut]])
      if (g) add(g.deviceAt, g.by, 'jornada', j.id, `Registro de ${kind} · Jornada ${j.dayIndex} (GPS ±${g.accuracy} m)`);
  for (const i of incidentsByOrder.get(o.id) ?? [])
    add(i.createdAt, i.createdBy, 'incidencia', i.id, `Registró incidencia: ${(incidentAuditType.get(i.id) ?? i.type).replace('_', ' ')}`);
  if (o.closure) add(o.closure.validatedAt, o.closure.validatedBy, 'orden', o.id, 'Validó cierre definitivo', o.closure.exception ? EXCEPTION_AUDIT : undefined);
  for (const r of reportsByOrder.get(o.id) ?? []) {
    add(r.generatedAt, r.generatedBy, 'reporte', r.id, `Generó reporte PDF v${r.version}`);
    for (const s of r.shares) add(s.at, s.by, 'reporte', r.id, `Inició envío por ${s.channel === 'whatsapp' ? 'WhatsApp' : 'correo'}`);
  }
  for (const pc of casesByOrder.get(o.id) ?? []) add(pc.createdAt, pc.createdBy, 'caso', pc.id, `Abrió caso postventa ${pc.folio}`);
  return out;
};
const detailOrders = orders.filter((o) => (auditByOrder.get(o.id) ?? []).some((a) => a.action === 'Alta manual de orden de servicio'));
const remaining = new Map();
for (const a of seed.audit) {
  assert.ok(a.orderId, `${a.id} without order`);
  const k = auditKey(a);
  remaining.set(k, [...(remaining.get(k) ?? []), a]);
}
for (const o of detailOrders)
  for (const e of derivedAudit(o)) {
    const k = auditKey(e);
    assert.ok(remaining.get(k)?.length, `derived bitácora entry not in the dataset: ${k}`);
    remaining.get(k).pop();
  }
const extraAudit = [...remaining.values()].flat().sort((a, b) => a.id.localeCompare(b.id));
assert.ok(extraAudit.length < 40, `too many non-derivable bitácora entries (${extraAudit.length}): did seed.ts change?`);
const detailRanges = [];
for (const o of detailOrders) {
  const n = num(o.id, 'ord', 4), last = detailRanges.at(-1);
  if (last && last[1] === n - 1) last[1] = n;
  else detailRanges.push([n, n]);
}

/* ───────────── compact rows ───────────── */

const MICRO = (x) => Math.round(x * 1e6);
const actIdx = (o) => o.activities.map((a) => dictAct.get(o.serviceTypeId).indexOf(a) + 1);
const orderRows = new Map(orders.map((o) => {
  const n = num(o.id, 'ord', 4), c = sts.get(o.serviceTypeId), site = sites.get(o.siteId);
  const created = ep(T[o.id].created);
  return [o.id, [
    n, num(o.clientId, 'cli', 2), Number(o.siteId.split('_s')[1]), o.serviceTypeId, o.supervisorId, o.status,
    o.title === `${c.name} · ${site.name}` ? null : o.title, actIdx(o), o.materials.map((m) => m.qty),
    o.specialInstructions ? dictInstr.indexOf(o.specialInstructions) + 1 : null, o.siteContact.name, Number(o.siteContact.phone.slice(-4)),
    o.commercialRef, o.priority, created, ep(T[o.id].updated) - created, o.crewHistory[0] ? o.crewHistory[0].workerIds.map((w) => Number(w.slice(-2))) : [],
    T[o.id].crew ? ep(T[o.id].crew) - created : null,
  ]];
}));
const jornadaRow = (j) => {
  const site = sites.get(ordersById.get(j.orderId).siteId);
  const start = ep(j.plannedStart);
  const check = (g, base) => (g
    ? [ep(g.deviceAt) - base, (ms(g.serverAt) - ms(g.deviceAt)) / 60000, MICRO(g.lat) - MICRO(site.lat), MICRO(g.lng) - MICRO(site.lng), g.accuracy, g.offline]
    : [null, null, null, null, null, null]);
  return [
    num(j.id, 'jor', 5), num(j.orderId, 'ord', 4), j.dayIndex, start, (ms(j.plannedEnd) - ms(j.plannedStart)) / 60000, j.status,
    j.breakdown ? j.breakdown.map((b) => b.hours) : null, ...check(j.checkIn, start), ...check(j.checkOut, j.checkIn ? ep(j.checkIn.deviceAt) : 0),
  ];
};

/* ───────────── SQL statements ───────────── */

const ORD = (col) => `private.demo_uuid('ord_' || lpad(${col}::text, 4, '0'))`;
/** VALUES list as a CTE. `cols` are "name:type": the first row carries the casts, so a column that is null in every row
 *  of a batch still has its type (an all-null column would otherwise resolve to text). */
function valuesCte(name, cols, rows) {
  const names = cols.map((c) => c.split(':')[0]), types = cols.map((c) => c.split(':')[1] ?? 'text');
  if (!rows.length) return `${name} (${names.join(', ')}) as (select ${types.map((t) => `null::${t}`).join(', ')} where false)`;
  const lines = rows.map((r, i) => `  (${r.map((v, k) => (i === 0 ? `${lit(v)}::${types[k]}` : lit(v))).join(', ')})`);
  return `${name} (${names.join(', ')}) as (values\n${lines.join(',\n')}\n)`;
}
const registerUnion = (pairs) => `insert into private.demo_rows (table_name, row_id)\n${pairs.map(([t, cte, col = 'id'], i) => `${i ? 'union all ' : ''}select '${t}', ${col}::text from ${cte}`).join('\n')};`;
const catalog = tsLit(CATALOG_AT);

// Catalogs: explicit rows (small), ids mapped with private.demo_uuid.
function catalogStatement(table, cols, rows, insert, idCol = 'id') {
  return `with ${valuesCte('v', cols, rows)},\nins as (\n  ${insert}\n  returning ${idCol}\n)\n${registerUnion([[table, 'ins', idCol]])}`;
}
const CATALOG_SQL = [
  catalogStatement('auth.users', ['id', 'email'], seed.users.map((u) => [u.id, demoEmail(u.email)]),
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token,
    recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  select '00000000-0000-0000-0000-000000000000'::uuid, private.demo_uuid(v.id), 'authenticated', 'authenticated', v.email, '', ${catalog},
    '', '', '', '', '', '', '', '', '{"provider": "email", "providers": ["email"], "pulkro_demo": true}'::jsonb, '{}'::jsonb,
    ${catalog}, ${catalog}, false, false
  from v`),
  catalogStatement('units', ['id', 'name', 'code', 'city'], seed.units.map((u) => [u.id, u.name, u.code, u.city]),
    `insert into public.units (id, name, code, city, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.code, v.city, ${catalog}, ${catalog} from v`),
  catalogStatement('profiles', ['id', 'name', 'initials', 'role', 'title', 'unit', 'email', 'phone', 'hue:int'],
    seed.users.map((u) => {
      assert.ok(u.initials.length >= 1 && u.initials.length <= 4 && u.active);
      return [u.id, u.name, u.initials, u.role, u.title, u.unitId, demoEmail(u.email), phone(u.phone), u.hue];
    }),
    `insert into public.profiles (id, name, initials, role, title, unit_id, email, phone, hue, active, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.initials, v.role::public.user_role, v.title, private.demo_uuid(v.unit), v.email, v.phone, v.hue, true,
    ${catalog}, ${catalog}
  from v`),
  catalogStatement('workers', ['id', 'name', 'initials', 'unit', 'specialty', 'phone', 'hue:int', 'active:boolean'],
    seed.workers.map((w) => {
      assert.ok(w.initials.length >= 1 && w.initials.length <= 4);
      return [w.id, w.name, w.initials, w.unitId, w.specialty, phone(w.phone), w.hue, w.active];
    }),
    `insert into public.workers (id, name, initials, unit_id, specialty, phone, hue, active, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.initials, private.demo_uuid(v.unit), v.specialty, v.phone, v.hue, v.active, ${catalog}, ${catalog} from v`),
  catalogStatement('clients', ['id', 'name', 'short', 'segment', 'unit', 'contact', 'phone', 'email', 'since:date', 'hue:int'],
    seed.clients.map((c) => [c.id, c.name, c.shortName, c.segment, c.unitId, c.contactName, phone(c.contactPhone), demoEmail(c.contactEmail), localDate(c.since), c.hue]),
    `insert into public.clients (id, name, short_name, segment, unit_id, contact_name, contact_phone, contact_email, since, hue, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.short, v.segment::public.client_segment, private.demo_uuid(v.unit), v.contact, v.phone, v.email,
    v.since::date, v.hue, ${catalog}, ${catalog}
  from v`),
  catalogStatement('sites', ['id', 'client', 'name', 'address', 'municipality', 'lat:float8', 'lng:float8'],
    seed.sites.map((s) => [s.id, s.clientId, s.name, s.address, s.municipality, s.lat, s.lng]),
    `insert into public.sites (id, client_id, name, address, municipality, lat, lng, created_at, updated_at)
  select private.demo_uuid(v.id), private.demo_uuid(v.client), v.name, v.address, v.municipality, v.lat, v.lng, ${catalog}, ${catalog} from v`),
  catalogStatement('service_types', ['id', 'name', 'short', 'hue:int', 'hours:numeric'],
    seed.serviceTypes.map((s) => [s.id, s.name, s.short, s.hue, s.defaultHoursPerDay]),
    `insert into public.service_types (id, name, short, hue, default_hours_per_day, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.short, v.hue, v.hours, ${catalog}, ${catalog} from v`),
  catalogStatement('materials', ['id', 'name', 'unit'], seed.materials.map((m) => [m.id, m.name, m.unit]),
    `insert into public.materials (id, name, unit, created_at, updated_at)
  select private.demo_uuid(v.id), v.name, v.unit, ${catalog}, ${catalog} from v`),
];

// Orders with their jornadas, crew, check-ins/outs and bitácora notes, in one statement per batch.
const DICTS = [
  valuesCte('act', ['st', 'k:int', 'txt'], [...dictAct].flatMap(([st, acts]) => acts.map((a, i) => [st, i + 1, a]))),
  valuesCte('mat', ['st', 'k:int', 'material'], [...dictMat].flatMap(([st, mats]) => mats.map((m, i) => [st, i + 1, m]))),
  valuesCte('instr', ['k:int', 'txt'], dictInstr.map((t, i) => [i + 1, t])),
].join(',\n');
const ORDER_COLS = ['n:int', 'client:int', 'site:int', 'st', 'sup', 'status', 'title', 'act:int[]', 'qty:int[]', 'instr:int', 'contact', 'phone:int',
  'ref', 'prio', 'created:bigint', 'updated_s:int', 'crew:int[]', 'crew_s:int'];
const JORNADA_COLS = ['n:int', 'ord:int', 'day:int', 'start_at:bigint', 'len_m:int', 'status', 'hours:numeric[]', 'in_s:int', 'in_dly:int', 'in_lat:int',
  'in_lng:int', 'in_acc:int', 'in_off:boolean', 'out_s:int', 'out_dly:int', 'out_lat:int', 'out_lng:int', 'out_acc:int', 'out_off:boolean'];
function ordersStatement(batch) {
  const js = batch.flatMap((o) => jornadasByOrder.get(o.id));
  return `with
${DICTS},
${valuesCte('o', ORDER_COLS, batch.map((o) => orderRows.get(o.id)))},
${valuesCte('j', JORNADA_COLS, js.map(jornadaRow))},
oo as (
  select o.*, ${ORD('o.n')} as id, c.id as client_id, c.unit_id, lower(u.code) as unit_code, si.id as site_id, si.name as site_name,
    si.lat as site_lat, si.lng as site_lng, s.id as st_id, s.name as st_name, to_timestamp(o.created) as created_at,
    array(select a.txt from unnest(o.act) with ordinality x(k, n) join act a on a.st = o.st and a.k = x.k order by x.n) as activities,
    array(select private.demo_uuid('wrk_' || lower(u.code) || '_' || lpad(w.x::text, 2, '0'))
          from unnest(o.crew) with ordinality w(x, n) order by w.n) as crew_ids
  from o
  join public.clients c on c.id = private.demo_uuid('cli_' || lpad(o.client::text, 2, '0'))
  join public.units u on u.id = c.unit_id
  join public.sites si on si.id = private.demo_uuid('cli_' || lpad(o.client::text, 2, '0') || '_s' || o.site)
  join public.service_types s on s.id = private.demo_uuid(o.st)
),
jj as (
  select j.*, private.demo_uuid('jor_' || lpad(j.n::text, 5, '0')) as id, oo.id as order_id, oo.sup, oo.crew_ids, oo.activities,
    oo.site_lat, oo.site_lng, oo.created_at, to_timestamp(j.start_at) as ps, to_timestamp(j.start_at + j.in_s) as in_at,
    to_timestamp(j.start_at + j.in_s + j.out_s) as out_at
  from j join oo on oo.n = j.ord
),
ins_orders as (
  insert into public.orders (id, folio, unit_id, client_id, site_id, service_type_id, supervisor_id, status, title, activities, materials,
    special_instructions, site_contact_name, site_contact_phone, scheduled_start, scheduled_end, planned_days, commercial_ref, priority,
    created_by, created_at, updated_at)
  select oo.id, 'OS-' || (${FOLIO_BASE} + oo.n), oo.unit_id, oo.client_id, oo.site_id, oo.st_id, private.demo_uuid(oo.sup),
    oo.status::public.order_status, coalesce(oo.title, oo.st_name || ' · ' || oo.site_name), oo.activities,
    (select coalesce(jsonb_agg(jsonb_build_object('material_id', private.demo_uuid(m.material), 'qty', q.x) order by q.n), '[]')
     from unnest(oo.qty) with ordinality q(x, n) join mat m on m.st = oo.st and m.k = q.n),
    coalesce((select i.txt from instr i where i.k = oo.instr), ''), oo.contact, '+52 81 0000 ' || oo.phone,
    (select min(jj.ps) from jj where jj.ord = oo.n), (select max(jj.ps + jj.len_m * interval '1 minute') from jj where jj.ord = oo.n),
    (select count(*) from jj where jj.ord = oo.n), oo.ref, oo.prio::public.order_priority,
    private.demo_uuid('usr_adm_' || oo.unit_code), oo.created_at, oo.created_at + oo.updated_s * interval '1 second'
  from oo
  returning id
),
ins_jornadas as (
  insert into public.jornadas (id, order_id, day_index, date, planned_start, planned_end, worker_ids, status, breakdown, created_at, updated_at)
  select jj.id, jj.order_id, jj.day, (jj.ps at time zone '${TZ}')::date, jj.ps, jj.ps + jj.len_m * interval '1 minute', jj.crew_ids,
    jj.status::public.jornada_status,
    (select jsonb_agg(jsonb_build_object('activity', a.txt, 'hours', h.x) order by h.n)
     from unnest(jj.hours) with ordinality h(x, n) join unnest(jj.activities) with ordinality a(txt, n) using (n)),
    jj.created_at, greatest(jj.created_at, jj.in_at + jj.in_dly * interval '1 minute', jj.out_at + jj.out_dly * interval '1 minute')
  from jj
  returning id
),
ins_crew as (
  insert into public.crew_changes (id, order_id, worker_ids, reason, created_by, created_at, updated_at)
  select private.demo_uuid('ord_' || lpad(oo.n::text, 4, '0') || ':crew:1'), oo.id, oo.crew_ids, 'Asignación inicial', private.demo_uuid(oo.sup),
    oo.created_at + oo.crew_s * interval '1 second', oo.created_at + oo.crew_s * interval '1 second'
  from oo where oo.crew_s is not null
  returning id
),
ins_checks as (
  insert into public.jornada_checks (id, jornada_id, order_id, kind, device_at, server_at, lat, lng, accuracy, source, offline, created_by,
    created_at, updated_at)
  select private.demo_uuid('jor_' || lpad(jj.n::text, 5, '0') || ':' || k.kind), jj.id, jj.order_id, k.kind::public.check_kind, k.at,
    k.at + k.dly * interval '1 minute', (round(jj.site_lat::numeric, 6) + k.lat / 1000000.0)::double precision,
    (round(jj.site_lng::numeric, 6) + k.lng / 1000000.0)::double precision, k.acc, 'gps', k.off, private.demo_uuid(jj.sup),
    k.at + k.dly * interval '1 minute', k.at + k.dly * interval '1 minute'
  from jj cross join lateral (values
    ('entrada', jj.in_at, jj.in_dly, jj.in_lat, jj.in_lng, jj.in_acc, jj.in_off),
    ('salida', jj.out_at, jj.out_dly, jj.out_lat, jj.out_lng, jj.out_acc, jj.out_off)) k(kind, at, dly, lat, lng, acc, off)
  where k.at is not null
  returning id
),
ins_notes as (
  insert into public.jornada_notes (id, jornada_id, order_id, text, device_at, created_by, created_at, updated_at)
  select private.demo_uuid('jor_' || lpad(jj.n::text, 5, '0') || ':note:' || x.k), jj.id, jj.order_id, x.txt, x.at, private.demo_uuid(jj.sup), x.at, x.at
  from jj cross join lateral (values
    (1, case jj.status when 'cerrada' then ${lit(NOTE_START)} else ${lit(NOTE_LIVE)} end,
        jj.in_at + case jj.status when 'cerrada' then interval '5 minutes' else interval '4 minutes' end),
    (2, ${lit(NOTE_END)}, jj.out_at - interval '10 minutes')) x(k, txt, at)
  where x.at is not null
  returning id
)
${registerUnion([['orders', 'ins_orders'], ['jornadas', 'ins_jornadas'], ['crew_changes', 'ins_crew'], ['jornada_checks', 'ins_checks'], ['jornada_notes', 'ins_notes']])}`;
}

const incidents = [...seed.incidents].sort((a, b) => num(a.id, 'inc', 4) - num(b.id, 'inc', 4));
const incidentsStatement = (batch) => `with ${valuesCte('v', ['n:int', 'ord:int', 'jor:int', 'type', 'severity', 'description', 'status', 'blocks:boolean', 'resolution', 'resolved:bigint', 'at:bigint'],
  batch.map((i) => [num(i.id, 'inc', 4), num(i.orderId, 'ord', 4), num(i.jornadaId, 'jor', 5), i.type, i.severity, i.description, i.status,
    i.blocksClosure, i.resolution ?? null, ep(past(i.resolvedAt, 'incidents.resolved_at')), ep(past(i.createdAt, 'incidents.created_at'))]))},
ins as (
  insert into public.incidents (id, folio, order_id, jornada_id, type, severity, description, status, blocks_closure, resolution, resolved_at,
    resolved_by, device_at, created_by, created_at, updated_at)
  select private.demo_uuid('inc_' || lpad(v.n::text, 4, '0')), 'INC-' || lpad((300 + v.n)::text, 4, '0'), o.id,
    private.demo_uuid('jor_' || lpad(v.jor::text, 5, '0')), v.type::public.incident_type, v.severity::public.severity, v.description,
    v.status::public.incident_status, v.blocks, v.resolution, to_timestamp(v.resolved), case when v.resolved is not null then o.supervisor_id end,
    to_timestamp(v.at), o.supervisor_id, to_timestamp(v.at), to_timestamp(coalesce(v.resolved, v.at))
  from v join public.orders o on o.id = ${ORD('v.ord')}
  returning id
)
${registerUnion([['incidents', 'ins']])}`;

const cases = [...seed.cases].sort((a, b) => num(a.id, 'cas', 4) - num(b.id, 'cas', 4));
const casesStatement = (batch) => `with ${valuesCte('v', ['n:int', 'ord:int', 'category', 'severity', 'channel', 'description', 'owner', 'due:date', 'status', 'resolution', 'at:bigint',
  'contact_at:bigint', 'updated:bigint'],
  batch.map((c) => [num(c.id, 'cas', 4), num(c.orderId, 'ord', 4), c.category, c.severity, c.channel, c.description, c.ownerId, localDate(c.dueDate),
    c.status, c.resolution ?? null, ep(past(c.createdAt, 'post_sale_cases.created_at')),
    c.timeline[1] ? ep(past(c.timeline[1].at, 'case_events.created_at')) : null, ep(past(c.updatedAt, 'post_sale_cases.updated_at'))]))},
vv as (
  select v.*, private.demo_uuid('cas_' || lpad(v.n::text, 4, '0')) as id, o.id as order_id, o.client_id,
    private.demo_uuid('usr_adm_' || lower(u.code)) as admin_id
  from v join public.orders o on o.id = ${ORD('v.ord')} join public.units u on u.id = o.unit_id
),
ins as (
  insert into public.post_sale_cases (id, folio, order_id, client_id, category, severity, channel, description, owner_id, due_date, status,
    resolution, created_by, created_at, updated_at)
  select vv.id, 'PV-' || lpad((40 + vv.n)::text, 4, '0'), vv.order_id, vv.client_id, vv.category::public.case_category,
    vv.severity::public.severity, vv.channel::public.case_channel, vv.description, private.demo_uuid(vv.owner), vv.due::date,
    vv.status::public.case_status, vv.resolution, vv.admin_id, to_timestamp(vv.at), to_timestamp(vv.updated)
  from vv
  returning id
),
ins_events as (
  insert into public.case_events (id, case_id, order_id, text, created_by, created_at, updated_at)
  select private.demo_uuid('cas_' || lpad(vv.n::text, 4, '0') || ':event:' || e.k), vv.id, vv.order_id, e.txt, e.actor, to_timestamp(e.at),
    to_timestamp(e.at)
  from vv cross join lateral (values
    (1, ${lit(CASE_EVENTS[0])}, vv.admin_id, vv.at),
    (2, ${lit(CASE_EVENTS[1])}, private.demo_uuid(vv.owner), case when vv.status <> 'abierto' then vv.contact_at end),
    (3, ${lit(CASE_EVENTS[2])}, private.demo_uuid(vv.owner), case when vv.status in ('resuelto', 'cerrado') then vv.updated end)) e(k, txt, actor, at)
  where e.at is not null
  returning id
)
${registerUnion([['post_sale_cases', 'ins'], ['case_events', 'ins_events']])}`;

const closedOrders = orders.filter((o) => o.closure);
const closuresStatement = (batch) => `with sig (data_url) as (values (${lit(SIGNATURE)})),
${valuesCte('v', ['ord:int', 'method', 'exception:boolean', 'at:bigint'], batch.map((o) => [num(o.id, 'ord', 4), o.closure.conformity.method, !!o.closure.exception,
  ep(past(o.closure.validatedAt, 'order_closures.validated_at'))]))},
ins as (
  insert into public.order_closures (id, order_id, version, summary, conformity_method, conformity_name, conformity_role, conformity_signature,
    conformity_at, exception_reason, exception_authorized_by, exception_at, validated_by, validated_at, device_at, created_at, updated_at)
  select private.demo_uuid('ord_' || lpad(v.ord::text, 4, '0') || ':closure:1'), o.id, 1,
    'Se realizó ' || lower(s.name) || ' en ' || si.name || ' conforme a la orden ' || o.folio || '. ' || array_to_string(o.activities[1:2], '. ') || '.',
    v.method::public.conformity_method, o.site_contact_name, 'Contacto en sitio', case when v.method = 'firma' then (select sig.data_url from sig) end,
    (select max(k.device_at) from public.jornada_checks k where k.order_id = o.id and k.kind = 'salida') - interval '5 minutes',
    case when v.exception then ${lit(EXCEPTION_REASON)} end, case when v.exception then o.supervisor_id end,
    case when v.exception then to_timestamp(v.at) end, o.supervisor_id, to_timestamp(v.at), to_timestamp(v.at), to_timestamp(v.at), to_timestamp(v.at)
  from v
  join public.orders o on o.id = ${ORD('v.ord')}
  join public.service_types s on s.id = o.service_type_id
  join public.sites si on si.id = o.site_id
  returning id
)
${registerUnion([['order_closures', 'ins']])}`;

const reports = [...seed.reports].sort((a, b) => num(a.id, 'rep', 4) - num(b.id, 'rep', 4));
// snapshot: the shape private.generate_report stores, rebuilt from the loaded rows (order status as of version 1 =
// finalizada; no photos: the demo's photos are procedural scenes, not files — see README)
const reportsStatement = (batch) => `with ${valuesCte('v', ['n:int', 'ord:int', 'at:bigint'], batch.map((r) => [num(r.id, 'rep', 4), num(r.orderId, 'ord', 4), ep(past(r.generatedAt, 'reports.generated_at'))]))},
ins as (
  insert into public.reports (id, order_id, closure_id, version, summary, photo_ids, snapshot, generated_by, generated_at, device_at, created_at,
    updated_at)
  select private.demo_uuid('rep_' || lpad(v.n::text, 4, '0')), o.id, c.id, 1, c.summary, '{}', jsonb_build_object(
      'order', jsonb_set(to_jsonb(o) - 'row_version', '{status}', '"finalizada"'),
      'client', (select jsonb_build_object('id', cl.id, 'name', cl.name, 'short_name', cl.short_name) from public.clients cl where cl.id = o.client_id),
      'site', (select to_jsonb(s) - 'row_version' from public.sites s where s.id = o.site_id),
      'service_type', (select jsonb_build_object('id', st.id, 'name', st.name) from public.service_types st where st.id = o.service_type_id),
      'supervisor', (select jsonb_build_object('id', u.id, 'name', u.name, 'title', u.title) from public.profiles u where u.id = o.supervisor_id),
      'closure', to_jsonb(c) - 'conformity_signature',
      'jornadas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', j.id, 'day_index', j.day_index, 'date', j.date, 'planned_start', j.planned_start, 'planned_end', j.planned_end,
          'status', j.status, 'breakdown', j.breakdown,
          'workers', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name), '[]'::jsonb)
                      from public.workers w where w.id = any (j.worker_ids)),
          'checks', (select coalesce(jsonb_agg(to_jsonb(k) - 'updated_at' - 'created_at' order by k.kind), '[]'::jsonb)
                     from public.jornada_checks k where k.jornada_id = j.id)
        ) order by j.day_index), '[]'::jsonb)
        from public.jornadas j where j.order_id = o.id and j.deleted_at is null),
      'incidents', (select coalesce(jsonb_agg(to_jsonb(i) - 'row_version' - 'updated_at' order by i.created_at), '[]'::jsonb)
                    from public.incidents i where i.order_id = o.id),
      'photos', '[]'::jsonb),
    o.supervisor_id, to_timestamp(v.at), to_timestamp(v.at), to_timestamp(v.at), to_timestamp(v.at)
  from v
  join public.orders o on o.id = ${ORD('v.ord')}
  join public.order_closures c on c.order_id = o.id and c.version = 1
  returning id
)
${registerUnion([['reports', 'ins']])}`;

const shares = reports.flatMap((r) => r.shares.map((s) => ({ ...s, reportId: r.id, orderId: r.orderId }))).sort((a, b) => num(a.id, 'shr', 4) - num(b.id, 'shr', 4));
const sharesStatement = (batch) => `with ${valuesCte('v', ['n:int', 'rep:int', 'channel', 'at:bigint'], batch.map((s) => [num(s.id, 'shr', 4), num(s.reportId, 'rep', 4), s.channel, ep(past(s.at, 'report_shares.created_at'))]))},
ins as (
  insert into public.report_shares (id, report_id, order_id, channel, recipient, device_at, created_by, created_at, updated_at)
  select private.demo_uuid('shr_' || lpad(v.n::text, 4, '0')), r.id, o.id, v.channel::public.share_channel,
    case v.channel when 'whatsapp' then o.site_contact_phone else c.contact_email end, to_timestamp(v.at), o.supervisor_id, to_timestamp(v.at), to_timestamp(v.at)
  from v
  join public.reports r on r.id = private.demo_uuid('rep_' || lpad(v.rep::text, 4, '0'))
  join public.orders o on o.id = r.order_id
  join public.clients c on c.id = o.client_id
  returning id
)
${registerUnion([['report_shares', 'ins']])}`;

const surveys = [...seed.surveys].sort((a, b) => num(a.id, 'sur', 4) - num(b.id, 'sur', 4));
const surveysStatement = (batch) => `with ${valuesCte('v', ['n:int', 'ord:int', 'channel', 'manual:boolean', 'sent:bigint', 'responded:bigint', 'overall:smallint', 'quality:smallint',
  'punctuality:smallint', 'staff:smallint', 'nps:smallint', 'comment'],
  batch.map((s) => [num(s.id, 'sur', 4), num(s.orderId, 'ord', 4), s.channel, s.manual, ep(past(s.sentAt, 'surveys.sent_at')), ep(past(s.respondedAt, 'surveys.responded_at')),
    s.answers?.overall ?? null, s.answers?.quality ?? null, s.answers?.punctuality ?? null, s.answers?.staff ?? null, s.answers?.nps ?? null, s.answers?.comment ?? null]))},
ins as (
  insert into public.surveys (id, order_id, client_id, channel, manual, sent_by, sent_at, responded_at, overall, quality, punctuality, staff, nps,
    comment, respondent_name, recorded_by, created_at, updated_at)
  select private.demo_uuid('sur_' || lpad(v.n::text, 4, '0')), o.id, o.client_id, v.channel::public.share_channel, v.manual, o.supervisor_id,
    to_timestamp(v.sent), to_timestamp(v.responded), v.overall, v.quality, v.punctuality, v.staff, v.nps, v.comment,
    case when v.responded is not null then o.site_contact_name end, case when v.manual then o.supervisor_id end,
    to_timestamp(v.sent), to_timestamp(coalesce(v.responded, v.sent))
  from v join public.orders o on o.id = ${ORD('v.ord')}
  returning id
)
${registerUnion([['surveys', 'ins']])}`;

const AUDIT_SQL = `-- bitácora: derived from the loaded rows exactly like the app writes it (orders with detail = the ranges below), plus the
-- entries that cannot be derived; identity ids follow time
with ${valuesCte('detail', ['lo:int', 'hi:int'], detailRanges)},
${valuesCte('inc_type', ['n:int', 'type'], [...incidentAuditType].map(([id, t]) => [num(id, 'inc', 4), t]).sort((a, b) => a[0] - b[0]))},
${valuesCte('extra', ['at:bigint', 'actor', 'entity', 'entity_id', 'ord:int', 'action', 'reason'],
  extraAudit.map((e) => [ep(past(e.at, 'audit_log.at')), e.by, e.entity, e.entityId, num(e.orderId, 'ord', 4), e.action, e.reason ?? null]))},
d as (
  select o.* from public.orders o
  where o.id in (select private.demo_uuid('ord_' || lpad(g::text, 4, '0')) from detail cross join generate_series(detail.lo, detail.hi) g)
),
ev (at, actor, entity, entity_id, order_id, action, reason, rk) as (
  select o.created_at, o.created_by, 'orden', o.id, o.id, 'Alta manual de orden de servicio', 'Trabajo autorizado ' || o.commercial_ref, 1 from d o
  union all
  select c.created_at, c.created_by, 'orden', o.id, o.id, 'Asignó cuadrilla de ' || cardinality(c.worker_ids) || ' personas', null, 2
  from d o join public.crew_changes c on c.order_id = o.id
  union all
  select c.created_at, c.created_by, 'orden', o.id, o.id, 'Cambió estado a Programada', null, 3
  from d o join public.crew_changes c on c.order_id = o.id
  union all
  select k.device_at, k.created_by, 'jornada', k.jornada_id, o.id,
    'Registro de ' || k.kind || ' · Jornada ' || j.day_index || ' (GPS ±' || k.accuracy::int || ' m)', null, 4
  from d o join public.jornada_checks k on k.order_id = o.id join public.jornadas j on j.id = k.jornada_id
  union all
  select i.created_at, i.created_by, 'incidencia', i.id, o.id, 'Registró incidencia: ' || replace(coalesce(t.type, i.type::text), '_', ' '), null, 5
  from d o join public.incidents i on i.order_id = o.id left join inc_type t on private.demo_uuid('inc_' || lpad(t.n::text, 4, '0')) = i.id
  union all
  select c.validated_at, c.validated_by, 'orden', o.id, o.id, 'Validó cierre definitivo',
    case when c.exception_reason is not null then ${lit(EXCEPTION_AUDIT)} end, 6
  from d o join public.order_closures c on c.order_id = o.id
  union all
  select r.generated_at, r.generated_by, 'reporte', r.id, o.id, 'Generó reporte PDF v' || r.version, null, 7
  from d o join public.reports r on r.order_id = o.id
  union all
  select s.created_at, s.created_by, 'reporte', s.report_id, o.id,
    'Inició envío por ' || case s.channel when 'whatsapp' then 'WhatsApp' else 'correo' end, null, 8
  from d o join public.report_shares s on s.order_id = o.id
  union all
  select c.created_at, c.created_by, 'caso', c.id, o.id, 'Abrió caso postventa ' || c.folio, null, 9
  from d o join public.post_sale_cases c on c.order_id = o.id
  union all
  select to_timestamp(x.at), private.demo_uuid(x.actor), x.entity, private.demo_uuid(x.entity_id), ${ORD('x.ord')}, x.action, x.reason, 10
  from extra x
),
ins as (
  insert into public.audit_log (at, actor_kind, actor_id, actor_name, entity, entity_id, order_id, unit_id, action, reason, updated_at)
  select ev.at, 'usuario', p.id, p.name, ev.entity::public.audit_entity, ev.entity_id, ev.order_id, o.unit_id, ev.action, ev.reason, ev.at
  from ev join public.profiles p on p.id = ev.actor join public.orders o on o.id = ev.order_id
  order by ev.at, o.folio, ev.rk, ev.entity_id
  returning id
)
${registerUnion([['audit_log', 'ins']])}`;

const TOKENS_SQL = `-- survey links: one random 256-bit base64url token per survey, generated by the database (never written to the repo)
with ins as (
  insert into public.survey_tokens (survey_id, order_id, token, created_at, updated_at)
  select s.id, s.order_id, translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'), s.sent_at, s.sent_at
  from public.surveys s
  where s.id in (select r.row_id::uuid from private.demo_rows r where r.table_name = 'surveys')
    and not exists (select 1 from public.survey_tokens t where t.survey_id = s.id)
  returning survey_id
)
${registerUnion([['survey_tokens', 'ins', 'survey_id']])}`;

const SEQUENCES_SQL = `-- folio sequences continue after the highest folio in the tables (the RPCs use nextval; never moved backwards). Re-run
-- this block after a rolled-back private.drop_demo_data(): sequences are not transactional.
select pg_catalog.setval('private.order_folio_seq', greatest(
  (select coalesce(max(substr(folio, 4)::bigint), 1) from public.orders), (select last_value from private.order_folio_seq)));
select pg_catalog.setval('private.incident_folio_seq', greatest(
  (select coalesce(max(substr(folio, 5)::bigint), 1) from public.incidents), (select last_value from private.incident_folio_seq)));
select pg_catalog.setval('private.case_folio_seq', greatest(
  (select coalesce(max(substr(folio, 4)::bigint), 1) from public.post_sale_cases), (select last_value from private.case_folio_seq)));
select pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.audit_log', 'id'), greatest(
  (select coalesce(max(id), 1) from public.audit_log), (select last_value from public.audit_log_id_seq)));`;

/* ───────────── fingerprints: what each table must contain, computed from the app dataset ───────────── */

const E = (col) => `extract(epoch from ${col})::bigint`;
const MI = (col) => `round(${col}::numeric * 1000000)::bigint`;
const sepA = '¦';
// [table, registry name, id column, SQL expressions, expected rows]
const FP = [
  ['units', 'id', ['id', 'name', 'code', 'city', E('created_at')], seed.units.map((u) => [uuid(u.id), u.name, u.code, u.city, ep(CATALOG_AT)])],
  ['auth.users', 'id', ['id', 'email', `raw_app_meta_data ->> 'pulkro_demo'`, `encrypted_password = ''`, E('email_confirmed_at'), 'invited_at is null'],
    seed.users.map((u) => [uuid(u.id), demoEmail(u.email), 'true', true, ep(CATALOG_AT), true])],
  ['profiles', 'id', ['id', 'name', 'initials', 'role', 'title', 'unit_id', 'email', 'phone', 'hue', 'active'],
    seed.users.map((u) => [uuid(u.id), u.name, u.initials, u.role, u.title, uuid(u.unitId), demoEmail(u.email), u.phone, u.hue, true])],
  ['workers', 'id', ['id', 'name', 'initials', 'unit_id', 'specialty', 'phone', 'hue', 'active'],
    seed.workers.map((w) => [uuid(w.id), w.name, w.initials, uuid(w.unitId), w.specialty, w.phone, w.hue, w.active])],
  ['clients', 'id', ['id', 'name', 'short_name', 'segment', 'unit_id', 'contact_name', 'contact_phone', 'contact_email', 'since', 'hue'],
    seed.clients.map((c) => [uuid(c.id), c.name, c.shortName, c.segment, uuid(c.unitId), c.contactName, c.contactPhone, demoEmail(c.contactEmail), localDate(c.since), c.hue])],
  ['sites', 'id', ['id', 'client_id', 'name', 'address', 'municipality', MI('lat'), MI('lng')],
    seed.sites.map((s) => [uuid(s.id), uuid(s.clientId), s.name, s.address, s.municipality, MICRO(s.lat), MICRO(s.lng)])],
  ['service_types', 'id', ['id', 'name', 'short', 'hue', 'default_hours_per_day::float8'],
    seed.serviceTypes.map((s) => [uuid(s.id), s.name, s.short, s.hue, s.defaultHoursPerDay])],
  ['materials', 'id', ['id', 'name', 'unit'], seed.materials.map((m) => [uuid(m.id), m.name, m.unit])],
  ['orders', 'id', ['id', 'folio', 'unit_id', 'client_id', 'site_id', 'service_type_id', 'supervisor_id', 'status', 'title',
    `array_to_string(activities, '${sepA}')`,
    `(select string_agg((e ->> 'material_id') || ':' || (e ->> 'qty'), ',' order by n) from jsonb_array_elements(materials) with ordinality x(e, n))`,
    'special_instructions', 'site_contact_name', 'site_contact_phone', E('scheduled_start'), E('scheduled_end'), 'planned_days', 'commercial_ref',
    'priority', 'created_by', E('created_at'), E('updated_at')],
    orders.map((o) => [uuid(o.id), o.folio, uuid(o.unitId), uuid(o.clientId), uuid(o.siteId), uuid(o.serviceTypeId), uuid(o.supervisorId), o.status,
      o.title, o.activities.join(sepA), o.materials.map((m) => `${uuid(m.materialId)}:${m.qty}`).join(','), o.specialInstructions,
      o.siteContact.name, o.siteContact.phone, ep(o.scheduledStart), ep(o.scheduledEnd), o.plannedDays, o.commercialRef, o.priority,
      uuid(o.createdBy), ep(T[o.id].created), ep(T[o.id].updated)])],
  ['jornadas', 'id', ['id', 'order_id', 'day_index', 'date', E('planned_start'), E('planned_end'), `array_to_string(worker_ids, ',')`, 'status',
    `(select string_agg((e ->> 'activity') || ':' || (e ->> 'hours'), '${sepA}' order by n) from jsonb_array_elements(breakdown) with ordinality x(e, n))`,
    E('created_at'), E('updated_at'), 'deleted_at is null'],
    seed.jornadas.map((j) => [uuid(j.id), uuid(j.orderId), j.dayIndex, j.date, ep(j.plannedStart), ep(j.plannedEnd), j.workerIds.map(uuid).join(','),
      j.status, j.breakdown ? j.breakdown.map((b) => `${b.activity}:${b.hours}`).join(sepA) : null, ep(T[j.orderId].created), ep(jornadaUpdated(j)), true])],
  ['crew_changes', 'id', ['id', 'order_id', 'jornada_id', `array_to_string(worker_ids, ',')`, 'reason', 'created_by', E('created_at')],
    orders.filter((o) => o.crewHistory[0]).map((o) => {
      const c = o.crewHistory[0];
      return [uuid(`${o.id}:crew:1`), uuid(o.id), null, c.workerIds.map(uuid).join(','), c.reason, uuid(c.by), ep(T[o.id].crew)];
    })],
  ['jornada_checks', 'id', ['id', 'jornada_id', 'order_id', 'kind', E('device_at'), E('server_at'), MI('lat'), MI('lng'), 'accuracy::int', 'source',
    'note', 'offline', 'created_by', E('created_at')],
    seed.jornadas.flatMap((j) => [['entrada', j.checkIn], ['salida', j.checkOut]].filter(([, g]) => g).map(([kind, g]) => [
      uuid(`${j.id}:${kind}`), uuid(j.id), uuid(j.orderId), kind, ep(g.deviceAt), ep(g.serverAt), MICRO(g.lat), MICRO(g.lng), g.accuracy, g.source,
      null, g.offline, uuid(g.by), ep(g.serverAt)]))],
  ['jornada_notes', 'id', ['id', 'jornada_id', 'order_id', 'text', E('device_at'), 'created_by', E('created_at')],
    seed.jornadas.flatMap((j) => j.log.map((n, i) => [uuid(`${j.id}:note:${i + 1}`), uuid(j.id), uuid(j.orderId), n.text, ep(n.at), uuid(n.by), ep(n.at)]))],
  ['incidents', 'id', ['id', 'folio', 'order_id', 'jornada_id', 'type', 'severity', 'description', 'status', 'blocks_closure', 'resolution',
    E('resolved_at'), 'resolved_by', E('device_at'), 'created_by', E('created_at'), E('updated_at')],
    incidents.map((i) => {
      const at = ep(past(i.createdAt, 'x')), res = ep(past(i.resolvedAt, 'x'));
      return [uuid(i.id), i.folio, uuid(i.orderId), uuid(i.jornadaId), i.type, i.severity, i.description, i.status, i.blocksClosure, i.resolution ?? null,
        res, i.resolvedBy ? uuid(i.resolvedBy) : null, at, uuid(i.createdBy), at, res ?? at];
    })],
  ['post_sale_cases', 'id', ['id', 'folio', 'order_id', 'client_id', 'category', 'severity', 'channel', 'description', 'owner_id', 'due_date', 'status',
    'resolution', 'created_by', E('created_at'), E('updated_at')],
    cases.map((c) => [uuid(c.id), c.folio, uuid(c.orderId), uuid(c.clientId), c.category, c.severity, c.channel, c.description, uuid(c.ownerId),
      localDate(c.dueDate), c.status, c.resolution ?? null, uuid(c.createdBy), ep(past(c.createdAt, 'x')), ep(past(c.updatedAt, 'x'))])],
  ['case_events', 'id', ['id', 'case_id', 'order_id', 'text', 'created_by', E('created_at')],
    cases.flatMap((c) => c.timeline.map((e, i) => [uuid(`${c.id}:event:${i + 1}`), uuid(c.id), uuid(c.orderId), e.text, uuid(e.by), ep(past(e.at, 'x'))]))],
  ['order_closures', 'id', ['id', 'order_id', 'version', 'summary', 'conformity_method', 'conformity_name', 'conformity_role',
    `(conformity_signature is not null) = (conformity_method = 'firma')`, E('conformity_at'), 'exception_reason', 'exception_authorized_by',
    E('exception_at'), 'validated_by', E('validated_at'), E('device_at')],
    closedOrders.map((o) => {
      const c = o.closure, at = ep(past(c.validatedAt, 'x'));
      return [uuid(`${o.id}:closure:1`), uuid(o.id), 1, c.summary, c.conformity.method, c.conformity.name, c.conformity.role, true,
        ep(c.conformity.at), c.exception?.reason ?? null, c.exception ? uuid(c.exception.authorizedBy) : null, c.exception ? at : null,
        uuid(c.validatedBy), at, at];
    })],
  ['reports', 'id', ['id', 'order_id', 'closure_id', 'version', 'summary', 'cardinality(photo_ids)', 'generated_by', E('generated_at'),
    `snapshot #>> '{order,id}' = order_id::text and snapshot #>> '{closure,id}' = closure_id::text`],
    reports.map((r) => [uuid(r.id), uuid(r.orderId), uuid(`${r.orderId}:closure:1`), r.version, r.summary, 0, uuid(r.generatedBy),
      ep(past(r.generatedAt, 'x')), true])],
  ['report_shares', 'id', ['id', 'report_id', 'order_id', 'channel', 'recipient', 'note', 'created_by', E('device_at'), E('created_at')],
    shares.map((s) => [uuid(s.id), uuid(s.reportId), uuid(s.orderId), s.channel, s.to.includes('@') ? demoEmail(s.to) : s.to, s.note, uuid(s.by),
      ep(past(s.at, 'x')), ep(past(s.at, 'x'))])],
  ['surveys', 'id', ['id', 'order_id', 'client_id', 'channel', 'manual', 'sent_by', E('sent_at'), E('responded_at'), 'overall', 'quality',
    'punctuality', 'staff', 'nps', 'comment', 'respondent_name', 'recorded_by'],
    surveys.map((s) => [uuid(s.id), uuid(s.orderId), uuid(s.clientId), s.channel, s.manual, uuid(s.sentBy), ep(past(s.sentAt, 'x')),
      ep(past(s.respondedAt, 'x')), s.answers?.overall ?? null, s.answers?.quality ?? null, s.answers?.punctuality ?? null, s.answers?.staff ?? null,
      s.answers?.nps ?? null, s.answers?.comment ?? null, s.respondentName ?? null, s.manual && s.respondedAt ? uuid(s.sentBy) : null])],
  ['survey_tokens', 'survey_id', ['survey_id', 'order_id', `token ~ '^[A-Za-z0-9_-]{43,64}$'`], surveys.map((s) => [uuid(s.id), uuid(s.orderId), true])],
  ['audit_log', 'id', [E('at'), 'actor_kind', 'actor_id', 'actor_name', 'entity', 'entity_id', 'order_id', 'unit_id', 'action', 'reason', 'op_id', E('updated_at')],
    seed.audit.map((e) => {
      const at = ep(past(e.at, 'x'));
      return [at, 'usuario', uuid(e.by), users.get(e.by).name, e.entity, uuid(e.entityId), uuid(e.orderId), uuid(ordersById.get(e.orderId).unitId),
        e.action, e.reason ?? null, null, at];
    })],
];
// concat_ws skips nulls and prints booleans as t/f: the expected rows are canonicalised the same way
const canon = (vals) => vals.filter((v) => v !== null && v !== undefined).map((v) => (typeof v === 'boolean' ? (v ? 't' : 'f') : String(v))).join('|');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const fingerprint = (rows) => md5(rows.map(canon).sort().join('\n'));
const schemaOf = (t) => (t === 'auth.users' ? 'auth.users' : `public.${t}`);
const fpSelect = ([table, idCol, exprs, expected]) => `select ${lit(table)}, ${expected.length}, (select count(*)::int from r where t = ${lit(table)}),
  coalesce((select md5(string_agg(x, E'\\n' order by x collate "C")) from (select concat_ws('|', ${exprs.join(', ')}) as x
    from ${schemaOf(table)} where ${idCol}::text in (select id from r where t = ${lit(table)})) s) = ${lit(fingerprint(expected))}, false)`;
const VERIFY_SQL = `-- every table: rows registered = rows in the app dataset, and the content fingerprint (md5 of every row, canonical
-- columns) equals the one computed by scripts/build-demo-seed.mjs from src/lib/seed.ts
with r (t, id) as (select table_name, row_id from private.demo_rows)
select v.table_name, v.expected, v.registered, v.registered = v.expected and v.content_ok as ok
from (
${FP.map(fpSelect).join('\nunion all\n')}
union all
select 'photos (procedural scenes, not loaded)', 0, (select count(*)::int from r where t = 'photos'), true
union all
select 'stamp_insert triggers left disabled', 0, (select count(*)::int from pg_trigger where tgname = 'stamp_insert' and tgenabled = 'D'), true
union all
select 'weak survey tokens (< 16 distinct characters)', 0, (select count(*)::int from public.survey_tokens k
  where k.survey_id::text in (select id from r where t = 'survey_tokens')
    and (select count(distinct c) from regexp_split_to_table(k.token, '') c) < 16), true
) as v(table_name, expected, registered, content_ok);`;

/* ───────────── chunks: one transaction each, under CHUNK_BYTES ───────────── */

const STAMPED = ['units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders', 'jornadas', 'crew_changes',
  'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'order_closures', 'reports', 'report_shares', 'surveys',
  'audit_log'];
const chunks = [];
let cur;
const startChunk = () => (cur = { labels: [], tables: new Set(), sql: [] });
const flush = () => {
  if (cur?.sql.length) chunks.push(cur);
  startChunk();
};
startChunk();
const bytes = (s) => Buffer.byteLength(s);
const curSize = () => bytes(cur.sql.join('\n\n')) + 900;
/** Adds `items` in batches: each batch is the largest that keeps the current chunk under CHUNK_BYTES. */
function addBatched(label, items, render, tables) {
  let i = 0;
  while (i < items.length) {
    let n = 0, lo = 1, hi = items.length - i;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (curSize() + bytes(render(items.slice(i, i + mid))) <= CHUNK_BYTES) { n = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (n === 0) {
      if (!cur.sql.length) throw new Error(`${label}: one item does not fit in DEMO_CHUNK_BYTES=${CHUNK_BYTES}`);
      flush();
      continue;
    }
    const range = items.length === 1 ? '' : ` ${i + 1}–${i + n} of ${items.length}`;
    cur.sql.push(`-- ${label}${range}\n${render(items.slice(i, i + n))}`);
    cur.labels.push(items.length === 1 ? label : `${label} ${i + 1}–${i + n}`);
    tables.forEach((t) => cur.tables.add(t));
    i += n;
  }
}
const addOne = (label, sql, tables) => addBatched(label, [0], () => sql, tables);
addOne('accounts, units and catalogs', CATALOG_SQL.join('\n\n'), ['units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials']);
flush();
addBatched('orders (+ jornadas, crew, checks, notes)', orders, ordersStatement, ['orders', 'jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes']);
addBatched('incidents', incidents, incidentsStatement, ['incidents']);
addBatched('post-sale cases (+ timeline)', cases, casesStatement, ['post_sale_cases', 'case_events']);
addBatched('closures', closedOrders, closuresStatement, ['order_closures']);
addBatched('reports', reports, reportsStatement, ['reports']);
addBatched('report shares', shares, sharesStatement, ['report_shares']);
addBatched('surveys', surveys, surveysStatement, ['surveys']);
flush();
addOne('bitácora', AUDIT_SQL, ['audit_log']);
addOne('survey tokens', TOKENS_SQL, ['survey_tokens']);
addOne('folio sequences', SEQUENCES_SQL, []);
flush();

const total = chunks.length + 1;
const chunkSql = chunks.map((c, k) => {
  const stamped = STAMPED.filter((t) => c.tables.has(t)).map((t) => `public.${t}`);
  if (c.tables.has('survey_tokens')) stamped.push('public.survey_tokens');
  return [
    `-- ═════ chunk ${k + 1} of ${total} · ${c.labels.join(' · ')} ═════`,
    'begin;',
    ...(stamped.length
      ? ['-- historical created_at/updated_at (audit_log.at): server-time stamping off inside this transaction only, re-enabled before commit',
        ...stamped.map((t) => `alter table ${t} disable trigger stamp_insert;`)]
      : []),
    c.sql.join('\n\n'),
    ...stamped.map((t) => `alter table ${t} enable trigger stamp_insert;`),
    'commit;',
  ].join('\n');
});

/* ───────────── header + output ───────────── */

const personas = { direccion: 'usr_dir', administracion: 'usr_adm_mty', supervisor: 'sup_daniela' };
const visible = Object.fromEntries(Object.entries(personas).map(([role, uid]) => {
  const u = users.get(uid);
  return [role, { user: u.name, unit: u.unitId, orders: seed.orders.filter((o) => canSeeOrder(u, o, 'all')).length }];
}));
const statusCounts = {};
for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
const clampedList = [...clamped.entries()].map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
const counts = Object.fromEntries(FP.map(([t, , , rows]) => [t, rows.length]));

const header = `-- GENERATED by scripts/build-demo-seed.mjs — do not edit; regenerate instead. See supabase/seed/README.md.
-- Pulkro Cuadrillas demo dataset (src/lib/seed.ts, SEED_VERSION ${SEED_VERSION}) mapped to the database schema.
--
-- Anchored to ${now.toISOString()} = ${format(now, 'yyyy-MM-dd HH:mm')} ${TZ} (generateSeed(now), like the app's reseed).
-- Needs migration 20261011050457_demo_data_registry (private.demo_rows, private.demo_uuid, private.drop_demo_data).
-- Run as the database owner (postgres), chunk by chunk in order: each chunk is its own transaction and registers what it
-- inserts, so a failed load is cleaned up like a complete one. The last chunk only reads (verification). Remove with
--   select private.drop_demo_data();
--
-- Rows per table:
${Object.entries(counts).map(([t, n]) => `--   ${t.padEnd(16)} ${String(n).padStart(5)}`).join('\n')}
--   photos               0  (the app's ${seed.photos.length} seeded photos are procedural scene illustrations, not files)
-- Orders by status: ${Object.entries(statusCounts).map(([s, n]) => `${s} ${n}`).join(', ')}
-- Orders each demo persona should see (src/lib/permissions.ts canSeeOrder, unit filter "all"):
${Object.entries(visible).map(([role, v]) => `--   ${role.padEnd(15)} ${v.user} (${v.unit}): ${v.orders}`).join('\n')}
-- Future "already happened" times capped at the anchor: ${clampedList}
--
-- Encoding: times are Unix epoch seconds (to_timestamp) or seconds relative to the row's reference time; app ids are
-- rebuilt from their numbers (12 → 'ord_0012') and become private.demo_uuid('<app id>') = uuid_generate_v5(
-- '010bd357-25ea-5b0b-9a32-47d44503f380', '<app id>'); values the app derives (folios, default titles, the crew of each day,
-- notes, closure summaries, share recipients, the bitácora) are derived here the same way. Accounts: no password, e-mail
-- on the reserved domain ${DEMO_DOMAIN}, app_metadata.pulkro_demo = true, never invited.
`;

const verifyChunk = `-- ═════ chunk ${total} of ${total} · verification (read-only) ═════\n${VERIFY_SQL}`;
const out = SAMPLE
  ? [`-- SAMPLE DRY RUN (${orders.length} orders) — everything in one transaction, rolled back. Disposable databases only:\n`
      + '-- the folio sequences and the audit identity keep the numbers it used (never moved back).\nbegin;',
    ...chunkSql.map((c) => c.replace(/^begin;$/m, '').replace(/^commit;$/m, '')), verifyChunk, 'rollback;', ''].join('\n\n')
  : [header, ...chunkSql, verifyChunk, ''].join('\n\n');
const outFile = SAMPLE ? path.resolve(process.env.DEMO_OUT) : path.join(root, 'supabase/seed/demo.sql');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);

console.log(`wrote ${path.relative(root, outFile)} (${(bytes(out) / 1024).toFixed(0)} KiB, ${total} chunks, anchor ${now.toISOString()} ${TZ})`);
console.log(Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' '), `(photos in the app: ${seed.photos.length})`);
console.log('visible orders:', JSON.stringify(visible));
console.log('capped future times:', clampedList, '· non-derivable bitácora entries:', extraAudit.length, '· detail ranges:', JSON.stringify(detailRanges));
chunkSql.forEach((c, k) => console.log(`  chunk ${k + 1}: ${(bytes(c) / 1024).toFixed(1)} KiB · ${chunks[k].labels.join(' · ')}`));
