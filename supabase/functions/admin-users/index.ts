/**
 * admin-users — account administration for Dirección (Pulkro Cuadrillas; docs/backend/architecture.md §2, decision 11).
 *
 * POST JSON, user JWT (verify_jwt on). The caller must be an ACTIVE Dirección profile; the database re-checks
 * `users.admin` in every RPC anyway, but the check here gates the Auth admin calls (an invite e-mail cannot be unsent).
 *
 *   { action: "invite",       opId, email, name, role, unitId, title?, phone?, hue? }
 *       inviteUserByEmail (redirectTo = APP_URL/acceso/definir-contrasena), then provision_profile with the CALLER's JWT;
 *       if the profile fails, the auth user this call created is deleted again.
 *   { action: "deactivate",   opId, userId }   update_profile {active:false} (caller's JWT; revokes sessions, returns
 *   { action: "reactivate",   opId, userId }   open_orders), then ban / unban through the admin API.
 *   { action: "change_email", opId, userId, email }
 *       admin updateUserById {email, email_confirm:true}, then sync_profile_email (caller's JWT); if the sync is refused,
 *       the auth e-mail goes back to the previous one (an unknown outcome leaves it: the same request again completes it).
 *
 * 200 → { ok: true, action, duplicate, user_id, profile, open_orders?, invite_pending? }   (`profile` = the public.profiles
 *       row as the caller reads it after the change, or null if that read failed: the next pull brings it)
 * 4xx/5xx → { ok: false, code, message }: `code` is stable (the database hint for RPC refusals, e.g. "self_change",
 *       "forbidden:users.admin", "op_id_reused"; otherwise one of the codes below), `message` is Spanish for the person.
 *
 * `opId` is the idempotency key of the RPC: a retry with the same payload answers the stored result (duplicate: true).
 * Secrets: SUPABASE_URL, the publishable/secret keys and the JWKS are provisioned by the platform; APP_URL and APP_ORIGINS
 * are set as function secrets (README.md). Nothing here logs tokens, keys, request bodies or e-mail addresses.
 */
import { createSupabaseContext, type SupabaseContext } from "npm:@supabase/server@1.9.1";
import { isAuthRetryableFetchError } from "npm:@supabase/supabase-js@2.117.2";
import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@2.117.2/cors";

/* ───────────── configuration ───────────── */

const env = (name: string): string | undefined => Deno.env.get(name)?.trim() || undefined;

/** One key out of the platform's JSON map (`SUPABASE_*_KEYS`), the single-key form, or the legacy JWT key. */
function pickKey(pluralVar: string, singularVar: string, legacyVar: string): string | undefined {
  const plural = env(pluralVar);
  if (plural) {
    try {
      const keys = JSON.parse(plural) as Record<string, unknown>;
      const value = keys?.default ?? Object.values(keys ?? {})[0];
      if (typeof value === "string" && value) return value;
    } catch {
      // malformed: fall through to the other forms
    }
  }
  return env(singularVar) ?? env(legacyVar);
}

const PUBLISHABLE_KEY = pickKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
const SECRET_KEY = pickKey("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
/** Passed to @supabase/server so it uses exactly these keys (new `sb_…` keys first, legacy JWT keys as fallback). */
const SERVER_ENV = {
  ...(PUBLISHABLE_KEY ? { publishableKeys: { default: PUBLISHABLE_KEY } } : {}),
  ...(SECRET_KEY ? { secretKeys: { default: SECRET_KEY } } : {}),
};

const originOf = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

/** Base URL of the app (invite landing page). No trailing slash. */
const APP_URL = originOf(env("APP_URL") ?? "") ? env("APP_URL")!.replace(/\/+$/, "") : undefined;
/** Browser origins allowed to call (APP_ORIGINS, comma-separated); when unset, the origin of APP_URL. */
const APP_ORIGINS: ReadonlySet<string> = new Set(
  (env("APP_ORIGINS") ?? APP_URL ?? "")
    .split(",")
    .map((value) => originOf(value.trim()))
    .filter((value): value is string => !!value),
);

const INVITE_PATH = "/acceso/definir-contrasena";
/** "Banned until" for a deactivated account: effectively forever; reactivation lifts it ("none"). */
const BAN_DURATION = "876000h";
const MAX_BODY = 16_384;

/* ───────────── errors (stable codes, Spanish messages in the usted voice) ───────────── */

class Failure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Failure";
  }
}

/** A function declaration (not an arrow) so `if (…) fail(…)` narrows like a throw. */
function fail(status: number, code: string, message: string): never {
  throw new Failure(status, code, message);
}

const MSG = {
  sessionExpired: "Su sesión venció. Vuelva a iniciar sesión para continuar.",
  misconfigured: "El servicio de cuentas no está configurado. Avise a quien administra el sistema.",
  unavailable: "No se pudo contactar al servidor. Revise su conexión e intente de nuevo en unos minutos.",
  serverError: "El servicio de cuentas tuvo un error inesperado. Intente de nuevo en unos minutos.",
  emailTaken: "Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.",
  emailInvalid: "Escriba un correo completo, como nombre@empresa.com.",
  outOfScope: "No encontrado o fuera de su alcance.",
} as const;

const NETWORK_RE = /failed to fetch|fetch failed|networkerror|load failed|network request failed|connection|timed? ?out/i;

type DbError = { message: string; code?: string; details?: string | null; hint?: string | null };

/**
 * A PostgREST error → the contract. Business refusals keep the database's code (`PTnnn` → HTTP nnn) and its stable hint
 * and Spanish message; `details` (raw SQL text) never leaves the function.
 */
function dbFailure(error: DbError, status: number): Failure {
  const pt = /^PT(\d{3})$/.exec(error.code ?? "");
  if (pt) return new Failure(Number(pt[1]), error.hint || "rejected", error.message);
  if (error.code === "23505") return new Failure(409, "duplicate", "Ese registro ya existe.");
  if (error.code === "23503") return new Failure(422, "missing_reference", "Falta un dato relacionado: actualice la pantalla e intente de nuevo.");
  if (error.code === "42501") return new Failure(403, "forbidden", "Su cuenta no tiene permiso para esta acción.");
  if (status === 401 || /^PGRST30[0-3]$/.test(error.code ?? "")) return new Failure(401, "no_session", MSG.sessionExpired);
  if (status === 0 || NETWORK_RE.test(error.message)) return new Failure(503, "unavailable", MSG.unavailable);
  return new Failure(502, "server_error", MSG.serverError);
}

type AuthAdminError = { message: string; code?: string; status?: number; name?: string };
type AuthStep = "invite" | "email" | "lookup";

/** An Auth admin API error → the contract (GoTrue's `error.code`, HTTP status as fallback). */
function authFailure(error: AuthAdminError | null | undefined, step: AuthStep): Failure {
  if (!error) return new Failure(502, "server_error", MSG.serverError);
  if (isAuthRetryableFetchError(error) || error.status === 0) return new Failure(503, "unavailable", MSG.unavailable);
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
    case "identity_already_exists":
      return new Failure(409, "email_taken", "Ese correo ya tiene una cuenta de acceso: use uno distinto.");
    case "email_address_invalid":
    case "validation_failed":
      return new Failure(422, "invalid_email", MSG.emailInvalid);
    case "email_address_not_authorized":
      return new Failure(
        422,
        "email_not_authorized",
        "El servidor de correo actual solo envía a las direcciones autorizadas del proyecto. Pida que se configure el servidor de correo propio o use una dirección autorizada.",
      );
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return new Failure(
        429,
        "rate_limited",
        "Se alcanzó el límite de correos por hora del servidor de correo. Espere un rato e intente de nuevo.",
      );
    case "user_not_found":
      return new Failure(404, "auth_user_missing", "La cuenta de acceso no existe.");
  }
  if (error.status === 429) return new Failure(429, "rate_limited", "Hay demasiadas solicitudes seguidas. Espere unos minutos e intente de nuevo.");
  if (error.status === 404) return new Failure(404, "auth_user_missing", "La cuenta de acceso no existe.");
  if (step === "invite") return new Failure(502, "invite_failed", "No se pudo enviar la invitación. Intente de nuevo en unos minutos.");
  if (step === "email") return new Failure(502, "email_update_failed", "No se pudo cambiar el correo. Intente de nuevo en unos minutos.");
  return new Failure(502, "server_error", MSG.serverError);
}

/** For logs only: names and codes, never tokens, keys or addresses. */
const describe = (error: unknown): string => {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
    return [e.name, e.code, e.status, typeof e.message === "string" ? e.message.slice(0, 200) : undefined]
      .filter((part) => part !== undefined && part !== "")
      .join(" · ");
  }
  return String(error).slice(0, 200);
};

/* ───────────── request validation ───────────── */

const ROLES = ["direccion", "administracion", "supervisor"] as const;
type Role = (typeof ROLES)[number];

type InviteRequest = {
  action: "invite";
  opId: string;
  email: string;
  name: string;
  role: Role;
  unitId: string;
  title: string;
  phone: string;
  hue: number | null;
};
type ActiveRequest = { action: "deactivate" | "reactivate"; opId: string; userId: string };
type EmailRequest = { action: "change_email"; opId: string; userId: string; email: string };
type AdminRequest = InviteRequest | ActiveRequest | EmailRequest;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function invalid(message: string): never {
  return fail(422, "invalid_value", message);
}

function uuidField(body: Record<string, unknown>, key: string, message: string): string {
  const value = body[key];
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : invalid(message);
}

function emailField(body: Record<string, unknown>): string {
  const value = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  return value.length <= 254 && EMAIL_RE.test(value) ? value : fail(422, "invalid_email", MSG.emailInvalid);
}

function textField(body: Record<string, unknown>, key: string, max: number, message: string): string {
  const value = body[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > max) return invalid(message);
  return value.trim();
}

function parseRequest(raw: unknown): AdminRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "invalid_body", "La solicitud no es válida: envíe un objeto JSON con la acción y sus datos.");
  }
  const body = raw as Record<string, unknown>;
  const opId = uuidField(body, "opId", "Falta el identificador de la operación (opId).");
  switch (body.action) {
    case "invite": {
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      if (name.length < 3 || name.length > 120) invalid("Escriba el nombre completo (de 3 a 120 caracteres).");
      if (typeof body.role !== "string" || !(ROLES as readonly string[]).includes(body.role)) {
        invalid("Elija un rol válido: Dirección, Administración o Supervisor.");
      }
      const hue = body.hue === undefined || body.hue === null ? null : body.hue;
      if (hue !== null && !(typeof hue === "number" && Number.isInteger(hue) && hue >= 0 && hue <= 360)) {
        invalid("El color del avatar no es válido.");
      }
      return {
        action: "invite",
        opId,
        email: emailField(body),
        name,
        role: body.role as Role,
        unitId: uuidField(body, "unitId", "Elija la unidad de la persona."),
        title: textField(body, "title", 120, "El puesto admite hasta 120 caracteres."),
        phone: textField(body, "phone", 40, "El teléfono admite hasta 40 caracteres."),
        hue: hue as number | null,
      };
    }
    case "deactivate":
    case "reactivate":
      return { action: body.action, opId, userId: uuidField(body, "userId", "Indique la cuenta (userId).") };
    case "change_email":
      return { action: "change_email", opId, userId: uuidField(body, "userId", "Indique la cuenta (userId)."), email: emailField(body) };
    default:
      return fail(400, "unknown_action", "Acción desconocida. Use invite, deactivate, reactivate o change_email.");
  }
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, "payload_too_large", "La solicitud es demasiado grande.");
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, "invalid_body", "La solicitud no es válida: envíe un objeto JSON con la acción y sus datos.");
  }
}

/* ───────────── actions ───────────── */

type Ctx = {
  /** Scoped to the caller (their JWT): RLS applies and every RPC re-checks role, scope and rules. */
  db: SupabaseContext["supabase"];
  /** Secret key: used for auth.admin and for reading the caller's own profile row, nothing else. */
  admin: SupabaseContext["supabaseAdmin"];
  callerId: string;
};

const PROFILE_COLUMNS = "id, name, initials, role, title, unit_id, email, phone, hue, active";
type ProfileRow = {
  id: string;
  name: string;
  initials: string;
  role: Role;
  title: string;
  unit_id: string;
  email: string;
  phone: string;
  hue: number;
  active: boolean;
};
type RpcResult = { duplicate?: boolean; open_orders?: unknown } | null;

/** The caller must be an active Dirección. Read with the secret key, filtered to the caller's own id. */
async function requireDireccion(ctx: Ctx): Promise<void> {
  const { data, error, status } = await ctx.admin.from("profiles").select("role, active").eq("id", ctx.callerId).maybeSingle();
  if (error) throw dbFailure(error, status);
  const me = data as { role: Role; active: boolean } | null;
  if (!me) fail(401, "no_profile", "Su cuenta no tiene perfil en Pulkro Cuadrillas.");
  if (!me.active) fail(401, "inactive", "Su cuenta está desactivada.");
  if (me.role !== "direccion") fail(403, "forbidden:users.admin", "Su rol no administra usuarios.");
}

/** The profile as the caller reads it now (null if the read fails: the change is already done, the pull brings it). */
async function readProfile(ctx: Ctx, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await ctx.db.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) {
    console.warn("admin-users: profile read after the change failed", describe(error));
    return null;
  }
  return (data as ProfileRow | null) ?? null;
}

async function profileIdByEmail(ctx: Ctx, email: string, exceptId?: string): Promise<string | null> {
  let query = ctx.db.from("profiles").select("id").eq("email", email);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error, status } = await query.limit(1).maybeSingle();
  if (error) throw dbFailure(error, status);
  return (data as { id: string } | null)?.id ?? null;
}

function provision(ctx: Ctx, req: InviteRequest, userId: string) {
  return ctx.db.rpc("provision_profile", {
    p_op_id: req.opId,
    p_user_id: userId,
    p_name: req.name,
    p_role: req.role,
    p_unit_id: req.unitId,
    p_title: req.title,
    p_phone: req.phone,
    p_hue: req.hue,
  });
}

async function invite(ctx: Ctx, req: InviteRequest) {
  if (!APP_URL) {
    console.error("admin-users: APP_URL is not set (or not an http(s) URL)");
    fail(500, "server_misconfigured", MSG.misconfigured);
  }
  // Checked before anything is e-mailed: an invitation cannot be taken back.
  const unit = await ctx.db.from("units").select("id").eq("id", req.unitId).maybeSingle();
  if (unit.error) throw dbFailure(unit.error, unit.status);
  if (!unit.data) fail(422, "invalid_unit", "La unidad elegida no existe. Elija otra.");

  // The address already has a profile: either this same invite answered before (a retry after a lost response → the
  // stored result, nothing e-mailed again) or another account owns it.
  const existingId = await profileIdByEmail(ctx, req.email);
  if (existingId) {
    const replay = await provision(ctx, req, existingId);
    if (replay.error) {
      if (replay.error.hint === "already_provisioned") {
        fail(
          409,
          "email_taken",
          "Ese correo ya pertenece a una cuenta de Pulkro Cuadrillas. Si es la misma persona, búsquela en la lista y, si está desactivada, reactívela.",
        );
      }
      throw dbFailure(replay.error, replay.status);
    }
    return { ok: true, action: req.action, duplicate: true, user_id: existingId, profile: await readProfile(ctx, existingId) };
  }

  const startedAt = Date.now();
  const invited = await ctx.admin.auth.admin.inviteUserByEmail(req.email, { redirectTo: `${APP_URL}${INVITE_PATH}` });
  if (invited.error || !invited.data?.user) throw authFailure(invited.error, "invite");
  const user = invited.data.user;
  // GoTrue re-sends the invitation of an existing, never-confirmed account (same id, `invited_at` moves on): only an
  // account created by this call — just now, invited in the same step — is removed if the profile fails. (An auth user
  // with a profile can never be deleted anyway: profiles.id is ON DELETE RESTRICT.)
  const createdAt = Date.parse(user.created_at);
  const invitedAt = user.invited_at ? Date.parse(user.invited_at) : createdAt;
  const createdNow = createdAt >= startedAt - 60_000 && Math.abs(invitedAt - createdAt) < 5_000;

  const provisioned = await provision(ctx, req, user.id);
  if (provisioned.error) {
    if (createdNow) {
      const removed = await ctx.admin.auth.admin.deleteUser(user.id);
      if (removed.error) console.error("admin-users invite: could not remove the auth user after a failed profile", describe(removed.error));
    }
    throw dbFailure(provisioned.error, provisioned.status);
  }
  const result = provisioned.data as RpcResult;
  return { ok: true, action: req.action, duplicate: !!result?.duplicate, user_id: user.id, profile: await readProfile(ctx, user.id) };
}

async function setActive(ctx: Ctx, req: ActiveRequest) {
  const active = req.action === "reactivate";
  // The database first: it refuses self changes and other units' rules, revokes the sessions and lists open orders.
  const rpc = await ctx.db.rpc("update_profile", { p_op_id: req.opId, p_user_id: req.userId, p_patch: { active } });
  if (rpc.error) throw dbFailure(rpc.error, rpc.status);
  const result = rpc.data as RpcResult;
  // Then the auth account, mirroring the profile as it is NOW: a retried op answers its stored result even if someone
  // changed the status since, and two people may switch the same account at once — the ban follows the profile, not the
  // request, and is checked again after it is set. Idempotent, so a retry also repairs an attempt that stopped here.
  let profile = await readProfile(ctx, req.userId);
  let nowActive = profile ? profile.active : active;
  for (let round = 0; round < 3; round++) {
    const banned = await ctx.admin.auth.admin.updateUserById(req.userId, { ban_duration: nowActive ? "none" : BAN_DURATION });
    if (banned.error) {
      console.error(`admin-users ${req.action}: ${nowActive ? "unban" : "ban"} failed after the profile change`, describe(banned.error));
      if (nowActive) {
        fail(502, "unban_failed", "La cuenta quedó activa en Pulkro Cuadrillas, pero no se pudo quitar el bloqueo de acceso. Intente de nuevo.");
      }
      fail(502, "ban_failed", "La cuenta quedó desactivada en Pulkro Cuadrillas, pero no se pudo bloquear su acceso. Intente de nuevo.");
    }
    const after = await readProfile(ctx, req.userId);
    if (!after || after.active === nowActive) break;
    profile = after;
    nowActive = after.active;
  }
  const listed = result?.open_orders;
  const openOrders = Array.isArray(listed) ? listed.filter((folio): folio is string => typeof folio === "string") : [];
  return {
    ok: true,
    action: req.action,
    duplicate: !!result?.duplicate,
    user_id: req.userId,
    active: nowActive,
    open_orders: openOrders,
    profile,
  };
}

async function changeEmail(ctx: Ctx, req: EmailRequest) {
  // Checked before the auth account changes.
  const target = await ctx.db.from("profiles").select("id").eq("id", req.userId).maybeSingle();
  if (target.error) throw dbFailure(target.error, target.status);
  if (!target.data) fail(404, "out_of_scope", MSG.outOfScope);
  if (await profileIdByEmail(ctx, req.email, req.userId)) fail(409, "email_taken", MSG.emailTaken);

  const found = await ctx.admin.auth.admin.getUserById(req.userId);
  if (found.error || !found.data?.user) throw authFailure(found.error, "lookup");
  const previous = found.data.user.email ?? "";
  // Never accepted the invitation: the old link went to the old address, so the person sets a password through
  // "¿Olvidó su contraseña?" with the new one (the account is confirmed below).
  const invitePending = !!found.data.user.invited_at && !found.data.user.email_confirmed_at;

  let changedAuth = false;
  if (previous.toLowerCase() !== req.email) {
    const updated = await ctx.admin.auth.admin.updateUserById(req.userId, { email: req.email, email_confirm: true });
    if (updated.error) throw authFailure(updated.error, "email");
    changedAuth = true;
  }

  const restoreLogin = async (why: string) => {
    if (!changedAuth || !previous) return;
    const reverted = await ctx.admin.auth.admin.updateUserById(req.userId, { email: previous, email_confirm: true });
    if (reverted.error) console.error(`admin-users change_email: could not restore the previous auth e-mail (${why})`, describe(reverted.error));
  };
  const done = (profile: ProfileRow | null, duplicate: boolean) => ({
    ok: true,
    action: req.action,
    duplicate,
    user_id: req.userId,
    email: req.email,
    invite_pending: invitePending,
    profile,
  });

  const synced = await ctx.db.rpc("sync_profile_email", { p_op_id: req.opId, p_user_id: req.userId });
  if (synced.error) {
    const failure = dbFailure(synced.error, synced.status);
    if (failure.status >= 500) {
      // Unknown outcome (network, timeout, 5xx): the sync may have committed, so the login is never undone on a guess.
      // Sending the same request again completes it without repeating anything.
      const now = await readProfile(ctx, req.userId);
      if (now?.email === req.email) return done(now, false);
      throw failure;
    }
    // A definite refusal: nothing changed in the profile, so the login goes back too.
    await restoreLogin("sync refused");
    throw failure;
  }
  const result = synced.data as RpcResult;
  const now = await readProfile(ctx, req.userId);
  if (result?.duplicate && changedAuth && now?.email !== req.email) {
    // This op was applied before and the address changed again since (the stored result does not re-sync the profile):
    // the login goes back to what it was instead of differing from the profile. (When the profile already holds this
    // address — an earlier attempt synced it and its login change was lost — the login now matches it: nothing to undo.)
    await restoreLogin("stale retry");
    fail(409, "stale_retry", "Este cambio ya se había aplicado y el correo cambió después. Actualice la pantalla y revise el correo actual.");
  }
  return done(now, !!result?.duplicate);
}

function run(ctx: Ctx, req: AdminRequest) {
  switch (req.action) {
    case "invite":
      return invite(ctx, req);
    case "deactivate":
    case "reactivate":
      return setActive(ctx, req);
    case "change_email":
      return changeEmail(ctx, req);
  }
}

/* ───────────── HTTP ───────────── */

/** CORS for the app's own origins only. Calls without an Origin header (curl, server code) get no CORS headers. */
function corsFor(req: Request): { allowed: boolean; headers: Headers } {
  const headers = new Headers({ Vary: "Origin" });
  const origin = req.headers.get("Origin");
  if (!origin) return { allowed: true, headers };
  if (!APP_ORIGINS.has(origin)) return { allowed: false, headers };
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", supabaseCorsHeaders["Access-Control-Allow-Headers"]);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  return { allowed: true, headers };
}

function reply(status: number, body: unknown, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });

  let action = "unknown";
  try {
    if (!cors.allowed) fail(403, "origin_not_allowed", "Este sitio no puede usar el servicio de cuentas de Pulkro Cuadrillas.");
    if (req.method !== "POST") fail(405, "method_not_allowed", "Use POST para llamar a este servicio.");

    // verify_jwt already rejected requests without a valid JWT at the gateway; this verifies it again (project JWKS) and
    // builds the caller-scoped client and the secret-key client.
    const auth = await createSupabaseContext(req, { auth: "user", env: SERVER_ENV });
    if (auth.error) {
      if (auth.error.status === 401) fail(401, "no_session", MSG.sessionExpired);
      console.error("admin-users: context setup failed", describe(auth.error));
      // the project's signing keys could not be fetched right now: temporary, not a configuration problem
      if (auth.error.status === 503 || auth.error.code === "JWKS_FETCH_FAILED") fail(503, "unavailable", MSG.unavailable);
      fail(500, "server_misconfigured", MSG.misconfigured);
    }
    const context = auth.data;
    const callerId = context.userClaims?.id;
    if (!callerId) fail(401, "no_session", MSG.sessionExpired);

    const ctx: Ctx = { db: context.supabase, admin: context.supabaseAdmin, callerId };
    await requireDireccion(ctx);
    const request = parseRequest(await readBody(req));
    action = request.action;
    return reply(200, await run(ctx, request), cors.headers);
  } catch (error) {
    if (error instanceof Failure) {
      if (error.status >= 500) console.error(`admin-users ${action}: ${error.code}`);
      return reply(error.status, { ok: false, code: error.code, message: error.message }, cors.headers);
    }
    console.error(`admin-users ${action}: unexpected error`, describe(error));
    return reply(500, { ok: false, code: "server_error", message: MSG.serverError }, cors.headers);
  }
});
