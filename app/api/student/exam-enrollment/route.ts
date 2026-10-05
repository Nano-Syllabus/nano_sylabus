import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { getStudentExamEnrollment, selectExamFaculty } from "@/lib/data/exam-enrollment";
import { LandingSiteError } from "@/lib/data/landing-sites";

const selectionSchema = z.object({
  examSlug: z.string().min(1).max(40),
  facultyId: z.string().uuid(),
  answers: z.record(z.string().max(100)),
});

export async function POST(request: Request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  if (!user)
    return NextResponse.json({ error: "Sign in to choose your faculty." }, { status: 401 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a supported faculty and answer the preparation questions." },
      { status: 400 },
    );
  try {
    const result = await selectExamFaculty(
      user.id,
      parsed.data.examSlug,
      parsed.data.facultyId,
      parsed.data.answers,
    );
    revalidatePath("/app", "layout");
    return NextResponse.json({ enrollment: result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof LandingSiteError
            ? error.message
            : "Could not save your faculty. Please retry.",
      },
      { status: error instanceof LandingSiteError ? error.status : 500 },
    );
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ enrollment: await getStudentExamEnrollment(user.id) });
}
