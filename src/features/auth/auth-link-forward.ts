/**
 * E-mail links that land off /acceso/definir-contrasena. Supabase's default e-mails link to Auth's /verify, which then
 * redirects to the link's `redirect_to`. When the link has none (an invite sent from the dashboard), or it is not in the
 * project's redirect allow list, Auth redirects to the Site URL instead: the app's root, with the session in the fragment
 * (`#access_token=…`), a PKCE code in the query (`?code=…`) or the failure (`#error_code=…`).
 *
 * FORWARD_AUTH_LINK_SCRIPT runs inline in the root layout's <head>, while the HTML is parsed: before React, the store or the
 * Supabase client exist. It sends such a landing to /acceso/definir-contrasena (location.replace, so the landing leaves the
 * history). The fragment goes along as it is; only the query keys of a link go along: never a `next=` or anything else
 * the URL carried. It forwards a URL that has:
 *  - in the fragment: `access_token` or `error_code`;
 *  - in the query: `token_hash` or `code` together with an Auth `type`, or `error_code` with `error_description`;
 *  - on the root path only (the Site URL): `code` alone. That is how a PKCE recovery comes back without its redirect.
 * No route of the app reads `code`, `token_hash`, `type`, `access_token` or `error_code` (`/encuesta/[token]` takes its
 * token from the path). A `hashchange` listener covers a link pasted into a tab that is already open on the app (a fragment
 * change does not reload the page).
 *
 * The source is plain ES5 with no imports, because it is inlined as a string. It also contains no backslashes, which a
 * template literal would eat.
 */

export const AUTH_LINK_PATH = "/acceso/definir-contrasena";

/** `function (w)` over a window-like object; FORWARD_AUTH_LINK_SCRIPT calls it with `window`. */
export const FORWARD_AUTH_LINK_SOURCE = `function (w) {
  var PATH = "${AUTH_LINK_PATH}";
  var TYPES = ["invite", "recovery", "magiclink", "signup", "email_change", "email"];
  var KEEP = ["token_hash", "type", "code", "sb_flow_id", "error", "error_code", "error_description"];
  function params(s) {
    try { return new URLSearchParams(s); } catch (e) { return new URLSearchParams(""); }
  }
  function target(l) {
    var path = l.pathname || "/";
    while (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    if (path === PATH) return null;
    var hash = l.hash || "";
    var h = params(hash.charAt(0) === "#" ? hash.slice(1) : "");
    var q = params(l.search || "");
    var type = q.get("type");
    var authType = type !== null && TYPES.indexOf(type) >= 0;
    var inHash = h.has("access_token") || h.has("error_code");
    var inQuery = ((q.has("token_hash") || q.has("code")) && authType) ||
      (q.has("error_code") && q.has("error_description")) ||
      (path === "/" && !!q.get("code"));
    if (!inHash && !inQuery) return null;
    var keep = new URLSearchParams();
    q.forEach(function (v, k) { if (KEEP.indexOf(k) >= 0) keep.append(k, v); });
    var s = keep.toString();
    return PATH + (s ? "?" + s : "") + (hash.length > 1 ? hash : "");
  }
  function run() {
    try {
      var to = target(w.location);
      if (!to) return;
      w.location.replace(to);
      w.__pkAuthLinkForward = true;
    } catch (e) {}
  }
  run();
  w.addEventListener("hashchange", run);
}`;

export const FORWARD_AUTH_LINK_SCRIPT = `(${FORWARD_AUTH_LINK_SOURCE})(window);`;

/**
 * This document is on its way to /acceso/definir-contrasena: the app does not start here (no store, no session read), so
 * the shell cannot send it to /login before the forward lands.
 */
export function isForwardingAuthLink(): boolean {
  return typeof window !== "undefined" && (window as Window & { __pkAuthLinkForward?: boolean }).__pkAuthLinkForward === true;
}
