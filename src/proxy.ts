import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Next 16 Proxy (the former Middleware): refreshes the Supabase session cookies on each request so server code and the
 * browser client share a live session.
 *
 * It never redirects. The demo has no Supabase session, and the app gates its routes on the client from the on-device
 * store session (AppShell → /login), which also works offline. The database decides what an account may read or write.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // The refreshed cookies go to the rendering request and to the browser; the response is rebuilt each time, so
        // only the one built here (last) carries them.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Cache-Control / Expires / Pragma: a response that sets auth cookies must never be cached for someone else.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Nothing may run between creating the client and this call. getClaims() refreshes an expired access token (through
  // setAll above) and verifies the JWT; never getSession() on the server.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Auth unreachable: serve the page anyway (the app works from the device) and refresh on a later request.
  }

  // Return exactly the response setAll built: a fresh NextResponse would drop the refreshed cookies and sign the user out.
  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except static files and images, the service worker, the web manifest, icons and other public assets.
     */
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|favicon\\.ico|icons/|brand/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|txt|xml)$).*)",
  ],
};
