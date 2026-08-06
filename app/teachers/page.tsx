import Link from "next/link";
import { getTeacherProfileForUserId } from "@/app/teachers/actions";
import { TeacherOnboarding } from "@/app/teachers/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherWorkspaceV2 } from "@/app/teachers-v2/teacher-workspace-v2";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <TeacherLoginRequired />;
  }

  const teacher = await getTeacherProfileForUserId(user.id);
  if (!teacher) {
    return <TeacherOnboarding userEmail={user.email || ""} />;
  }

  return <TeacherWorkspaceV2 teacherHandle={teacher.handle} />;
}

function TeacherLoginRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-text-primary">
      <div className="w-full max-w-[520px]">
        <p className="font-mono-ui text-xs uppercase tracking-[0.28em] text-text-muted">
          Teacher workspace
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">
          Sign in to load your workspace
        </h1>
        <p className="mt-4 text-lg leading-8 text-text-secondary">
          Your teacher session is missing or expired. Sign in again and we’ll bring you straight
          back here.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login?next=/teachers"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-text-primary px-6 font-medium text-bg-primary transition hover:opacity-90"
          >
            Login to teacher workspace
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
