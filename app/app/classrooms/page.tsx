import { SetAppShell } from "@/components/set-app-shell";
import { StudentClassroomsClient } from "@/components/student-classrooms-client";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  await requireOnboardedUser();

  return (
    <>
      <SetAppShell title="Classrooms" />
      <StudentClassroomsClient />
    </>
  );
}
