"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AppUser, Language } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNanoAiTopic } from "@/lib/nanoai-topic";

/*
 * The NanoAI bubble: the full Library chat (ChatPageClient in its "floating"
 * variant) behind a draggable button in the Revision section (/app/notes).
 *
 *   - The chat's code is only fetched the first time the bubble opens, so pages
 *     that never use it pay for a small "Ask AI" pill and nothing else.
 *   - Once opened it stays mounted, hidden while closed, so a conversation
 *     survives closing the panel and moving between pages (the shell persists).
 *   - The button can be dragged anywhere; on release it snaps to the nearer
 *     side so it never parks over the middle of a page, and the spot is
 *     remembered per browser. The panel can be dragged by its header.
 */

const ChatPageClient = dynamic(
  () => import("@/components/chat-page-client").then((module) => module.ChatPageClient),
  { ssr: false, loading: () => <PanelLoading /> },
);

type Bootstrap = {
  profile: { languagePref: Language; board: string; grade: string; subjects: string[] };
  noteSubjectOptions: {
    courseId: string;
    courseName: string;
    subjectSlug: string;
    subjectName: string;
  }[];
};

type Point = { x: number; y: number };

/** The "Ask AI" pill: logo, label, sparkle. */
const BUTTON_WIDTH = 132;
const BUTTON_HEIGHT = 48;
const EDGE_GAP = 16;
const PANEL_WIDTH = 408;
const PANEL_MAX_HEIGHT = 680;
/** Below this the panel is a full-screen sheet; dragging a sheet makes no sense. */
const SHEET_BREAKPOINT = 640;
const DRAG_THRESHOLD = 5;
const POSITION_KEY = "ns-nanoai-bubble-position";
const EMPTY_LIBRARY_SELECTION = { termId: null, subjectSlug: null, documentId: null };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampButton(point: Point): Point {
  return {
    x: clamp(point.x, EDGE_GAP, window.innerWidth - BUTTON_WIDTH - EDGE_GAP),
    y: clamp(point.y, EDGE_GAP, window.innerHeight - BUTTON_HEIGHT - EDGE_GAP),
  };
}

function snapToSide(point: Point): Point {
  const centre = point.x + BUTTON_WIDTH / 2;
  const x =
    centre < window.innerWidth / 2 ? EDGE_GAP : window.innerWidth - BUTTON_WIDTH - EDGE_GAP;
  return clampButton({ x, y: point.y });
}

function defaultButtonPosition(): Point {
  return clampButton({
    x: window.innerWidth - BUTTON_WIDTH - EDGE_GAP - 8,
    y: window.innerHeight - BUTTON_HEIGHT - EDGE_GAP - 8,
  });
}

/** Stored as the side plus a fraction of the height, so it survives a resize. */
function readStoredPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { side?: string; top?: number };
    if (typeof parsed.top !== "number") return null;
    const y = parsed.top * window.innerHeight;
    const x =
      parsed.side === "left" ? EDGE_GAP : window.innerWidth - BUTTON_WIDTH - EDGE_GAP;
    return clampButton({ x, y });
  } catch {
    return null;
  }
}

function storePosition(point: Point) {
  try {
    const side = point.x + BUTTON_WIDTH / 2 < window.innerWidth / 2 ? "left" : "right";
    window.localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({ side, top: point.y / window.innerHeight }),
    );
  } catch {}
}

function panelSize() {
  return {
    width: Math.min(PANEL_WIDTH, window.innerWidth - EDGE_GAP * 2),
    height: Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_GAP * 2),
  };
}

function clampPanel(point: Point): Point {
  const { width, height } = panelSize();
  return {
    x: clamp(point.x, EDGE_GAP, window.innerWidth - width - EDGE_GAP),
    y: clamp(point.y, EDGE_GAP, window.innerHeight - height - EDGE_GAP),
  };
}

/** Open the panel beside the button: same side, bottom edges lined up. */
function panelFromButton(button: Point): Point {
  const { width, height } = panelSize();
  const onRight = button.x + BUTTON_WIDTH / 2 >= window.innerWidth / 2;
  return clampPanel({
    x: onRight ? button.x + BUTTON_WIDTH - width : button.x,
    y: button.y + BUTTON_HEIGHT - height,
  });
}

function PanelLoading() {
  return (
    <div role="status" aria-label="Loading NanoAI" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <div className="h-3.5 w-20 rounded-full bg-border animate-pulse-soft motion-reduce:animate-none" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 p-3">
        <div className="h-28 rounded-xl bg-border animate-pulse-soft motion-reduce:animate-none" />
        <div className="h-[104px] rounded-[16px] bg-border animate-pulse-soft motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function NanoAiFloatingChat({ user }: { user: AppUser }) {
  const pathname = usePathname();
  // Only in the Revision section (user, 2026-09-24): `/app/notes` and the pages
  // under it. Everywhere else — the chat page included — the bubble steps aside.
  const offRevision = !(pathname === "/app/notes" || pathname?.startsWith("/app/notes/"));

  const [button, setButton] = useState<Point | null>(null);
  const [panel, setPanel] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSheet, setIsSheet] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState("");
  const [draggingButton, setDraggingButton] = useState(false);
  /** "Stuck on …?" beside the pill, for a few seconds when a topic first opens. */
  const topic = useNanoAiTopic();
  const [nudge, setNudge] = useState("");
  const nudgedTopics = useRef(new Set<string>());
  const everOpened = useRef(false);
  useEffect(() => {
    const title = topic?.topicTitle;
    if (!title || open || everOpened.current || nudgedTopics.current.has(title)) return;
    nudgedTopics.current.add(title);
    const show = window.setTimeout(() => setNudge(title), 1200);
    const hide = window.setTimeout(() => setNudge(""), 7200);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [topic?.topicTitle, open]);

  const dragRef = useRef<{
    target: "button" | "panel";
    pointerId: number;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bootstrapRequested = useRef(false);

  // Positions depend on the viewport, so they are only known after mount.
  useEffect(() => {
    setButton(readStoredPosition() ?? defaultButtonPosition());
    setIsSheet(window.innerWidth < SHEET_BREAKPOINT);

    const onResize = () => {
      setIsSheet(window.innerWidth < SHEET_BREAKPOINT);
      setButton((current) => (current ? snapToSide(current) : current));
      setPanel((current) => (current ? clampPanel(current) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadBootstrap = useCallback(async () => {
    if (bootstrapRequested.current) return;
    bootstrapRequested.current = true;
    setBootstrapError("");
    try {
      const response = await fetch("/api/chat/widget");
      if (!response.ok) throw new Error("NanoAI could not start. Please try again.");
      setBootstrap((await response.json()) as Bootstrap);
    } catch (error) {
      bootstrapRequested.current = false;
      setBootstrapError(error instanceof Error ? error.message : "NanoAI could not start.");
    }
  }, []);

  // Warm the chat chunk and its bootstrap on intent, so opening feels instant.
  const prefetch = useCallback(() => {
    void import("@/components/chat-page-client");
    void loadBootstrap();
  }, [loadBootstrap]);

  const openPanel = useCallback(() => {
    if (!button) return;
    setPanel(panelFromButton(button));
    setMounted(true);
    setOpen(true);
    setNudge("");
    everOpened.current = true;
    void loadBootstrap();
  }, [button, loadBootstrap]);

  const closePanel = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Leave Escape to the chat's own dialogs (save note, rename, delete).
      if (panelRef.current?.querySelector(".fixed.inset-0")) return;
      closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  // Outside the Revision section the bubble steps aside.
  useEffect(() => {
    if (offRevision) setOpen(false);
  }, [offRevision]);

  function startDrag(
    target: "button" | "panel",
    event: ReactPointerEvent<HTMLElement>,
    origin: Point,
  ) {
    if (event.button !== 0) return;
    dragRef.current = {
      target,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.target === "button") setDraggingButton(true);
    }
    const next = { x: drag.origin.x + dx, y: drag.origin.y + dy };
    if (drag.target === "button") setButton(clampButton(next));
    else setPanel(clampPanel(next));
  }

  /** Returns whether the pointer actually dragged, so a click can be told apart. */
  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved && drag.target === "button") {
      setDraggingButton(false);
      setButton((current) => {
        if (!current) return current;
        const snapped = snapToSide(current);
        storePosition(snapped);
        return snapped;
      });
    }
    return drag.moved;
  }

  if (!button) return null;

  const panelStyle: CSSProperties | undefined =
    isSheet || !panel
      ? undefined
      : {
          left: panel.x,
          top: panel.y,
          width: panelSize().width,
          height: panelSize().height,
        };

  return (
    <>
      {!open && !offRevision ? (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Ask AI"
          title="Ask NanoAI — drag to move"
          onPointerEnter={prefetch}
          onFocus={prefetch}
          onPointerDown={(event) => startDrag("button", event, button)}
          onPointerMove={moveDrag}
          onPointerUp={(event) => {
            if (!endDrag(event)) openPanel();
          }}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPanel();
            }
          }}
          style={{ left: button.x, top: button.y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }}
          className={cn(
            "fixed z-40 flex touch-none select-none items-center justify-center gap-2 rounded-full border border-border bg-bg-primary pl-1.5 pr-3.5 text-sm font-semibold text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
            !draggingButton && "nanoai-pill",
            draggingButton
              ? "cursor-grabbing scale-105"
              : "cursor-pointer transition-[left,top,transform] duration-200 ease-out hover:scale-105 motion-reduce:transition-none",
          )}
        >
          <span className="nanoai-pill-icon shrink-0 rounded-full">
            <Image
              src="/nanologo.png"
              alt=""
              width={34}
              height={34}
              draggable={false}
              className="size-[34px] rounded-full object-contain"
            />
          </span>
          <span className="nanoai-pill-label whitespace-nowrap">Ask AI</span>
          <Sparkles className="size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </button>
      ) : null}
      {nudge && !open && !offRevision && !draggingButton ? (
        <button
          type="button"
          onClick={openPanel}
          style={
            button.x + BUTTON_WIDTH / 2 >= window.innerWidth / 2
              ? { right: window.innerWidth - button.x + 10, top: button.y + 4 }
              : { left: button.x + BUTTON_WIDTH + 10, top: button.y + 4 }
          }
          className="nanoai-intro fixed z-40 max-w-[240px] truncate rounded-full border border-border bg-bg-primary px-3.5 py-2 text-sm text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:bg-bg-secondary"
        >
          Stuck on <span className="font-semibold">{nudge}</span>?
        </button>
      ) : null}

      {mounted ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="NanoAI chat"
          aria-modal="false"
          aria-hidden={!open || offRevision}
          style={panelStyle}
          onPointerDown={(event) => {
            if (isSheet || !panel) return;
            const target = event.target as HTMLElement;
            if (!target.closest("[data-floating-drag-handle]") || target.closest("[data-no-drag]")) {
              return;
            }
            startDrag("panel", event, panel);
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            // No transform on this box: the chat's own modals and selection
            // popover are `position: fixed` and must stay viewport-relative.
            "fixed z-40 flex flex-col overflow-hidden bg-bg-primary text-text-primary",
            (!open || offRevision) && "hidden",
            isSheet
              ? "inset-0"
              : "rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,0.28)]",
          )}
        >
          {bootstrap ? (
            <ChatPageClient
              variant="floating"
              onRequestClose={closePanel}
              user={user}
              defaultLanguage={bootstrap.profile.languagePref}
              profileBoard={bootstrap.profile.board}
              profileGrade={bootstrap.profile.grade}
              profileSubjects={bootstrap.profile.subjects}
              initialSessions={[]}
              initialHasMore={false}
              initialSession={null}
              initialSubjectContext={null}
              initialPrompt={null}
              initialReferenceNote={null}
              noteSubjectOptions={bootstrap.noteSubjectOptions}
              libraryCommunity={null}
              libraryInsights={{}}
              initialLibrarySelection={EMPTY_LIBRARY_SELECTION}
            />
          ) : bootstrapError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-text-secondary">{bootstrapError}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadBootstrap()}
                  className="rounded-full bg-text-primary px-4 py-2 text-sm font-medium text-bg-primary"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text-primary"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <PanelLoading />
          )}
        </div>
      ) : null}
    </>
  );
}
