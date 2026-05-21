import Link from "next/link";
import { AdminBox, AdminBoxBody, AdminBoxHeader, AdminDataTable, AdminStatCell, AdminStatGrid } from "@/components/admin/resource-ui";
import { AdminShell } from "@/components/admin-shell";
import { ADMIN_SURFACES } from "@/lib/admin-registry";
import { requireAdminUser } from "@/lib/auth";
import { listAdminAnswers } from "@/lib/data/admin-answers";
import { listAdminKnowledgeNotebooks } from "@/lib/data/admin-knowledge";
import { listPromptTemplates } from "@/lib/data/admin-prompts";
import { listAdminSubscriptionPlans, listAdminSubscriptions } from "@/lib/data/admin-subscriptions";
import { listAdminUsers } from "@/lib/data/admin-users";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";
import { formatDate } from "@/lib/utils";

export default async function AdminIndexPage() {
  await requireAdminUser();

  const [answersPage, notebooksPage, prompts, paymentSubmissions, usersPage, plans, subscriptions] = await Promise.all([
    listAdminAnswers(),
    listAdminKnowledgeNotebooks(),
    listPromptTemplates(),
    listAdminPaymentSubmissions(),
    listAdminUsers(),
    listAdminSubscriptionPlans(),
    listAdminSubscriptions(),
  ]);

  const answers = answersPage.items;
  const notebooks = notebooksPage.items;
  const users = usersPage.items;
  const onboardedUsers = users.filter((user) => user.onboarded).length;
  const flaggedAnswers = answers.filter((answer) => answer.status === "flagged");
  const reviewedAnswers = answers.filter((answer) => answer.status === "reviewed").length;
  const pendingPayments = paymentSubmissions.filter((submission) => submission.status === "submitted");
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;
  const activePrompts = prompts.filter((prompt) => prompt.isActive).length;
  const totalResources = notebooks.reduce((sum, notebook) => sum + notebook.resourceCount, 0);
  const totalReadyChunks = notebooks.reduce((sum, notebook) => sum + notebook.readyChunkCount, 0);

  return (
    <AdminShell
      title="Home"
      subtitle="Daily control room for notebooks, answers, students, payments, and live AI instructions."
    >
      <div className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
        <AdminStatGrid columns="xl:grid-cols-6">
          <AdminStatCell label="Students" value={users.length} note={`${onboardedUsers} onboarded`} />
          <AdminStatCell label="Flagged answers" value={flaggedAnswers.length} note={`${reviewedAnswers} reviewed`} />
          <AdminStatCell label="Notebooks" value={notebooks.length} note={`${totalResources} resources`} />
          <AdminStatCell label="Ready chunks" value={totalReadyChunks} note="Processed and retrievable" />
          <AdminStatCell label="Pending payments" value={pendingPayments.length} note={`${activeSubscriptions} active subs`} />
          <AdminStatCell label="Live AI templates" value={activePrompts} note={`${prompts.length} total templates`} />
        </AdminStatGrid>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <AdminBox>
            <AdminBoxHeader
              title="Work queues"
              subtitle="Start here first. These items affect student trust, access, and answer quality."
            />
            <div className="grid border-t border-border md:grid-cols-2">
              <QueueTile
                href="/admin/answers"
                title="Flagged answers"
                value={flaggedAnswers.length}
                note="Review conversations and source quality."
              />
              <QueueTile
                href="/admin/billing"
                title="Pending payments"
                value={pendingPayments.length}
                note="Approve manual payment proofs."
              />
            </div>
          </AdminBox>

          <AdminBox>
            <AdminBoxHeader title="Go straight to a section" subtitle="Open the main admin surfaces from one registry." />
            <div className="grid border-t border-border md:grid-cols-2">
              {ADMIN_SURFACES.filter((surface) => surface.key !== "home").map((surface) => (
                <ShortcutTile
                  key={surface.key}
                  href={surface.href}
                  title={surface.navLabel}
                  note={surface.subtitle}
                />
              ))}
            </div>
          </AdminBox>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <TablePanel
            title="Latest notebooks"
            actionHref="/admin/knowledge"
            actionLabel="Open notebooks"
            columns={["Notebook", "Subject", "Resources", "Ready"]}
            rows={notebooks.slice(0, 8).map((notebook) => [
              notebook.title,
              `${notebook.board} · ${notebook.level} · ${notebook.subject}`,
              String(notebook.resourceCount),
              String(notebook.readyChunkCount),
            ])}
            empty="No notebooks yet."
          />

          <TablePanel
            title="Flagged answers"
            actionHref="/admin/answers"
            actionLabel="Open answers"
            columns={["Student", "Board / Grade", "Subject", "When"]}
            rows={flaggedAnswers.slice(0, 8).map((answer) => [
              answer.studentName,
              `${answer.board || "—"} · ${answer.grade || "—"}`,
              answer.subjectContext || "General",
              formatDate(answer.createdAt),
            ])}
            empty="No flagged answers."
          />

          <TablePanel
            title="Payment queue"
            actionHref="/admin/billing"
            actionLabel="Open payments"
            columns={["Student", "Plan", "Amount", "Submitted"]}
            rows={pendingPayments.slice(0, 8).map((submission) => [
              submission.studentName,
              submission.planName,
              `${submission.currency} ${submission.amount}`,
              formatDate(submission.submittedAt),
            ])}
            empty="No pending payments."
          />
        </section>
      </div>
    </AdminShell>
  );
}

function QueueTile({
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
    <Link href={href} className="border-t border-border px-4 py-5 transition hover:bg-bg-secondary md:border-t-0 md:border-r last:md:border-r-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-2 text-sm text-text-secondary">{note}</p>
        </div>
        <p className="font-display text-5xl leading-none">{value}</p>
      </div>
    </Link>
  );
}

function ShortcutTile({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link href={href} className="border-t border-border px-4 py-4 transition hover:bg-bg-secondary md:border-r [&:nth-child(2n)]:md:border-r-0">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-text-secondary">{note}</p>
    </Link>
  );
}

function TablePanel({
  title,
  actionHref,
  actionLabel,
  columns,
  rows,
  empty,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  columns: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <AdminBox>
      <AdminBoxHeader
        title={<span className="font-display text-2xl">{title}</span>}
        action={
          <Link href={actionHref} className="text-sm text-text-secondary hover:text-text-primary">
            {actionLabel} →
          </Link>
        }
      />
      <AdminDataTable columns={columns} rows={rows} empty={empty} />
    </AdminBox>
  );
}
