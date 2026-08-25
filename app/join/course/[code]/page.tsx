import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseInviteJoin } from "@/components/course-invite-join";
import { LandingHeader } from "@/components/landing-header";
import { getCurrentAuth } from "@/lib/auth";
import {
  getPublishedCourseByInviteCode,
  getStudentCourse,
  isCourseCreator,
} from "@/lib/student-courses";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const course = await getPublishedCourseByInviteCode(code).catch(() => null);
  if (!course) return { title: "Course invitation unavailable", robots: { index: false } };
  return {
    title: `Join ${titleCase(course.name)} - nanosyllabus`,
    description: course.tagline || course.description,
    robots: { index: false, follow: false },
  };
}

export default async function CourseInvitePage({ params }: PageProps) {
  const { code } = await params;
  const normalizedCode = decodeURIComponent(code).trim().toUpperCase();
  const [course, auth] = await Promise.all([
    getPublishedCourseByInviteCode(normalizedCode),
    getCurrentAuth(),
  ]);
  if (!course) notFound();

  const [alreadyJoined, creator] = auth.user
    ? await Promise.all([
        getStudentCourse(auth.user.id, course.slug).then(Boolean),
        isCourseCreator(auth.user.id, course),
      ])
    : [false, false];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <LandingHeader />
      <CourseInviteJoin
        code={normalizedCode}
        signedIn={Boolean(auth.user)}
        alreadyJoined={alreadyJoined}
        isCreator={creator}
        course={{
          slug: course.slug,
          name: titleCase(course.name),
          description: course.description,
          category: course.category,
          level: course.level,
          durationWeeks: course.durationWeeks,
          dailyMinutes: course.dailyMinutes,
          subjectNames: course.subjects.map((subject) => titleCase(subject.name)),
          teacherName: course.author.displayName,
        }}
      />
    </div>
  );
}
