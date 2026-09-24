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
export type NanoAiTopic = { subjectName: string; topicTitle: string };

const EVENT = "nanoai:topic";
let current: NanoAiTopic | null = null;

export function publishNanoAiTopic(topic: NanoAiTopic | null) {
  if (current?.subjectName === topic?.subjectName && current?.topicTitle === topic?.topicTitle) return;
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

/** Starters for a topic: each a whole question, sent as it is. */
export function topicStarters(topic: NanoAiTopic) {
  const name = topic.topicTitle;
  return [
    `Explain ${name} simply, with one example`,
    `Quiz me on ${name} with 3 MCQs`,
    `What mistakes do students make in ${name}?`,
    `Summarise ${name} in 5 points for exam revision`,
  ];
}
