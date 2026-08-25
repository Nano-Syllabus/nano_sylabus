import Link from "next/link";
import type { ChallengeSubject, StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";

function percentage(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function signedPoints(value: number | null) {
  if (value === null) return "First week of practice";
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded} pts vs previous 7 days`;
}

function practiceHref(subject: ChallengeSubject) {
  const params = new URLSearchParams({ subject: subject.slug });
  if (subject.nextTopic) params.set("topic", subject.nextTopic.key);
  return `/app/exams?${params.toString()}`;
}

function SubjectCard({ subject }: { subject: ChallengeSubject }) {
  const detail = subject.totalTopics
    ? `${subject.practicedTopics} of ${subject.totalTopics} topics practised`
    : "Topic data is not available yet";
  const action = subject.nextTopic ? `Practise ${subject.nextTopic.title}` : "Open practice";

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-lg font-semibold text-text-primary">{subject.name}</h3>
            <span className="text-sm text-text-secondary">{percentage(subject.readiness)} ready</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{detail}</p>
          {subject.weakTopics > 0 ? (
            <p className="mt-2 text-sm text-text-secondary">
              {subject.weakTopics} topic{subject.weakTopics === 1 ? "" : "s"} need attention.
            </p>
          ) : null}
          {!subject.topicDataAvailable ? (
            <p className="mt-2 text-sm text-text-secondary">Showing saved progress while topic data reconnects.</p>
          ) : null}
        </div>
        <Link
          href={practiceHref(subject)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          {action}
        </Link>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-secondary" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, subject.readiness ?? 0))}%` }}
        />
      </div>
    </article>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium tracking-wide text-text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-secondary">{detail}</p>
    </article>
  );
}

export function ChallengesDashboardClient({
  dashboard,
}: {
  dashboard: StudentChallengeDashboard;
}) {
  const hasSubjects = dashboard.subjects.length > 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-20 sm:px-8">
        <section className="rounded-xl border border-border bg-bg-secondary p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-lg font-semibold">Today&apos;s minimum</h1>
              <p className="mt-1 text-sm text-text-secondary">
                {dashboard.todayCompleted
                  ? "Today’s practice is complete. Keep going if you want another round."
                  : "Pass one practice session today to keep your consistency streak going."}
              </p>
            </div>
            <div className="w-full sm:w-52">
              <p className="text-right text-sm text-text-secondary">{dashboard.todayCompleted ? "1 / 1" : "0 / 1"}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: dashboard.todayCompleted ? "100%" : "0%" }} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.9fr)]">
          <article className="rounded-xl border border-border bg-card p-6">
            <p className="font-display text-lg font-semibold">Exam readiness</p>
            <p className="mt-1 text-sm text-text-secondary">Across your enrolled subjects</p>
            <p className="mt-6 text-5xl font-semibold tracking-tight">{percentage(dashboard.readiness)}</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-bg-secondary" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, dashboard.readiness ?? 0))}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-text-secondary">
              <span>{dashboard.totalTopics ? `${dashboard.practicedTopics} of ${dashboard.totalTopics} topics practised` : "Start a practice session to build your readiness."}</span>
              <span>{signedPoints(dashboard.readinessChange)}</span>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6">
            <p className="font-display text-lg font-semibold">Consistency streak</p>
            <p className="mt-5 text-5xl font-semibold tracking-tight">{dashboard.currentStreak} {dashboard.currentStreak === 1 ? "day" : "days"}</p>
            <p className="mt-1 text-sm text-text-secondary">Practice days in a row</p>
            {dashboard.leaderboard ? (
              <div className="mt-6 space-y-3 border-t border-border pt-4 text-sm text-text-secondary">
                <div className="flex items-center justify-between gap-4">
                  <span>Your streak rank</span>
                  <strong className="text-text-primary">{dashboard.leaderboard.currentStreakRank ? `#${dashboard.leaderboard.currentStreakRank}` : "—"}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Your best streak</span>
                  <strong className="text-text-primary">{dashboard.leaderboard.bestStreak} days</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Platform best</span>
                  <strong className="text-text-primary">{dashboard.leaderboard.platformBestStreak} days · #1</strong>
                </div>
                <p className="pt-1">{dashboard.leaderboard.daysFromBest === 0 ? "You are at the current top streak." : `${dashboard.leaderboard.daysFromBest} days from the current #1 streak.`}</p>
              </div>
            ) : (
              <div className="mt-6 border-t border-border pt-4 text-sm text-text-secondary">
                Ranking will appear after daily practice tracking is enabled.
              </div>
            )}
          </article>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="CHALLENGES / DAY" value={dashboard.practicePerDay.toFixed(1)} detail={dashboard.leaderboard?.practicePerDayRank ? `Your rank · #${dashboard.leaderboard.practicePerDayRank}` : "Your 7-day average"} />
          <StatCard label="TOP CHALLENGES / DAY" value={dashboard.leaderboard ? dashboard.leaderboard.topPracticePerDay.toFixed(1) : "—"} detail="Current #1 · 7-day average" />
          <StatCard label="PASSED" value={String(dashboard.passedThisMonth)} detail={`This month · ${dashboard.passedThisWeek} this week`} />
          <StatCard label="PASS RATE" value={percentage(dashboard.passRateLast30Days)} detail="Graded practice in the last 30 days" />
        </section>

        <section className="mt-9">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Your challenges</h2>
              <p className="mt-1 text-sm text-text-secondary">Each challenge opens a real topic-focused practice session from your course material.</p>
            </div>
            {hasSubjects ? (
              <Link href="/app/exams" className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary">
                View all practice
              </Link>
            ) : null}
          </div>

          {hasSubjects ? (
            <div className="mt-4 space-y-3">
              {dashboard.subjects.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
              <h3 className="font-display text-lg font-semibold">No enrolled subjects yet</h3>
              <p className="mx-auto mt-2 max-w-prose text-sm text-text-secondary">Join a course first. Then your subject topics, practice results, and readiness will appear here.</p>
              <Link href="/app/courses" className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary">
                Browse courses
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
