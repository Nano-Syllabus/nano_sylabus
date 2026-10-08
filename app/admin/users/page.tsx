import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminUserManager } from "@/components/admin-user-manager";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, listScopedUserIds } from "@/lib/admin-scope";
import { listStudentAmbassadors } from "@/lib/data/student-ambassadors";
import { listAdminUsers, listFacultyChoices } from "@/lib/data/admin-users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ faculty?: string }>;
}) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fusers");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const faculty = (await searchParams).faculty?.trim() || "";
  // An admin sees the students of their subdomain and faculties only.
  const scope = await getAdminScope(access);
  const onlyUserIds = await listScopedUserIds(scope);
  const [page, allFaculties] = await Promise.all([
    listAdminUsers({ page: 1, pageSize: 50, onlyUserIds, ...(faculty ? { faculty } : {}) }),
    listFacultyChoices().catch(() => []),
  ]);
  const faculties = scope.all
    ? allFaculties
    : allFaculties.filter((choice) => scope.faculties.some((own) => own.slug === choice.slug));
  // Only a super admin decides who may create faculties (the switch in a
  // person's panel, under Access).
  const ambassadors =
    access.role === "super_admin" ? await listStudentAmbassadors().catch(() => []) : null;

  return (
    <AdminBillingFrame active="users">
      <AdminUserManager
        initialPage={page}
        faculties={faculties}
        initialFaculty={faculty}
        viewerRole={access.role}
        viewerUserId={access.userId}
        ambassadorEmails={ambassadors?.map((row) => row.email) ?? null}
      />
    </AdminBillingFrame>
  );
}
