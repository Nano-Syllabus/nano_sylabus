import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { communityStorageError, joinCommunity } from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { ACTIVE_COMMUNITY_COOKIE } from "@/lib/community-switch";
import { getFacultyLock, getStudentExamEnrollment, releaseAdminFacultyLock } from "@/lib/data/faculty-lock";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, context: RouteContext) {
  let slug = "unknown";
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to join this community." }, { status: 401 });

    ({ slug } = await context.params);
    const locked = await getFacultyLock(user.id);
    if (locked && locked.facultySlug !== slug)
      return NextResponse.json(
        { error: "Your faculty is locked. Contact an admin to change it." },
        { status: 409 },
      );
    const enrolled = await getStudentExamEnrollment(user.id);
    if (enrolled && enrolled.facultySlug !== slug) await releaseAdminFacultyLock(user.id);
    const community = await joinCommunity(user.id, slug);
    // The join is committed; a failed revalidation must not report it as failed.
    try {
      revalidatePath("/app", "layout");
      revalidatePath("/communities", "layout");
    } catch {
      /* the next navigation renders fresh anyway */
    }
    const response = NextResponse.json({ community });
    // A creator opening their own faculty as a student: with no joined faculty
    // left, the active one is chosen by this preference among those they own.
    if (community.membership?.role === "creator") {
      response.cookies.set(ACTIVE_COMMUNITY_COOKIE, JSON.stringify({ userId: user.id, slug }), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    const source = (error || {}) as { code?: string; message?: string };
    console.error("[community:join] failed", {
      slug,
      code: source.code,
      message: source.message,
    });
    const mapped = communityStorageError(error);
    return NextResponse.json(
      { error: mapped.message, ...(mapped.current ? { current: mapped.current } : {}) },
      { status: mapped.status },
    );
  }
}
