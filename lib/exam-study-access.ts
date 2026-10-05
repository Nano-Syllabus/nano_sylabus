import { NextResponse } from "next/server";
import { getStudentExamEnrollment } from "@/lib/data/faculty-lock";
import { hasActiveSubscription } from "@/lib/data/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/** Metadata remains browsable; opening an exam learning resource requires a plan. */
export function withExamStudyAccess<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await getVerifiedUser(supabase);
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const enrollment = await getStudentExamEnrollment(user.id);
      if (enrollment && !(await hasActiveSubscription(user.id))) {
        return NextResponse.json(
          {
            error: "Upgrade your plan to open this learning resource.",
            code: "exam_upgrade_required",
            upgradeHref: `/payment/${encodeURIComponent(enrollment.examSlug)}`,
          },
          { status: 402, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not check your plan. Please try again." },
        { status: 503 },
      );
    }
    return handler(request, ...args);
  };
}
