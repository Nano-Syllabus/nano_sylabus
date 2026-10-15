import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { challengeUpstreamScope } from "@/lib/data/student-challenges";
import { requestTeacherExplainerAnimation } from "@/lib/teacher-app/client";
import { explainerNotes } from "@/lib/concept-explainer-notes";

export { explainerNotes };

/**
 * A topic's animated explainer: the Concepts chapter as a ~90 second video.
 *
 * The renderer (video-gen-check) plans it with Claude and animates it with
 * manim. Requests are content-addressed by the backend — the same topic, notes
 * and length name the same video — so a topic is rendered once and every
 * student after the first watches the cached file.
 */

export const EXPLAINER_SECONDS = 90;

export type ConceptExplainer = {
  hash: string;
  status: string;
  /** `/api/media/<hash>/animation.mp4`, through this app's media proxy. */
  video: string | null;
  poster: string | null;
  error: string;
};

function toExplainer(reply: {
  spec_hash: string;
  status: string;
  derivatives: Partial<Record<"poster" | "gif" | "mp4", string>>;
  error: string;
}): ConceptExplainer {
  const hash = reply.spec_hash;
  return {
    hash,
    status: reply.status,
    video: reply.derivatives?.mp4 ? `/api/media/${hash}/animation.mp4` : null,
    poster: reply.derivatives?.poster ? `/api/media/${hash}/poster.png` : null,
    error: reply.error || "",
  };
}

export async function requestConceptExplainer(
  userId: string,
  challengeId: string,
  priority: "urgent" | "background" = "urgent",
): Promise<ConceptExplainer | null> {
  const scope = await challengeUpstreamScope(userId, challengeId);
  if (!scope) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from("student_challenges")
    .select("reading:content->lesson->content")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const reading = Array.isArray((data as { reading?: unknown } | null)?.reading)
    ? ((data as { reading: unknown[] }).reading.map(String) as string[])
    : [];
  if (!reading.length) throw new RangeError("The concepts reading isn't ready yet.");
  const reply = await requestTeacherExplainerAnimation(scope.collectionKey, {
    concept: (scope.topicTitle || "This topic").slice(0, 200),
    subject: scope.subject.slice(0, 120),
    notes: explainerNotes(reading),
    seconds: EXPLAINER_SECONDS,
    // Board: one diagram built up across the video. Measured on the same brief,
    // card style gave 55s of isolated single objects; board gave 83s of one
    // figure growing into the worked example.
    style: "board",
    priority,
  });
  return toExplainer(reply);
}
