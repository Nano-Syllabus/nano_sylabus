import { NextResponse } from "next/server";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import {
  courseLearningTopicsKey,
  readCourseLearningTopicsBatch,
} from "@/lib/data/community-learning-topics";
import { assignTopicChallenge, unlocksEveryTopic } from "@/lib/data/student-challenges";
import { getStudentCourseSubjectAccessCached } from "@/lib/student-courses";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/**
 * Starts a syllabus topic from Revision that the challenge queue has not reached.
 *
 * Plus and Pro only: on Free a topic opens when the queue, which runs in syllabus
 * order, gets to it. The page only draws the button for those plans, and this
 * checks again, because the button is not the gate.
 *
 * Returns the id of the assigned challenge; the client opens it in the hub.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";
    const subjectSlug = typeof body.subjectSlug === "string" ? body.subjectSlug.trim() : "";
    const topicKey = typeof body.topicKey === "string" ? body.topicKey.trim() : "";
    if (!courseId || !subjectSlug || !topicKey) {
      return NextResponse.json({ error: "Choose a topic to start." }, { status: 400 });
    }

    if (!(await unlocksEveryTopic(user.id))) {
      return NextResponse.json(
        {
          error: "This topic is locked. Finish the challenges before it, or upgrade to Plus or Pro.",
          code: "plan_required",
        },
        { status: 402 },
      );
    }

    const access = await getStudentCourseSubjectAccessCached(user.id, courseId, subjectSlug);
    if (!access) {
      return NextResponse.json({ error: "You do not have access to this subject." }, { status: 403 });
    }

    // The topic must be one the syllabus lists now, read from the same
    // catalogue the Revision outline was drawn from.
    const scope = {
      courseId: access.courseId,
      teacherId: access.teacherId,
      subjectSlug: access.subjectSlug,
    };
    const catalogue =
      (await readCourseLearningTopicsBatch([scope], createSupabaseAdminClient())).get(
        courseLearningTopicsKey(scope),
      ) ?? [];
    const topic = catalogue.find((candidate) => candidate.topic_key === topicKey);
    if (
      !topic ||
      isChallengeSourceDocumentTopic({
        topicKey: topic.topic_key,
        title: topic.title,
        subjectName: access.subjectName,
      })
    ) {
      return NextResponse.json(
        { error: "This topic is no longer in the syllabus. Reload Revision." },
        { status: 404 },
      );
    }

    const challengeId = await assignTopicChallenge(user.id, {
      courseId: access.accessKind === "owner-private" ? null : access.courseId,
      subjectSlug: access.subjectSlug,
      subjectName: access.subjectName,
      namespace: access.folderPath || access.subjectSlug,
      topicKey: topic.topic_key,
      topicTitle: topic.title,
      topicBlurb: topic.blurb?.trim() || "",
      unitNumber: String(topic.unit_number || "").trim(),
      reason: "Started from Revision.",
    });
    return NextResponse.json({ challengeId });
  } catch (error) {
    console.error("[revision] start topic failed", error);
    return NextResponse.json({ error: "Could not start this topic. Try again." }, { status: 500 });
  }
}
