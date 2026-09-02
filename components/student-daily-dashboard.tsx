"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CircleGauge,
  Clock3,
  Flame,
  LibraryBig,
  LockKeyholeOpen,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import type {
  DailyActivityDay,
  DailyLeaderboardMember,
  StudentDailyDashboard,
} from "@/lib/data/student-daily-dashboard";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "Student";
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "min-w-0 rounded-2xl border p-4",
        accent
          ? "border-[var(--community-accent)]/35 bg-[color-mix(in_srgb,var(--community-accent)_7%,var(--bg-primary))]"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          {label}
        </span>
        <span className="text-text-secondary" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-5 truncate font-display text-[clamp(1.65rem,2.2vw,2.15rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
        {value}
      </p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-text-muted">{detail}</p>
    </article>
  );
}

function activityLabel(day: DailyActivityDay) {
  if (day.status === "future") return `${day.label}: upcoming`;
  if (day.status === "idle") return `${day.label}: no recorded practice`;
  const score = day.averageScore === null ? "" : `, ${Math.round(day.averageScore)}% average`;
  return `${day.label}: ${day.attempts} attempt${day.attempts === 1 ? "" : "s"}, ${day.completions} passed${score}`;
}

function ActivityCalendar({ days }: { days: DailyActivityDay[] }) {
  const completedDays = days.filter((day) => day.status === "completed").length;
  const practiceDays = days.filter(
    (day) => day.status === "completed" || day.status === "started",
  ).length;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="activity-calendar-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <CalendarDays className="size-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Last five weeks</p>
          </div>
          <h2 id="activity-calendar-heading" className="mt-2 font-display text-xl font-semibold">
            Practice calendar
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {practiceDays
              ? `${practiceDays} active days · ${completedDays} with a passing result`
              : "No recorded practice in this window yet."}
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-3 text-xs text-text-muted"
          aria-label="Calendar legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-success" /> Passed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-warning" /> Practised
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-bg-secondary ring-1 ring-inset ring-border" />{" "}
            No activity
          </span>
        </div>
      </div>

      <div className="mt-7 overflow-x-auto pb-1">
        <div className="min-w-[500px]">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => (
              <div
                key={day.date}
                role="img"
                title={activityLabel(day)}
                aria-label={activityLabel(day)}
                className={cn(
                  "flex aspect-[1.3] min-h-10 items-center justify-center rounded-lg border text-xs font-medium tabular-nums",
                  day.status === "completed" && "border-success/20 bg-success text-white",
                  day.status === "started" && "border-warning/25 bg-warning text-white",
                  day.status === "idle" && "border-border bg-bg-secondary text-text-muted",
                  day.status === "future" && "border-transparent bg-transparent text-text-muted/40",
                  day.isToday &&
                    "ring-2 ring-[var(--community-accent)] ring-offset-2 ring-offset-bg-primary",
                )}
              >
                {day.dayOfMonth}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeaderboardRow({ member }: { member: DailyLeaderboardMember }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)_64px_62px] items-center gap-2 border-t border-border px-1 py-3 text-sm first:border-t-0 sm:grid-cols-[42px_minmax(0,1fr)_84px_70px]",
        member.isViewer && "bg-bg-secondary",
      )}
    >
      <span className="text-xs font-semibold text-text-muted tabular-nums">
        #{member.dailyRank}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">
          {member.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {member.name}
            {member.isViewer ? " (you)" : ""}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {formatNumber(member.xp)} XP
          </span>
        </span>
      </span>
      <span className="text-right font-semibold tabular-nums">{member.todayAttempts}</span>
      <span className="text-right text-text-secondary tabular-nums">{member.streak}d</span>
    </li>
  );
}

function DailyLeaderboard({ dashboard }: { dashboard: StudentDailyDashboard }) {
  const community = dashboard.community;
  if (!community) {
    return (
      <section
        className="flex min-h-[330px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-labelledby="leaderboard-heading"
      >
        <div className="flex items-center gap-2 text-text-secondary">
          <Trophy className="size-4" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Daily standings</p>
        </div>
        <h2 id="leaderboard-heading" className="mt-2 font-display text-xl font-semibold">
          Community leaderboard
        </h2>
        <div className="my-auto py-8 text-center">
          <Users className="mx-auto size-7 text-text-muted" aria-hidden="true" />
          <h3 className="mt-3 font-semibold">No active community</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-text-secondary">
            Join your programme community to compare today&apos;s real practice activity.
          </p>
          <Link
            href="/communities"
            className={cn(
              "mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-semibold text-text-inverse",
              focusRing,
            )}
          >
            Browse communities <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const visible = community.leaderboard.slice(0, 5);
  const viewer = community.leaderboard.find((member) => member.isViewer);
  if (viewer && !visible.some((member) => member.id === viewer.id)) visible.push(viewer);
  const hasTodayActivity = community.leaderboard.some((member) => member.todayAttempts > 0);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="leaderboard-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Trophy className="size-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Today</p>
          </div>
          <h2 id="leaderboard-heading" className="mt-2 font-display text-xl font-semibold">
            Community leaderboard
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{community.name}</p>
        </div>
        <Link
          href="/app/community?tab=members"
          className={cn(
            "inline-flex min-h-10 items-center text-sm font-medium text-text-secondary hover:text-text-primary",
            focusRing,
          )}
        >
          All {formatNumber(community.memberCount)} members
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-[34px_minmax(0,1fr)_64px_62px] gap-2 border-b border-border px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:grid-cols-[42px_minmax(0,1fr)_84px_70px]">
        <span>Rank</span>
        <span>Member</span>
        <span className="text-right">Today</span>
        <span className="text-right">Streak</span>
      </div>
      <ol>
        {visible.map((member) => (
          <LeaderboardRow key={member.id} member={member} />
        ))}
      </ol>
      {!hasTodayActivity ? (
        <p className="mt-3 rounded-xl bg-bg-secondary px-3 py-2 text-xs leading-5 text-text-secondary">
          No community member has recorded practice today. Ordering currently uses streak and XP.
        </p>
      ) : null}
    </section>
  );
}

function SemesterProgress({ dashboard }: { dashboard: StudentDailyDashboard }) {
  const community = dashboard.community;
  const [semesterId, setSemesterId] = useState(community?.currentSemesterId ?? "");
  const semester = useMemo(
    () => community?.semesters.find((item) => item.id === semesterId) ?? community?.semesters[0],
    [community, semesterId],
  );

  if (!community) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-7 text-center">
        <LibraryBig className="mx-auto size-7 text-text-muted" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-semibold">
          Semester progress starts with a community
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          Semester-to-subject mappings come from your joined programme community, so nothing is
          guessed from profile text.
        </p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card"
      aria-labelledby="semester-progress-heading"
    >
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Programme map
          </p>
          <h2 id="semester-progress-heading" className="mt-2 font-display text-xl font-semibold">
            Semester progress
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Real topic readiness from your indexed subjects.
          </p>
        </div>
        <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
          Semester
          <select
            value={semester?.id ?? ""}
            onChange={(event) => setSemesterId(event.target.value)}
            className={cn(
              "min-h-11 min-w-[220px] rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary",
              focusRing,
            )}
          >
            {community.semesters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {semester ? (
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{semester.label}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {semester.subjects.length} subject{semester.subjects.length === 1 ? "" : "s"} ·{" "}
                {semester.measuredSubjects} with measurable readiness
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-semibold tabular-nums">
                {semester.readiness === null ? "—" : `${Math.round(semester.readiness)}%`}
              </p>
              <p className="text-xs text-text-muted">Average readiness</p>
            </div>
          </div>

          {semester.subjects.length ? (
            <div className="mt-6 divide-y divide-border border-y border-border">
              {semester.subjects.map((subject) => (
                <article
                  key={subject.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {subject.code ? (
                        <span className="rounded-md bg-bg-secondary px-2 py-1 text-[11px] font-semibold text-text-secondary">
                          {subject.code}
                        </span>
                      ) : null}
                      <h3 className="truncate text-sm font-semibold">{subject.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {subject.topicCount === null
                        ? "Topics syncing"
                        : `${formatNumber(subject.topicCount)} topics`}{" "}
                      ·{" "}
                      {subject.materialCount === null
                        ? "Materials syncing"
                        : `${formatNumber(subject.materialCount)} materials`}
                    </p>
                  </div>
                  <div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-bg-secondary"
                      aria-hidden="true"
                    >
                      {subject.readiness !== null ? (
                        <div
                          className="h-full rounded-full bg-[var(--community-accent)]"
                          style={{ width: `${Math.max(0, Math.min(100, subject.readiness))}%` }}
                        />
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs text-text-muted">
                      {subject.readiness === null
                        ? "No graded practice yet"
                        : `${Math.round(subject.readiness)}% ready`}
                    </p>
                  </div>
                  <Link
                    href={`/app/communities/${community.slug}/subjects/${subject.slug}`}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 justify-self-start text-sm font-semibold md:justify-self-end",
                      focusRing,
                    )}
                  >
                    Open <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium">No subjects mapped to this semester yet.</p>
              <p className="mt-1 text-sm text-text-secondary">
                A community creator can attach real indexed subjects.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function StudentDailyDashboardView({
  fullName,
  creditBalance,
  hasUnlimitedAccess,
  dashboard,
}: {
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  dashboard: StudentDailyDashboard;
}) {
  const community = dashboard.community;
  const challenge = dashboard.challenge;
  const readyChallenges = challenge.challenges.filter((item) => item.status !== "completed").length;
  const todayActivity = dashboard.activity.find((day) => day.isToday);
  const accessValue = hasUnlimitedAccess ? "Unlimited" : formatNumber(creditBalance);
  const accessDetail = hasUnlimitedAccess
    ? "Active unlimited subscription"
    : `NanoAI message${creditBalance === 1 ? "" : "s"} remaining`;
  const todayMessage = dashboard.todayChallengeCompletions
    ? `${dashboard.todayChallengeCompletions} challenge${dashboard.todayChallengeCompletions === 1 ? "" : "s"} completed today.`
    : readyChallenges
      ? `${readyChallenges} challenge${readyChallenges === 1 ? " is" : "s are"} ready for today.`
      : "Your daily challenge queue is up to date.";

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-7 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Daily dashboard
          </p>
          <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
            Welcome back, {firstName(fullName)}.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            {todayMessage}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasUnlimitedAccess ? (
            <Link
              href="/app/billing"
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-bg-secondary",
                focusRing,
              )}
            >
              <Zap className="size-4" aria-hidden="true" /> View Unlimited
            </Link>
          ) : null}
          <Link
            href="/app/challenges"
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90",
              focusRing,
            )}
          >
            {dashboard.todayChallengeCompletions ? "Keep practising" : "Start a challenge"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        aria-label="Daily learning metrics"
      >
        <MetricCard
          icon={<Flame className="size-4" />}
          label="Current streak"
          value={`${challenge.currentStreak}d`}
          detail={
            challenge.currentStreak
              ? `Personal best ${challenge.leaderboard?.bestStreak ?? challenge.currentStreak} days`
              : "Pass a challenge to begin"
          }
        />
        <MetricCard
          icon={<LockKeyholeOpen className="size-4" />}
          label="NanoAI access"
          value={accessValue}
          detail={accessDetail}
        />
        <MetricCard
          icon={<Sparkles className="size-4" />}
          label="XP balance"
          value={community ? formatNumber(community.viewerXp) : "—"}
          detail={
            community
              ? community.viewerRank
                ? `Rank #${community.viewerRank} in ${community.name}`
                : community.name
              : "Join a community to earn scoped XP"
          }
        />
        <MetricCard
          icon={<CircleGauge className="size-4" />}
          label="Challenges / day"
          value={formatNumber(challenge.practicePerDay, 1)}
          detail="Passing challenges · last 7 days"
        />
        <MetricCard
          icon={
            dashboard.todayChallengeCompletions ? (
              <Check className="size-4" />
            ) : (
              <Clock3 className="size-4" />
            )
          }
          label="Today"
          value={formatNumber(dashboard.todayChallengeCompletions)}
          detail={`${readyChallenges} still available · ${todayActivity?.attempts ?? 0} practice attempts`}
          accent={dashboard.todayChallengeCompletions > 0}
        />
        <MetricCard
          icon={<BookOpenCheck className="size-4" />}
          label="Content completeness"
          value={
            community?.contentReadiness === null || !community
              ? "—"
              : `${community.contentReadiness}%`
          }
          detail={
            community
              ? `${community.materialCount} materials · ${community.topicCount} synced topics`
              : "Available after joining a community"
          }
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <ActivityCalendar days={dashboard.activity} />
        <DailyLeaderboard dashboard={dashboard} />
      </div>

      <div className="mt-6">
        <SemesterProgress dashboard={dashboard} />
      </div>
    </main>
  );
}
