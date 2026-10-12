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
//
// E-mails: the subjects and HTML of the invite, recovery, email_change and confirmation e-mails come from
// supabase/templates/ (subjects.json + <name>.html, Spanish, links to /acceso/definir-contrasena). Supabase only uses
// custom templates with a custom SMTP server on the Free plan; the API answers with an error otherwise.
//
// URLs (optional; without the flags the project's values are left as they are):
//   --site-url https://cuadrillas.pulkro.com.mx     site_url: {{ .SiteURL }} in the e-mails (no trailing slash)
//   --redirect https://cuadrillas.pulkro.com.mx/**  uri_allow_list, repeatable: the exact list of allowed redirect URLs
//                                                   (resetPasswordForEmail's redirectTo must match one of them)

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
/** Every value given for a repeatable option. */
const values = (name) => {
  const out = [];
  args.forEach((arg, i) => {
    if (arg !== name) return;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) fail(`Falta el valor de ${name}.`);
    out.push(value);
  });
  return out;
};
const option = (name) => {
  const all = values(name);
  if (all.length > 1) fail(`${name} va una sola vez.`);
  return all[0];
};

const apply = flag('--apply');
const explicitRef = option('--ref');
if (apply && !explicitRef) {
  fail('--apply necesita --ref <project-ref> explícito: los cambios de Auth nunca van a un proyecto por omisión.');
}
const ref = explicitRef ?? 'cbdzndpdpwtxbhshidyi';
if (!/^[a-z]{20}$/.test(ref)) {
  fail(`Referencia de proyecto inválida: ${ref} (20 letras minúsculas, como en la URL del dashboard).`);
}

/* ── optional URL settings ── */
const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

let siteUrl;
const siteUrlArg = option('--site-url');
if (siteUrlArg !== undefined) {
  // The e-mails build links as {{ .SiteURL }}/acceso/…: a trailing slash would double it.
  siteUrl = siteUrlArg.replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(siteUrl);
  } catch {
    fail(`--site-url no es una URL válida: ${siteUrlArg}`);
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost(parsed.hostname))) {
    fail(`--site-url debe usar https:// (http:// solo para localhost): ${siteUrlArg}`);
  }
  if (parsed.search || parsed.hash) fail(`--site-url no lleva consulta ni fragmento: ${siteUrlArg}`);
}

let redirects;
const redirectArgs = values('--redirect');
if (redirectArgs.length) {
  for (const url of redirectArgs) {
    // Wildcards (https://*.example.com/**) are allowed by Supabase; the list itself is comma-separated.
    if (!/^https?:\/\/[^\s,]+$/.test(url)) fail(`--redirect inválido (http(s)://…, sin espacios ni comas): ${url}`);
  }
  redirects = [...new Set(redirectArgs)];
}

/* ── e-mail templates (supabase/templates) ── */
const TEMPLATES = ['invite', 'recovery', 'email_change', 'confirmation'];
const templatesDir = new URL('../supabase/templates/', import.meta.url);
const readTemplateFile = (name) => {
  try {
    return readFileSync(new URL(name, templatesDir), 'utf8');
  } catch (error) {
    fail(`No se pudo leer supabase/templates/${name}: ${error.message}`);
  }
};
let subjects;
try {
  subjects = JSON.parse(readTemplateFile('subjects.json'));
} catch (error) {
  fail(`supabase/templates/subjects.json no es JSON válido: ${error.message}`);
}
const mail = {};
for (const name of TEMPLATES) {
  const subject = subjects[name];
  if (typeof subject !== 'string' || !subject.trim()) fail(`Falta el asunto "${name}" en supabase/templates/subjects.json.`);
  const content = readTemplateFile(`${name}.html`);
  // Every e-mail must carry the one-time link to the landing page.
  if (!content.includes('{{ .TokenHash }}') || !content.includes('/acceso/definir-contrasena')) {
    fail(`supabase/templates/${name}.html no tiene el enlace a /acceso/definir-contrasena con {{ .TokenHash }}.`);
  }
  mail[`mailer_subjects_${name}`] = subject;
  mail[`mailer_templates_${name}_content`] = content;
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  fail('Falta SUPABASE_ACCESS_TOKEN en el entorno (créelo en https://supabase.com/dashboard/account/tokens).');
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
  // Spanish e-mails (subjects + HTML) for invite, recovery, email_change and confirmation.
  ...mail,
  ...(siteUrl !== undefined ? { site_url: siteUrl } : {}),
  ...(redirects ? { uri_allow_list: redirects.join(',') } : {}),
};

/* ── comparison: the allow list is a set; template HTML ignores line endings and outer whitespace ── */
const isTemplate = (key) => key.startsWith('mailer_templates_');
const normalizeList = (value) =>
  [...new Set(String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean))].sort().join(',');
const normalizeHtml = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
const same = (key, current, wanted) => {
  if (key === 'uri_allow_list') return normalizeList(current) === normalizeList(wanted);
  if (isTemplate(key)) return typeof current === 'string' && normalizeHtml(current) === normalizeHtml(wanted);
  return current === wanted;
};
const show = (key, value) => {
  if (isTemplate(key) && typeof value === 'string') return `(HTML, ${value.length} caracteres)`;
  return JSON.stringify(value);
};
const source = (key) => {
  const name = TEMPLATES.find((t) => key === `mailer_templates_${t}_content`);
  return name ? ` desde supabase/templates/${name}.html` : '';
};

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const current = await fetch(url, { headers });
if (!current.ok) {
  fail(`No se pudo leer la configuración de Auth de ${ref}: HTTP ${current.status} ${await current.text()}`);
}
const now = await current.json();

const changes = Object.entries(desired).filter(([key, value]) => !same(key, now[key], value));
const unknown = Object.keys(desired).filter((key) => !(key in now));
console.log(`Proyecto ${ref}`);
for (const [key, value] of Object.entries(desired)) {
  const equal = same(key, now[key], value);
  console.log(`${equal ? '  =' : '  →'} ${key}: ${show(key, now[key])}${equal ? '' : ` ⇒ ${show(key, value)}${source(key)}`}`);
}
if (siteUrl === undefined) console.log(`  · site_url sin cambios: ${JSON.stringify(now.site_url)} (use --site-url para fijarlo)`);
if (!redirects) console.log(`  · uri_allow_list sin cambios: ${JSON.stringify(now.uri_allow_list)} (use --redirect para fijarlo)`);
if (unknown.length) console.warn(`Campos que la API no devolvió (revise el nombre): ${unknown.join(', ')}`);

if (!changes.length) {
  console.log('Nada que cambiar.');
} else if (!apply) {
  console.log(`${changes.length} cambio(s) pendiente(s). Para aplicarlos: --ref ${ref} --apply`);
} else {
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(Object.fromEntries(changes)) });
  if (!res.ok) {
    fail(`La API rechazó el cambio: HTTP ${res.status} ${await res.text()}`);
  }
  const after = await res.json();
  const missed = changes.filter(([key, value]) => !same(key, after[key], value)).map(([key]) => key);
  if (missed.length) {
    fail(`Aplicado, pero no quedó igual: ${missed.join(', ')}`);
  }
  console.log(`Aplicado: ${changes.length} cambio(s).`);
}
