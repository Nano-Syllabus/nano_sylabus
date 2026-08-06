import { SetAppShell } from "@/components/set-app-shell";
import { JoinClassroomClient } from "@/components/join-classroom-client";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JoinClassroomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireOnboardedUser();
  const { code } = await params;

  return (
    <>
      <SetAppShell title={null} />
      <JoinClassroomClient code={decodeURIComponent(code).toUpperCase()} />
    </>
  );
}
