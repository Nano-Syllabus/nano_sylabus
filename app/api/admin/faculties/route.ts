import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { communityInputSchema } from "@/lib/communities";
import { createCommunity } from "@/lib/data/communities";
import { listAdminFaculties } from "@/lib/data/admin-faculties";

export async function GET() {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json({ faculties: await listAdminFaculties() });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const input = communityInputSchema.parse(await request.json().catch(() => null));
    const faculty = await createCommunity(access.userId, input);
    return NextResponse.json({ faculty }, { status: 201 });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
