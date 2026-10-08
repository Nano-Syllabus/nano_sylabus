import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsSite } from "@/lib/admin-scope";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { publishLandingSite } from "@/lib/data/landing-sites";

/** Makes the draft live. The body may carry the latest draft, saved in the same write. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!scopeAllowsSite(access.scope, slug)) return outOfScope("that subdomain");

  const body = (await request.json().catch(() => null)) as { draft?: unknown } | null;

  try {
    const site = await publishLandingSite(slug, access.userId, body?.draft);
    await recordFacultyActivity({
      actorId: access.userId,
      action: "site.published",
      siteSlug: slug,
      summary: `Published the ${site.name} landing page`,
    });
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t publish the site.");
  }
}
