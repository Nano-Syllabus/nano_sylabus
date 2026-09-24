import type { Metadata } from "next";
import { PublicExamsClient } from "@/components/public-exams-client";
import { buildCanonicalUrl } from "@/lib/site";
import { listPublishedCourses } from "@/lib/student-courses";

const TITLE = "Browse all exams - nanosyllabus";
const DESC =
  "Search every exam track on nanosyllabus: Loksewa Na.Su. and Kharidar, IOE, CEE MBBS, CMAT, KUUMAT, NRB banking, IELTS, NEB and license exams.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: {
    canonical: buildCanonicalUrl("/exams"),
  },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: buildCanonicalUrl("/exams"),
  },
};

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const courses = await listPublishedCourses();
  return <PublicExamsClient courses={courses} />;
}
