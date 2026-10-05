import { withExamStudyAccess } from "@/lib/exam-study-access";
import { getStudentRevisionTopic } from "@/lib/data/student-revision-docs";
import { errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { withUsageCommunity } from "@/lib/usage-community";

export const dynamic = "force-dynamic";

/**
 * One Revision page: a filed topic's reading, past questions, solved questions
 * and MCQs. Fetched when the topic is opened (or hovered in the navigator) and
 * kept in the browser cache under its own key, so a page read once opens from
 * memory from then on. See `revisionDocsIndex` for why it is not in the index.
 */
async function handleGET(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return errorJson("Unauthorized", 401);

    const { challengeId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return errorJson("Not found", 404);
    const topic = await getStudentRevisionTopic(user.id, challengeId);
    if (!topic) return errorJson("Not found", 404);
    return privateJson({ topic }, { request });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Could not load this page.", 502);
  }
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const GET = withExamStudyAccess(withUsageCommunity(handleGET));
