import { SetAppShell } from "@/components/set-app-shell";
import { StudentExamsClient } from "@/components/student-exams-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listTenantSubjectNames, listTenantSubjects } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const { user, profile } = await requireOnboardedUser();
  const tenantSubjects = await listTenantSubjects();
  const subjects = listTenantSubjectNames(tenantSubjects, profile?.subjects ?? []);
  const unavailableSubjects = tenantSubjects
    .filter((subject) => subject.chunk_count <= 0)
    .map((subject) => subject.name);

  return (
    <>
      <SetAppShell title="Exams" />
      <StudentExamsClient
        subjects={subjects}
        unavailableSubjects={unavailableSubjects}
        fullName={user.fullName}
      />
    </>
  );
}
