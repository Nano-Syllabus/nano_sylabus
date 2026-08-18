import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { enrollStudentInCourse, getPublishedCourse } from "@/lib/student-courses";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params }: PageProps) {
  const { slug } = await params;
  const { user } = await getCurrentAuth();
  const paymentPath = `/payment/${encodeURIComponent(slug)}`;

  if (!user) redirect(`/login?next=${encodeURIComponent(paymentPath)}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(paymentPath)}`);

  const course = await getPublishedCourse(slug);
  if (!course) redirect("/exams");

  try {
    await enrollStudentInCourse(user.id, slug);
  } catch (error) {
    console.error("Enrollment error:", error);
  }

  redirect("/app/today");
}
