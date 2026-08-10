import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Signal,
  Sparkles,
  Users,
} from "lucide-react";
import { PUBLIC_APP_URL, getPublicExam, publicExams, type PublicExam } from "@/lib/public-exams";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function examEnrollUrl(exam: PublicExam) {
  return `${PUBLIC_APP_URL}?next=${encodeURIComponent(`/app/today?exam=${exam.slug}`)}`;
}

export function generateStaticParams() {
  return publicExams.map((exam) => ({ slug: exam.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const exam = getPublicExam(slug);

  if (!exam) {
    return {
      title: "Exam not found - nanosyllabus",
      robots: { index: false, follow: false },
    };
  }

  const title = `${exam.name} preparation - nanosyllabus`;

  return {
    title,
    description: exam.tagline,
    openGraph: {
      title,
      description: exam.tagline,
    },
  };
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="flex min-h-10 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="size-4 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">nanosyllabus</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link href="/exams" className="transition-colors hover:text-foreground">
            Exams
          </Link>
          <Link href="/#how" className="transition-colors hover:text-foreground">
            How it works
          </Link>
          <Link href="/#why" className="transition-colors hover:text-foreground">
            Why nanosyllabus
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={PUBLIC_APP_URL}
            className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log in
          </Link>
          <Link
            href="/exams"
            className="glow-shadow inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} nanosyllabus - AI exam prep built for Nepal.</p>
        <div className="flex gap-6">
          <Link href="/exams" className="hover:text-foreground">
            Browse exams
          </Link>
          <Link href={PUBLIC_APP_URL} className="hover:text-foreground">
            Study space
          </Link>
        </div>
      </div>
    </footer>
  );
}

function RelatedExamCard({ exam }: { exam: PublicExam }) {
  return (
    <Link
      href={`/exams/${exam.slug}`}
      className="glass-card group flex flex-col justify-between rounded-2xl border border-border p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {exam.category}
          </span>
          <ArrowUpRight
            className="size-4 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
        </div>
        <h3 className="mt-4 text-base font-semibold leading-snug">{exam.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{exam.tagline}</p>
      </div>
      <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" aria-hidden="true" /> {exam.questions} questions
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" /> {exam.learners}
        </span>
      </div>
    </Link>
  );
}

export default async function ExamDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const exam = getPublicExam(slug);

  if (!exam) {
    notFound();
  }

  const related = publicExams
    .filter((candidate) => candidate.slug !== exam.slug && candidate.category === exam.category)
    .slice(0, 3);

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="hero-glow border-b border-border/60">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <Link
              href="/exams"
              className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> All exams
            </Link>
            <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {exam.category} · {exam.authority}
                </span>
                <h1 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-5xl">
                  {exam.name}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {exam.about}
                </p>
                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="size-4" aria-hidden="true" /> {exam.questions} questions
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" aria-hidden="true" /> {exam.durationWeeks}-week plan
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Signal className="size-4" aria-hidden="true" /> {exam.level}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden="true" /> {exam.learners} learners
                  </span>
                </div>
              </div>

              <aside className="glass-card h-fit rounded-2xl border border-border p-6 lg:sticky lg:top-24">
                <p className="text-sm text-muted-foreground">Enrollment</p>
                <p className="mt-1 font-display text-2xl font-semibold">Free to start</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enrolling opens your study space with today&apos;s plan already built.
                </p>
                <a
                  href={examEnrollUrl(exam)}
                  className="glow-shadow mt-6 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-7 text-[15px] font-semibold text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  Enroll & open study space <ArrowRight aria-hidden="true" />
                </a>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  {["Adaptive daily plan", "AI doubt solving", "Full-length mock tests"].map(
                    (feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-highlight" aria-hidden="true" />{" "}
                        {feature}
                      </li>
                    ),
                  )}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <h2 className="font-display text-2xl font-semibold">Syllabus coverage</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                These units follow the syllabus published by {exam.authority}. Each one carries its
                own question pool, worked explanations and revision cards, and your accuracy is
                tracked separately per unit so you can see which one is holding your score down.
              </p>
              <div className="mt-6 space-y-3">
                {exam.syllabus.map((item, index) => (
                  <div
                    key={item.unit}
                    className="flex gap-4 rounded-xl border border-border bg-card p-5"
                  >
                    <span className="font-display text-sm text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{item.unit}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.topics}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="mt-12 font-display text-2xl font-semibold">
                How this {exam.short} track works
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  You begin with a short diagnostic drawn from all {exam.syllabus.length} units. It
                  is not a score you are judged on - it exists to place you correctly, so a{" "}
                  {exam.level.toLowerCase()}-level plan starts where you actually are rather than at
                  chapter one of everything.
                </p>
                <p>
                  From there the planner spreads the syllabus across {exam.durationWeeks} weeks. A
                  daily session mixes new practice from the current unit with revision questions you
                  previously got wrong, scheduled just before you would normally forget them.
                  Full-length papers appear once your accuracy in a unit is stable, so mocks measure
                  readiness instead of demoralising you early.
                </p>
                <p>
                  Every explanation is written against the source material for this exam and is
                  available in Nepali and English. If an answer looks wrong, flag it from the
                  question - flagged items are reviewed and corrected, and you will see the update.
                </p>
              </div>

              <h2 className="mt-12 font-display text-2xl font-semibold">Who this track suits</h2>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Aspirants targeting the next {exam.authority} cycle who want a schedule instead of
                  a pile of PDFs.
                </li>
                <li>
                  Repeat candidates who cleared some sections before and need targeted work on the
                  units that cost them the cutoff.
                </li>
                <li>
                  Working or studying candidates with roughly 20-60 focused minutes a day, on a
                  phone, often on a slow connection.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="font-display text-2xl font-semibold">What you get</h2>
              <ul className="mt-6 space-y-3">
                {exam.outcomes.map((outcome) => (
                  <li
                    key={outcome}
                    className="flex gap-3 rounded-xl border border-border bg-surface/40 p-4 text-sm"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-highlight"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{outcome}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-base font-semibold">Straight answers</h2>
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="font-medium">Do I pay to enroll?</dt>
                    <dd className="mt-1 text-muted-foreground">
                      No. Enrolling is free and needs no card. Paid plans only add extras like
                      unlimited full-length mocks.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Can I switch exams later?</dt>
                    <dd className="mt-1 text-muted-foreground">
                      Yes. You can enroll in another track any time and your progress in this one is
                      kept.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Is a result guaranteed?</dt>
                    <dd className="mt-1 text-muted-foreground">
                      No, and we will not claim it. This is a preparation tool that makes your study
                      time count - the exam is still yours to sit.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 pb-20">
            <h2 className="font-display text-xl font-semibold">Related tracks</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((candidate) => (
                <RelatedExamCard key={candidate.slug} exam={candidate} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
