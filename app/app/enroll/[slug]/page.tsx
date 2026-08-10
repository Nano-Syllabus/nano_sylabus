import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, Clock3 } from "lucide-react";
import { CourseEnrollmentCard } from "@/components/course-enrollment-card";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getPublishedCourse, getStudentCourse } from "@/lib/student-courses";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function EnrollCoursePage({ params }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug } = await params;
  const enrolled = await getStudentCourse(user.id, slug);
  if (enrolled) redirect(`/app/courses/${slug}`);

  const course = await getPublishedCourse(slug);
  if (!course) redirect("/exams");

  return (
    <>
      <SetAppShell title="Enroll" />
      <main className="w-full max-w-[920px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
        <p className="text-sm text-text-secondary">{course.category} · {course.authority}</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold">{course.name}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-text-secondary">{course.description}</p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-4 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {course.subjects.length} subject{course.subjects.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4" aria-hidden="true" /> {course.dailyMinutes} min daily
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> {course.durationWeeks} weeks
          </span>
        </div>

        <section className="py-8">
          <h2 className="font-display text-xl font-semibold">Open your study space</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Enrollment connects this course and all its indexed subjects to your student account.
          </p>
          <div className="mt-5">
            <CourseEnrollmentCard slug={course.slug} accessModel={course.accessModel} />
          </div>
        </section>
      </main>
    </>
  );
}

