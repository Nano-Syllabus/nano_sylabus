import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowLeft, BookOpen, Files, Layers, Users, UserRound } from "lucide-react";
import { Skeleton, LoadingStatus } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("loading-card rounded-xl border border-border bg-card p-5", className)}
    >
      <div className="flex items-center justify-between">
        <div className="grid size-10 place-items-center rounded-lg border border-border bg-bg-secondary text-text-muted">
          <BookOpen size={18} strokeWidth={1.5} />
        </div>
        <Skeleton className="h-2 w-12" />
      </div>
      <Skeleton className="mt-5 h-4 w-3/4" />
      <Skeleton className="mt-2.5 h-2.5 w-1/2" />
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  );
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-text-muted">
            <Files size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-3 max-w-full", index % 2 ? "w-48" : "w-36")} />
            <Skeleton className="h-2 w-24" />
          </div>
          <Skeleton className="h-2 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SummaryLoading({ title, className }: { title: string; className?: string }) {
  return (
    <section
      aria-busy="true"
      className={cn("rounded-xl border border-border bg-card p-5", className)}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <div aria-hidden="true" className="mt-5 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div aria-hidden="true" className="mt-6 flex gap-3 border-t border-border pt-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </section>
  );
}

export function ChartLoading() {
  return (
    <div aria-hidden="true" className="mt-5">
      <Skeleton className="mb-6 h-5 w-36" />
      <div className="flex h-44 items-end gap-3 border-b border-l border-border px-4">
        {[35, 50, 42, 65, 48, 78, 60, 85, 72, 92].map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-sm bg-bg-tertiary"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between">
        <Skeleton className="h-2 w-12" />
        <Skeleton className="h-2 w-12" />
        <Skeleton className="h-2 w-12" />
      </div>
    </div>
  );
}

export function CalendarLoading() {
  return (
    <section aria-busy="true" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="type-student-section-title">Practice calendar</h2>
      <Skeleton className="mt-3 h-2.5 w-40" />
      <div aria-hidden="true" className="mt-5 grid grid-cols-7 gap-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={index} className="text-center text-[10px] text-text-muted">
            {day}
          </span>
        ))}
        {Array.from({ length: 35 }, (_, index) => (
          <div
            key={index}
            className="grid h-12 place-items-center rounded-lg border border-border bg-bg-secondary"
          >
            <Skeleton className="h-2 w-4" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CommunityAccessLoading({ title }: { title: string }) {
  return (
    <main
      aria-busy="true"
      className="min-h-screen bg-bg-secondary px-4 py-8 text-text-primary sm:px-6"
    >
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 font-display text-lg font-semibold"
        >
          <Image src="/nanologo.png" width={30} height={30} alt="" />
          NanoSyllabus
        </Link>
        <section className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-6 sm:p-8">
            <Users size={26} strokeWidth={1.5} className="mb-4 text-text-muted" />
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            <LoadingStatus label="Loading community details" className="mt-3" />
          </div>
          <div className="p-6 sm:p-8">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="mt-3 h-3 w-3/4" />
            <LoadingRows count={3} />
          </div>
        </section>
      </div>
    </main>
  );
}

export function CollectionLoading({
  title,
  label,
  count = 6,
}: {
  title: string;
  label?: string;
  count?: number;
}) {
  return (
    <section aria-busy="true" className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <div aria-hidden="true" className="mt-3">
            <Skeleton className="h-2.5 w-52 max-w-full" />
          </div>
        </div>
        <LoadingStatus label={label ?? `Loading ${title.toLowerCase()}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <LoadingCard key={index} />
        ))}
      </div>
    </section>
  );
}

export function LearningProfileLoading() {
  return (
    <main className="student-page-frame" aria-busy="true">
      <h1 className="type-student-page-title">Your learning profile</h1>
      <LoadingStatus label="Loading your progress" className="mt-3" />
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Total XP", "Challenges completed", "Topics mastered", "Communities"].map((label) => (
          <article key={label} className="student-surface">
            <Skeleton className="h-7 w-16" />
            <p className="type-student-body mt-3 text-text-secondary">{label}</p>
          </article>
        ))}
      </section>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <SummaryLoading title="Mastery map" />
        <section className="student-surface">
          <h2 className="type-student-section-title">Recent XP</h2>
          <LoadingRows />
        </section>
      </div>
    </main>
  );
}

export function SubjectLoading() {
  return (
    <main className="student-page-frame" aria-busy="true">
      <LoadingStatus label="Opening subject" />
      <Skeleton className="mt-5 h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-3 w-40" />
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SummaryLoading title="Subject overview" />
        <section className="rounded-xl border border-border bg-card px-5 pt-5">
          <h2 className="text-sm font-semibold">Study materials</h2>
          <LoadingRows />
        </section>
      </div>
    </main>
  );
}

/** Shared by the route fallback and the workspace query's initial state. */
export function CreatorWorkspaceLoading() {
  return (
    <div
      aria-busy="true"
      className="min-h-screen bg-bg-secondary text-text-primary lg:grid lg:grid-cols-[250px_minmax(0,1fr)]"
    >
      <aside className="hidden h-screen flex-col border-r border-border bg-bg-primary px-[13px] pb-6 pt-[18px] lg:flex">
        <Link href="/" className="mb-3 flex items-center gap-2.5 rounded-lg px-2 py-0.5">
          <Image src="/nanologo.png" alt="" width={34} height={34} className="rounded-lg" />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            NanoSyllabus
          </span>
        </Link>
        <div aria-hidden="true" className="space-y-1">
          {[
            { icon: Activity, label: "Analytics" },
            { icon: Users, label: "My Communities" },
            { icon: Layers, label: "Activity" },
            { icon: UserRound, label: "Your Public Profile" },
          ].map(({ icon: NavIcon, label }) => {
            return (
              <div
                key={label}
                className="flex min-h-10 items-center gap-2.5 rounded-lg px-[11px] text-sm text-text-secondary"
              >
                <NavIcon size={16} strokeWidth={1.5} />
                {label}
              </div>
            );
          })}
        </div>
        <div className="mt-auto border-t border-border px-2 pt-4">
          <Link href="/app/today" className="flex items-center gap-2 text-sm text-text-secondary">
            <ArrowLeft size={16} />
            Back to study portal
          </Link>
          <Skeleton className="mt-5 h-3 w-28" />
          <Skeleton className="mt-2.5 h-2 w-40" />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-[53px] items-center gap-3 border-b border-border px-4 md:px-[26px]">
          <Image
            src="/nanologo.png"
            alt="NanoSyllabus"
            width={28}
            height={28}
            className="rounded-md lg:hidden"
          />
          <span className="text-sm font-medium">Creator workspace</span>
          <LoadingStatus
            label={
              <>
                <span className="hidden sm:inline">Opening your workspace</span>
                <span className="sm:hidden">Loading</span>
              </>
            }
            className="ml-auto"
          />
        </header>
        <main className="w-full max-w-[1240px] p-4 pb-16 md:p-[26px]">
          <div className="mb-7 pt-2">
            <p className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-text-muted">
              Your teaching space
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Your workspace
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Getting your communities and materials ready.
            </p>
          </div>
          <div className="mb-7 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
            {["Communities", "Subjects", "Materials"].map((label) => (
              <div key={label} className="p-4 sm:p-5">
                <p className="text-xs text-text-muted">{label}</p>
                <Skeleton className="mt-3 h-6 w-10" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Users size={17} className="text-text-muted" />
                <h2 className="text-sm font-semibold">Communities</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <LoadingCard key={index} />
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card px-5 pb-1 pt-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Files size={17} className="text-text-muted" />
                Recent materials
              </h2>
              <LoadingRows />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export function DocumentLoading({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn("flex h-full w-full flex-col items-center justify-center gap-4 p-5", className)}
    >
      <LoadingStatus label="Opening document" />
      <div
        aria-hidden="true"
        className="max-h-[min(70vh,440px)] w-full max-w-md overflow-hidden rounded-lg border border-border bg-bg-primary p-6 shadow-sm sm:p-10"
      >
        <Files size={24} strokeWidth={1.4} className="mb-6 text-text-muted" />
        <Skeleton className="mb-3 h-5 w-2/3" />
        <Skeleton className="mb-8 h-2.5 w-1/3" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="mb-6 space-y-2.5">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex h-full min-h-80 w-full max-w-4xl flex-col gap-8 px-5 py-6"
    >
      <LoadingStatus label="Loading conversation" />
      <div
        aria-hidden="true"
        className="ml-auto w-2/3 max-w-sm rounded-2xl border border-border bg-bg-secondary p-4"
      >
        <Skeleton className="h-3 w-full" />
        <Skeleton className="mt-2.5 h-3 w-2/3" />
      </div>
      <div aria-hidden="true" className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-text-muted">
          <BookOpen size={16} />
        </div>
        <div className="flex-1 space-y-3 pt-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div aria-hidden="true" className="mt-auto rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-3 w-44" />
        <div className="mt-6 flex items-center justify-between">
          <Skeleton className="h-3 w-16" />
          <div className="size-7 rounded-full bg-bg-secondary" />
        </div>
      </div>
    </div>
  );
}
