"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CourseEnrollmentCard({
  slug,
  accessModel,
}: {
  slug: string;
  accessModel: "free" | "paid";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function enroll() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/student/courses/${encodeURIComponent(slug)}/enroll`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not enroll in this course.");

      router.replace("/app/courses");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enroll in this course.");
      setLoading(false);
    }
  }

  if (accessModel === "paid") {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <p className="text-sm font-medium">Payment is not open yet</p>
        <p className="mt-1 text-sm text-text-secondary">
          This course is published, but checkout has not been connected.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        onClick={() => void enroll()}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? "Opening course..." : "Enroll free"}
        {!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
      </Button>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
