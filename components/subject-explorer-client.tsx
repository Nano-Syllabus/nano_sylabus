"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import type { SubjectExplorerSummary } from "@/lib/types";

export function SubjectExplorerClient({ subjects }: { subjects: SubjectExplorerSummary[] }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {subjects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <article key={subject.subject} className="flex h-full flex-col rounded-2xl border border-border bg-bg-primary p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">
                    {subject.inProfile ? "From your profile" : "Other subject"}
                  </p>
                  <h2 className="mt-2 font-display text-xl sm:text-2xl truncate" title={subject.subject}>{subject.subject}</h2>
                  <p className="mt-1 text-xs text-text-muted truncate">
                    {subject.board || "Board N/A"} · {subject.grade || "Grade N/A"} · {subject.category}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-secondary text-lg">
                  {subject.subject.slice(0, 1).toUpperCase()}
                </span>
              </div>





              <div className="mt-auto pt-5 flex gap-2">
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
