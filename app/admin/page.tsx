import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { requireAdminUser } from "@/lib/auth";
import { listAdminAnswers } from "@/lib/data/admin-answers";
import { listAdminKnowledgeNotebooks } from "@/lib/data/admin-knowledge";
import { listPromptTemplates } from "@/lib/data/admin-prompts";
import { listAdminSubscriptionPlans, listAdminSubscriptions } from "@/lib/data/admin-subscriptions";
import { listAdminUsers } from "@/lib/data/admin-users";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";

export default async function AdminIndexPage() {
  await requireAdminUser();

  const [answers, notebooks, prompts, paymentSubmissions, users, plans, subscriptions] = await Promise.all([
    listAdminAnswers(),
    listAdminKnowledgeNotebooks(),
    listPromptTemplates(),
    listAdminPaymentSubmissions(),
    listAdminUsers(),
    listAdminSubscriptionPlans(),
    listAdminSubscriptions(),
  ]);

  const onboardedUsers = users.filter((user) => user.onboarded).length;
  const flaggedAnswers = answers.filter((answer) => answer.status === "flagged").length;
  const reviewedAnswers = answers.filter((answer) => answer.status === "reviewed").length;
  const pendingPayments = paymentSubmissions.filter((submission) => submission.status === "submitted").length;
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;
  const activePrompts = prompts.filter((prompt) => prompt.isActive).length;
  const totalResources = notebooks.reduce((sum, notebook) => sum + notebook.resourceCount, 0);
  const totalReadyChunks = notebooks.reduce((sum, notebook) => sum + notebook.readyChunkCount, 0);

  return (
    <AdminShell
      title="Home"
      subtitle="Only the main controls you need every day: students, answers, content, payments, and AI settings."
    >
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <OverviewStat label="Students" value={users.length} note={`${onboardedUsers} onboarded`} />
          <OverviewStat label="Answers" value={flaggedAnswers} note={`${reviewedAnswers} reviewed`} />
          <OverviewStat label="Notebooks" value={notebooks.length} note={`${totalResources} resources`} />
          <OverviewStat label="Ready chunks" value={totalReadyChunks} note="Grounded retrieval inventory" />
          <OverviewStat label="Payments" value={pendingPayments} note={`${activeSubscriptions} active subs`} />
          <OverviewStat label="AI settings" value={activePrompts} note={`${prompts.length} total templates`} />
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[28px] border border-border bg-bg-primary p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="danger">Priority</Badge>
              <p className="text-sm text-text-secondary">Work the queues that directly affect student trust and paid access.</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <QueueCard
                href="/admin/answers"
                title="Check flagged answers"
                value={flaggedAnswers}
                note="Inspect conversations, citations, and internal review notes."
              />
              <QueueCard
                href="/admin/billing"
                title="Approve payments"
                value={pendingPayments}
                note="Manual payment proofs waiting for approval or rejection."
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-bg-primary p-6">
            <p className="text-[11px] font-mono-ui uppercase tracking-[0.24em] text-text-muted">Quick actions</p>
            <h2 className="mt-2 font-display text-3xl">Open the important sections fast</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <ActionLink href="/admin/knowledge" title="Content" note="Create notebooks, upload files, and process resources." />
              <ActionLink href="/admin/users" title="Students" note="Search students, change roles, and adjust credits." />
              <ActionLink href="/admin/billing" title="Payments" note="Manage plans, subscriptions, and payment review." />
              <ActionLink href="/admin/prompts" title="AI settings" note="Change answer behavior through active templates." />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-3">
          <SurfaceCard
            href="/admin/knowledge"
            eyebrow="Content"
            title="Notebook-based content control"
            summary="Board, level, faculty, notebook resources, upload flow, and chunk/vector processing."
            footer={`${notebooks.length} notebooks • ${totalResources} resources`}
          />
          <SurfaceCard
            href="/admin/answers"
            eyebrow="Answers"
            title="Answer quality audit"
            summary="Flagged answer queue, citation review, full conversation inspection, and internal notes."
            footer={`${flaggedAnswers} flagged • ${reviewedAnswers} reviewed`}
          />
          <SurfaceCard
            href="/admin/billing"
            eyebrow="Payments"
            title="Revenue operations"
            summary="Payment proof review, subscription grants, plan CRUD, and active access control."
            footer={`${pendingPayments} pending • ${activeSubscriptions} active`}
          />
        </section>
      </div>
    </AdminShell>
  );
}

function OverviewStat({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-5">
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.22em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
      <p className="mt-2 text-sm text-text-secondary">{note}</p>
    </div>
  );
}

function QueueCard({
  href,
  title,
  value,
  note,
}: {
  href: string;
  title: string;
  value: number;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-bg-secondary p-5 transition hover:border-border-strong hover:bg-bg-primary"
    >
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 font-display text-5xl">{value}</div>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{note}</p>
    </Link>
  );
}

function ActionLink({
  href,
  title,
  note,
}: {
  href: string;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-bg-secondary p-4 transition hover:border-border-strong hover:bg-bg-primary"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{note}</p>
    </Link>
  );
}

function SurfaceCard({
  href,
  eyebrow,
  title,
  summary,
  footer,
}: {
  href: string;
  eyebrow: string;
  title: string;
  summary: string;
  footer: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[28px] border border-border bg-bg-primary p-6 transition hover:border-border-strong hover:bg-bg-secondary"
    >
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.24em] text-text-muted">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{summary}</p>
      <p className="mt-6 text-sm text-text-muted">{footer}</p>
    </Link>
  );
}
