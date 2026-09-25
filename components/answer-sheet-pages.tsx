"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs; next/image would proxy and cache them */
import { FileText, Smartphone, X } from "lucide-react";
import type { AnswerSheetPage } from "@/lib/data/challenge-answer-sheet";

/** The pages of an answer sheet so far, in order, each removable. */
export function AnswerSheetPages({
  pages,
  disabled,
  onRemove,
}: {
  pages: AnswerSheetPage[];
  disabled?: boolean;
  onRemove: (pageId: string) => void;
}) {
  if (!pages.length) return null;
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {pages.map((page, index) => (
        <li
          key={page.id}
          className="relative overflow-hidden rounded-lg border border-border bg-bg-primary"
        >
          {page.previewUrl ? (
            <img
              src={page.previewUrl}
              alt={`Page ${index + 1}`}
              className="aspect-[3/4] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 p-2 text-center">
              <FileText className="size-7 text-text-muted" aria-hidden="true" />
              <span className="line-clamp-2 break-all text-xs text-text-secondary">{page.name || "PDF"}</span>
            </div>
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {page.mimeType === "application/pdf" ? "PDF" : index + 1}
            {page.source === "phone" ? <Smartphone className="size-3" aria-label="from phone" /> : null}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(page.id)}
            aria-label={`Remove ${page.mimeType === "application/pdf" ? "the PDF" : `page ${index + 1}`}`}
            className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}
