import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { subjectCreateSchema } from "@/lib/admin-faculties";
import { addAdminFacultySubject } from "@/lib/data/admin-faculties";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const input = subjectCreateSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(
      { faculty: await addAdminFacultySubject((await params).slug, input) },
      { status: 201 },
    );
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
