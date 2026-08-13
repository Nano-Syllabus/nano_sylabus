import { redirect } from "next/navigation";
import { CourseCheckoutClient } from "@/components/course-checkout-client";
import { getCurrentAuth } from "@/lib/auth";
import { getPublishedCourse, getStudentCourse } from "@/lib/student-courses";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params }: PageProps) {
  const { slug } = await params;
  const { user } = await getCurrentAuth();
  const paymentPath = `/payment/${encodeURIComponent(slug)}`;

  if (!user) redirect(`/login?next=${encodeURIComponent(paymentPath)}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(paymentPath)}`);

  const enrolled = await getStudentCourse(user.id, slug);
  if (enrolled) redirect("/app/courses");

  const course = await getPublishedCourse(slug);
  if (!course) redirect("/exams");

  return (
    <CourseCheckoutClient
      course={course}
      user={{
        id: user.id,
        fullName: user.fullName || "Student",
        email: user.email || "",
      }}
    />
  );
}
