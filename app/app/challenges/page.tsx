import {
  CHALLENGE_HUB_TITLE,
  ChallengesDashboardClient,
} from "@/components/challenges-dashboard-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import { getActiveCommunity } from "@/lib/data/active-community";
import { mayRestartChallenges } from "@/lib/challenge-refetch";

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
  const dashboard = await getStudentChallengeDashboard(
    user.id,
    Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1,
    courseId && subjectSlug ? { courseId, subjectSlug } : undefined,
    active.selected?.slug,
  );

  return (
    <>
      <SetAppShell title={CHALLENGE_HUB_TITLE} />
      <ChallengesDashboardClient
        key={active.selected?.id ?? "none"}
        dashboard={dashboard}
        initialChallengeId={String(params.challenge || "").trim() || undefined}
        // Resolved here so the allowlist itself never reaches the browser. The
        // route enforces it again; this only decides whether to draw the button.
        canRestartChallenge={mayRestartChallenges(user.email)}
      />
    </>
  );
}
