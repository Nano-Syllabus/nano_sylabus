import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  readCommunityLearningTopics,
  readCourseLearningTopics,
} from "@/lib/data/community-learning-topics";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";
import type { CommunityDetail } from "@/lib/communities";

// Explicit opt-in: reads real data and the provider catalogue; never refreshes
// the provider graph, assigns challenges, or modifies student progress.
vi.mock("@/lib/api-request-tracking", () => ({
  trackApiRequest: (_service: string, operation: () => Promise<unknown>) => operation(),
}));
const subjectSlug = process.env.COMMUNITY_TOPIC_SMOKE_SUBJECT;

describe.skipIf(!subjectSlug)("live community topic visibility (read-only)", () => {
  it("returns executable topics consistently in Subject Explorer and Challenge Hub", async () => {
    process.loadEnvFile(".env.local");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: subject, error } = await admin
      .from("community_subjects")
      .select("id,name,slug,teacher_id,external_subject_slug,community_id,folder_path")
      .eq("external_subject_slug", subjectSlug!)
      .eq("status", "active")
      .single();
    expect(error).toBeNull();
    expect(subject).not.toBeNull();
    if (!subject) throw new Error("Expected an active linked subject.");
    const { data: community } = await admin
      .from("communities")
      .select("id,study_course_id")
      .eq("id", subject.community_id)
      .eq("status", "active")
      .single();
    const { data: member } = await admin
      .from("community_memberships")
      .select("user_id")
      .eq("community_id", subject.community_id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!community?.study_course_id || !member)
      throw new Error("An active learning community and member are required.");
    const linkedSubject = {
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      teacherId: subject.teacher_id,
      externalSubjectSlug: subject.external_subject_slug,
      folderPath: subject.folder_path,
    };
    const topics = await readCommunityLearningTopics([linkedSubject], admin);
    const catalogue = await readCourseLearningTopics(
      community.study_course_id,
      subject.teacher_id,
      subject.external_subject_slug,
      admin,
    );
    const insights = await getCommunitySubjectExplorerInsights(member.user_id, {
      studyCourseId: community.study_course_id,
      terms: [{ subjects: [linkedSubject] }],
    } as CommunityDetail);
    expect(topics.length).toBeGreaterThan(0);
    expect(catalogue?.map((topic) => topic.topic_key)).toEqual(
      topics.map((topic) => topic.topic_key),
    );
    expect(insights[subject.id].topicCount).toBe(topics.length);
    expect(insights[subject.id].topics.map((topic) => topic.key)).toEqual(
      topics.map((topic) => topic.topic_key),
    );
    console.info(
      "Live topic visibility verified:",
      topics.length,
      "topics; student progress unchanged.",
    );
  }, 120_000);
});
