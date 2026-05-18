import { AdminShell } from "@/components/admin-shell";
import { AdminSubscriptionManager } from "@/components/admin-subscription-manager";
import { requireAdminUser } from "@/lib/auth";
import { listAdminSubscriptionPlans, listAdminSubscriptions } from "@/lib/data/admin-subscriptions";
import { listAdminUsers } from "@/lib/data/admin-users";

export default async function AdminSubscriptionsPage() {
  await requireAdminUser();
  const [plans, subscriptions, users] = await Promise.all([
    listAdminSubscriptionPlans(),
    listAdminSubscriptions(),
    listAdminUsers(),
  ]);

  return (
    <AdminShell
      title="Subscriptions"
      subtitle="Manage plans, grant subscriptions manually, and extend or cancel active access."
    >
      <AdminSubscriptionManager
        initialPlans={plans}
        initialSubscriptions={subscriptions}
        users={users}
      />
    </AdminShell>
  );
}
