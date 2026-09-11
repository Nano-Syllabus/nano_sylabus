import { z } from "zod";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CACHE, errorJson, privateJson } from "@/lib/http/cache";

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const examDateSchema = z.object({
  date: z.string().regex(datePattern, "Enter a valid exam date."),
  title: z.string().trim().min(1).max(120).default("Exam"),
});

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  return { supabase, user };
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return errorJson("Unauthorized", 401);

    const { data, error } = await supabase
      .from("student_exam_dates")
      .select("id,exam_date,title")
      .eq("user_id", user.id)
      .order("exam_date", { ascending: true });
    if (error) throw error;

    return privateJson(
      {
        examDates: (data ?? []).map((exam) => ({
          id: exam.id,
          date: exam.exam_date,
          title: exam.title,
        })),
      },
      { request, profile: CACHE.SHORT },
    );
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Could not load exam dates.", 502);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return errorJson("Unauthorized", 401);

    const parsed = examDateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isRealDate(parsed.data?.date ?? "")) {
      return errorJson("Enter a real exam date and a name up to 120 characters.", 400);
    }

    const { data, error } = await supabase
      .from("student_exam_dates")
      .upsert(
        {
          user_id: user.id,
          exam_date: parsed.data.date,
          title: parsed.data.title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,exam_date" },
      )
      .select("id,exam_date,title")
      .single();
    if (error) {
      if (error.code === "23505") return errorJson("You already have an exam on this date.", 409);
      throw error;
    }

    return privateJson(
      { examDate: { id: data.id, date: data.exam_date, title: data.title } },
      { request, profile: CACHE.REVALIDATE },
    );
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Could not save the exam date.", 502);
  }
}
