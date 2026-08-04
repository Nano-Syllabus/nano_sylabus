import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  // The previous ExamPracticeClient workspace is intentionally left in the
  // codebase as the inactive legacy implementation. Student navigation now
  // uses the NanoSyllabus reference flow mounted inside the app shell.
  redirect("/app/exams");
}
