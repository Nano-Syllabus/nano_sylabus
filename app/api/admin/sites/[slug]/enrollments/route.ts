import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectExamFaculty } from "@/lib/data/exam-enrollment";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_exam_enrollments")
    .select("user_id,community_id,selected_at,communities!inner(name)")
    .eq("exam_slug", (await params).slug)
    .order("selected_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "Could not load students." }, { status: 500 });
  const ids = (data ?? []).map((row) => row.user_id);
  const profiles = ids.length
    ? await admin.from("student_profiles").select("user_id,full_name").in("user_id", ids)
    : { data: [] };
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.user_id, profile.full_name]),
  );
  return NextResponse.json({
    students: (data ?? []).map((row) => ({
      userId: row.user_id,
      name: names.get(row.user_id) || "Student",
      facultyId: row.community_id,
      facultyName: (
        (Array.isArray(row.communities) ? row.communities[0] : row.communities) as unknown as {
          name: string;
        }
      ).name,
      selectedAt: row.selected_at,
    })),
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = z
    .object({ userId: z.string().uuid(), facultyId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Choose a student and faculty." }, { status: 400 });
  const slug = (await params).slug;
  const { data, error } = await createSupabaseAdminClient()
    .from("student_exam_enrollments")
    .select("preparation_answers")
    .eq("user_id", parsed.data.userId)
    .eq("exam_slug", slug)
    .maybeSingle();
  if (error || !data)
    return NextResponse.json(
      { error: "Student enrollment not found for this exam." },
      { status: 404 },
    );
  try {
    const enrollment = await selectExamFaculty(
      parsed.data.userId,
      slug,
      parsed.data.facultyId,
      data.preparation_answers,
      true,
    );
    revalidatePath("/app", "layout");
    return NextResponse.json({ enrollment });
  } catch (cause) {
    return landingSiteErrorResponse(cause, "Could not change this student’s faculty.");
  }
}
