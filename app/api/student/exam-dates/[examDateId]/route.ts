import { z } from "zod";
import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const patchSchema = z
  .object({
    date: z.string().regex(datePattern, "Enter a valid exam date.").optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.date !== undefined || value.title !== undefined, {
    message: "Add a date or a name to update the exam.",
  });

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type RouteContext = { params: Promise<{ examDateId: string }> };

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  return { supabase, user };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return errorJson("Unauthorized", 401);

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (parsed.data.date !== undefined && !isRealDate(parsed.data.date))) {
      return errorJson("Enter a real exam date and a name up to 120 characters.", 400);
    }

    const { examDateId } = await params;
    const updates = {
      ...(parsed.data.date ? { exam_date: parsed.data.date } : {}),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("student_exam_dates")
      .update(updates)
      .eq("id", examDateId)
      .eq("user_id", user.id)
      .select("id,exam_date,title")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return errorJson("You already have an exam on this date.", 409);
      throw error;
    }
    if (!data) return errorJson("Exam date not found.", 404);

    return privateJson(
      { examDate: { id: data.id, date: data.exam_date, title: data.title } },
      { request, profile: CACHE.REVALIDATE },
    );
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Could not update the exam date.",
      502,
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return errorJson("Unauthorized", 401);

    const { examDateId } = await params;
    const { data, error } = await supabase
      .from("student_exam_dates")
      .delete()
      .eq("id", examDateId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return errorJson("Exam date not found.", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Could not delete the exam date.",
      502,
    );
  }
}
