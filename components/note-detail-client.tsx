"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CitationCard } from "@/components/citation-card";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
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

export function NoteDetailClient({ note }: { note: RevisionNoteDetail }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [current, setCurrent] = useState(note);
  const followUpPrompt = `I want to ask a follow-up question about this explanation.\n\nOriginal question: ${current.questionContent}\n\nSaved note title: ${current.title}\n\nMy follow-up: `;

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

        <h1 className="mt-5 font-display text-4xl leading-[1.1] sm:text-5xl">{current.title}</h1>

        <blockquote className="mt-8 rounded-md border-l-2 border-border-strong bg-bg-secondary px-4 py-3 text-sm italic text-text-secondary">
          <span className="font-mono-ui text-[10px] uppercase not-italic text-text-muted">
            Original question
          </span>
          <p className="mt-1">{current.questionContent}</p>
        </blockquote>

        <div className="mt-8">
          <Markdown text={current.answerContent} className="text-base" />
        </div>

        {current.citations.length ? (
          <div className="mt-6">
            <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">Saved from source</p>
            <div className="flex flex-wrap gap-2">
              {current.citations.map((citation) => (
                <CitationCard key={`${citation.chunkId}-${citation.documentId}`} citation={citation} />
              ))}
            </div>
          </div>
        ) : null}

        {current.annotation ? (
          <div className="mt-8 rounded-md bg-[color:var(--note-yellow)] p-4">
            <p className="text-[10px] font-mono-ui uppercase text-text-muted">Your annotation</p>
            <p className="mt-1 text-sm">{current.annotation}</p>
          </div>
        ) : null}

        <div className="mt-10 border-t border-border pt-6">
          <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">Re-classify</p>
          <div className="flex flex-wrap gap-2">
            {(["red", "yellow", "green"] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setEditing(true)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs transition " +
                  (current.colorLabel === color
                    ? "border-text-primary bg-bg-secondary font-medium"
                    : "border-border hover:border-border-strong")
                }
              >
                {COLOR_LABEL[color]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          <Link href={`/app/chat?session=${current.sessionId}`}>
            <Button variant="outline" size="sm">
              ← Back to chat
            </Button>
          </Link>
          <Link
            href={`/app/chat?subject=${encodeURIComponent(normalizeSubjectLabel(current.subjectTag))}&prompt=${encodeURIComponent(followUpPrompt)}`}
          >
            <Button size="sm">Ask follow-up →</Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>

        <div className="mt-12 rounded-md border border-border bg-bg-secondary p-4 text-xs text-text-muted">
          <div className="flex justify-between font-mono-ui">
            <span>Reviewed</span>
            <span>{current.reviewedCount} times</span>
          </div>
          {current.lastReviewedAt ? (
            <div className="mt-1 flex justify-between font-mono-ui">
              <span>Last revised</span>
              <span>{formatDate(current.lastReviewedAt)}</span>
            </div>
          ) : null}
        </div>
      </article>

      {editing ? (
        <EditModal
          note={current}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setCurrent(next);
            setEditing(false);
          }}
        />
      ) : null}

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

function EditModal({
  note,
  onClose,
  onSaved,
}: {
  note: RevisionNoteDetail;
  onClose: () => void;
  onSaved: (note: RevisionNoteDetail) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [subjectTag, setSubjectTag] = useState(note.subjectTag);
  const [chapterTag, setChapterTag] = useState(note.chapterTag ?? "");
  const [annotation, setAnnotation] = useState(note.annotation ?? "");
  const [colorLabel, setColorLabel] = useState<NoteColor>(note.colorLabel);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        subjectTag,
        chapterTag,
        annotation,
        colorLabel,
      }),
    });
    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || "Failed to update note.");
      return;
    }

    onSaved({
      ...note,
      title,
      subjectTag,
      chapterTag: chapterTag || null,
      annotation: annotation || null,
      colorLabel,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-bg-primary p-6 animate-slide-up"
      >
        <h3 className="font-display text-2xl">Edit note</h3>
        <div className="mt-5 space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Subject">
            <Input value={subjectTag} onChange={(event) => setSubjectTag(event.target.value)} />
          </Field>
          <Field label="Chapter / topic">
            <Input value={chapterTag} onChange={(event) => setChapterTag(event.target.value)} />
          </Field>
          <Field label="Annotation">
            <Textarea value={annotation} rows={3} onChange={(event) => setAnnotation(event.target.value)} />
          </Field>
          <div>
            <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">Color</p>
            <div className="flex gap-2">
              {(["red", "yellow", "green"] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColorLabel(color)}
                  className={
                    "flex-1 rounded-md border px-2 py-2 text-xs transition " +
                    (colorLabel === color ? "border-text-primary bg-bg-secondary font-medium" : "border-border")
                  }
                >
                  {COLOR_LABEL[color]}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
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
