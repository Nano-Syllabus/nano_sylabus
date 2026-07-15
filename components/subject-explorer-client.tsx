"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import type { SubjectExplorerSummary } from "@/lib/types";

export function SubjectExplorerClient({ subjects }: { subjects: SubjectExplorerSummary[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SubjectExplorerSummary["category"] | "All">("All");
  const [source, setSource] = useState<"All" | "Profile" | "Available">("All");
  const [sort, setSort] = useState<"recommended" | "az" | "activity">("recommended");

  const categories = useMemo(
    () => Array.from(new Set(subjects.map((subject) => subject.category))).sort(),
    [subjects],
  );

  const filteredSubjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return subjects
      .filter((subject) => {
        if (category !== "All" && subject.category !== category) return false;
        if (source === "Profile" && !subject.inProfile) return false;
        if (source === "Available" && subject.inProfile) return false;
        if (!normalizedQuery) return true;

        return [
          subject.subject,
          subject.board,
          subject.grade,
          subject.category,
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        if (sort === "az") return left.subject.localeCompare(right.subject);
        if (sort === "activity") {
          const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
          const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
          if (leftTime !== rightTime) return rightTime - leftTime;
          return right.questionCount - left.questionCount || left.subject.localeCompare(right.subject);
        }

        if (left.inProfile !== right.inProfile) return left.inProfile ? -1 : 1;
        return right.questionCount - left.questionCount || left.subject.localeCompare(right.subject);
      });
  }, [category, query, sort, source, subjects]);

  const profileCount = subjects.filter((subject) => subject.inProfile).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <section className="mb-5 space-y-3">
        <div>
          <h1 className="mt-2 font-display text-3xl text-text-primary sm:text-4xl">
            Find your subject
          </h1>
        </div>

        <div className="grid gap-2 lg:grid-cols-[2fr_1fr]">
          <label className="group rounded-xl border border-black/10 dark:border-white/10 bg-bg-primary px-3 py-2.5 focus-within:border-text-secondary">

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search subjects..."
              className="mt-1.5 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>


          <label className="rounded-xl border border-black/10 dark:border-white/10 bg-bg-primary px-3 py-2.5">

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="mt-1.5 w-full bg-bg-primary text-sm text-text-primary outline-none"
            >
              <option value="recommended">Recommended</option>
              <option value="az">A to Z</option>
              <option value="activity">Recent activity</option>
            </select>
          </label>
        </div>
      </section>

      {filteredSubjects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSubjects.map((subject) => (
            <article key={subject.subject} className="flex h-full flex-col rounded-2xl border border-border bg-bg-primary p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">
                    {subject.inProfile ? "From your profile" : "Available subject"}
                  </p>
                  <h2 className="mt-2 font-display text-xl sm:text-2xl truncate" title={subject.subject}>{subject.subject}</h2>

                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-secondary text-lg">
                  {subject.subject.slice(0, 1).toUpperCase()}
                </span>
              </div>





              <div className="mt-auto pt-5 flex gap-2">
                <Link href={`/app/explore/${encodeURIComponent(normalizeSubjectLabel(subject.subject))}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    View history
                  </Button>
                </Link>
                <Link href={`/app/chat?subject=${encodeURIComponent(normalizeSubjectLabel(subject.subject))}`} className="flex-1">
                  <Button className="w-full">Start chat</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-text-secondary">
          No subjects match this filter.
        </div>
      )}
    </div>
  );
}
