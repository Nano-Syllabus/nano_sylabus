import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminUserManager } from "@/components/admin-user-manager";
import { assertAdminRequest } from "@/lib/admin-access";
import { AdminAmbassadors } from "@/components/admin-ambassadors";
import { listStudentAmbassadors } from "@/lib/data/student-ambassadors";
import { listAdminUsers } from "@/lib/data/admin-users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Students · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fusers");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const page = await listAdminUsers({ page: 1, pageSize: 50 });
  // Only a super admin decides who may create faculties.
  const ambassadors =
    access.role === "super_admin" ? await listStudentAmbassadors().catch(() => []) : null;

  return (
    <AdminBillingFrame active="users">
      {ambassadors ? <AdminAmbassadors initial={ambassadors} /> : null}
      <AdminUserManager initialPage={page} viewerRole={access.role} viewerUserId={access.userId} />
    </AdminBillingFrame>
  );
}
