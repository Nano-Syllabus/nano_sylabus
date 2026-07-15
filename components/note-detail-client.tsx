"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NoteColor, RevisionNoteDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const COLOR_DOT: Record<NoteColor, string> = {
  red: "bg-destructive",
  yellow: "bg-warning",
  green: "bg-success",
};

const COLOR_LABEL: Record<NoteColor, string> = {
  red: "Must revise",
  yellow: "Review later",
  green: "Got it",
};

function cleanTextForDisplay(value: string) {
  return value
    .replace(/^>\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/[_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function NoteDetailClient({ note }: { note: RevisionNoteDetail }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = note;
  const displayTitle = cleanTextForDisplay(current.title) || current.title;
  const displayQuestion = cleanTextForDisplay(current.questionContent) || current.questionContent;
  const followUpPrompt = `About ${displayTitle}: `;

  return (
    <>
      <article className="mx-auto max-w-3xl px-5 py-10 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${COLOR_DOT[current.colorLabel]}`} />
          <span className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">
            {COLOR_LABEL[current.colorLabel]}
          </span>
          <Badge variant="outline">{current.subjectTag}</Badge>
          {current.chapterTag ? <Badge>{current.chapterTag}</Badge> : null}
          <span className="ml-auto text-[11px] font-mono-ui text-text-muted">
            {formatDate(current.createdAt)}
          </span>
        </div>

        <h1 className="mt-5 max-w-3xl break-words font-display text-3xl leading-[1.12] sm:text-4xl">
          {displayTitle}
        </h1>

        <blockquote className="mt-8 rounded-md border-l-2 border-border-strong bg-bg-secondary px-4 py-3 text-sm italic text-text-secondary">
          <span className="font-mono-ui text-[10px] uppercase not-italic text-text-muted">
            Original question
          </span>
          <p className="mt-1">{displayQuestion}</p>
        </blockquote>

        <div className="mt-8">
          <Markdown text={current.answerContent} className="text-base" />
        </div>

        {current.annotation ? (
          <div className="mt-8 rounded-md bg-[color:var(--note-yellow)] p-4">
            <p className="text-[10px] font-mono-ui uppercase text-text-muted">Your annotation</p>
            <p className="mt-1 text-sm">{current.annotation}</p>
          </div>
        ) : null}

        <div className="mt-10 flex flex-wrap gap-2">
          <Link href={`/app/chat?session=${current.sessionId}`}>
            <Button variant="outline" size="sm">
              ↑ Jump to chat
            </Button>
          </Link>
          <Link
            href={`/app/chat?session=${current.sessionId}&prompt=${encodeURIComponent(followUpPrompt)}`}
          >
            <Button size="sm">Ask follow-up →</Button>
          </Link>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </article>

      {confirmDelete ? (
        <ConfirmDelete
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await fetch(`/api/notes/${current.id}`, { method: "DELETE" });
            router.push("/app/notes");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmDelete({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-primary p-6 animate-slide-up">
        <h3 className="font-display text-2xl">Delete this note?</h3>
        <p className="mt-2 text-sm text-text-muted">This can&apos;t be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
