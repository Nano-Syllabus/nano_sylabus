import { NextResponse } from "next/server";
import { assertScopedAdmin } from "@/lib/admin-scope";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { communityInputSchema } from "@/lib/communities";
import { createCommunity } from "@/lib/data/communities";
import { listAdminFaculties } from "@/lib/data/admin-faculties";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";

export async function GET() {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const faculties = await listAdminFaculties();
    const { scope } = access;
    return NextResponse.json({
      faculties: scope.all
        ? faculties
        : faculties.filter((faculty) => scope.faculties.some((own) => own.id === faculty.id)),
    });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const access = await assertScopedAdmin();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const input = communityInputSchema.parse(await request.json().catch(() => null));
    const faculty = await createCommunity(access.userId, input);
    await recordFacultyActivity({
      actorId: access.userId,
      action: "faculty.created",
      communityId: faculty.id,
      communityName: faculty.name,
      siteSlug: access.scope.all ? null : (access.scope.site?.slug ?? null),
      summary: `Created faculty ${faculty.name}`,
      details: { via: "admin panel" },
    });
    return NextResponse.json({ faculty }, { status: 201 });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
