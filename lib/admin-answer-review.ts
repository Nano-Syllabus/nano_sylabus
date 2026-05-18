import type { AdminAnswerState, MessageFeedback } from "@/lib/types";

export function buildAnswerPreview(content: string, maxLength = 160) {
  const clean = content.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function deriveAdminAnswerState(
  feedback: MessageFeedback | null,
  reviewedAt: string | null,
): AdminAnswerState {
  if (reviewedAt) return "reviewed";
  if (feedback === "down") return "flagged";
  if (feedback === "up") return "liked";
  return "neutral";
}
