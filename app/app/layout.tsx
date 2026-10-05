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
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasActiveSubscription } from "@/lib/data/billing";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOnboardedUser();
  const needsFaculty =
    user.role === "student" && !(DEV_AUTH_BYPASS && user.id === DEV_BYPASS_USER_ID);
  const enrollment = needsFaculty ? await getStudentExamEnrollment(user.id) : null;
  const exams = needsFaculty && !enrollment ? await listEnrollmentExams() : [];
  const intent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);

  // Students who came through an exam's checkout pay before they study. Their
  // faculty is chosen on the payment page, so the in-app modal never has to
  // block an unpaid student; payment submission activates the plan at once.
  const examSlug = enrollment?.examSlug ?? intent?.examSlug;
  // The exam must still be live, or the payment page would bounce back here.
  if (
    needsFaculty &&
    examSlug &&
    (await getEnrollmentExam(examSlug)) &&
    !(await hasActiveSubscription(user.id))
  )
    redirect(`/payment/${encodeURIComponent(examSlug)}`);

  return (
    <AppShell user={user} title="Dashboard" faculty={enrollment}>
      <FacultySelectionGate
        exams={exams}
        initialExamSlug={intent?.examSlug}
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
