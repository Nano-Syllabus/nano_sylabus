import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminUserManager } from "@/components/admin-user-manager";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminUsers } from "@/lib/data/admin-users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "User access · Nano Syllabus Admin",
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

  return (
    <AdminBillingFrame active="users" title="User access">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Identity & access</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">User access</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Inspect real registered accounts. Super admins can grant admin or super-admin access; every mutation is enforced in the database.
          </p>
        </div>
        <div className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs text-muted-foreground">
          {access.role === "super_admin" ? <ShieldCheck size={16} /> : <Users size={16} />}
          Signed in as {access.role.replace("_", " ")}
        </div>
      </div>

      <div className="-mx-4 mt-5 sm:-mx-6 lg:-mx-8">
        <AdminUserManager
          initialUsers={page.items}
          initialPage={page}
          viewerRole={access.role}
          viewerUserId={access.userId}
        />
      </div>
    </AdminBillingFrame>
  );
}
