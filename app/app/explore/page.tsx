import { AppShell } from "@/components/app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listExplorerSubjects } from "@/lib/data/explorer";

export default async function ExplorePage() {
  const { user, profile } = await requireOnboardedUser();
  const subjects = await listExplorerSubjects(user.id, profile!);

  return (
    <AppShell user={user} title="Explore by Subject">
      <SubjectExplorerClient subjects={subjects} />
    </AppShell>
  );
}
