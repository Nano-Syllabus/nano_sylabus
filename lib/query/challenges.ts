"use client";

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, queryFetcher } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/client";
import type { StudentChallengeDetail } from "@/lib/data/student-challenges";

export type ChallengeContentPayload = { challenge?: StudentChallengeDetail; status?: string };

export function challengeContentQuery(id: string) {
  return queryOptions({
    queryKey: keys.challenges.content(id),
    queryFn: queryFetcher<ChallengeContentPayload>(`/api/student/challenges/${encodeURIComponent(id)}/content`),
    staleTime: STALE.SHORT,
    // Exams include expiring papers; restore them from the server each session.
    meta: { persist: false },
  });
}

export function useStartChallenge() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["student", "challenges", "start"],
    mutationFn: (id: string) => apiFetch<{ challenge: StudentChallengeDetail }>(
      `/api/student/challenges/${encodeURIComponent(id)}/start`, { method: "POST" },
    ),
    onSuccess: (payload) => {
      client.setQueryData(keys.challenges.content(payload.challenge.id), payload);
    },
  });
}


export function useChallengeProgress(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["student", "challenges", "progress", id],
    mutationFn: (step: "lesson" | "examples" | "learn") => apiFetch<{ challenge: StudentChallengeDetail }>(
      `/api/student/challenges/${encodeURIComponent(id)}/progress`, { method: "POST", body: { step } },
    ),
    onSuccess: (payload) => { client.setQueryData(keys.challenges.content(id), payload); },
  });
}
