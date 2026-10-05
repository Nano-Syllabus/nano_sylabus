import { NextResponse, type NextRequest } from "next/server";
import { isValidSiteSlug, siteOrigin, siteSlugFromHost } from "@/lib/landing-site-host";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // highschool.nanosyllabus.com/ → that site's landing page. Only the home
  // page differs per subdomain; every other path is the same app.
  if (request.nextUrl.pathname === "/") {
    const slug = siteSlugFromHost(request.headers.get("host"));
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/sites/${slug}`;
      return NextResponse.rewrite(url);
    }
  }
  // A site lives only on its own subdomain. `/sites/<slug>` is the internal
  // rewrite target (a rewrite never re-enters middleware), so a direct visit —
  // nanosyllabus.com/sites/license — is sent to license.nanosyllabus.com.
  const sitePath = /^\/sites\/([^/]+)\/?$/.exec(request.nextUrl.pathname);
  if (sitePath && isValidSiteSlug(sitePath[1])) {
    const slug = sitePath[1];
    if (process.env.NODE_ENV === "production") {
      return NextResponse.redirect(`${siteOrigin(slug)}/`);
    }
    const { protocol, port } = request.nextUrl;
    return NextResponse.redirect(`${protocol}//${slug}.localhost${port ? `:${port}` : ""}/`);
  }
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
