import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsFaculty } from "@/lib/admin-scope";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { subjectCreateSchema } from "@/lib/admin-faculties";
import { addAdminFacultySubject } from "@/lib/data/admin-faculties";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!scopeAllowsFaculty(access.scope, { slug })) return outOfScope("that faculty");
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const input = subjectCreateSchema.parse(await request.json().catch(() => null));
    const startedAt = new Date().toISOString();
    const faculty = await addAdminFacultySubject(slug, input);
    // The subject is attached under the faculty's creator, so the trigger logged
    // them; credit the admin who actually pressed Add.
    await createSupabaseAdminClient()
      .from("faculty_activity")
      .update({ actor_id: access.userId, details: { via: "admin panel" } })
      .eq("action", "subject.added")
      .eq("community_id", faculty.id)
      .gte("created_at", startedAt)
      .then(({ error }) => {
        if (error) console.error("[faculty-activity] actor not updated", error.message);
      });
    return NextResponse.json({ faculty }, { status: 201 });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
