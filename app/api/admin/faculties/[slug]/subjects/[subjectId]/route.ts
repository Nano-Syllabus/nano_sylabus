import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { subjectUpdateSchema } from "@/lib/admin-faculties";
import { updateAdminFacultySubject } from "@/lib/data/admin-faculties";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; subjectId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { slug, subjectId } = await params;
    z.string().uuid().parse(subjectId);
    const input = subjectUpdateSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ faculty: await updateAdminFacultySubject(slug, subjectId, input) });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
