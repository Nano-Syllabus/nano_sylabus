"use client";

import { useEffect, useState } from "react";
import { emptyStudyWork, readStudyWork, type StudyWork } from "@/lib/concept-study";

/** Hydration-safe drafts. Nothing is sent to an AI model or written to the lesson. */
export function useConceptStudy(key?: string) {
  const [session, setSession] = useState<{ key?: string; work: StudyWork; loaded: boolean }>(
    () => ({ key, work: emptyStudyWork(), loaded: false }),
  );
  useEffect(() => {
    let restored = emptyStudyWork();
    try {
      if (key) restored = readStudyWork(localStorage.getItem(key));
    } catch {
      /* Storage is optional. */
    }
    setSession({ key, work: restored, loaded: true });
  }, [key]);
  useEffect(() => {
    if (!session.loaded || session.key !== key || !key) return;
    try {
      localStorage.setItem(key, JSON.stringify(session.work));
    } catch {
      /* Keep the in-memory draft. */
    }
  }, [session, key]);
  return [
    session.key === key ? session.work : emptyStudyWork(),
    (patch: Partial<StudyWork>) =>
      setSession((current) => ({
        key,
        loaded: true,
        work: { ...(current.key === key ? current.work : emptyStudyWork()), ...patch },
      })),
  ] as const;
}
