import { z } from "zod";
import { getStudentCalendarMonth } from "@/lib/data/student-daily-dashboard";
import { errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return errorJson("Unauthorized", 401);

    const params = new URL(request.url).searchParams;
    const parsedMonth = monthSchema.safeParse(params.get("month"));
    if (!parsedMonth.success) return errorJson("Choose a valid calendar month.", 400);

    const activity = await getStudentCalendarMonth(
      user.id,
      undefined,
      params.get("community") || undefined,
      parsedMonth.data,
    );

    return privateJson({ activity }, { request, profile: { maxAge: 60, swr: 300 } });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Could not load this calendar month.",
      502,
    );
  }
}
