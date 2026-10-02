"use client";

import { useSyncExternalStore } from "react";

/**
 * THE TOPIC ON SCREEN, FOR THE ASK AI BUBBLE.
 *
 * The bubble lives in the app shell and the Revision page is a route under it,
 * so neither renders the other. The page says what is open; the bubble reads
 * it — to pick the subject for the student and to offer questions about that
 * topic instead of a blank box. A window event, like the chat's own events,
 * because there is nothing to share but this one value.
 */
export type NanoAiTopic = {
  subjectName: string;
  topicTitle: string;
  /** Where it was published. "challenge" also shows the bubble over a
   *  challenge's focus mode, which is not under /app/notes. */
  surface?: "revision" | "challenge";
  /** The page carries its own Ask AI button (a challenge's focus bar), so the
   *  floating pill steps aside and the panel opens from that button. */
  launcher?: "page";
};

const EVENT = "nanoai:topic";
let current: NanoAiTopic | null = null;

export function publishNanoAiTopic(topic: NanoAiTopic | null) {
  if (
    current?.subjectName === topic?.subjectName &&
    current?.topicTitle === topic?.topicTitle &&
    current?.surface === topic?.surface &&
    current?.launcher === topic?.launcher
  )
    return;
  current = topic;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function useNanoAiTopic() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

const OPEN_EVENT = "nanoai:open";

export type NanoAiOpenDetail = { anchor: { left: number; right: number; bottom: number } };

/** Opens the bubble's panel from a page's own Ask AI button, just under it. */
export function openNanoAi(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent<NanoAiOpenDetail>(OPEN_EVENT, {
      detail: { anchor: { left: rect.left, right: rect.right, bottom: rect.bottom } },
    }),
  );
}

export function onNanoAiOpen(handler: (detail: NanoAiOpenDetail) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<NanoAiOpenDetail>).detail);
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
