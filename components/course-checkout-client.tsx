"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  GraduationCap,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { TeacherCourse } from "@/lib/teacher-courses";
import { titleCase } from "@/lib/utils";

type CourseCheckoutClientProps = {
  course: TeacherCourse;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
};

export function CourseCheckoutClient({ course, user }: CourseCheckoutClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"free" | "card" | "wallet">("free");
  const promoApplied = course.accessModel === "paid" && course.priceNpr > 0;
  const stats = course.sourceStats;
  const hasSourceFiles = stats.sourceFileCount > 0;
  const hasQuestionBank = stats.questionBankFileCount > 0;
  const sourceFileLabel = `${stats.sourceFileCount} source ${stats.sourceFileCount === 1 ? "file" : "files"}`;
  const subjectLabel = `${stats.subjectCount} indexed ${stats.subjectCount === 1 ? "subject" : "subjects"}`;
  const fileBreakdown = [
    stats.syllabusFileCount ? `${stats.syllabusFileCount} syllabus` : "",
    stats.notesFileCount ? `${stats.notesFileCount} notes` : "",
    stats.questionBankFileCount ? `${stats.questionBankFileCount} question bank` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleEnroll() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/student/courses/${encodeURIComponent(course.slug)}/enroll`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not complete enrollment.");

      router.replace("/app/today");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete enrollment.");
      setLoading(false);
    }
  }

  const isFree = course.accessModel === "free" || promoApplied;
  const originalPrice = course.priceNpr;
  const totalDueNpr = isFree ? 0 : course.priceNpr;
  const scholarshipDiscount = Math.max(0, originalPrice - totalDueNpr);

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex min-h-10 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <Sparkles className="size-4 text-primary-foreground" aria-hidden="true" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">nanosyllabus</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
            <span className="font-medium text-foreground">256-Bit Encrypted Checkout</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="hero-glow py-10 sm:py-14">
        <div className="mx-auto max-w-6xl px-5">
          {/* Back Navigation */}
          <Link
            href={`/exams/${encodeURIComponent(course.slug)}`}
            className="group inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft
              className="size-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Back to course details
          </Link>

          {/* Checkout Card Grid with equal heights */}
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1.3fr] lg:items-stretch">
            {/* Left Box: Visual Amount & Course Guarantee Hero */}
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-primary/20 via-surface/80 to-surface p-7 sm:p-9 shadow-2xl">
              {/* Background ambient glow circle */}
              <div
                className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary/25 blur-3xl"
                aria-hidden="true"
              />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  {course.category.toUpperCase()} · {course.authority}
                </div>

                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {titleCase(course.name)}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {course.tagline || course.description}
                </p>

                {/* Amount Display */}
                <div className="mt-8 rounded-2xl border border-border/70 bg-background/50 p-6 backdrop-blur-md">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Amount Due
                  </p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-display text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                      $0
                    </span>
                    <span className="text-sm font-semibold uppercase text-muted-foreground">
                      USD
                    </span>
                    <span className="ml-auto inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                      100% Free Tier
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    NPR 0 · No credit card or billing information needed
                  </p>
                </div>

                {/* What's included list */}
                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Included with your study space
                  </p>
                  <ul className="mt-4 space-y-3.5 text-sm text-foreground/90">
                    <li className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        Full access to <strong>{subjectLabel}</strong>
                        {hasSourceFiles
                          ? ` from ${sourceFileLabel}`
                          : " once the teacher source files are indexed"}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <FileText
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        {hasSourceFiles ? (
                          <>
                            Source library: <strong>{fileBreakdown || sourceFileLabel}</strong>
                          </>
                        ) : (
                          "Source library will appear after the teacher uploads course files"
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{course.diagnosticQuestionCount}-question diagnostic</strong> with{" "}
                        {course.passPercentage}% target readiness
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        {hasQuestionBank ? (
                          <>
                            Practice grounded in{" "}
                            <strong>
                              {stats.questionBankFileCount} question bank{" "}
                              {stats.questionBankFileCount === 1 ? "file" : "files"}
                            </strong>
                          </>
                        ) : (
                          "Practice starts from the syllabus until question bank files are added"
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{course.durationWeeks}-week</strong> plan at {course.dailyMinutes}{" "}
                        min/day in {course.languageModes.join(" + ")}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Student identity footer inside left card */}
              <div className="relative z-10 mt-10 border-t border-border/60 pt-5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-foreground">
                      {user.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{user.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span className="rounded-md border border-border px-2 py-0.5 text-[11px]">
                    Verified Student
                  </span>
                </div>
              </div>
            </div>

            {/* Right Box: The Sleek Payment / Checkout Form Card */}
            <div className="glass-card flex h-full flex-col justify-between rounded-3xl border border-border p-7 sm:p-9 shadow-2xl">
              <div>
                <div className="flex items-center justify-between border-b border-border/70 pb-5">
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                      Library &amp; NanoAI Activation
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review details & activate your course
                    </p>
                  </div>
                  <div className="flex size-9 items-center justify-center rounded-xl bg-surface-2">
                    <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </div>

                {/* Order Breakdown */}
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Course Enrollment Plan</span>
                    <span className="font-medium">NPR {originalPrice.toLocaleString("en-NP")}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <Zap className="size-3.5" aria-hidden="true" />{" "}
                      {isFree ? "Early Access Scholarship (100% Off)" : "Scholarship"}
                    </span>
                    <span>- NPR {scholarshipDiscount.toLocaleString("en-NP")}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Platform & Processing Fee</span>
                    <span className="font-medium">NPR 0</span>
                  </div>
                  <div className="border-t border-dashed border-border/80 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-semibold text-foreground">
                        Total Due Now
                      </span>
                      <div className="text-right">
                        <span className="font-display text-2xl font-extrabold text-foreground">
                          NPR {totalDueNpr.toLocaleString("en-NP")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">($0.00 USD)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="mt-7">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Select Payment Method
                  </label>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("free")}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        paymentMethod === "free"
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-surface/50 hover:bg-surface"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
                    >
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary">
                        {paymentMethod === "free" ? (
                          <div className="size-2.5 rounded-full bg-primary" />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Free Activation</p>
                        <p className="text-[11px] text-muted-foreground">Instant 1-Click Access</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled
                      className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-border bg-surface/30 p-3.5 text-left opacity-45 select-none"
                      title="Online payment not required for free courses"
                    >
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border">
                        {/* Unselected & disabled */}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-muted-foreground">
                            Card / Wallet
                          </p>
                          <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[9px] font-medium text-muted-foreground">
                            Inactive
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">eSewa · Khalti · Card</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Free Status Box */}
                <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2.5 text-xs text-emerald-400">
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                    <span className="font-semibold">No card or transaction required</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Click the button below to immediately activate your student study space with all
                    study materials and test series.
                  </p>
                </div>

                {/* Error display */}
                {error ? (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}
              </div>

              {/* Submit CTA Button & Guarantees (Anchored at the bottom) */}
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => void handleEnroll()}
                  disabled={loading}
                  className="glow-shadow inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Setting up your study space...
                    </>
                  ) : (
                    <>
                      Enroll Free & Start Learning
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>

                {/* Guarantees & Terms */}
                <div className="mt-5 flex items-center justify-center gap-6 text-center text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="size-3.5 text-primary" aria-hidden="true" /> Instant access
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="size-3.5 text-primary" aria-hidden="true" />{" "}
                    {stats.syllabusFileCount ? "Indexed syllabus" : "Teacher course"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden="true" />{" "}
                    Lifetime free
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} nanosyllabus · All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
