"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import type { TeacherCourse } from "@/lib/teacher-courses";

const PER_PAGE = 6;

const notes = [
  {
    title: "Built from indexed subjects",
    body: "Every published course is connected to the teacher's indexed material, which powers chat, practice, and exam generation.",
  },
  {
    title: "Inspect before enrolling",
    body: "Open a course to see its subjects, study settings, outcomes, access model, and teaching language.",
  },
  {
    title: "One course, one study space",
    body: "Enrollment keeps the full subject set and its learning tools together instead of making you collect subjects one at a time.",
  },
];

function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="glass-card inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
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
          <Link href="/exams" className="transition-colors hover:text-foreground">Exams</Link>
          <Link href="/#how" className="transition-colors hover:text-foreground">How it works</Link>
          <Link href="/#why" className="transition-colors hover:text-foreground">Why nanosyllabus</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="inline-flex h-8 items-center px-3 text-xs font-medium text-foreground hover:text-white">Log in</Link>
          <Link href="/exams" className="glow-shadow inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-110">Start free</Link>
        </div>
      </div>
    </header>
  );
}

function CourseCard({ course }: { course: TeacherCourse }) {
  return (
    <Link
      href={`/exams/${course.slug}`}
      className="glass-card group flex min-h-56 flex-col justify-between rounded-2xl border border-border p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase text-muted-foreground">
            {course.category}
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold leading-snug">{course.name}</h2>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{course.tagline}</p>
      </div>
      <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" aria-hidden="true" /> {course.subjects.length} subjects
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" /> {course.enrollmentCount} enrolled
        </span>
      </div>
    </Link>
  );
}

export function PublicExamsClient({ courses }: { courses: TeacherCourse[] }) {
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(courses.map((course) => course.category)))],
    [courses],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesCategory = category === "All" || course.category === category;
      const matchesQuery =
        !needle ||
        [course.name, course.shortName, course.authority, course.tagline, course.category]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [category, courses, query]);

  useEffect(() => setPage(1), [category, query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = results.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  function goTo(nextPage: number) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="hero-glow">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back home
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold sm:text-4xl">Find your course</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Browse {courses.length} teacher-published course{courses.length === 1 ? "" : "s"}. Open one to inspect its indexed subjects, study plan, and access before enrolling.
          </p>

          <div className="relative mt-8 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by course, authority, or category..."
              className="h-12 w-full rounded-xl border border-border bg-surface/70 pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Search courses"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  category === item
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <p className="mt-8 text-xs uppercase text-muted-foreground">
            {results.length} {results.length === 1 ? "course" : "courses"}
            {results.length > PER_PAGE ? ` · page ${currentPage} of ${totalPages}` : ""}
          </p>

          {results.length ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.map((course) => <CourseCard key={course.id} course={course} />)}
              </div>
              {totalPages > 1 ? (
                <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Course pagination">
                  <button type="button" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 1} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-sm disabled:opacity-40">
                    <ChevronLeft className="size-4" aria-hidden="true" /> Prev
                  </button>
                  <span className="px-3 text-sm text-muted-foreground">{currentPage} / {totalPages}</span>
                  <button type="button" onClick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-sm disabled:opacity-40">
                    Next <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className="glass-card mt-4 rounded-2xl border border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {courses.length ? "No course matches that search." : "No teacher has published a course yet."}
              </p>
              {courses.length ? (
                <button type="button" className="mt-5 min-h-10 rounded-full border border-border px-4 text-sm" onClick={() => { setQuery(""); setCategory("All"); }}>
                  Reset search
                </button>
              ) : null}
            </div>
          )}

          <section className="mt-16 grid gap-4 md:grid-cols-3">
            {notes.map((note) => (
              <div key={note.title} className="rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-base font-semibold">{note.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note.body}</p>
              </div>
            ))}
          </section>
        </div>
      </main>
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} nanosyllabus - AI exam prep built for Nepal.</p>
          <ButtonLink href="/login">Open study space</ButtonLink>
        </div>
      </footer>
    </div>
  );
}
