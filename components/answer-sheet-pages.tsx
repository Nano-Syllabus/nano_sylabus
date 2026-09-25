"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs; next/image would proxy and cache them */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FileText, GripVertical, Smartphone, X } from "lucide-react";
import type { AnswerSheetPage } from "@/lib/data/challenge-answer-sheet";
import { cn } from "@/lib/utils";

function moved(order: string[], id: string, to: number) {
  const next = order.filter((item) => item !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
}

/**
 * The pages of an answer sheet, in order — draggable into sequence, each
 * removable. The sheet is graded in this order.
 *
 * Pointer events rather than HTML drag-and-drop, which iOS Safari does not do:
 * one code path for mouse, touch and pen. A mouse drags the page itself; a
 * finger drags the grip, so a finger elsewhere on the grid still scrolls the
 * page. Pages swap live under the pointer. From the keyboard, the grip moves
 * its page with the arrow keys.
 */
export function AnswerSheetPages({
  pages,
  disabled,
  onRemove,
  onReorder,
}: {
  pages: AnswerSheetPage[];
  disabled?: boolean;
  onRemove: (pageId: string) => void;
  onReorder?: (order: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState("");
  const tiles = useRef(new Map<string, HTMLLIElement>());
  const byId = new Map(pages.map((page) => [page.id, page]));
  // While dragging, the draft order; a page that vanished mid-drag is dropped.
  const order = (draft ?? pages.map((page) => page.id)).filter((id) => byId.has(id));
  const sortable = Boolean(onReorder) && !disabled && pages.length > 1;

  if (!pages.length) return null;

  const begin = (event: PointerEvent<HTMLElement>, id: string) => {
    if (!sortable || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragId(id);
    setDraft(pages.map((page) => page.id));
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    if (!dragId || !draft) return;
    // The tile under the pointer, or failing that the nearest one: a pointer in
    // the gap between two tiles should still mean one of them.
    let target = -1;
    let nearest = Number.POSITIVE_INFINITY;
    order.forEach((id, index) => {
      const rect = tiles.current.get(id)?.getBoundingClientRect();
      if (!rect) return;
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) {
        nearest = distance;
        target = index;
      }
    });
    if (target < 0 || order[target] === dragId) return;
    setDraft(moved(order, dragId, target));
  };

  const end = () => {
    if (!dragId) return;
    const before = pages.map((page) => page.id).join();
    const after = order.join();
    setDragId("");
    setDraft(null);
    if (after !== before) onReorder?.(order);
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step || !sortable) return;
    event.preventDefault();
    const ids = pages.map((page) => page.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    onReorder?.(moved(ids, id, to));
    // Keep focus on the grip as its page moves.
    requestAnimationFrame(() => tiles.current.get(id)?.querySelector<HTMLButtonElement>("[data-grip]")?.focus());
  };

  return (
    <div>
      <ol className="grid select-none grid-cols-3 gap-2 sm:grid-cols-4">
        {order.map((id, index) => {
          const page = byId.get(id)!;
          const isPdf = page.mimeType === "application/pdf";
          const dragging = dragId === id;
          return (
            <li
              key={id}
              ref={(node) => {
                if (node) tiles.current.set(id, node);
                else tiles.current.delete(id);
              }}
              onPointerDown={(event) => {
                // A mouse drags the whole page; touch uses the grip (below).
                if (event.pointerType === "mouse" && !(event.target as HTMLElement).closest("button")) {
                  begin(event, id);
                }
              }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={cn(
                "relative overflow-hidden rounded-lg border border-border bg-bg-primary transition-[transform,box-shadow,opacity] duration-150",
                sortable && "cursor-grab",
                dragging && "z-10 scale-[1.04] cursor-grabbing opacity-90 shadow-xl ring-2 ring-blue-500",
                dragId && !dragging && "opacity-80",
              )}
            >
              {page.previewUrl ? (
                <img
                  src={page.previewUrl}
                  alt={`Page ${index + 1}`}
                  draggable={false}
                  className="pointer-events-none aspect-[3/4] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 p-2 text-center">
                  <FileText className="size-7 text-text-muted" aria-hidden="true" />
                  <span className="line-clamp-2 break-all text-xs text-text-secondary">{page.name || "PDF"}</span>
                </div>
              )}
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {isPdf ? "PDF" : index + 1}
                {page.source === "phone" ? <Smartphone className="size-3" aria-label="from phone" /> : null}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(id)}
                aria-label={`Remove ${isPdf ? "the PDF" : `page ${index + 1}`}`}
                className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              {sortable ? (
                <button
                  type="button"
                  data-grip
                  aria-label={`Move page ${index + 1}. Drag, or use the arrow keys.`}
                  onPointerDown={(event) => begin(event, id)}
                  onKeyDown={(event) => nudge(event, id)}
                  className="absolute bottom-1 left-1/2 inline-flex h-9 w-12 -translate-x-1/2 touch-none cursor-grab items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:cursor-grabbing"
                >
                  <GripVertical className="size-4 rotate-90" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {sortable ? (
        <p className="mt-2 text-center text-xs text-text-muted">Drag pages to put them in order.</p>
      ) : null}
    </div>
  );
}
