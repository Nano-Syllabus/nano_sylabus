import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsFaculty } from "@/lib/admin-scope";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { facultyUpdateSchema } from "@/lib/admin-faculties";
import { getAdminFaculty, updateAdminFaculty } from "@/lib/data/admin-faculties";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!scopeAllowsFaculty(access.scope, { slug })) return outOfScope("that faculty");
  try {
    return NextResponse.json({ faculty: await getAdminFaculty(slug) });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { slug } = await params;
  if (!scopeAllowsFaculty(access.scope, { slug })) return outOfScope("that faculty");
  try {
    const input = facultyUpdateSchema.parse(await request.json().catch(() => null));
    const before = (await getAdminFaculty(slug)) as unknown as Record<string, unknown>;
    const faculty = await updateAdminFaculty(slug, input);
    const changed = Object.entries(input)
      .filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))
      .map(([key, value]) => ({ field: key, from: before[key] ?? null, to: value }));
    if (changed.length)
      await recordFacultyActivity({
        actorId: access.userId,
        action: "faculty.updated",
        communityId: String(before.id),
        communityName: String(input.name ?? before.name),
        summary: `Changed ${changed.map((change) => change.field).join(", ")}`,
        details: { changes: changed },
      });
    return NextResponse.json({ faculty });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
