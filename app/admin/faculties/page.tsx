import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { AdminFacultyManagers } from "@/components/admin-faculty-managers";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope } from "@/lib/admin-scope";
import { AdminFacultyActivity } from "@/components/admin-faculty-activity";
import { AdminFacultyCreateButton } from "@/components/admin-faculty-create-button";
import { listFacultyManagement } from "@/lib/data/faculty-managers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Faculties · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminFacultiesPage() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Ffaculties");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const superAdmin = access.role === "super_admin";
  // An admin sees their subdomain's faculties and the ones they created.
  const scope = await getAdminScope(access);
  const faculties = await listFacultyManagement({
    showEmails: superAdmin,
    onlyIds: scope.all ? undefined : scope.faculties.map((faculty) => faculty.id),
  });

  return (
    <AdminBillingFrame active="faculties">
      <AdminPageHeader
        title="Faculties"
        actions={<AdminFacultyCreateButton />}
        description={
          superAdmin
            ? "Who manages each faculty, who can add to it, and every change made to it. Open a faculty for its full picture."
            : "The faculties of your subdomain (and ones you created), who manages each, and every change made to them."
        }
      />
      <AdminFacultyManagers faculties={faculties} showEmails={superAdmin} canEdit={superAdmin} />
      <div className="mt-6">
        <AdminFacultyActivity title="Recent changes across faculties" />
      </div>
    </AdminBillingFrame>
  );
}
