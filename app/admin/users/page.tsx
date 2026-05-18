import { AdminShell } from "@/components/admin-shell";
import { AdminUserManager } from "@/components/admin-user-manager";
import { requireAdminUser } from "@/lib/auth";
import { listAdminUsers } from "@/lib/data/admin-users";

export default async function AdminUsersPage() {
  await requireAdminUser();
  const users = await listAdminUsers();

  return (
    <AdminShell
      title="User Management"
      subtitle="Search students, inspect profile context, promote admins, and adjust credits from one place."
    >
      <AdminUserManager initialUsers={users} />
    </AdminShell>
  );
}
