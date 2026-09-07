import { NextResponse } from "next/server";
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import { getStudentChallenge, startStudentChallenge } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await params;
    const current = await getStudentChallenge(user.id, challengeId);
    if (!current) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId")?.trim() || "";
    const subjectSlug = url.searchParams.get("subject")?.trim() || "";
    const communitySlug = url.searchParams.get("community")?.trim() || "";
    const dashboard = await getStudentChallengeDashboard(
      user.id,
      1,
      courseId && subjectSlug ? { courseId, subjectSlug } : undefined,
      communitySlug || undefined,
    );
    // Loading the dashboard also tops up today's queue with unassigned real
    // topics. This makes Next work even when the client holds an old snapshot.
    const remaining = dashboard.challenges
      .filter((challenge) => challenge.id !== challengeId && challenge.status !== "completed")
      .sort((left, right) => left.position - right.position);
    const next =
      remaining.find((challenge) => challenge.position > current.position) ?? remaining[0] ?? null;
    if (!next) {
      return NextResponse.json(
        {
          error:
            "All currently extracted topics have a challenge already. Restart a completed challenge or ask the creator to publish more topics.",
        },
        { status: 409 },
      );
    }

    const challenge = await startStudentChallenge(user.id, next.id);
    if (!challenge) return NextResponse.json({ error: "Next challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not open the next challenge.",
      },
      { status: 502 },
    );
  }
}
