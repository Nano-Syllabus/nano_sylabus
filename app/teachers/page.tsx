import Link from "next/link";
import { isStudentAmbassador } from "@/lib/data/student-ambassadors";
import { getTeacherProfileForUserId } from "@/app/teachers/actions";
import { TeacherOnboarding } from "@/app/teachers/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherWorkspaceV2 } from "@/app/teachers-v2/teacher-workspace-v2";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { QueryIdentity } from "@/components/query-identity";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);

  if (!user) {
    return <TeacherLoginRequired />;
  }

  const teacher = await getTeacherProfileForUserId(user.id);
  if (!teacher) {
    // Opening a creator workspace (and creating faculties) is for student ambassadors only.
    if (!(await isStudentAmbassador(user.email))) return <AmbassadorsOnly />;
    return <TeacherOnboarding userEmail={user.email || ""} />;
  }

  return (
    <>
      {/* Keys the persisted cache (which holds the last workspace) to this
          account, and drops another account's copy — as every /app page does. */}
      <QueryIdentity userId={user.id} />
      <TeacherWorkspaceV2 teacherHandle={teacher.handle} />
    </>
  );
}

function AmbassadorsOnly() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-text-primary">
      <div className="w-full max-w-[520px]">
        <p className="font-mono-ui text-xs uppercase tracking-[0.28em] text-text-muted">
          Student Ambassador
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">
          Faculties are created by student ambassadors
        </h1>
        <p className="mt-4 text-lg leading-8 text-text-secondary">
          This account isn’t a student ambassador yet. Ask a Nano Syllabus admin to add your email,
          then come back here to create your faculty.
        </p>
        <Link
          href="/app/today"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-text-primary px-6 font-medium text-bg-primary transition hover:opacity-90"
        >
          Back to the app
        </Link>
      </div>
    </main>
  );
}

function TeacherLoginRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-text-primary">
      <div className="w-full max-w-[520px]">
        <p className="font-mono-ui text-xs uppercase tracking-[0.28em] text-text-muted">
          Creator workspace
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">
          Sign in to load your workspace
        </h1>
        <p className="mt-4 text-lg leading-8 text-text-secondary">
          Your creator session is missing or expired. Sign in again and we’ll bring you straight
          back here.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login?next=/teachers"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-text-primary px-6 font-medium text-bg-primary transition hover:opacity-90"
          >
            Login to creator workspace
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-6 font-medium text-text-primary transition hover:bg-bg-secondary"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
