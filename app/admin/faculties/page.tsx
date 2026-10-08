import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { AdminFacultyManagers } from "@/components/admin-faculty-managers";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminSites } from "@/lib/data/faculty-lock";
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
  // An admin sees only the faculties of the subdomain they run.
  const onlySite = superAdmin
    ? undefined
    : ((await listAdminSites([access.userId])).get(access.userId)?.slug ?? null);
  const faculties = await listFacultyManagement({ showEmails: superAdmin, onlySite });

  return (
    <AdminBillingFrame active="faculties">
      <AdminPageHeader
        title="Faculties"
        description={
          superAdmin
            ? "Who manages each faculty: the admins of the subdomains that list it, and the person who created it. Super admins manage every faculty."
            : "The faculties of your subdomain and who manages each one."
        }
      />
      <AdminFacultyManagers faculties={faculties} showEmails={superAdmin} />
    </AdminBillingFrame>
  );
}
