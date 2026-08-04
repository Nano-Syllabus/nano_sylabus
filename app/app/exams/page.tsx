import { SetAppShell } from "@/components/set-app-shell";
import { StudentExamsClient } from "@/components/student-exams-client";
import { requireOnboardedUser } from "@/lib/auth";

export default async function ExamsPage() {
  await requireOnboardedUser();

  return (
    <>
      <SetAppShell title="Exams" />
      <StudentExamsClient />
    </>
  );
}
