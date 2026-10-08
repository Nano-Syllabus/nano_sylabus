import { NextResponse } from "next/server";
import { z } from "zod";
import { assertScopedAdmin, outOfScope, scopeAllowsFaculty } from "@/lib/admin-scope";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { subjectUpdateSchema } from "@/lib/admin-faculties";
import { updateAdminFacultySubject } from "@/lib/data/admin-faculties";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; subjectId: string }> },
) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { slug, subjectId } = await params;
    z.string().uuid().parse(subjectId);
    if (!scopeAllowsFaculty(access.scope, { slug })) return outOfScope("that faculty");
    const input = subjectUpdateSchema.parse(await request.json().catch(() => null));
    const faculty = await updateAdminFacultySubject(slug, subjectId, input);
    const subjectName =
      faculty.subjects?.find((subject: { id: string; name: string }) => subject.id === subjectId)
        ?.name ?? "a subject";
    await recordFacultyActivity({
      actorId: access.userId,
      action: input.action === "publish" ? "subject.published" : "subject.updated",
      communityId: faculty.id,
      communityName: faculty.name,
      summary: `${input.action === "publish" ? "Published" : "Edited"} subject ${subjectName}`,
      details: { subjectId, subject: subjectName, via: "admin panel" },
    });
    return NextResponse.json({ faculty });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
