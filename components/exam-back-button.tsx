"use client";

import { useRouter } from "next/navigation";

export function ExamBackButton() {
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/app/chat");
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span className="hidden sm:inline">Back to chat</span>
      <span className="sm:hidden">Back</span>
    </button>
  );
}
