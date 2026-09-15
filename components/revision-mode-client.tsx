"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NoteColor, RevisionAction, RevisionNoteSummary } from "@/lib/types";

const COLOR_LABEL: Record<NoteColor, string> = {
  red: "Must revise",
  yellow: "Review later",
  green: "Got it",
};

export function RevisionModeClient({ notes }: { notes: RevisionNoteSummary[] }) {
  const [filter, setFilter] = useState<"all" | NoteColor>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(notes.map((note) => note.id)));
  const [phase, setPhase] = useState<"select" | "session" | "summary">("select");
  const [deck, setDeck] = useState<RevisionNoteSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<RevisionAction[]>([]);

  const filteredPool = useMemo(
    () => notes.filter((note) => filter === "all" || note.colorLabel === filter),
    [notes, filter],
  );

  async function logAction(noteId: string, action: RevisionAction) {
    await fetch("/api/notes/revision-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ noteId, action }),
    });
  }

  async function advance(action: RevisionAction) {
    const current = deck[index];
    await logAction(current.id, action);
    const nextResults = [...results, action];
    setResults(nextResults);
    if (index + 1 >= deck.length) {
      setPhase("summary");
    } else {
      setIndex(index + 1);
      setFlipped(false);
    }
  }

  if (phase === "select") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <p className="font-mono-ui text-xs uppercase text-text-muted">Revision Mode</p>
        <h1 className="mt-2 font-display text-4xl">Pick what to revise</h1>
        <p className="mt-2 text-sm text-text-secondary">Flip cards. Mark what you remember. Track your progress.</p>

        <div className="mt-7">
          <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">Filter by colour</p>
          <div className="inline-flex rounded-full border border-border p-0.5">
            {(["all", "red", "yellow", "green"] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setFilter(color)}
                className={
                  "rounded-full px-3 py-1.5 text-xs transition " +
                  (filter === color ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                }
              >
                {color === "all" ? "All notes" : COLOR_LABEL[color as NoteColor]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-[10px] font-mono-ui uppercase text-text-muted">
            <span>Notes ({filteredPool.length})</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setSelectedIds(new Set(filteredPool.map((note) => note.id)))}>
                Select all
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          </div>
          <ul className="max-h-[40vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
            {filteredPool.map((note) => {
              const selected = selectedIds.has(note.id);
              return (
                <li key={note.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-bg-secondary">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (selected) next.delete(note.id);
                        else next.add(note.id);
                        setSelectedIds(next);
                      }}
                      className="accent-text-primary"
                    />
                    <span className="flex-1 truncate text-sm">{note.title}</span>
                    <Badge variant="outline">{note.subjectTag}</Badge>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-7 flex justify-end">
          <Button
            onClick={() => {
              const chosen = filteredPool.filter((note) => selectedIds.has(note.id));
              if (chosen.length === 0) return;
              setDeck([...chosen].sort(() => Math.random() - 0.5));
              setIndex(0);
              setFlipped(false);
              setResults([]);
              setPhase("session");
            }}
            disabled={selectedIds.size === 0}
          >
            Begin · {selectedIds.size} card{selectedIds.size === 1 ? "" : "s"} →
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "session") {
    const card = deck[index];
    const total = deck.length;
    const pct = (index / total) * 100;
    return (
      <div className="mx-auto flex max-w-2xl flex-col px-5 py-8">
        <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary">
          <div className="h-full bg-text-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="relative mt-8 [perspective:1500px]">
          <div
            className={
              "relative min-h-[340px] w-full transition-transform duration-500 [transform-style:preserve-3d] " +
              (flipped ? "[transform:rotateY(180deg)]" : "")
            }
          >
            <div className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-bg-primary p-8 [backface-visibility:hidden]">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{card.subjectTag}</Badge>
                <button
                  type="button"
                  onClick={() => void advance("skip")}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Skip →
                </button>
              </div>
              <div className="my-auto py-8 text-center">
                <p className="font-mono-ui text-[10px] uppercase text-text-muted">Question</p>
                <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{card.title}</h2>
                <p className="mt-3 text-sm text-text-secondary">{card.questionContent}</p>
              </div>
              <Button onClick={() => setFlipped(true)} variant="outline" className="mx-auto">
                Show answer ↻
              </Button>
            </div>
            <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-secondary p-8 [transform:rotateY(180deg)] [backface-visibility:hidden]">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{card.subjectTag}</Badge>
                <button
                  type="button"
                  onClick={() => setFlipped(false)}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  ↺ Flip back
                </button>
              </div>
              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                <Markdown text={card.answerContent} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => void advance("review")}>
            🔁 Need review
          </Button>
          <Button onClick={() => void advance("remember")}>✓ Remember</Button>
        </div>
      </div>
    );
  }

  const remembered = results.filter((result) => result === "remember").length;
  const reviewCount = results.filter((result) => result === "review").length;
  const skipped = results.filter((result) => result === "skip").length;

  return (
    <div className="mx-auto max-w-md px-5 py-12 text-center">
      <p className="text-5xl">🎉</p>
      <h1 className="mt-4 font-display text-4xl">Session complete</h1>
      <p className="mt-2 text-sm text-text-secondary">Nice work. Here&apos;s how it went.</p>

      <div className="mt-8 grid grid-cols-3 gap-3 text-left">
        <Stat label="Reviewed" value={results.length} />
        <Stat label="Remember" value={remembered} accent="success" />
        <Stat label="To revisit" value={reviewCount + skipped} accent="warning" />
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <Button onClick={() => setPhase("select")}>Review again</Button>
        <Link href="/app/notes/saved">
          <Button variant="outline" className="w-full">
            Back to notes
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4">
      <p className="text-[10px] font-mono-ui uppercase text-text-muted">{label}</p>
      <p
        className={
          "mt-1 font-display text-3xl " +
          (accent === "success"
            ? "text-[color:var(--green)]"
            : accent === "warning"
              ? "text-[color:var(--yellow)]"
              : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
