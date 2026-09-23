import Link from "next/link";
import { ArrowRight, BookOpen, FileText, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type StarterChallengeDashboard = {
  community: {
    name: string;
    slug: string;
    university?: string;
    faculty?: string;
  } | null;
  challenges: Array<{
    position: number;
    status: string;
    subjectName: string;
    topicTitle: string;
  }>;
};

export function StarterChallengeBanner({
  dashboard,
}: {
  dashboard: StarterChallengeDashboard;
}) {
  const challenge = [...dashboard.challenges]
    .filter((item) => item.status !== "completed")
    .sort(
      (left, right) =>
        Number(right.status === "started") - Number(left.status === "started") ||
        left.position - right.position,
    )[0];
  const community = dashboard.community;
  const params = new URLSearchParams();
  if (community?.slug) params.set("community", community.slug);
  const fallbackHref = community
    ? `/app/challenges${params.toString() ? `?${params.toString()}` : ""}`
    : "/app/community";
  const action = challenge
    ? challenge.status === "started"
      ? "Continue challenge"
      : "Start a challenge"
    : community
      ? "Find a challenge"
      : "Browse communities";

  return (
    <section
      className="challenge-hub-reveal relative mt-5 overflow-hidden rounded-[24px] border border-black/10 bg-[#cbf738] px-6 py-5 text-black shadow-sm sm:px-8 sm:py-6 lg:px-9 lg:py-6"
      aria-labelledby="starter-challenge-heading"
    >
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-[460px] rounded-[100%] bg-gradient-to-tr from-[#e5ff75]/80 via-[#daf955]/60 to-transparent blur-md"
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute bottom-0 left-0 h-20 w-full opacity-35"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M 0 160 Q 350 30 900 160 Z" fill="rgba(255, 255, 255, 0.4)" />
      </svg>

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="max-w-xl">
          <h2 id="starter-challenge-heading" className="type-student-page-title text-black">
            One topic.
            <br />
            One small win.
          </h2>

          <div className="mt-2.5 max-w-md text-xs font-medium leading-relaxed text-black/80 sm:text-sm">
            {community ? (
              <p className="truncate font-semibold text-black/95">
                {community.university && community.faculty
                  ? `${community.university} · ${community.faculty}`
                  : community.university || community.faculty || community.name}
              </p>
            ) : challenge ? (
              <p className="truncate font-semibold text-black/95">
                {challenge.subjectName}: {challenge.topicTitle}
              </p>
            ) : (
              <p>Choose a programme to get your next challenge.</p>
            )}
          </div>

          <Link
            href={fallbackHref}
            className={cn(
              "mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#111215] px-6 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-black active:scale-[0.98] sm:mt-5 sm:text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[#cbf738]",
            )}
          >
            {action}
            <ArrowRight className="size-3.5 sm:size-4" aria-hidden="true" />
          </Link>
        </div>

        <div
          className="relative hidden select-none items-center justify-end gap-5 lg:flex xl:gap-7"
          aria-hidden="true"
        >
          <div className="relative shrink-0">
            <div className="absolute -bottom-1 -left-1 h-full w-full rotate-[-7deg] rounded-xl border-2 border-black bg-black/10" />
            <div className="absolute -bottom-0.5 -left-0.5 h-full w-full rotate-[-5deg] rounded-xl border-2 border-black bg-[#dcfb80]" />
            <div className="relative min-w-[110px] rotate-[-3deg] rounded-xl border-2 border-black bg-[#faffeb] px-4 py-3 shadow-[3px_3px_0_rgba(0,0,0,0.06)]">
              <div className="absolute -left-1 top-3.5 h-1.5 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-6.5 h-1.5 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-9.5 h-1.5 w-1 rounded-sm bg-black" />
              <div className="inline-flex items-center rounded-full border border-black/80 bg-black/[0.04] px-2 py-0.5 text-[10px] font-bold text-black">
                Topic {String(challenge?.position ?? 1).padStart(2, "0")}
              </div>
              <div className="mt-2.5 h-[2px] w-16 rounded-full bg-black" />
              <div className="mt-2 h-[2px] w-11 rounded-full bg-black/60" />
              <div className="mt-2 h-[2px] w-14 rounded-full bg-black/40" />
            </div>
          </div>

          <div className="flex items-center gap-2.5 xl:gap-3.5">
            <div className="flex flex-col items-center">
              <div className="grid size-12 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105 sm:size-13">
                <BookOpen className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 text-[11px] font-bold tracking-tight text-black sm:text-xs">
                Learn
              </span>
            </div>
            <ArrowRight className="size-3.5 shrink-0 text-black stroke-[2.2]" />
            <div className="flex flex-col items-center">
              <div className="grid size-12 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105 sm:size-13">
                <FileText className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 text-[11px] font-bold tracking-tight text-black sm:text-xs">
                Practice
              </span>
            </div>
            <ArrowRight className="size-3.5 shrink-0 text-black stroke-[2.2]" />
            <div className="flex flex-col items-center">
              <div className="grid size-12 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105 sm:size-13">
                <Star className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 whitespace-nowrap text-[11px] font-bold tracking-tight text-black sm:text-xs">
                Take the exam
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StarterChallengeBannerSkeleton() {
  return (
    <section
      className="relative mt-5 overflow-hidden rounded-[24px] border border-black/10 bg-[#cbf738] px-6 py-5 shadow-sm sm:px-8 sm:py-6 lg:px-9 lg:py-6"
      aria-hidden="true"
    >
      <div className="relative flex min-h-[150px] flex-col justify-between gap-5 lg:min-h-[164px] lg:max-w-[58%]">
        <div>
          <div className="h-8 w-40 rounded bg-black/15" />
          <div className="mt-2 h-8 w-36 rounded bg-black/15" />
          <div className="mt-4 h-4 w-64 max-w-full rounded bg-black/10" />
        </div>
        <div className="h-10 w-40 rounded-full bg-black/80" />
      </div>
    </section>
  );
}
