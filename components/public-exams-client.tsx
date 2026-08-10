"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
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

import {
  PUBLIC_APP_URL,
  publicExamCategories,
  publicExams,
  type PublicExam,
} from "@/lib/public-exams";

const PER_PAGE = 6;
const APP_URL = PUBLIC_APP_URL;
const categories = publicExamCategories;
const exams = publicExams;

const notes = [
  {
    title: "Mapped to the official syllabus",
    body: "Each track is broken into the same units the conducting body publishes, so you can compare it line by line with the notice before enrolling.",
  },
  {
    title: "Open before you commit",
    body: "Every exam page shows the full unit list, the plan length and what is included. Nothing is hidden behind a signup wall.",
  },
  {
    title: "Free to start, no card",
    body: "Enrolling opens your study space with a diagnostic test. You can study the daily plan without paying anything.",
  },
];

function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="glass-card inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {children}
    </Link>
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
          <Link href="/#how" className="transition-colors hover:text-foreground">
            How it works
          </Link>
          <Link href="/#why" className="transition-colors hover:text-foreground">
            Why nanosyllabus
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={APP_URL}
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

function ExamCard({ exam }: { exam: PublicExam }) {
  return (
    <Link
      href={`/exams/${exam.slug}`}
      className="glass-card group flex min-h-56 flex-col justify-between rounded-2xl border border-border p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <BookOpen className="size-3.5" aria-hidden="true" /> {exam.questions} questions
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" /> {exam.learners}
        </span>
      </div>
    </Link>
  );
}

export function PublicExamsClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [page, setPage] = useState(1);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((exam) => {
      const matchesCat = category === "All" || exam.category === category;
      const matchesQuery =
        !q ||
        [exam.name, exam.short, exam.authority, exam.tagline, exam.category].some((field) =>
          field.toLowerCase().includes(q),
        );
      return matchesCat && matchesQuery;
    });
  }, [query, category]);

  useEffect(() => {
    setPage(1);
  }, [query, category]);

  const totalPages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PER_PAGE;
  const pageItems = results.slice(start, start + PER_PAGE);

  const goTo = (nextPage: number) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="exam-prep-theme min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="hero-glow">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back home
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold sm:text-4xl">Find your exam</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Search {exams.length} exam tracks by name, conducting authority or category - from
            Loksewa Nayab Subba and Kharidar to IOE, CEE MBBS, CMAT, KUUMAT, NRB banking, IELTS, NEB
            Class 12 and professional license exams. Open any track to read its full syllabus
            coverage, plan length and what is included before you enroll.
          </p>

          <div className="relative mt-8 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Nayab Subba, IELTS, entrance..."
              className="h-12 w-full rounded-xl border border-border bg-surface/70 pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Search exams"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  category === item
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <p className="mt-8 text-xs uppercase tracking-wider text-muted-foreground">
            {results.length} {results.length === 1 ? "exam" : "exams"}
            {results.length > PER_PAGE && ` · page ${current} of ${totalPages}`}
          </p>

          {results.length > 0 ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.map((exam) => (
                  <ExamCard key={exam.slug} exam={exam} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav
                  className="mt-10 flex items-center justify-center gap-2"
                  aria-label="Exam pagination"
                >
                  <button
                    type="button"
                    onClick={() => goTo(current - 1)}
                    disabled={current === 1}
                    aria-label="Previous page"
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface/80 px-3 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" /> Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => goTo(item)}
                      aria-current={item === current ? "page" : undefined}
                      className={`size-9 rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        item === current
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => goTo(current + 1)}
                    disabled={current === totalPages}
                    aria-label="Next page"
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface/80 px-3 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Next <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </nav>
              )}
            </>
          ) : (
            <div className="glass-card mt-4 rounded-2xl border border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No exam matches &quot;{query}&quot;. Try a shorter keyword or clear the filter.
              </p>
              <button
                type="button"
                className="mt-5 inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface/80 px-3 text-sm font-medium text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Reset search
              </button>
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

          <section className="mt-14 max-w-3xl">
            <h2 className="font-display text-xl font-semibold">Can&apos;t find your exam?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We add tracks based on what aspirants actually ask for, and we would rather ship one
              well-mapped syllabus than twenty shallow ones. If your exam is missing, pick the
              closest track for now - the reasoning, Nepali and English, and general-awareness units
              overlap heavily across Loksewa and recruitment exams - and tell us inside the study
              space so it enters the queue.
            </p>
          </section>
        </div>
      </main>
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
    </div>
  );
}
