import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

/** Transpiles one TS module and runs it in a sandbox; `modules` resolves its imports (anything else is an error). */
function load(file, modules = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = {
    exports: {},
    require: (name) => {
      if (name in modules) return modules[name];
      throw new Error(`${file}: unexpected import ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const permissions = load('src/lib/permissions.ts');
const { can, canSeeOrder, canSeeAuditEntry } = permissions;
// nav.ts only needs icon components from lucide-react: any value will do for a route check.
const icons = new Proxy({}, { get: () => () => null });
const { canSeeRoute } = load('src/components/shell/nav.ts', { 'lucide-react': icons, '@/lib/permissions': permissions });

const admin = { id: 'admin', role: 'administracion', unitId: 'mty' };
const supervisor = { id: 'sup', role: 'supervisor', unitId: 'mty' };
const director = { id: 'dir', role: 'direccion', unitId: 'mty' };

/* ── role actions (product decisions) ── */
for (const action of ['order.create', 'view.kpis', 'export.kpis', 'export.backup']) assert.equal(can('supervisor', action), false, action);
for (const action of ['order.reschedule', 'order.reopen', 'field.capture', 'crew.assign', 'report.share']) assert.equal(can('administracion', action), false, action);
assert.equal(can('supervisor', 'field.capture'), true);
assert.equal(can('administracion', 'order.create'), true);
assert.equal(can('direccion', 'order.create'), false, 'Dirección creates no orders');
// Indicadores and their exports (Excel and print-PDF share export.kpis): Dirección and Administración only.
for (const role of ['direccion', 'administracion']) assert.equal(can(role, 'export.kpis'), true, `${role} export.kpis`);
// Postventa: Dirección keeps it read-only (no client-facing actions: link, QR, WhatsApp).
assert.equal(can('direccion', 'postventa.manage'), false);
assert.equal(can('administracion', 'postventa.manage'), true);
assert.equal(can('supervisor', 'postventa.manage'), true);
// Backups: Dirección and Administración.
for (const role of ['direccion', 'administracion']) assert.equal(can(role, 'export.backup'), true, `${role} export.backup`);

/* ── order scope ── */
assert.equal(canSeeOrder(admin, { unitId: 'other' }, 'all'), false);
assert.equal(canSeeOrder(supervisor, { supervisorId: 'other' }, 'all'), false);

/* ── Bitácora scope ── */
const ctx = { unitFilter: 'mty', orderIds: new Set(['visible']), users: new Map([['other', { unitId: 'other' }], ['admin', admin], ['dir', director]]) };
for (const user of [admin, director, supervisor]) assert.equal(canSeeAuditEntry(user, { orderId: 'hidden', by: 'other' }, ctx), false);
assert.equal(canSeeAuditEntry(admin, { by: 'other' }, ctx), false);
assert.equal(canSeeAuditEntry(admin, { by: 'admin' }, ctx), true);
assert.equal(canSeeAuditEntry(supervisor, { orderId: 'visible', by: 'other' }, ctx), true);
// The touched record's unit decides, not the actor's: a Dirección account (unit mty) editing another unit's catalog stays out
// of mty's Bitácora, and that unit's own edits made by someone from another unit show up in it.
const recordCtx = (unit) => ({ ...ctx, entityUnit: () => unit });
assert.equal(canSeeAuditEntry(admin, { by: 'dir', entityId: 'cli_apo' }, recordCtx('apo')), false, 'mty admin must not see edits to another unit');
assert.equal(canSeeAuditEntry(admin, { by: 'other', entityId: 'cli_mty' }, recordCtx('mty')), true, 'mty admin sees edits to its own unit by anyone');
assert.equal(canSeeAuditEntry({ ...admin, unitId: 'apo' }, { by: 'dir', entityId: 'cli_apo' }, { ...recordCtx('apo'), unitFilter: 'apo' }), true);
// Unknown record unit (company-wide catalogs): falls back to the actor's unit.
assert.equal(canSeeAuditEntry(admin, { by: 'dir', entityId: 'srv_x' }, recordCtx(undefined)), true);
assert.equal(canSeeAuditEntry(admin, { by: 'other', entityId: 'srv_x' }, recordCtx(undefined)), false);
// Dirección with "Todas las unidades" sees every entry without an order; supervisors only their own actions.
assert.equal(canSeeAuditEntry(director, { by: 'other', entityId: 'cli_apo' }, { ...recordCtx('apo'), unitFilter: 'all' }), true);
assert.equal(canSeeAuditEntry(supervisor, { by: 'other', entityId: 'cli_mty' }, recordCtx('mty')), false);

/* ── routes (nav.ts → canSeeRoute: sidebar, Menú, ⌘K and the shell guard) ── */
const FIELD_ROUTES = ['/agenda', '/jornada/j_1', '/evidencias', '/incidencias', '/reportes', '/ordenes/OS-1/reporte'];
const MANAGEMENT_ROUTES = ['/indicadores', '/equipo'];
for (const route of FIELD_ROUTES) {
  assert.equal(canSeeRoute('supervisor', route), true, `supervisor ${route}`);
  for (const role of ['direccion', 'administracion']) assert.equal(canSeeRoute(role, route), false, `${role} ${route}`);
}
for (const route of MANAGEMENT_ROUTES) {
  assert.equal(canSeeRoute('supervisor', route), false, `supervisor ${route}`);
  for (const role of ['direccion', 'administracion']) assert.equal(canSeeRoute(role, route), true, `${role} ${route}`);
}
assert.equal(canSeeRoute('administracion', '/ordenes/nueva'), true);
for (const role of ['direccion', 'supervisor']) assert.equal(canSeeRoute(role, '/ordenes/nueva'), false, `${role} /ordenes/nueva`);
// The order detail (with its Jornadas / Evidencia / Incidencias tabs and the PDF) and Postventa stay open to every role.
for (const role of ['direccion', 'administracion', 'supervisor']) {
  for (const route of ['/ordenes', '/ordenes/OS-1', '/postventa', '/mapa', '/clientes']) assert.equal(canSeeRoute(role, route), true, `${role} ${route}`);
}

console.log('Permission, route and cross-unit audit regression checks passed.');
