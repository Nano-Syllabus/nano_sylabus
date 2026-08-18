import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * The gate in `resolveAccess` only ever acts on /admin, /app, /onboarding,
   * /login and /signup — every other path was allowed through after paying for
   * a full `auth.getUser()` round trip. API routes are the costly case: they
   * authenticate themselves, and the chat, exam and sidebar surfaces call them
   * constantly, so each one was doubling its own auth latency here for nothing.
   *
   * Page navigations outside the gated paths stay matched so the session cookie
   * still gets refreshed while browsing.
   */
  matcher: [
    "/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2|ttf|otf)$).*)",
  ],
};
