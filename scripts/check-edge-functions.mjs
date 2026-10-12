// Type-checks the Supabase Edge Functions (supabase/functions/*/index.ts) without Deno: tsc with
// supabase/functions/tsconfig.json, against the supabase-js types installed in node_modules and the Deno /
// `npm:@supabase/server` declarations in supabase/functions/_check/. The app's own `tsc` excludes supabase/functions.
// Also checks that every `npm:@supabase/supabase-js@<version>` a function imports is the version installed here (the types
// checked are then the ones the deploy bundles) and is declared in _check/deno.d.ts.
// Run it before deploying a function (supabase/functions/admin-users/README.md, "Before deploying").
// Usage: node scripts/check-edge-functions.mjs     (npm run check:functions)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'supabase', 'functions');
const require = createRequire(path.join(root, 'package.json'));
const problems = [];

const functions = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(dir, d.name, 'index.ts')))
  .map((d) => d.name);
if (!functions.length) problems.push('no function found under supabase/functions');

// The pinned supabase-js is the installed one, and the declarations know every pinned specifier.
const installed = require('@supabase/supabase-js/package.json').version;
const stubs = fs.readFileSync(path.join(dir, '_check', 'deno.d.ts'), 'utf8');
for (const name of functions) {
  const src = fs.readFileSync(path.join(dir, name, 'index.ts'), 'utf8');
  for (const [, spec, version] of src.matchAll(/from\s+"(npm:@supabase\/supabase-js@([^/"]+)(?:\/[^"]*)?)"/g)) {
    if (version !== installed) problems.push(`${name}: imports supabase-js ${version}, node_modules has ${installed} (pin and package.json must agree)`);
    if (!stubs.includes(`declare module "${spec}"`)) problems.push(`${name}: ${spec} is not declared in supabase/functions/_check/deno.d.ts`);
  }
  for (const [, spec] of src.matchAll(/from\s+"(npm:[^"]+)"/g))
    if (!stubs.includes(`declare module "${spec}"`)) problems.push(`${name}: ${spec} is not declared in supabase/functions/_check/deno.d.ts`);
}

if (problems.length) {
  for (const p of [...new Set(problems)]) console.error(`check-edge-functions: ${p}`);
  process.exit(1);
}

const tsc = require.resolve('typescript/bin/tsc');
try {
  execFileSync(process.execPath, [tsc, '--noEmit', '-p', path.join(dir, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
} catch {
  console.error('check-edge-functions: type errors (above)');
  process.exit(1);
}
console.log(`check-edge-functions: OK (${functions.join(', ')}; supabase-js ${installed})`);
