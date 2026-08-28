"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  FileCheck2,
  GraduationCap,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { AdminActivityChart } from "@/components/admin-activity-chart";
import { formatMetric as num, formatReceipt, type AdminAnalytics } from "@/lib/admin-analytics";
import {
  activityTotal,
  type AnalyticsDay,
  type AnalyticsWindow,
} from "@/lib/admin-analytics-presentation";

export const adminControl =
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors duration-100 hover:bg-muted active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";
export const adminPanel = "min-w-0 rounded-lg border border-border bg-card";

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className={`${adminPanel} p-4 xl:p-5`}>
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
      </dt>
      <dd className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      <dd className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</dd>
    </div>
  );
}

export function PanelHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        {detail && <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>}
      </div>
      <dd className="shrink-0 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function GrowthChange({ row }: { row: AdminAnalytics["users"]["growth"][number] }) {
  if (row.percentChange === null)
    return <span className="text-xs text-muted-foreground">No previous baseline</span>;
  const Icon = row.percentChange < 0 ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium ${row.percentChange > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
    >
      <Icon size={12} aria-hidden="true" />
      {row.percentChange > 0 ? "+" : ""}
      {num(row.percentChange, 1)}%
    </span>
  );
}

export function GrowthSummary({ data }: { data: AdminAnalytics }) {
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading title="Growth at a glance" description="Compared with the preceding period" />
      <dl className="mt-3 divide-y divide-border">
        {data.users.growth.map((row) => (
          <div key={row.days} className="py-3 last:pb-0">
            <dt className="text-xs text-muted-foreground">
              {row.days === 1 ? "Today" : `Last ${row.days} days`}
            </dt>
            <dd className="mt-1 flex items-center justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {num(row.current)}{" "}
                <span className="text-xs font-normal text-muted-foreground">new</span>
              </span>
              <GrowthChange row={row} />
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {num(row.previous)} in preceding {row.days === 1 ? "day" : `${row.days} days`}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SignupChart({ rows, days }: { rows: AnalyticsDay[]; days: AnalyticsWindow }) {
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading
        title="New registrations"
        description={`Daily signups · last ${days} calendar days`}
        action={
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            Accounts
          </span>
        }
      />
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
        {num(activityTotal(rows, "newUsers"))}
        <span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">
          new users this period
        </span>
      </p>
      <AdminActivityChart
        label="New registered users per day"
        dates={rows.map((row) => row.date)}
        series={[{ label: "New users", values: rows.map((row) => row.newUsers) }]}
      />
    </section>
  );
}

export function LearningChart({ rows, days }: { rows: AnalyticsDay[]; days: AnalyticsWindow }) {
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading
        title="Learning activity"
        description={`Daily completions · last ${days} calendar days`}
      />
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <p className="text-2xl font-semibold tabular-nums">
          {num(activityTotal(rows, "challengesPassed"))}
          <span className="ml-2 text-xs font-normal text-muted-foreground">challenges passed</span>
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {num(activityTotal(rows, "examsCompleted"))}
          <span className="ml-2 text-xs font-normal text-muted-foreground">exams</span>
        </p>
      </div>
      <AdminActivityChart
        label="Passed challenges and completed exams per day"
        dates={rows.map((row) => row.date)}
        series={[
          { label: "Challenges", values: rows.map((row) => row.challengesPassed) },
          { label: "Exams", values: rows.map((row) => row.examsCompleted), secondary: true },
        ]}
      />
    </section>
  );
}

export function ContentSummary({ data }: { data: AdminAnalytics }) {
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading title="Course library" description="Registered content in your database" />
      <dl className="mt-2">
        <StatRow label="Total subjects" value={num(data.content.subjects)} />
        <StatRow label="Total courses" value={num(data.content.courses)} />
        <StatRow label="Published courses" value={num(data.content.publishedCourses)} />
        <StatRow label="Subjects per user" value={num(data.content.subjectsPerUser, 2)} />
      </dl>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Subject profiles count once, regardless of how many students enroll.
      </p>
    </section>
  );
}

export function ReceiptSummary({ data }: { data: AdminAnalytics }) {
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading title="Confirmed revenue" description="Gross receipts · all retained records" />
      {data.revenue.currencies.length ? (
        <dl className="mt-2">
          {data.revenue.currencies.map((row) => (
            <StatRow
              key={row.currency}
              label={row.currency}
              value={formatReceipt(row.total, row.currency)}
              detail={`${formatReceipt(row.today, row.currency)} today`}
            />
          ))}
        </dl>
      ) : (
        <div className="my-5 flex items-start gap-3">
          <Wallet size={22} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">No confirmed receipts yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Approved, reconciled payments will appear here. No revenue has been assumed.
            </p>
          </div>
        </div>
      )}
      {data.revenue.unreconciledPaidInvoices > 0 && (
        <p className="mt-3 text-xs text-warning">
          {num(data.revenue.unreconciledPaidInvoices)} paid invoice(s) excluded: missing payment
          reconciliation.
        </p>
      )}
    </section>
  );
}

export function LearningDetails({
  data,
  rows,
  days,
}: {
  data: AdminAnalytics;
  rows: AnalyticsDay[];
  days: AnalyticsWindow;
}) {
  const passRate = data.challenges.gradedAttempts30
    ? `${num((data.challenges.passedAttempts30 / data.challenges.gradedAttempts30) * 100, 2)}%`
    : "—";
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CheckCheck}
          label="Challenges passed"
          value={num(data.challenges.passed)}
          detail={`${num(data.challenges.today)} today · unique completions`}
        />
        <Metric
          icon={FileCheck2}
          label="Exams completed"
          value={num(data.exams.completed)}
          detail={`${num(data.exams.today)} today · graded submissions`}
        />
        <Metric
          icon={GraduationCap}
          label="Average exam score"
          value={data.exams.averagePercent === null ? "—" : `${num(data.exams.averagePercent, 2)}%`}
          detail={`${num(data.exams.scored)} valid graded submissions`}
        />
        <Metric
          icon={CheckCheck}
          label="Challenge pass rate"
          value={passRate}
          detail={`${num(data.challenges.passedAttempts30)} / ${num(data.challenges.gradedAttempts30)} graded attempts · 30 days`}
        />
      </dl>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <LearningChart rows={rows} days={days} />
        <section className={`${adminPanel} p-5`}>
          <PanelHeading
            title="Challenge consistency"
            description="Passes, not opens or exam starts"
          />
          <dl className="mt-2">
            <StatRow
              label="Platform passes / day"
              value={num(data.challenges.averagePerDay, 2)}
              detail={`${num(data.challenges.last7)} in the last 7 days ÷ 7`}
            />
            <StatRow
              label="Top student passes / day"
              value={num(data.challenges.topStudentPerDay, 2)}
              detail="Highest individual 7-day average"
            />
            <StatRow
              label="Best platform day"
              value={num(data.challenges.bestDay)}
              detail="Most passes in one Nepal calendar day"
            />
          </dl>
        </section>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className={`${adminPanel} p-5`}>
          <PanelHeading
            title="Exam breakdown"
            description="Challenge sittings are tracked separately"
          />
          <dl className="mt-2">
            <StatRow label="Practice submissions" value={num(data.exams.practice)} />
            <StatRow label="Teacher exam submissions" value={num(data.exams.teacher)} />
            <StatRow label="Completed exams per user" value={num(data.exams.perUser, 2)} />
          </dl>
          {data.exams.scored < data.exams.completed && (
            <p className="mt-2 text-xs text-warning">
              {num(data.exams.completed - data.exams.scored)} invalid or missing scores excluded
              from the average.
            </p>
          )}
        </section>
        <ContentSummary data={data} />
      </div>
    </div>
  );
}

export function Definitions() {
  const rows = [
    [
      "Users & growth",
      "Non-anonymous registered accounts retained in auth.users. Growth is signups in 1, 7, or 30 calendar days versus the preceding equal window—not daily active users. A zero previous window has no percentage baseline.",
    ],
    [
      "Subjects & courses",
      "Subjects are teacher_subject_profiles rows, including personal profiles. Courses are teacher_courses rows. Subjects per user = registered subject profiles ÷ registered users. Content only in the external AI service is not counted.",
    ],
    [
      "Challenge completion",
      "A student_challenges record with a completed status and completion time. Each challenge counts once, only after passing. Platform daily average = passes in the last 7 days ÷ 7. Top student uses the highest individual average; best day is the platform's highest daily pass count.",
    ],
    [
      "Challenge pass rate",
      "Passed graded challenge attempts ÷ all graded challenge attempts in the last 30 days. Failed sittings count in this denominator; they do not count as completed challenges.",
    ],
    [
      "Exams & performance",
      "Graded practice submissions plus graded teacher-exam submissions, excluding challenge sittings and duplicate teacher mastery records. Performance averages score ÷ marks × 100 per valid submission. Exams per user uses submissions linked to current users ÷ all registered users.",
    ],
    [
      "Revenue",
      "Positive paid invoices matched to approved, dated payments. Approval date determines the Nepal day. Currencies stay separate. Unreconciled paid invoices, free invoices, pending/rejected proofs, and credit grants are excluded.",
    ],
    [
      "Data coverage",
      "These are retained records, not a permanent creation audit. Deleted accounts, content and cascaded activity are not included. Admin and test accounts are included because the database has no verified test-account flag. API tracking starts with this release; it does not recreate historical traffic.",
    ],
  ];
  return (
    <section className={`${adminPanel} p-5`}>
      <PanelHeading
        title="Metric definitions"
        description="Same database. Explicit rules. No estimated replacement values."
      />
      <div className="mt-4 divide-y divide-border">
        {rows.map(([label, text]) => (
          <details key={label} className="py-1">
            <summary className="cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              {label}
            </summary>
            <p className="max-w-3xl pb-4 text-sm leading-6 text-muted-foreground">{text}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
