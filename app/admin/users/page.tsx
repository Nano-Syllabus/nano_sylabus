import { AdminShell } from "@/components/admin-shell";
import { AdminUserManager } from "@/components/admin-user-manager";
import { requireAdminUser } from "@/lib/auth";
import { listAdminUsers } from "@/lib/data/admin-users";

export default async function AdminUsersPage() {
  await requireAdminUser();
  const users = await listAdminUsers();

  return (
    <AdminShell
      title="Students"
      subtitle="Search students, check profiles, make admins, and adjust credits from one place."
    >
      <AdminUserManager initialUsers={users} />
    </AdminShell>
  );
}
