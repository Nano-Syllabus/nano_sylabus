import { SetAppShell } from "@/components/set-app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { requireOnboardedUser } from "@/lib/auth";

export default async function ExplorePage() {
  await requireOnboardedUser();

  return (
    <>
      <SetAppShell title="Subjects" />
      <SubjectExplorerClient />
    </>
  );
}
