import { AdminShell } from "@/components/admin-shell";
import { AdminUserManager } from "@/components/admin-user-manager";
import { requireAdminUser } from "@/lib/auth";
import { listAdminUsers } from "@/lib/data/admin-users";

export default async function AdminUsersPage() {
  await requireAdminUser();
  const userPage = await listAdminUsers({ page: 1, pageSize: 50 });

  return (
    <AdminShell
      title="Students"
      subtitle="Search students, check profiles, make admins, and adjust credits from one place."
    >
      <AdminUserManager initialUsers={userPage.items} initialPage={userPage} />
    </AdminShell>
  );
}
