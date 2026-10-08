import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { facultyErrorResponse, invalidFacultyOrigin } from "@/lib/admin/faculty-response";
import { setFacultyCreator } from "@/lib/data/faculty-managers";

type Context = { params: Promise<{ slug: string }> };

const bodySchema = z.object({ userId: z.string().uuid() });

/** Super admins only: hand a faculty to a new creator, from the Faculties page. */
export async function PUT(request: Request, { params }: Context) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (invalidFacultyOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
  try {
    await setFacultyCreator((await params).slug, parsed.data.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return facultyErrorResponse(error);
  }
}
