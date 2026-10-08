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
import { invalidateStudentCourseAccess } from "@/lib/student-courses";
import type { FacultySwitch } from "@/components/faculty-switch-bar";
import { RefreshOnce } from "@/components/refresh-once";
import {
  activateExamEnrollment,
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
  // Each subdomain is its own dashboard, and a student holds one faculty PER
  // site (user, 2026-10-08): IOE → BCT and License → its faculty side by side.
  // `enrollment` is the one for the host they're on. On the main domain a
  // student with an enrollment goes to that site's subdomain; admins stay put.
  const hostSlug = siteSlugFromHost(requestHeaders.get("host"));
  if (enrollment && !hostSlug && enrollment.examSlug !== MAIN_SITE_SLUG) {
    const protocol = requestHeaders.get("x-forwarded-proto") === "https" ? "https:" : "http:";
    redirect(`${siteAppOrigin(enrollment.examSlug, requestHeaders.get("host"), protocol)}/app/today`);
  }
  // The rest of the app reads one active faculty: make it this site's. When
  // that changes, pages rendered alongside this layout saw the old one, so the
  // client refreshes once.
  let switchedFaculty = false;
  if (enrollment && hostSlug) {
    switchedFaculty = await activateExamEnrollment(user.id, hostSlug).catch((error) => {
      console.error("[app/layout] could not activate the site's faculty", error);
      return false;
    });
    if (switchedFaculty) invalidateStudentCourseAccess(user.id);
  }

  // Admins are never locked. A super admin moves across every subdomain and
  // faculty from a site + faculty dropdown (user, 2026-10-08); a site admin
  // gets their own site's faculties while on it.
  const platformAdmin = user.role === "admin" || user.role === "super_admin";
  const superAdmin = user.role === "super_admin";
  let facultySwitch: FacultySwitch | null = null;
  if (platformAdmin) {
    const [allSites, switchAccess, currentSlug] = await Promise.all([
      superAdmin
        ? listEnrollmentExams().catch(() => [])
        : hostSlug
          ? getEnrollmentExam(hostSlug).then((exam) => (exam ? [exam] : []), () => [])
          : Promise.resolve([]),
      getFacultySwitchAccess(user.id).catch(() => null),
      currentMemberFacultySlug(user.id).catch(() => null),
    ]);
    const sites = allSites
      .map((exam) => ({
        slug: exam.slug,
        name: exam.name,
        faculties: (exam.faculties ?? [])
          .filter(
            (faculty) =>
              switchAccess === "all" ||
              (Array.isArray(switchAccess) && switchAccess.some((own) => own.slug === faculty.slug)),
          )
          .map(({ slug, name }) => ({ slug, name })),
      }))
      .filter((site) => site.faculties.length);
    const currentSite =
      sites.find((site) => site.slug === hostSlug) ??
      sites.find((site) => site.faculties.some((faculty) => faculty.slug === currentSlug)) ??
      sites[0];
    if (currentSite)
      facultySwitch = {
        sites,
        siteSlug: currentSite.slug,
        currentSlug,
        mode: "admin",
        roleLabel: superAdmin ? "Super admin" : "Admin",
      };
  } else if (enrollment) {
    // A student switches freely within this site's faculties; only Upgrade nudges.
    const exam = await getEnrollmentExam(enrollment.examSlug).catch(() => null);
    if (exam?.faculties?.length)
      facultySwitch = {
        sites: [
          {
            slug: exam.slug,
            name: exam.name,
            faculties: exam.faculties.map(({ slug, name }) => ({ slug, name })),
          },
        ],
        siteSlug: exam.slug,
        currentSlug: enrollment.facultySlug,
        mode: "student",
      };
  }

  // A student without a faculty here picks one of this site's: on a subdomain
  // that means no enrollment for THIS site (joining another never counts); on
  // the main domain, no faculty at all.
  const needsFaculty = examStudent && (hostSlug ? !enrollment : !member);
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
    enrollment?.examSlug ??
    hostSlug ??
    (member ? undefined : (intent?.examSlug ?? hostExamSlug ?? undefined));
  // Upgrade opens the in-app pricing page, which shows the exam's own prices for
  // the student's faculty once they have one.
  const upgradeHref = examStudent && examSlug && !user.hasPaidPlan ? "/app/billing" : null;

  return (
    <AppShell
      user={user}
      title="Dashboard"
      faculty={enrollment}
      facultySwitch={facultySwitch}
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
      {switchedFaculty ? <RefreshOnce /> : null}
      {children}
    </AppShell>
  );
}
