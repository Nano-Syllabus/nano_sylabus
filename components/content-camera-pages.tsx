"use client";

/* eslint-disable @next/next/no-img-element -- temporary signed VPS previews */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnswerSheetPages } from "@/components/answer-sheet-pages";
import type { ContentCameraState } from "@/lib/content-camera-types";

export function ContentCameraPages({
  pages,
  disabled,
  onRemove,
  onReorder,
}: {
  pages: ContentCameraState["pages"];
  disabled: boolean;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState("");
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === selected),
  );
  const page = pages[index];
  const move = (step: number) =>
    setSelected(pages[Math.max(0, Math.min(pages.length - 1, index + step))]?.id ?? "");
  if (!page)
    return (
      <p className="rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-text-muted">
        Take a photo on your phone or choose images here. Each page will appear as it arrives.
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-secondary p-3">
        <div
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            if (touchStart !== null) {
              const distance = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
              if (Math.abs(distance) > 50) move(distance < 0 ? 1 : -1);
            }
            setTouchStart(null);
          }}
        >
          <img
            src={page.previewUrl ?? ""}
            alt={`Preview page ${index + 1}`}
            className="mx-auto h-64 max-w-full rounded-md object-contain sm:h-80"
          />
        </div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Previous page"
            disabled={index === 0}
            onClick={() => move(-1)}
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-bg-primary disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span aria-live="polite" className="text-sm">
            Page {index + 1} of {pages.length}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={index === pages.length - 1}
            onClick={() => move(1)}
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-bg-primary disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      <AnswerSheetPages
        pages={pages}
        disabled={disabled}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    </div>
  );
}
