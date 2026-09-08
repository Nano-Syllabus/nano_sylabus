import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStudentCourses } from "@/lib/student-courses";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return errorJson("Unauthorized", 401);

    const courses = await listStudentCourses(user.id);
    return privateJson({ courses }, { request, profile: CACHE.SHORT });
  } catch {
    return errorJson("Could not load your courses.", 502);
  }
}

