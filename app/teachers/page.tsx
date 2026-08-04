import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherProfile } from "./actions";
import { TeacherOnboarding } from "./onboarding";
import { TeacherDashboard } from "./dashboard";

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

  return <TeacherDashboard teacherHandle={teacher.handle} />;
}
