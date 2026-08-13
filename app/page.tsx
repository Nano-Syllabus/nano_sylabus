import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarCheck,
  FileText,
  LineChart,
  Lock,
  MessagesSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { listPublishedCourses } from "@/lib/student-courses";
import type { TeacherCourse } from "@/lib/teacher-courses";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TITLE = "nanosyllabus - AI exam preparation for Nepal";
const DESC =
  "Prepare for Loksewa, IOE, CEE, CMAT, IELTS and NEB exams with an AI tutor that builds your daily plan, drills your weak topics and tracks progress.";

export const metadata = {
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
  },
};

const APP_URL = "/login";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Ask your AI tutor",
    body: "Type or speak your doubt in English or Roman Nepali. Get answers pulled from your syllabus and past papers nothing extra, nothing wrong.",
  },
  {
    title: "Write and submit a handwritten exam",
    body: "Pick a past paper or custom quiz. Write your answers on paper. Snap a photo. Nano Syllabus grades it and shows exactly where you lost marks.",
  },
  {
    title: "Check your readiness dashboard",
    body: "See your overall preparedness score, weak topics in red, and a clear plan for what to study next. Update it anytime.",
  },
];

const pillars = [
  {
    icon: MessagesSquare,
    title: "An AI tutor that speaks your syllabus",
    body: "Ask a doubt in Nepali or English and get an explanation tied to the exact unit of your exam's official syllabus.",
  },
  {
    icon: LineChart,
    title: "Progress you can actually read",
    body: "Accuracy, speed and retention per unit - with an honest estimate of where you stand against the cutoff.",
  },
  {
    icon: Brain,
    title: "Spaced repetition, automatically",
    body: "Every wrong answer becomes a scheduled revision card, so concepts return right before you forget them.",
  },
];

const studyTools = [
  {
    iconText: "Aa",
    label: "Tool 01",
    title: "AI Tutor That Answers From Your Syllabus",
    body: "Ask any doubt. Get answers pulled directly from past papers and your actual textbook not generic internet content. Bilingual: English or Roman Nepali.",
    note: "Ask anything. Always patient.",
  },
  {
    iconText: "Px",
    label: "Tool 02",
    title: "Handwritten Exams Graded Instantly by AI",
    body: "Write your answer by hand on paper. Snap a photo. Nano Syllabus reads your handwriting, checks your answer against the marking scheme, and tells you exactly what you got right and what you missed.",
    note: "Real practice. Real feedback.",
  },
  {
    iconText: "Dg",
    label: "Tool 03",
    title: "See Your Readiness at a Glance",
    body: "A live dashboard showing your exam preparedness score, weak topics that need attention, and progress over time. Know before exam day which chapters to revisit.",
    note: "No blind spots. Just focus.",
  },
];

const readinessTopics = [
  { name: "Data Structures", status: "Strong", score: 85, tone: "bg-emerald-400" },
  { name: "Operating Systems", status: "Needs work", score: 55, tone: "bg-amber-400" },
  { name: "DBMS", status: "Weak", score: 30, tone: "bg-rose-400" },
  { name: "Computer Networks", status: "Moderate", score: 55, tone: "bg-amber-400" },
  { name: "Mathematics", status: "Critical", score: 15, tone: "bg-rose-400" },
];

const readinessBars = readinessTopics.filter((topic) => topic.name !== "Computer Networks");

const realResults = [
  {
    quote:
      "I thought I was ready for my OS exam. Nano Syllabus showed me I was scoring 28% on that topic. I spent 3 focused hours on weak areas instead of wasting time on things I already knew.",
    initials: "DJ",
    name: "Diwash Joshi",
    meta: "CSIT Student, Pokhara",
  },
  {
    quote:
      "Writing exams by hand and getting them checked changed everything. I could see my mistakes in real time like having a teacher look at every answer instantly.",
    initials: "BM",
    name: "Bikesh Maharjan",
    meta: "Electronics Engineering, Kathmandu",
  },
  {
    quote:
      "Past papers used to scare me. Now I write answers by hand, get feedback, and track my weak topics until they turn green. Exam day feels like just another practice session.",
    initials: "RS",
    name: "Roshni Shrestha",
    meta: "BSc CSIT, Lalitpur",
  },
];

const trust = [
  {
    icon: FileText,
    title: "Every unit traces back to an official document",
    body: "Each track is written from the published syllabus and past papers of the conducting body - PSC, IOE, MEC, TU, KU, NRB and NEB. Units are named the way the notice names them, so nothing feels invented.",
  },
  {
    icon: ShieldCheck,
    title: "Reviewed by people, not just generated",
    body: "Questions and explanations are drafted with AI, then checked against the source material before they reach your practice set. If something looks wrong, you can flag it inside the study space and we correct it.",
  },
  {
    icon: RefreshCw,
    title: "Updated when the exam changes",
    body: "When a commission revises a syllabus or pattern, the affected units are re-mapped and your plan adjusts on the next login. Current-affairs material is refreshed weekly.",
  },
  {
    icon: Lock,
    title: "Your attempt data stays yours",
    body: "We use your attempts only to build your plan. No selling of data, no spam calls, and you can export or delete your history any time from account settings.",
  },
];

const faqs = [
  {
    q: "Is nanosyllabus really free to start?",
    a: "Yes. You can create an account, take the diagnostic test, and study the daily plan without paying. Paid plans only unlock extras like unlimited full-length mocks and long-answer AI evaluation - the core practice loop stays free.",
  },
  {
    q: "Can I study in Nepali?",
    a: "Explanations are bilingual. You can read a solution in Nepali, English, or switch mid-question. Nepali-language papers such as Loksewa Paper I keep their original terminology.",
  },
  {
    q: "How is this different from a PDF question bank?",
    a: "A PDF gives everyone the same 500 questions. nanosyllabus watches which units you get wrong, then chooses tomorrow's questions from those units and schedules revision before you forget. You study less material, more times.",
  },
  {
    q: "Do I need a laptop?",
    a: "No. The study space is built mobile-first and works on a low-end Android phone over 4G. Question sets are lightweight, and downloaded revision cards work with a weak connection.",
  },
  {
    q: "What happens after I enroll in an exam?",
    a: "You land in your study space with a 10-minute diagnostic. From your results, the planner builds a week-by-week schedule up to your exam date and starts the daily 18-minute session.",
  },
];

const buttonVariants = {
  hero: "bg-primary text-primary-foreground glow-shadow font-semibold hover:brightness-110",
  soft: "glass-card border border-border text-foreground hover:border-primary/60",
  highlight: "bg-highlight text-highlight-foreground font-semibold shadow-sm hover:brightness-105",
  ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
};

const buttonSizes = {
  sm: "h-8 rounded-md px-3 text-xs",
  xl: "h-13 rounded-xl px-9 text-base",
};

function ButtonLink({
  href,
  variant,
  size = "sm",
  children,
}: {
  href: string;
  variant: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 ${buttonVariants[variant]} ${buttonSizes[size]}`}
    >
      {children}
    </Link>
  );
}

function AnchorButton({
  href,
  variant,
  size = "sm",
  children,
}: {
  href: string;
  variant: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 ${buttonVariants[variant]} ${buttonSizes[size]}`}
    >
      {children}
    </a>
  );
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
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#why" className="transition-colors hover:text-foreground">
            Why nanosyllabus
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/exams" variant="hero" size="sm">
            Start free
          </ButtonLink>
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
          <Link href={APP_URL} className="hover:text-foreground">
            Study space
          </Link>
        </div>
      </div>
    </footer>
  );
}

function ExamCard({ exam }: { exam: TeacherCourse }) {
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
          <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>
        <h3 className="mt-4 text-base font-semibold leading-snug">{exam.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{exam.tagline}</p>
      </div>
      <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" /> {exam.subjects.length} subjects
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" /> {exam.enrollmentCount} enrolled
        </span>
      </div>
    </Link>
  );
}

export default async function Index() {
  const courses = await listPublishedCourses().catch(() => []);
  const featured = courses.slice(0, 8);
  const subjectCount = new Set(
    courses.flatMap((course) => course.subjects.map((subject) => subject.slug)),
  ).size;
  const enrollmentCount = courses.reduce((total, course) => total + course.enrollmentCount, 0);
  const averageDailyMinutes = courses.length
    ? Math.round(courses.reduce((total, course) => total + course.dailyMinutes, 0) / courses.length)
    : 0;

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="hero-glow relative overflow-hidden">
          <div className="grid-lines absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto max-w-4xl px-5 pb-20 pt-20 text-center sm:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-highlight" />
              Built for Nepal&apos;s Students
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
              You study hours.{" "}
              <span className="text-gradient">But still don&apos;t know if you&apos;re ready.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              That anxiety before every exam. The fear that you missed something important. Nano
              Syllabus ends the guessing. See exactly what you can answer and what you need to fix
              before it is too late.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/exams" variant="hero" size="xl">
                Start Free <ArrowRight />
              </ButtonLink>
              <AnchorButton href="#how" variant="soft" size="xl">
                See how it works
              </AnchorButton>
            </div>
            <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-4 text-left">
              {[
                [String(subjectCount), "indexed subjects in live courses"],
                [String(enrollmentCount), "active course enrollments"],
                [`${averageDailyMinutes} min`, "average daily target"],
              ].map(([stat, label]) => (
                <div key={label} className="glass-card rounded-xl border border-border p-4">
                  <dt className="font-display text-xl font-semibold sm:text-2xl">{stat}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-border/60 bg-surface/30 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-5 text-center">
            <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-highlight">
              The problem with exam prep
            </span>
            <h2 className="mx-auto mt-6 max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-5xl">
              You study for hours.{" "}
              <span className="text-gradient">
                But do you know what is still costing you marks?
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              More material does not always create more confidence. nanosyllabus shows what you can
              answer now, which topics are slipping, and where your next focused session will make
              the biggest difference.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/exams" variant="hero" size="xl">
                Check your starting point <ArrowRight />
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Exams */}
        <section className="mx-auto max-w-6xl px-5 py-20" id="exams">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">
                Start from an exam
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Every live course is published by a teacher and backed by its connected indexed
                subjects.
              </p>
            </div>
            <ButtonLink href="/exams" variant="soft">
              <Search /> Show all exams
            </ButtonLink>
          </div>
          {featured.length ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((exam) => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          ) : (
            <div className="glass-card mt-8 rounded-2xl border border-border p-8 text-sm text-muted-foreground">
              Published courses will appear here as soon as a teacher makes one live.
            </div>
          )}
        </section>

        {/* Core tools */}
        <section
          className="border-y border-border/60 bg-surface/30 py-20"
          aria-labelledby="tools-title"
        >
          <div className="mx-auto max-w-6xl px-5">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">
              Three ways to prepare
            </span>
            <h2
              id="tools-title"
              className="mt-4 max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-4xl"
            >
              Stop spending time on what you already know.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Three tools. One goal: knowing your readiness before the exam tells you.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {studyTools.map((tool) => (
                <article
                  key={tool.title}
                  className="glass-card flex min-h-80 flex-col rounded-2xl border border-border p-6"
                >
                  <span className="text-4xl font-semibold leading-none text-foreground">
                    {tool.iconText}
                  </span>
                  <span className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-highlight">
                    {tool.label}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold leading-snug">{tool.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tool.body}</p>
                  <p className="mt-auto pt-6 text-xs font-medium text-highlight">{tool.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border/60 bg-surface/40 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">
              How it works
            </span>
            <h2 className="mt-4 max-w-5xl font-display text-3xl font-semibold leading-tight sm:text-5xl">
              From doubt to certainty in three steps.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <div
                  key={s.title}
                  className="glass-card rounded-2xl border border-border p-8 text-center"
                >
                  <span className="font-display text-6xl font-semibold text-primary/25">
                    {i + 1}
                  </span>
                  <h3 className="mt-8 text-lg font-semibold">{s.title}</h3>
                  <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Readiness dashboard */}
        <section
          className="border-y border-border/60 bg-surface/30 py-20"
          aria-labelledby="readiness-title"
        >
          <div className="mx-auto max-w-6xl px-5">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">
              Your readiness dashboard
            </span>
            <div className="mt-5 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <h2
                  id="readiness-title"
                  className="max-w-xl font-display text-3xl font-semibold leading-tight sm:text-4xl"
                >
                  See what you are ready for. Fix what you are not.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  No vague scores. Every topic shows exactly how prepared you are so you know where
                  to spend your last hour of revision.
                </p>
                <ul className="mt-8 divide-y divide-border/60 border-y border-border/60">
                  {readinessTopics.map((topic) => (
                    <li
                      key={topic.name}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <span className={`size-2 rounded-full ${topic.tone}`} aria-hidden="true" />
                        {topic.name} {topic.status} ({topic.score}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className="glass-card rounded-3xl border border-border p-6 sm:p-8"
                aria-label="Illustrative readiness dashboard"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">CSIT Entrance Prep</p>
                  </div>
                  <h3 className="text-lg font-semibold">Overall Readiness</h3>
                </div>
                <div className="mt-7 grid gap-8 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <div className="readiness-ring mx-auto" aria-label="68 percent readiness">
                    <span>68%</span>
                  </div>
                  <div className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      You need 75% to feel confident. Focus on these next:
                    </p>
                    {readinessBars.map((topic) => (
                      <div key={topic.name}>
                        <div className="flex justify-between gap-4 text-xs">
                          <span>{topic.name}</span>
                          <span className="text-muted-foreground">{topic.score}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className={`block h-full rounded-full ${topic.tone}`}
                            style={{ width: `${topic.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why */}
        <section id="why" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl font-display text-2xl font-semibold sm:text-3xl">
            Not another question bank. A tutor that knows where you&apos;re losing marks.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Most aspirants in Nepal do not fail for lack of material - they fail because the same
            two or three units keep leaking marks while the rest gets revised again and again.
            nanosyllabus measures that leak on every attempt and spends your next session on it.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {pillars.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-card p-6">
                <p.icon className="size-5 text-highlight" />
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="border-y border-border/60 bg-surface/40 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="max-w-2xl font-display text-2xl font-semibold sm:text-3xl">
              Why you can trust what you study here
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Exam prep is a high-stakes purchase of your time. So here is exactly how the content
              is made, kept current and handled - in plain terms, before you sign up.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {trust.map((t) => (
                <div key={t.title} className="glass-card rounded-2xl border border-border p-6">
                  <t.icon className="size-5 text-highlight" />
                  <h3 className="mt-4 text-lg font-semibold">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              A note on honesty: nanosyllabus is a preparation tool, not a guarantee. No app can
              promise a name on the result sheet. What we can promise is that your practice is
              mapped to the real syllabus, your weak units are tracked, and nothing here is padded
              to look bigger than it is.
            </p>
          </div>
        </section>

        {/* Real results */}
        <section className="mx-auto max-w-6xl px-5 py-20" aria-labelledby="results-title">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">
            Real results
          </span>
          <h2
            id="results-title"
            className="mt-4 max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-5xl"
          >
            They finally knew where they stood.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Before Nano Syllabus, everyone was guessing. After Nano Syllabus, everyone knew.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {realResults.map((result) => (
              <article
                key={result.name}
                className="glass-card flex min-h-80 flex-col rounded-2xl border border-border p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-highlight">
                  Before Nano Syllabus / After
                </p>
                <blockquote className="mt-6 text-lg font-medium italic leading-relaxed text-muted-foreground">
                  <span className="text-3xl font-semibold not-italic text-highlight">&quot;</span>
                  {result.quote}
                </blockquote>
                <div className="mt-auto flex items-center gap-3 pt-8">
                  <span className="grid size-12 place-items-center rounded-full bg-highlight text-sm font-semibold text-background">
                    {result.initials}
                  </span>
                  <div>
                    <p className="font-semibold">{result.name}</p>
                    <p className="text-sm text-muted-foreground">{result.meta}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            Questions aspirants ask us
          </h2>
          <div className="mt-8 divide-y divide-border/60 rounded-2xl border border-border bg-card">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="cursor-pointer list-none text-base font-medium marker:hidden">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="hero-glow glass-card relative overflow-hidden rounded-3xl border border-border px-6 py-14 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-highlight">
              Start today
            </span>
            <h2 className="mx-auto mt-5 max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-6xl">
              Your next exam. Your most confident attempt.
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-xl">
              Join 10,000+ students who stopped guessing and started knowing. Check your readiness
              now with Nano Syllabus.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/exams" variant="highlight" size="xl">
                Open the App It Is Free <ArrowRight />
              </ButtonLink>
            </div>
            <p className="mt-8 text-base text-muted-foreground sm:text-xl">
              No credit card required. Free forever plan available.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
