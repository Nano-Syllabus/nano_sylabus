"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryFetcher } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import type { RevisionDocTopic, StudentRevisionDocs } from "@/lib/data/student-revision-docs";

/**
 * REVISION, CACHE-FIRST.
 *
 * Everything on the page is material already written and stored — nothing
 * here changes unless the student sits a challenge (which is another screen)
 * or a syllabus is re-indexed. So both queries follow the dashboard's rule:
 * fetched once per page load, painted from the browser cache on the next one,
 * with `QueryBootReconcile` running the single reconcile under the paint.
 *
 * Two queries rather than one: the navigator (`docs`) is small and always
 * needed; a topic's page (`topic`) is big and only one is on screen. Each page
 * read is kept under its own key, so a topic opened once opens from memory
 * after, across reloads, and the index stays small enough to persist.
 */
type DocsPayload = { docs: StudentRevisionDocs };
type TopicPayload = { topic: RevisionDocTopic };

export function revisionDocsQuery(community: string) {
  return {
    queryKey: keys.student.revision.docs(community),
    queryFn: queryFetcher<DocsPayload>("/api/student/revision/docs"),
    staleTime: Infinity,
    refetchOnReconnect: false,
  } as const;
}

export function revisionTopicQuery(challengeId: string) {
  return {
    queryKey: keys.student.revision.topic(challengeId),
    queryFn: queryFetcher<TopicPayload>(
      `/api/student/revision/topic/${encodeURIComponent(challengeId)}`,
    ),
    staleTime: Infinity,
    refetchOnReconnect: false,
  } as const;
}

/** `community` is the saved faculty slug (a cache partition, not a grant). */
export function useRevisionDocs(community: string) {
  return useQuery(revisionDocsQuery(community));
}

export function useRevisionTopic(challengeId: string, enabled: boolean) {
  return useQuery({ ...revisionTopicQuery(challengeId), enabled: enabled && Boolean(challengeId) });
}

/** Warm a page on hover or focus in the navigator, so the click reads memory. */
export function usePrefetchRevisionTopic() {
  const queryClient = useQueryClient();
  return useCallback(
    (challengeId: string) => {
      if (!challengeId) return;
      void queryClient.prefetchQuery(revisionTopicQuery(challengeId));
    },
    [queryClient],
  );
}
