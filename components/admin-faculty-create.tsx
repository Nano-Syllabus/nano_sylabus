"use client";

import { useState } from "react";
import {
  communityLevels,
  communityLevelDefaults,
  communityLevelStructure,
  type CommunityLevel,
} from "@/lib/communities";
import type { CommunityChoice } from "@/lib/data/landing-sites";

export const facultyInputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
export function AdminFacultyCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (faculty: CommunityChoice) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    faculty: "",
    university: "",
    description: "",
    level: "License" as CommunityLevel,
    totalYears: 1,
    totalSemesters: 1,
    visibility: "public",
    challengeQuestionFormat: "mcq",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create faculty.");
      onCreated(result.faculty);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-blue-600/30 bg-blue-600/5 p-4"
    >
      <h3 className="font-semibold">Add a faculty</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["name", "Faculty name", "BCT License"],
            ["faculty", "Programme / faculty code", "BCT"],
            ["university", "University / examining body", "Nepal Engineering Council"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="text-sm">
            {label}
            <input
              required
              maxLength={key === "name" ? 120 : 160}
              value={draft[key]}
              placeholder={placeholder}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              className={`${facultyInputClass} mt-1`}
            />
          </label>
        ))}
        <label className="text-sm">
          Level
          <select
            value={draft.level}
            onChange={(e) => {
              const level = e.target.value as CommunityLevel;
              setDraft({
                ...draft,
                level,
                ...communityLevelDefaults(level),
                challengeQuestionFormat:
                  communityLevelStructure(level) === "single-track"
                    ? "mcq"
                    : draft.challengeQuestionFormat,
              });
            }}
            className={`${facultyInputClass} mt-1`}
          >
            {communityLevels.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        {communityLevelStructure(draft.level) === "years-or-semesters" ? (
          <>
            <label className="text-sm">
              Years
              <input
                type="number"
                min={1}
                max={10}
                value={draft.totalYears}
                onChange={(e) => setDraft({ ...draft, totalYears: Number(e.target.value) })}
                className={`${facultyInputClass} mt-1`}
              />
            </label>
            <label className="text-sm">
              Semesters / terms
              <input
                type="number"
                min={draft.totalYears}
                max={draft.totalYears * 4}
                value={draft.totalSemesters}
                onChange={(e) => setDraft({ ...draft, totalSemesters: Number(e.target.value) })}
                className={`${facultyInputClass} mt-1`}
              />
            </label>
          </>
        ) : null}
        <label className="text-sm">
          Visibility
          <select
            value={draft.visibility}
            onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}
            className={`${facultyInputClass} mt-1`}
          >
            <option value="public">Public · visible before signup</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="text-sm">
          Challenge format
          <select
            disabled={communityLevelStructure(draft.level) === "single-track"}
            value={draft.challengeQuestionFormat}
            onChange={(e) => setDraft({ ...draft, challengeQuestionFormat: e.target.value })}
            className={`${facultyInputClass} mt-1`}
          >
            <option value="mcq">MCQ</option>
            <option value="qna">Written answers</option>
            <option value="hybrid">Both</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Description
        <textarea
          maxLength={1200}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className={`${facultyInputClass} mt-1`}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        License and Entrance faculties use one subject track. Other levels use their year or
        semester structure.
      </p>
      <div className="flex gap-2">
        <button
          disabled={pending}
          className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create faculty"}
        </button>
        <button
          disabled={pending}
          type="button"
          onClick={onCancel}
          className="min-h-10 rounded-lg border border-border px-4 text-sm"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
