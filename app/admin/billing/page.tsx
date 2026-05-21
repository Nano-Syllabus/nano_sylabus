import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminSubscriptionManager } from "@/components/admin-subscription-manager";
import { Badge } from "@/components/ui/badge";
import { requireAdminUser } from "@/lib/auth";
import { listAdminSubscriptionPlans, listAdminSubscriptions } from "@/lib/data/admin-subscriptions";
import { listAdminUsers } from "@/lib/data/admin-users";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";
import { formatDate } from "@/lib/utils";

export default async function AdminBillingPage() {
  await requireAdminUser();
  const [plans, submissions, subscriptions, usersPage] = await Promise.all([
    listAdminSubscriptionPlans(),
    listAdminPaymentSubmissions(),
    listAdminSubscriptions(),
    listAdminUsers({ page: 1, pageSize: 100 }),
  ]);

  const pendingPayments = submissions.filter((submission) => submission.status === "submitted");
  const approvedPayments = submissions.filter((submission) => submission.status === "approved").length;
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;

  return (
    <AdminShell
      title="Payments"
      subtitle="Review manual payments, manage plans, and control active student subscriptions from one place."
    >
      <div className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
        <div className="grid gap-0 overflow-hidden rounded-none border border-border bg-bg-primary sm:grid-cols-2 xl:grid-cols-4">
          <BillingStat label="Pending payments" value={pendingPayments.length} />
          <BillingStat label="Approved payments" value={approvedPayments} />
          <BillingStat label="Plans" value={plans.length} />
          <BillingStat label="Active subscriptions" value={activeSubscriptions} />
        </div>

        <section className="mt-6 overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <p className="text-[11px] font-mono-ui uppercase tracking-[0.24em] text-text-muted">Payment queue</p>
              <h2 className="mt-2 font-display text-3xl">Manual payment review</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Approve or reject submitted proofs before student credits and access are granted.
              </p>
            </div>
            <Link
              href="/admin/payments"
              className="inline-flex h-11 items-center border border-border px-5 text-sm font-medium text-text-primary transition hover:bg-bg-secondary"
            >
              Open full queue
            </Link>
          </div>

          <div className="divide-y divide-border">
            {submissions.length ? (
              submissions.slice(0, 6).map((submission) => (
                <Link
                  key={submission.id}
                  href={`/admin/payments/${submission.id}`}
                  className="block bg-bg-primary px-5 py-4 transition hover:bg-bg-secondary"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{submission.studentName}</p>
                        <Badge
                          variant={
                            submission.status === "submitted"
                              ? "warning"
                              : submission.status === "approved"
                                ? "success"
                                : "danger"
                          }
                        >
                          {submission.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {submission.planName} · {submission.currency} {submission.amount}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Ref {submission.reference} · {formatDate(submission.submittedAt)}
                      </p>
                    </div>
                    <div className="text-sm text-text-secondary">Review →</div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-text-secondary">
                No payment submissions yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <AdminSubscriptionManager
            initialPlans={plans}
            initialSubscriptions={subscriptions}
            users={usersPage.items}
          />
        </section>
      </div>
    </AdminShell>
  );
}

function BillingStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-border px-4 py-4 last:border-r-0">
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.22em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}
