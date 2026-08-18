import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Signal,
  Sparkles,
  Users,
} from "lucide-react";
import { getPublishedCourse, listPublishedCourses } from "@/lib/student-courses";
import type { TeacherCourse } from "@/lib/teacher-courses";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourse(slug).catch(() => null);
  if (!course) return { title: "Course not found - nanosyllabus", robots: { index: false } };
  return {
    title: `${titleCase(course.name)} - nanosyllabus`,
    description: course.tagline,
    openGraph: { title: `${titleCase(course.name)} - nanosyllabus`, description: course.tagline },
  };
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex min-h-10 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="size-4 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-semibold">nanosyllabus</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link href="/exams" className="hover:text-foreground">Exams</Link>
          <Link href="/#how" className="hover:text-foreground">How it works</Link>
          <Link href="/#why" className="hover:text-foreground">Why nanosyllabus</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/app"
            target="_blank"
            rel="noreferrer"
            className="glow-shadow inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open study space
          </Link>
        </div>
      </div>
    </header>
  );
}

function RelatedCourseCard({ course }: { course: TeacherCourse }) {
  return (
    <Link href={`/exams/${course.slug}`} className="glass-card group flex min-h-48 flex-col justify-between rounded-2xl border border-border p-5 transition hover:border-primary/60">
      <div>
        <div className="flex justify-between gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase text-muted-foreground">{course.category}</span>
          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
        </div>
        <h3 className="mt-4 font-semibold">{titleCase(course.name)}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{course.tagline}</p>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{course.subjects.length} indexed subjects</p>
    </Link>
  );
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [course, published] = await Promise.all([
    getPublishedCourse(slug),
    listPublishedCourses(),
  ]);
  if (!course) notFound();

  const related = published
    .filter((item) => item.id !== course.id && item.category === course.category)
    .slice(0, 3);
  const paymentHref = `/payment/${course.slug}`;

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="hero-glow border-b border-border/60">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
            <Link href="/exams" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden="true" /> All courses
            </Link>

            <div className="mt-8 grid gap-10 lg:grid-cols-[1.55fr_0.85fr]">
              <div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase text-muted-foreground">
                  {course.category} · {course.authority}
                </span>
                <h1 className="mt-7 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
                  {titleCase(course.name)}
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground">{course.description}</p>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><BookOpen className="size-4" aria-hidden="true" /> {course.subjects.length} subjects</span>
                  <span className="inline-flex items-center gap-2"><CalendarDays className="size-4" aria-hidden="true" /> {course.durationWeeks}-week plan</span>
                  <span className="inline-flex items-center gap-2"><Signal className="size-4" aria-hidden="true" /> {course.level}</span>
                  <span className="inline-flex items-center gap-2"><Users className="size-4" aria-hidden="true" /> {course.enrollmentCount} enrolled</span>
                </div>
              </div>

              <aside className="glass-card rounded-2xl border border-border p-6">
                <p className="text-sm text-muted-foreground">Enrollment</p>
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold tracking-tight">Free</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">Instant access to all subjects</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Enrolling opens one study space with every subject connected to this course.
                </p>
                <a href={paymentHref} className="glow-shadow mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                  Enroll now <ArrowRight className="size-4" aria-hidden="true" />
                </a>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden="true" /> {course.diagnosticQuestionCount}-question diagnostic</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden="true" /> {course.dailyMinutes}-minute daily target</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden="true" /> {course.languageModes.join(" and ")} instruction</li>
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.35fr_0.75fr]">
          <div>
            <h2 className="font-display text-2xl font-semibold">Subjects in this course</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              These are the teacher-published indexed sources used by the tutor, practice generator, and grading flow.
            </p>
            <div className="mt-7 divide-y divide-border border-y border-border">
              {course.subjects.map((subject, index) => (
                <div key={subject.slug} className="flex gap-4 py-5">
                  <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-medium">{titleCase(subject.name)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Indexed course subject</p>
                  </div>
                </div>
              ))}
              {!course.subjects.length ? <p className="py-7 text-sm text-muted-foreground">No subjects are connected yet.</p> : null}
            </div>
          </div>
          <aside className="h-fit rounded-2xl border border-border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your instructor</p>
            <div className="mt-5 flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface">
                {course.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.author.avatarUrl}
                    alt={`${course.author.displayName} profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-xl font-semibold" aria-hidden="true">
                    {course.author.displayName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase() || "T"}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold">{course.author.displayName}</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {course.author.headline || "Course creator and instructor"}
                </p>
              </div>
            </div>

            {course.author.bio ? (
              <p className="mt-5 text-sm leading-6 text-muted-foreground">{course.author.bio}</p>
            ) : null}

            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {course.author.institution ? (
                <li className="flex gap-2.5">
                  <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{course.author.institution}</span>
                </li>
              ) : null}
              {course.author.location ? (
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{course.author.location}</span>
                </li>
              ) : null}
              {course.author.yearsExperience ? (
                <li className="flex gap-2.5">
                  <BriefcaseBusiness className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{course.author.yearsExperience} years teaching experience</span>
                </li>
              ) : null}
            </ul>

            {course.author.expertise.length ? (
              <div className="mt-5 flex flex-wrap gap-2" aria-label="Areas of expertise">
                {course.author.expertise.map((item) => (
                  <span key={item} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}

            {course.author.website ? (
              <a
                href={course.author.website}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Visit instructor website <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </aside>
        </section>

        {related.length ? (
          <section className="border-t border-border/60 bg-surface/40 py-16">
            <div className="mx-auto max-w-6xl px-5">
              <h2 className="font-display text-2xl font-semibold">More {course.category} courses</h2>
              <div className="mt-7 grid gap-4 md:grid-cols-3">{related.map((item) => <RelatedCourseCard key={item.id} course={item} />)}</div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} nanosyllabus</p>
          <Link href="/exams" className="hover:text-foreground">Browse courses</Link>
        </div>
      </footer>
    </div>
  );
}
