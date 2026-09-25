import {
  CHALLENGE_HUB_TITLE,
  ChallengesDashboardClient,
} from "@/components/challenges-dashboard-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import { getStudentChallenge } from "@/lib/data/student-challenges";
import { getActiveCommunity } from "@/lib/data/active-community";
import { mayRestartChallenges } from "@/lib/challenge-refetch";
import { challengeAllowance } from "@/lib/data/challenge-daily-limit";

export const dynamic = "force-dynamic";

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{
    completedPage?: string;
    courseId?: string;
    subject?: string;
    community?: string;
    challenge?: string;
  }>;
}) {
  const { user } = await requireOnboardedUser();
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.completedPage || "1", 10);
  const courseId = String(params.courseId || "").trim();
  const subjectSlug = String(params.subject || "").trim();
  const active = await getActiveCommunity(
    user.id,
    String(params.community || "").trim() || undefined,
  );
  const [initialDashboard, allowance] = await Promise.all([
    getStudentChallengeDashboard(
      user.id,
      Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1,
      courseId && subjectSlug ? { courseId, subjectSlug } : undefined,
      active.selected?.slug,
    ),
    // Never costs the hub: unknown means unlimited here, and the server's
    // start route still enforces the limit.
    challengeAllowance(user.id).catch(() => undefined),
  ]);
  let dashboard = initialDashboard;
  // A challenge linked by id is opened even when the hub would not list it: a
  // topic started from Revision, or the queue's card on a subject that already
  // has one open (the hub shows one per subject), or another term's subject.
  // `getStudentChallenge` re-checks access.
  const requestedChallengeId = String(params.challenge || "").trim();
  if (
    requestedChallengeId &&
    !dashboard.challenges.some((challenge) => challenge.id === requestedChallengeId)
  ) {
    const requested = await getStudentChallenge(user.id, requestedChallengeId).catch(() => null);
    if (requested && requested.status !== "completed") {
      dashboard = { ...dashboard, challenges: [requested, ...dashboard.challenges] };
    }
  }

  return (
    <>
      <SetAppShell title={CHALLENGE_HUB_TITLE} />
      <ChallengesDashboardClient
        key={active.selected?.id ?? "none"}
        dashboard={dashboard}
        initialChallengeId={requestedChallengeId || undefined}
        // Resolved here so the allowlist itself never reaches the browser. The
        // route enforces it again; this only decides whether to draw the button.
        canRestartChallenge={mayRestartChallenges(user.email)}
        allowance={allowance}
      />
    </>
  );
}
