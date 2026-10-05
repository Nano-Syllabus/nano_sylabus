import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { facultyUpdateSchema } from "@/lib/admin-faculties";
import { getAdminFaculty, updateAdminFaculty } from "@/lib/data/admin-faculties";
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json({ faculty: await getAdminFaculty((await params).slug) });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const input = facultyUpdateSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ faculty: await updateAdminFaculty((await params).slug, input) });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
