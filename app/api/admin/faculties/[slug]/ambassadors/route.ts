import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { setFacultyAmbassador } from "@/lib/data/faculty-managers";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";

type Context = { params: Promise<{ slug: string }> };

const bodySchema = z.object({ userId: z.string().uuid(), action: z.enum(["add", "remove"]) });

/** Super admins only: add or remove one of a faculty's ambassadors (it may have several). */
export async function PUT(request: Request, { params }: Context) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
  try {
    const result = await setFacultyAmbassador({
      facultySlug: (await params).slug,
      userId: parsed.data.userId,
      actorUserId: access.userId,
      action: parsed.data.action,
    });
    await recordFacultyActivity({
      actorId: access.userId,
      action: parsed.data.action === "add" ? "faculty.ambassador_added" : "faculty.ambassador_removed",
      summary:
        parsed.data.action === "add"
          ? `Added ${result.person?.fullName ?? "an ambassador"} as an ambassador of ${result.facultyName}`
          : `Removed an ambassador from ${result.facultyName}`,
      communityId: result.facultyId,
      communityName: result.facultyName,
      details: { userId: parsed.data.userId },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
