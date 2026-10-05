import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import {
  addStudentAmbassador,
  listStudentAmbassadors,
  removeStudentAmbassador,
} from "@/lib/data/student-ambassadors";

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

/** Super admin only: who may create faculties. */
export async function GET() {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json({ ambassadors: await listStudentAmbassadors() });
  } catch (error) {
    console.error("[admin/ambassadors]", error);
    return NextResponse.json({ error: "Could not load ambassadors." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    await addStudentAmbassador(parsed.data.email, access.userId);
    return NextResponse.json({ ambassadors: await listStudentAmbassadors() }, { status: 201 });
  } catch (error) {
    console.error("[admin/ambassadors]", error);
    return NextResponse.json({ error: "Could not add this ambassador." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    await removeStudentAmbassador(parsed.data.email);
    return NextResponse.json({ ambassadors: await listStudentAmbassadors() });
  } catch (error) {
    console.error("[admin/ambassadors]", error);
    return NextResponse.json({ error: "Could not remove this ambassador." }, { status: 500 });
  }
}
