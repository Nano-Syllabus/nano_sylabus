"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/utils";

export function CourseLeaveButton({
  slug,
  courseName,
  redirectTo,
  label = "Leave",
  onLeft,
}: {
  slug: string;
  courseName: string;
  redirectTo?: string;
  label?: string;
  onLeft?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  async function leaveCourse() {
    setLeaving(true);
    setError("");

    try {
      const response = await fetch(`/api/student/courses/${encodeURIComponent(slug)}/enroll`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not leave this course.");

      onLeft?.();
      if (redirectTo) {
        router.replace(redirectTo);
      } else {
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not leave this course.");
      setLeaving(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="md" onClick={() => setConfirming(true)}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> {label}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-3">
      <p className="text-sm font-medium">Leave {titleCase(courseName)}?</p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">
        This removes the course and its subjects from your study space. You can enroll again later.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => void leaveCourse()}
          disabled={leaving}
          aria-busy={leaving}
        >
          {leaving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {leaving ? "Leaving..." : "Leave course"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={leaving}
        >
          Keep it
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
