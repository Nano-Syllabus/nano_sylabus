import { redirect } from "next/navigation";
import { getTeacherProfile } from "@/app/teachers/actions";
import { TeacherOnboarding } from "@/app/teachers/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherWorkspaceV2 } from "@/app/teachers-v2/teacher-workspace-v2";

export default async function TeachersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/teachers");
  }

  const teacher = await getTeacherProfile();
  if (!teacher) {
    return <TeacherOnboarding userEmail={user.email || ""} />;
  }

  return <TeacherWorkspaceV2 teacherHandle={teacher.handle} />;
}
