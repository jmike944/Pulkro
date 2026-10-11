/**
 * Where to go after signing in (`/login?next=…`): a path of this app, never another origin.
 *
 * The raw value is checked before the URL parser sees it, because the WHATWG parser strips tab / LF / CR and reads "\" as "/":
 * "/\t/evil.example" passes a "starts with / but not //" test and still resolves to evil.example. Then the value is resolved
 * against this origin, must stay on it, and is rebuilt from pathname + search + hash. Dot segments are resolved by the parser
 * too ("/.//evil.example" → "//evil.example"), so the rebuilt path is checked again. The sign-in screens themselves are
 * never a destination (that would loop).
 */

const UNSAFE = /[\u0000-\u001f\u007f\\]/;
/** Origin used to resolve the value while rendering on the server (any origin works: only same-origin paths survive). */
const FALLBACK_ORIGIN = "https://pulkro.invalid";
const AUTH_SCREENS = ["/login", "/acceso"];

function decoded(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

export function safeNext(next: string | null | undefined, origin?: string): string {
  if (!next || UNSAFE.test(next) || !next.startsWith("/") || next.startsWith("//")) return "/";
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN);
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return "/";
  }
  if (url.origin !== base) return "/";
  const path = url.pathname;
  // The same tests on the parsed (and on the percent-decoded) path: nothing downstream may turn it into "//host" or "\host".
  const plain = decoded(path);
  if (plain === null || !path.startsWith("/") || path.startsWith("//") || plain.startsWith("//") || UNSAFE.test(plain)) return "/";
  const screen = plain.toLowerCase().replace(/\/+$/, "");
  if (AUTH_SCREENS.some((p) => screen === p || screen.startsWith(`${p}/`))) return "/";
  return `${path}${url.search}${url.hash}`;
}
