import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsFaculty } from "@/lib/admin-scope";
import { listFacultyActivity } from "@/lib/data/faculty-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The faculty change log, newest first. `?faculty=<slug>` narrows to one
 * faculty (and the subdomains that list it); without it, everything in the
 * viewer's reach. `?before=<id>` pages.
 */
export async function GET(request: Request) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { searchParams } = new URL(request.url);
  const facultySlug = searchParams.get("faculty")?.trim().slice(0, 100) || "";
  const before = Number(searchParams.get("before")) || undefined;
  const limit = Number(searchParams.get("limit")) || 50;
  const { scope } = access;

  try {
    let facultyIds: string[] | undefined;
    let siteSlugs: string[] | undefined;
    if (facultySlug) {
      if (!scopeAllowsFaculty(scope, { slug: facultySlug })) return outOfScope("that faculty");
      const admin = createSupabaseAdminClient();
      const { data: faculty, error } = await admin
        .from("communities")
        .select("id")
        .eq("slug", facultySlug)
        .maybeSingle();
      if (error) throw error;
      if (!faculty) return NextResponse.json({ error: "Faculty not found." }, { status: 404 });
      facultyIds = [faculty.id];
      // Site-level rows (admins added, site renamed) belong to its faculties' story too.
      const { data: links } = await admin
        .from("landing_exam_faculties")
        .select("exam_slug")
        .eq("community_id", faculty.id)
        .eq("is_active", true);
      siteSlugs = (links ?? [])
        .map((link) => link.exam_slug as string)
        .filter((slug) => scope.all || scope.site?.slug === slug);
    } else if (!scope.all) {
      facultyIds = scope.faculties.map((faculty) => faculty.id);
      siteSlugs = scope.site ? [scope.site.slug] : [];
    }
    const result = await listFacultyActivity({
      facultyIds,
      siteSlugs,
      before,
      limit,
      showEmails: scope.all,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[faculty-activity]", error);
    return NextResponse.json({ error: "Couldn’t load the change history." }, { status: 500 });
  }
}
