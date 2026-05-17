"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import type { SubjectExplorerSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function SubjectExplorerClient({ subjects }: { subjects: SubjectExplorerSummary[] }) {
  const [query, setQuery] = useState("");
  const [boardFilter, setBoardFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "questions" | "sessions" | "az">("recent");

  const boards = useMemo(() => {
    return Array.from(new Set(subjects.map((subject) => subject.board.trim()).filter(Boolean))).sort();
  }, [subjects]);

  const categories = useMemo(() => {
    return Array.from(new Set(subjects.map((subject) => subject.category))).sort();
  }, [subjects]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const next = subjects.filter((subject) => {
      if (lowered && !subject.subject.toLowerCase().includes(lowered)) return false;
      if (boardFilter !== "all" && subject.board !== boardFilter) return false;
      if (categoryFilter !== "all" && subject.category !== categoryFilter) return false;
      return true;
    });

    return next.sort((left, right) => {
      if (left.inProfile !== right.inProfile) return left.inProfile ? -1 : 1;

      if (sortBy === "questions") {
        if (left.questionCount !== right.questionCount) return right.questionCount - left.questionCount;
      } else if (sortBy === "sessions") {
        if (left.sessionCount !== right.sessionCount) return right.sessionCount - left.sessionCount;
      } else if (sortBy === "az") {
        return left.subject.localeCompare(right.subject);
      } else {
        const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
        const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
        if (leftTime !== rightTime) return rightTime - leftTime;
      }

      if (left.questionCount !== right.questionCount) return right.questionCount - left.questionCount;
      return left.subject.localeCompare(right.subject);
    });
  }, [boardFilter, categoryFilter, query, sortBy, subjects]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 grid gap-3 lg:grid-cols-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search subjects..."
        />
        <select
          value={boardFilter}
          onChange={(event) => setBoardFilter(event.target.value)}
          className="h-12 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Boards</option>
          {boards.map((board) => (
            <option key={board} value={board}>
              {board}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-12 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(event) =>
            setSortBy(event.target.value as "recent" | "questions" | "sessions" | "az")
          }
          className="h-12 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="recent">Sort: Recent activity</option>
          <option value="questions">Sort: Most questions</option>
          <option value="sessions">Sort: Most sessions</option>
          <option value="az">Sort: A to Z</option>
        </select>
      </div>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subject) => (
            <article key={subject.subject} className="rounded-2xl border border-border bg-bg-primary p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">
                    {subject.inProfile ? "From your profile" : "Other subject"}
                  </p>
                  <h2 className="mt-2 font-display text-3xl">{subject.subject}</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {subject.board || "Board N/A"} · {subject.grade || "Grade N/A"} · {subject.category}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-secondary text-lg">
                  {subject.subject.slice(0, 1).toUpperCase()}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-bg-secondary p-3">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">Questions</p>
                  <p className="mt-1 font-display text-3xl">{subject.questionCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg-secondary p-3">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">Sessions</p>
                  <p className="mt-1 font-display text-3xl">{subject.sessionCount}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-text-muted">
                {subject.lastActivityAt ? `Last activity ${formatDate(subject.lastActivityAt)}` : "No chat yet"}
              </p>

              <div className="mt-5 flex gap-2">
                <Link href={`/app/explore/${encodeURIComponent(normalizeSubjectLabel(subject.subject))}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    Open subject
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
          No subjects found yet.
        </div>
      )}
    </div>
  );
}
