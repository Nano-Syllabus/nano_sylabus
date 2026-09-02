import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectionKeyFromOperatorPayload,
  createTeacherFromOperator,
} from "@/lib/teacher-app/operator";
import { teacherCourseSlug } from "@/lib/teacher-courses";

export type CommunityTeacher = {
  id: string;
  userId: string;
  handle: string;
  collectionKey: string;
};

export type CommunityLearningSpace = {
  courseId: string;
  teacher: CommunityTeacher;
};

function safeHandlePart(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase() || "creator";
}

async function existingTeacher(admin: SupabaseClient, userId: string) {
  const result = await admin
    .from("teachers")
    .select("id,user_id,handle,collection_sk")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return {
    id: String(result.data.id),
    userId: String(result.data.user_id),
    handle: String(result.data.handle),
    collectionKey: String(result.data.collection_sk),
  } satisfies CommunityTeacher;
}

/** Any community creator gets the same collection identity teachers already use. */
export async function ensureCommunityTeacher(admin: SupabaseClient, userId: string) {
  const existing = await existingTeacher(admin, userId);
  if (existing) return existing;

  const authResult = await admin.auth.admin.getUserById(userId);
  if (authResult.error || !authResult.data.user) {
    throw authResult.error || new Error("The community creator account could not be loaded.");
  }
  const user = authResult.data.user;
  const email = user.email?.trim() || `${userId}@community.nanosyllabus.local`;
  const displayName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    email.split("@")[0] ||
    "Community creator";
  const handle = `${safeHandlePart(email.split("@")[0])}_${userId.replace(/-/g, "").slice(0, 8)}`;
  const operator = await createTeacherFromOperator({ handle, name: displayName, email });
  const collectionKey = collectionKeyFromOperatorPayload(operator);
  if (!collectionKey) throw new Error("The learning service did not return a collection key.");

  const insert = await admin
    .from("teachers")
    .insert({ user_id: userId, handle, collection_sk: collectionKey })
    .select("id,user_id,handle,collection_sk")
    .single();
  if (insert.error) {
    // A concurrent request may have completed the same provisioning work.
    const concurrent = await existingTeacher(admin, userId);
    if (concurrent) return concurrent;
    throw insert.error;
  }
  return {
    id: String(insert.data.id),
    userId: String(insert.data.user_id),
    handle: String(insert.data.handle),
    collectionKey: String(insert.data.collection_sk),
  } satisfies CommunityTeacher;
}

async function availableCourseSlug(admin: SupabaseClient, communitySlug: string) {
  const base = teacherCourseSlug(`community-${communitySlug}`);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const result = await admin.from("teacher_courses").select("id").eq("slug", candidate).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return candidate;
  }
  throw new Error("Could not create a unique community learning-space URL.");
}

/** Creates the hidden compatibility course used by chat/practice/challenges/mastery. */
export async function ensureCommunityLearningSpace(
  admin: SupabaseClient,
  communityId: string,
): Promise<CommunityLearningSpace> {
  const communityResult = await admin
    .from("communities")
    .select("id,creator_id,slug,name,university,faculty,total_semesters,study_course_id")
    .eq("id", communityId)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) throw new Error("Community not found.");
  const community = communityResult.data;
  const teacher = await ensureCommunityTeacher(admin, String(community.creator_id));

  let courseId = String(community.study_course_id || "");
  if (!courseId) {
    const slug = await availableCourseSlug(admin, String(community.slug));
    const courseResult = await admin
      .from("teacher_courses")
      .insert({
        teacher_id: teacher.id,
        slug,
        name: String(community.name),
        short_name: String(community.name).slice(0, 60),
        category: "Bachelor",
        authority: String(community.university),
        tagline: `${community.faculty} community learning space`,
        description: `Community learning space for ${community.name} at ${community.university}.`,
        duration_weeks: Math.min(104, Math.max(1, Number(community.total_semesters) * 16)),
        level: "Intermediate",
        language_modes: ["English", "Nepali"],
        access_model: "free",
        price_paisa: 0,
        visibility: "unlisted",
        status: "published",
        diagnostic_question_count: 10,
        daily_minutes: 20,
        pass_percentage: 40,
        negative_marking: 0,
        outcomes: ["Complete the community syllabus", "Practice exam-style answers"],
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (courseResult.error) throw courseResult.error;
    courseId = String(courseResult.data.id);
    const update = await admin
      .from("communities")
      .update({
        study_course_id: courseId,
        learning_status: "ready",
        learning_error: null,
        learning_ready_at: new Date().toISOString(),
      })
      .eq("id", communityId)
      .is("study_course_id", null);
    if (update.error) throw update.error;
  }

  const enrollment = await admin.from("teacher_course_enrollments").upsert(
    { course_id: courseId, student_id: String(community.creator_id), status: "active" },
    { onConflict: "course_id,student_id" },
  );
  if (enrollment.error) throw enrollment.error;
  return { courseId, teacher };
}

export async function markCommunityLearningError(
  admin: SupabaseClient,
  communityId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "Learning-space setup failed.";
  await admin
    .from("communities")
    .update({ learning_status: "error", learning_error: message.slice(0, 1000) })
    .eq("id", communityId);
}
