"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { onboardTeacher } from "./actions";

export function TeacherOnboarding({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOnboard = async () => {
    setLoading(true);
    setError("");
    try {
      await onboardTeacher();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to onboard.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
        Teacher workspace
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-text-primary">
        Create your isolated teaching collection
      </h1>
      <p className="mt-4 leading-7 text-text-secondary">
        You are logged in as <span className="font-medium text-text-primary">{userEmail}</span>.
        Activating creates a private collection where you can create subjects, upload and index
        material, and ask questions grounded in that material.
      </p>

      {error && (
        <div className="mt-6 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-500 border border-red-500/20">
          {error}
        </div>
      )}

      <Button className="mt-8 w-fit rounded-md px-6" onClick={handleOnboard} disabled={loading}>
        {loading ? "Activating workspace..." : "Activate teacher workspace"}
      </Button>
    </div>
  );
}
