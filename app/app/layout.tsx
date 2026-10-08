import { DEV_AUTH_BYPASS, DEV_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { AppShell } from "@/components/app-shell";
import { QueryIdentity } from "@/components/query-identity";
import { TabWarmer } from "@/components/tab-warmer";
import { getSessionUser, requireOnboardedUser } from "@/lib/auth";
import {
  getEnrollmentExam,
  getStudentExamEnrollment,
  listEnrollmentExams,
} from "@/lib/data/exam-enrollment";
import { FacultySelectionGate } from "@/components/faculty-selection-dialog";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MAIN_SITE_SLUG, siteAppOrigin, siteSlugFromHost } from "@/lib/landing-site-host";
import { EXAM_INTENT_COOKIE, EXAM_SITE_COOKIE, readExamIntent } from "@/lib/exam-enrollment";
import {
  currentMemberFacultySlug,
  getFacultySwitchAccess,
  hasFacultyMembership,
} from "@/lib/data/faculty-lock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The faculty lookups need only the user id, which the session gives without a
  // database trip. Starting them here runs them alongside the profile/credits
  // batch in `requireOnboardedUser` instead of after it: one round trip fewer on
  // every app page. For admins the answer is simply unused.
  const { user: sessionUser } = await getSessionUser();
  const facultyLookups = sessionUser
    ? Promise.all([
        getStudentExamEnrollment(sessionUser.id),
        hasFacultyMembership(sessionUser.id),
      ])
    : null;
  // Handled here so a redirect below can't leave it as an unhandled rejection;
  // awaiting it later still throws as before.
  facultyLookups?.catch(() => {});

  const { user } = await requireOnboardedUser();
  const examStudent =
    user.role === "student" && !(DEV_AUTH_BYPASS && user.id === DEV_BYPASS_USER_ID);
  const [[enrollment, member], cookieStore, requestHeaders] = await Promise.all([
    examStudent && facultyLookups ? facultyLookups : Promise.resolve([null, false] as const),
    cookies(),
    headers(),
  ]);
  // A student's dashboard lives on the subdomain of the exam they joined
  // (user, 2026-10-08): an IOE student on nanosyllabus.com/app — or on another
  // site's subdomain — goes to ioe.nanosyllabus.com. Sessions are per host, so
  // they sign in there; admins and super admins stay where they are.
  const hostSlug = siteSlugFromHost(requestHeaders.get("host"));
  if (enrollment && (hostSlug ?? MAIN_SITE_SLUG) !== enrollment.examSlug) {
    const protocol = requestHeaders.get("x-forwarded-proto") === "https" ? "https:" : "http:";
    redirect(`${siteAppOrigin(enrollment.examSlug, requestHeaders.get("host"), protocol)}/app/today`);
  }
  // A super admin (or this site's admin) on a subdomain is never locked: they
  // get a bar with the site's faculties to open any of them (user, 2026-10-08).
  const platformAdmin = user.role === "admin" || user.role === "super_admin";
  // A student switches freely within the exam they joined (only Upgrade nudges).
  const [siteExam, switchAccess, currentFacultySlug] =
    platformAdmin && hostSlug
      ? await Promise.all([
          getEnrollmentExam(hostSlug).catch(() => null),
          getFacultySwitchAccess(user.id).catch(() => null),
          currentMemberFacultySlug(user.id).catch(() => null),
        ])
      : enrollment
        ? [await getEnrollmentExam(enrollment.examSlug).catch(() => null), null, enrollment.facultySlug]
        : [null, null, null];
  const pickerFaculties = siteExam?.faculties
    ? siteExam.faculties.filter(
        (faculty) =>
          !platformAdmin ||
          switchAccess === "all" ||
          (Array.isArray(switchAccess) && switchAccess.some((own) => own.slug === faculty.slug)),
      )
    : [];
  // A student who already joined a faculty (exam enrollment or Browse) is never
  // asked to pick one again: the app simply opens the faculty they joined.
  const needsFaculty = examStudent && !member;
  // Which exam the student is here for: the subdomain they are on, else the exam
  // site whose "Continue learning" brought them in (main domain in production).
  const hostExamSlug =
    hostSlug ??
    cookieStore.get(EXAM_SITE_COOKIE)?.value ??
    null;
  const allExams = needsFaculty && !enrollment ? await listEnrollmentExams() : [];
  const hostExam = allExams.find((exam) => exam.slug === hostExamSlug);
  const exams = hostExam ? [hostExam] : allExams;
  const intent = readExamIntent(cookieStore.get(EXAM_INTENT_COOKIE)?.value);

  // Skipping payment opens the dashboard. Study actions offer an upgrade until
  // a subscription is active; opening the dashboard never activates a plan.
  // A Browse member with no exam enrollment is on the app's own plans, not an exam's.
  const examSlug =
    enrollment?.examSlug ?? (member ? undefined : (intent?.examSlug ?? hostExamSlug ?? undefined));
  // Upgrade opens the in-app pricing page, which shows the exam's own prices for
  // the student's faculty once they have one.
  const upgradeHref = examStudent && examSlug && !user.hasPaidPlan ? "/app/billing" : null;

  return (
    <AppShell
      user={user}
      title="Dashboard"
      faculty={enrollment}
      facultySwitch={
        siteExam && pickerFaculties.length
          ? {
              siteName: siteExam.name,
              faculties: pickerFaculties.map(({ slug, name }) => ({ slug, name })),
              currentSlug: currentFacultySlug,
              mode: platformAdmin ? "admin" : "student",
              roleLabel: platformAdmin
                ? user.role === "super_admin"
                  ? "Super admin"
                  : "Admin"
                : undefined,
            }
          : null
      }
      upgradeHref={upgradeHref}
    >
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
