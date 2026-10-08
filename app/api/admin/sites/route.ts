import { NextResponse } from "next/server";
import { assertScopedAdmin, superAdminOnly } from "@/lib/admin-scope";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { createLandingSite, listLandingSites } from "@/lib/data/landing-sites";

export async function GET() {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const sites = await listLandingSites();
    const { scope } = access;
    return NextResponse.json({
      sites: scope.all ? sites : sites.filter((site) => site.slug === scope.site?.slug),
    });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t load the sites.");
  }
}

/** A new subdomain is a new tenant: super admins only. */
export async function POST(request: Request) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.scope.all) return superAdminOnly("create a subdomain");

  const body = (await request.json().catch(() => null)) as
    | { slug?: unknown; name?: unknown; copyFrom?: unknown }
    | null;
  if (!body || typeof body.slug !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "A subdomain and a name are required." }, { status: 400 });
  }

  try {
    const site = await createLandingSite({
      slug: body.slug,
      name: body.name,
      copyFrom: typeof body.copyFrom === "string" ? body.copyFrom : undefined,
      userId: access.userId,
    });
    await recordFacultyActivity({
      actorId: access.userId,
      action: "site.created",
      siteSlug: site.slug,
      summary: `Created subdomain ${site.name}`,
    });
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t create the site.");
  }
}
