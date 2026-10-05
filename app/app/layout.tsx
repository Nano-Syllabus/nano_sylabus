import { DEV_AUTH_BYPASS, DEV_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { AppShell } from "@/components/app-shell";
import { QueryIdentity } from "@/components/query-identity";
import { TabWarmer } from "@/components/tab-warmer";
import { requireOnboardedUser } from "@/lib/auth";
import {
  getEnrollmentExam,
  getStudentExamEnrollment,
  listEnrollmentExams,
} from "@/lib/data/exam-enrollment";
import { FacultySelectionGate } from "@/components/faculty-selection-dialog";
import { cookies, headers } from "next/headers";
import { siteSlugFromHost } from "@/lib/landing-site-host";
import { hasActiveSubscription } from "@/lib/data/billing";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOnboardedUser();
  const needsFaculty =
    user.role === "student" && !(DEV_AUTH_BYPASS && user.id === DEV_BYPASS_USER_ID);
  const enrollment = needsFaculty ? await getStudentExamEnrollment(user.id) : null;
  // On an exam's subdomain the host itself says which exam the student is here for.
  const hostExamSlug = siteSlugFromHost((await headers()).get("host"));
  const allExams = needsFaculty && !enrollment ? await listEnrollmentExams() : [];
  const hostExam = allExams.find((exam) => exam.slug === hostExamSlug);
  const exams = hostExam ? [hostExam] : allExams;
  const intent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);

  // Skipping payment opens the dashboard. Study actions offer an upgrade until
  // a subscription is active; opening the dashboard never activates a plan.
  const examSlug = enrollment?.examSlug ?? intent?.examSlug ?? hostExamSlug ?? undefined;
  // The exam must still be live, or the payment page would bounce back here.
  const upgradeHref =
    needsFaculty && examSlug && !(await hasActiveSubscription(user.id))
      ? (await getEnrollmentExam(examSlug))
        ? `/payment/${encodeURIComponent(examSlug)}`
        : "/app/billing"
      : null;

  return (
    <AppShell user={user} title="Dashboard" faculty={enrollment} upgradeHref={upgradeHref}>
      <FacultySelectionGate
        exams={exams}
        initialExamSlug={hostExam?.slug ?? intent?.examSlug}
        initialAnswers={intent?.answers}
      />
      {/* Clears the query cache if a different account signs in on this
          browser. See components/query-identity.tsx — the cache is keyed by
          endpoint, and the endpoint does not change when the cookie does. */}
      <QueryIdentity userId={user.id} />
      {/* Renders the other tabs on the server while this one is being read, so
          the first click on each is an in-memory read rather than a wait.
          See components/tab-warmer.tsx. */}
      <TabWarmer />
      {children}
    </AppShell>
  );
}
