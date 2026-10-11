// Checks safeNext (src/features/auth/safe-next.ts), the `/login?next=` filter, against open-redirect variants.
// Usage: node scripts/check-safe-next.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const file = 'src/features/auth/safe-next.ts';
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, URL, decodeURIComponent };
vm.runInNewContext(compiled, context);
const { safeNext } = context.exports;

const ORIGIN = 'https://app.pulkro.test';
const next = (raw) => safeNext(raw, ORIGIN);
/** What `/login?next=<query>` hands to safeNext: URLSearchParams decodes it once, as useSearchParams does. */
const fromQuery = (query) => next(new URLSearchParams(`next=${query}`).get('next'));
/** Where router.replace(target) would land: anything off this origin is a failure. */
const lands = (target) => new URL(target, ORIGIN).origin;

const rejected = [
  // the reported payloads: tab / LF / CR are stripped by the URL parser, "\" reads as "/"
  ['query', '/%09/evil.example'],
  ['query', '/%0a/evil.example'],
  ['query', '/%0d%0a/evil.example'],
  ['query', '/%09%5Cevil.example'],
  ['query', '/%5C%09evil.example'],
  ['query', '/%5Cevil.example'],
  ['query', '%2F%2Fevil.example'],
  // dot segments: the parser resolves them into "//evil.example", a protocol-relative URL once rebuilt
  ['raw', '/.//evil.example'],
  ['raw', '/..//evil.example'],
  ['raw', '/%2e//evil.example'],
  ['raw', '/x/..//evil.example'],
  ['raw', '/./%2fevil.example'],
  // double-encoded: the decoded path is held to the same rules
  ['query', '/%2509/evil.example'],
  ['query', '/%255Cevil.example'],
  ['raw', '/%2F/evil.example'],
  // plain off-origin values
  ['raw', '//evil.example'],
  ['raw', '/\\evil.example'],
  ['raw', 'https://evil.example/'],
  ['raw', 'javascript:alert(1)'],
  ['raw', 'evil.example'],
  ['raw', ''],
  ['raw', null],
  ['raw', undefined],
  // the sign-in screens are never a destination (loop)
  ['raw', '/login'],
  ['raw', '/login/'],
  ['raw', '/LOGIN?next=/x'],
  ['raw', '/%6cogin'],
  ['raw', '/acceso/definir-contrasena'],
  ['raw', '/acceso'],
];
for (const [how, value] of rejected) {
  const out = how === 'query' ? fromQuery(value) : next(value);
  assert.equal(out, '/', `${how} ${JSON.stringify(value)} → ${JSON.stringify(out)}`);
}

const kept = [
  ['/', '/'],
  ['/ordenes', '/ordenes'],
  ['/ordenes/OS-24394?tab=fotos#antes', '/ordenes/OS-24394?tab=fotos#antes'],
  ['/jornada/abc', '/jornada/abc'],
  ['/loginx', '/loginx'],
  ['/acceso-rapido', '/acceso-rapido'],
];
for (const [value, expected] of kept) assert.equal(next(value), expected, JSON.stringify(value));
assert.equal(fromQuery(encodeURIComponent('/ordenes/OS-24394')), '/ordenes/OS-24394', 'the shell encodes the pathname');

// Whatever comes in, the result stays on this origin.
const samples = [...rejected.map(([, v]) => v), ...kept.map(([v]) => v), '/a/../../b', '/a/%2e%2e/%2e%2e//evil.example'];
for (const value of samples) assert.equal(lands(next(value)), ORIGIN, JSON.stringify(value));
for (let c = 0; c < 128; c++) {
  for (const value of [`/${String.fromCharCode(c)}/evil.example`, `/${String.fromCharCode(c)}${String.fromCharCode(c)}evil.example`]) {
    assert.equal(lands(next(value)), ORIGIN, JSON.stringify(value));
    assert.equal(lands(fromQuery(encodeURIComponent(value))), ORIGIN, JSON.stringify(value));
  }
}

console.log(`check-safe-next: OK (${rejected.length} rejected, ${kept.length} kept, ${128 * 4} generated)`);
