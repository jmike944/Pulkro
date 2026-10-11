// Applies the Pulkro Auth settings (docs/backend/architecture.md §12, step 1) to a Supabase project through the
// Management API. The Supabase MCP server has no auth-config tool, and a script keeps production and staging identical.
//
// The token stays in your shell: create a personal access token scoped to this project at
// https://supabase.com/dashboard/account/tokens, then in your own terminal (never commit it, never paste it in chat):
//   export SUPABASE_ACCESS_TOKEN=…
//   node scripts/supabase-auth-config.mjs                                   # dry run on Pulkro: current vs desired
//   node scripts/supabase-auth-config.mjs --ref <project-ref> --apply      # PATCH /v1/projects/{ref}/config/auth
// --apply always needs an explicit --ref (no default target for writes). --pro also turns on leaked-password protection
// (Pro plan only). The script exits non-zero when the API refuses a change or leaves a setting different.

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Falta el valor de ${name}.`);
    process.exit(1);
  }
  return value;
};

const apply = flag('--apply');
const explicitRef = option('--ref');
if (apply && !explicitRef) {
  console.error('--apply necesita --ref <project-ref> explícito: los cambios de Auth nunca van a un proyecto por omisión.');
  process.exit(1);
}
const ref = explicitRef ?? 'cbdzndpdpwtxbhshidyi';
if (!/^[a-z]{20}$/.test(ref)) {
  console.error(`Referencia de proyecto inválida: ${ref} (20 letras minúsculas, como en la URL del dashboard).`);
  process.exit(1);
}
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno (créelo en https://supabase.com/dashboard/account/tokens).');
  process.exit(1);
}

const desired = {
  // Accounts are created by Dirección (invite + profile), never by self sign-up.
  disable_signup: true,
  // Supervisors type on phones: long and mixed-case with digits, no symbol requirement.
  password_min_length: 12,
  password_required_characters: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  // Adds pulkro_role / pulkro_unit_id to the JWT and refuses inactive accounts (migration access_rls).
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: 'pg-functions://postgres/private/custom_access_token_hook',
  // Short-lived access tokens; refresh tokens rotate.
  jwt_exp: 3600,
  refresh_token_rotation_enabled: true,
  ...(flag('--pro') ? { password_hibp_enabled: true } : {}),
};

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const current = await fetch(url, { headers });
if (!current.ok) {
  console.error(`No se pudo leer la configuración de Auth de ${ref}: HTTP ${current.status} ${await current.text()}`);
  process.exit(1);
}
const now = await current.json();

const changes = Object.entries(desired).filter(([key, value]) => now[key] !== value);
const unknown = Object.keys(desired).filter((key) => !(key in now));
console.log(`Proyecto ${ref}`);
for (const [key, value] of Object.entries(desired)) {
  const mark = now[key] === value ? '  =' : '  →';
  console.log(`${mark} ${key}: ${JSON.stringify(now[key])}${now[key] === value ? '' : ` ⇒ ${JSON.stringify(value)}`}`);
}
if (unknown.length) console.warn(`Campos que la API no devolvió (revise el nombre): ${unknown.join(', ')}`);

if (!changes.length) {
  console.log('Nada que cambiar.');
} else if (!apply) {
  console.log(`${changes.length} cambio(s) pendiente(s). Para aplicarlos: --ref ${ref} --apply`);
} else {
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(Object.fromEntries(changes)) });
  if (!res.ok) {
    console.error(`La API rechazó el cambio: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const after = await res.json();
  const missed = changes.filter(([key, value]) => after[key] !== value).map(([key]) => key);
  if (missed.length) {
    console.error(`Aplicado, pero no quedó igual: ${missed.join(', ')}`);
    process.exit(1);
  }
  console.log(`Aplicado: ${changes.length} cambio(s).`);
}
