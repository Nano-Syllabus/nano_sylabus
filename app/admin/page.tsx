import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { requireAdminUser } from "@/lib/auth";
import { listAdminAnswers } from "@/lib/data/admin-answers";
import { listAdminKnowledgeDocuments } from "@/lib/data/admin-knowledge";
import { listPromptTemplates } from "@/lib/data/admin-prompts";
import { listAdminSubscriptionPlans, listAdminSubscriptions } from "@/lib/data/admin-subscriptions";
import { listAdminUsers } from "@/lib/data/admin-users";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";

export default async function AdminIndexPage() {
  await requireAdminUser();

  const [answers, documents, prompts, paymentSubmissions, users, plans, subscriptions] = await Promise.all([
    listAdminAnswers(),
    listAdminKnowledgeDocuments(),
    listPromptTemplates(),
    listAdminPaymentSubmissions(),
    listAdminUsers(),
    listAdminSubscriptionPlans(),
    listAdminSubscriptions(),
  ]);

  const readyDocs = documents.filter((document) => document.processingStatus === "ready").length;
  const processingDocs = documents.filter((document) => document.processingStatus === "processing").length;
  const pendingPayments = paymentSubmissions.filter((submission) => submission.status === "submitted").length;
  const activePrompts = prompts.filter((prompt) => prompt.isActive).length;
  const onboardedUsers = users.filter((user) => user.onboarded).length;
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;
  const flaggedAnswers = answers.filter((answer) => answer.status === "flagged").length;
  const reviewedAnswers = answers.filter((answer) => answer.status === "reviewed").length;

  return (
    <AdminShell
      title="Operations Overview"
      subtitle="Control users, grounded knowledge, prompts, payments, and answer quality from one serious command surface."
    >
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_380px]">
          <section className="rounded-[28px] border border-border bg-gradient-to-br from-bg-secondary via-bg-primary to-bg-primary p-7 shadow-[0_24px_80px_rgba(0,0,0,0.14)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="danger">Admin command</Badge>
              <Badge variant="outline">Users + AI + Billing + Content</Badge>
            </div>
            <div className="mt-5 max-w-3xl">
              <h2 className="font-display text-5xl leading-[0.95] md:text-6xl">
                Run Nano Syllabus like an actual operations product, not a pile of tables.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
                This panel is for the real control work: promote admins, inspect answers, process syllabus sources,
                switch prompts, and unblock paid access without touching raw database rows every time.
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <SignalTile
                label="Grounded engine"
                value={`${readyDocs}/${documents.length || 0}`}
                hint={processingDocs ? `${processingDocs} still processing` : "All current sources stable"}
              />
              <SignalTile
                label="AI review queue"
                value={String(flaggedAnswers)}
                hint={flaggedAnswers ? "Needs moderation attention" : "No flagged answers right now"}
              />
              <SignalTile
                label="Payment queue"
                value={String(pendingPayments)}
                hint={pendingPayments ? "Manual approvals waiting" : "No pending approvals"}
              />
            </div>
          </section>

          <aside className="rounded-[28px] border border-border bg-bg-secondary p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono-ui uppercase tracking-[0.28em] text-text-muted">Today at a glance</p>
                <h3 className="mt-2 font-display text-3xl">Ops pulse</h3>
              </div>
              <div className="h-3 w-3 rounded-full bg-[color:var(--green)] shadow-[0_0_18px_rgba(104,211,145,0.6)]" />
            </div>

            <div className="mt-6 space-y-3">
              <PulseRow
                title="Student coverage"
                value={`${onboardedUsers}/${users.length}`}
                note="Onboarded learners with usable profile context"
              />
              <PulseRow
                title="Active subscriptions"
                value={String(activeSubscriptions)}
                note="Live paid access currently running"
              />
              <PulseRow
                title="Prompt templates"
                value={String(activePrompts)}
                note="Active runtime prompt variants"
              />
              <PulseRow
                title="Reviewed answers"
                value={String(reviewedAnswers)}
                note="Assistant responses already triaged"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-bg-primary p-4">
              <p className="text-[11px] font-mono-ui uppercase tracking-[0.24em] text-text-muted">Recommended next moves</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                <li>• Keep source uploads fresh before new textbook onboarding.</li>
                <li>• Review flagged answers before they turn into student trust issues.</li>
                <li>• Use prompt activation carefully when changing answer behavior.</li>
              </ul>
            </div>
          </aside>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <OverviewStat label="Users" value={users.length} note={`${onboardedUsers} onboarded`} />
          <OverviewStat label="Plans" value={plans.length} note={`${activeSubscriptions} active subs`} />
          <OverviewStat label="Answers" value={answers.length} note={`${flaggedAnswers} flagged`} />
          <OverviewStat label="Knowledge" value={documents.length} note={`${readyDocs} ready docs`} />
          <OverviewStat label="Prompts" value={prompts.length} note={`${activePrompts} active now`} />
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono-ui uppercase tracking-[0.28em] text-text-muted">Ops modules</p>
              <h3 className="mt-2 font-display text-4xl">Main control surfaces</h3>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-text-secondary">
              Each module is grouped by the actual job an admin performs, so the panel reads like a command center
              instead of a long list of generic sections.
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <ModuleCard
              href="/admin/users"
              eyebrow="Student ops"
              title="Users"
              accent="warning"
              summary="Search users, inspect academic context, promote admins, and adjust credits without touching SQL."
              bullets={["Role switching", "Credit adjustments", "Profile visibility"]}
              footer={`${users.length} total users`}
            />
            <ModuleCard
              href="/admin/answers"
              eyebrow="Quality control"
              title="AI Answers"
              accent="danger"
              summary="Inspect full conversations, audit citations, and work the flagged-answer queue before trust slips."
              bullets={["Conversation audit", "Source inspection", "Review notes"]}
              footer={`${flaggedAnswers} flagged • ${reviewedAnswers} reviewed`}
            />
            <ModuleCard
              href="/admin/knowledge"
              eyebrow="Grounding engine"
              title="Knowledge Base"
              accent="success"
              summary="Manage textbook, notes, syllabus, and question-bank sources with processing and source-file control."
              bullets={["Structured CRUD", "Chunk + vectorize", "Open/download source"]}
              footer={`${readyDocs} ready • ${processingDocs} processing`}
            />
            <ModuleCard
              href="/admin/subscriptions"
              eyebrow="Revenue ops"
              title="Subscriptions"
              accent="outline"
              summary="Create plans, grant access directly, and extend or cancel live subscriptions from the admin surface."
              bullets={["Plan CRUD", "Direct grants", "Extension + cancel"]}
              footer={`${plans.length} plans • ${activeSubscriptions} active`}
            />
            <ModuleCard
              href="/admin/prompts"
              eyebrow="System behavior"
              title="Prompt Control"
              accent="outline"
              summary="Manage system, follow-up, and rewrite prompts with live activation for safer output changes."
              bullets={["Template CRUD", "Language variants", "Active switching"]}
              footer={`${activePrompts} active prompt variants`}
            />
            <ModuleCard
              href="/admin/payments"
              eyebrow="Billing ops"
              title="Payment Review"
              accent="outline"
              summary="Approve or reject manual payment proofs so student credits and plans stay aligned with real payments."
              bullets={["Proof review", "Approval workflow", "Billing sync"]}
              footer={`${pendingPayments} waiting for review`}
            />
          </div>
        </section>

        <section className="mt-10 rounded-[28px] border border-border bg-bg-secondary p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="warning">Admin goals</Badge>
            <p className="text-sm text-text-secondary">
              The platform promise only works when these four backend control loops stay healthy.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ChecklistPanel
              title="Document hierarchy"
              items={["Board", "Grade / Year", "Faculty", "Curriculum / syllabus", "Document type"]}
            />
            <ChecklistPanel
              title="Processing"
              items={["Chunking", "Vector embedding", "Re-process on demand", "Ready / failed status"]}
            />
            <ChecklistPanel
              title="AI answer review"
              items={["Flagged answer queue", "Full conversation audit", "Source citation inspection", "Internal notes"]}
            />
            <ChecklistPanel
              title="Prompt operations"
              items={["CRUD templates", "Language-specific variants", "Active prompt switching", "Safe runtime tuning"]}
            />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function SignalTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary/90 p-4">
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.22em] text-text-muted">{label}</p>
      <div className="mt-3 font-display text-4xl">{value}</div>
      <p className="mt-2 text-sm text-text-secondary">{hint}</p>
    </div>
  );
}

function PulseRow({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-text-secondary">{note}</p>
        </div>
        <div className="font-display text-4xl">{value}</div>
      </div>
    </div>
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
    <div className="rounded-2xl border border-border bg-bg-primary p-4">
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.22em] text-text-muted">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-display text-4xl">{value}</p>
        <p className="max-w-[120px] text-right text-xs leading-5 text-text-secondary">{note}</p>
      </div>
    </div>
  );
}

function ModuleCard({
  href,
  eyebrow,
  title,
  accent,
  summary,
  bullets,
  footer,
}: {
  href: string;
  eyebrow: string;
  title: string;
  accent: "danger" | "warning" | "success" | "outline";
  summary: string;
  bullets: string[];
  footer: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-border bg-bg-primary p-6 transition-colors hover:border-border-strong hover:bg-bg-secondary"
    >
      <div className="flex items-center justify-between gap-3">
        <Badge variant={accent}>{eyebrow}</Badge>
        <span className="text-sm text-text-muted transition-transform group-hover:translate-x-0.5">→</span>
      </div>
      <h4 className="mt-5 font-display text-[2.5rem] leading-[0.92]">{title}</h4>
      <p className="mt-4 text-sm leading-7 text-text-secondary">{summary}</p>
      <ul className="mt-5 space-y-2 text-sm text-text-secondary">
        {bullets.map((bullet) => (
          <li key={bullet}>• {bullet}</li>
        ))}
      </ul>
      <div className="mt-6 border-t border-border pt-4 text-[11px] font-mono-ui uppercase tracking-[0.22em] text-text-muted">
        {footer}
      </div>
    </Link>
  );
}

function ChecklistPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-5">
      <p className="text-base font-medium">{title}</p>
      <div className="mt-4 space-y-2 text-sm leading-6 text-text-secondary">
        {items.map((item) => (
          <div key={item}>• {item}</div>
        ))}
      </div>
    </div>
  );
}
