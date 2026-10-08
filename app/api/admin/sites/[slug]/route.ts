import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsSite, superAdminOnly } from "@/lib/admin-scope";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { deleteLandingSite, getLandingSite, updateLandingSite } from "@/lib/data/landing-sites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!scopeAllowsSite(access.scope, slug)) return outOfScope("that subdomain");

  try {
    const site = await getLandingSite(slug);
    if (!site) return NextResponse.json({ error: "That site doesn’t exist." }, { status: 404 });
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t load the site.");
  }
}

/** Saves the draft, and/or renames, and/or shows or hides the site. */
export async function PATCH(request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  const { scope } = access;
  if (!scopeAllowsSite(scope, slug)) return outOfScope("that subdomain");

  const body = (await request.json().catch(() => null)) as {
    draft?: unknown;
    name?: unknown;
    status?: unknown;
    examConfig?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const status = body.status === "live" || body.status === "hidden" ? body.status : undefined;
  if (body.status !== undefined && !status) {
    return NextResponse.json({ error: "Status must be live or hidden." }, { status: 400 });
  }

  try {
    const before = await getLandingSite(slug);
    if (!before) return NextResponse.json({ error: "That site doesn’t exist." }, { status: 404 });

    const nextSlugs =
      body.examConfig && typeof body.examConfig === "object" &&
      Array.isArray((body.examConfig as { facultySlugs?: unknown }).facultySlugs)
        ? ((body.examConfig as { facultySlugs: unknown[] }).facultySlugs.filter(
            (value): value is string => typeof value === "string",
          ))
        : null;
    const added = nextSlugs ? nextSlugs.filter((s) => !before.examConfig.facultySlugs.includes(s)) : [];
    const removed = nextSlugs
      ? before.examConfig.facultySlugs.filter((s) => !nextSlugs.includes(s))
      : [];
    // Linking a faculty to a site hands that site's admins its management, so an
    // admin may bring in only faculties they created themselves.
    if (!scope.all && added.length) {
      const foreign = added.filter(
        (facultySlug) => !scope.faculties.some((faculty) => faculty.slug === facultySlug),
      );
      if (foreign.length)
        return NextResponse.json(
          {
            error:
              "You can link only faculties you created. Ask a super admin to link another creator’s faculty.",
          },
          { status: 403 },
        );
    }

    const site = await updateLandingSite(
      slug,
      {
        draft: body.draft,
        name: typeof body.name === "string" ? body.name : undefined,
        status,
        examConfig: body.examConfig,
      },
      access.userId,
    );

    const changed = [...added, ...removed];
    const faculties = changed.length
      ? ((
          await createSupabaseAdminClient()
            .from("communities")
            .select("id,slug,name")
            .in("slug", changed)
        ).data ?? [])
      : [];
    const bySlug = new Map(faculties.map((row) => [row.slug, row]));
    await Promise.all([
      ...added.map((facultySlug) =>
        recordFacultyActivity({
          actorId: access.userId,
          action: "site.faculty_linked",
          siteSlug: slug,
          communityId: bySlug.get(facultySlug)?.id,
          communityName: bySlug.get(facultySlug)?.name ?? facultySlug,
          summary: `Linked to subdomain ${site.name}`,
        }),
      ),
      ...removed.map((facultySlug) =>
        recordFacultyActivity({
          actorId: access.userId,
          action: "site.faculty_unlinked",
          siteSlug: slug,
          communityId: bySlug.get(facultySlug)?.id,
          communityName: bySlug.get(facultySlug)?.name ?? facultySlug,
          summary: `Removed from subdomain ${site.name}`,
        }),
      ),
      site.name !== before.name
        ? recordFacultyActivity({
            actorId: access.userId,
            action: "site.renamed",
            siteSlug: slug,
            summary: `Renamed subdomain ${before.name} → ${site.name}`,
          })
        : null,
      site.status !== before.status
        ? recordFacultyActivity({
            actorId: access.userId,
            action: "site.status_changed",
            siteSlug: slug,
            summary: `Subdomain ${site.name} is now ${site.status === "live" ? "live" : "hidden"}`,
          })
        : null,
      site.examConfig.enabled !== before.examConfig.enabled
        ? recordFacultyActivity({
            actorId: access.userId,
            action: "site.status_changed",
            siteSlug: slug,
            summary: `${site.examConfig.enabled ? "Turned on" : "Turned off"} the faculty flow on ${site.name}`,
          })
        : null,
    ]);
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t save the site.");
  }
}

/** Deleting a tenant is a super admin's call. */
export async function DELETE(_request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.scope.all) return superAdminOnly("delete a subdomain");

  try {
    const { slug } = await params;
    const before = await getLandingSite(slug);
    await deleteLandingSite(slug);
    await recordFacultyActivity({
      actorId: access.userId,
      action: "site.deleted",
      siteSlug: slug,
      summary: `Deleted subdomain ${before?.name ?? slug}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t delete the site.");
  }
}
