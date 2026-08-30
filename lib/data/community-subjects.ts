import type { SupabaseClient } from "@supabase/supabase-js";
import { CommunityError } from "@/lib/data/communities";
import { ensureDailyChallenges } from "@/lib/data/student-challenges";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherPracticeTopics, type ApiRecord } from "@/lib/teacher-app/client";
import { ingestTeacherDocument } from "@/lib/teacher-document-ingest";
import { randomUUID } from "node:crypto";

export type CommunityTopic = {
  id: string;
  topicKey: string;
  title: string;
  blurb: string;
  unitNumber: string | null;
  position: number;
  masteryStatus: "not_attempted" | "weak" | "developing" | "strong";
  percentage: number;
};

export type CommunityPost = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  postType: "resource" | "discussion";
  shelf: "Syllabus" | "Notes" | "Question Bank";
  attachmentName: string | null;
  status: "pending" | "merge_pending" | "merged" | "merge_error" | "hidden";
  voteCount: number;
  viewerVoted: boolean;
  createdAt: string;
};

export type CommunitySubjectWorkspace = {
  subjectId: string;
  communityId: string;
  courseId: string | null;
  canManage: boolean;
  folderPath: string;
  externalSubjectSlug: string | null;
  topicSyncStatus: "pending" | "ready" | "empty" | "error";
  topicSyncError: string | null;
  contributionThreshold: number;
  topics: CommunityTopic[];
  posts: CommunityPost[];
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractedTopics(payload: ApiRecord) {
  const items = Array.isArray(payload.topics) ? payload.topics : [];
  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as ApiRecord;
    const title = stringValue(row.title || row.name);
    const topicKey = stringValue(row.topic_key || row.topic_id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    if (!title || !topicKey) return [];
    return [{
      topic_key: topicKey,
      title,
      blurb: stringValue(row.blurb),
      unit_number: stringValue(row.unit_number) || null,
      position: Math.max(0, numberValue(row.order_index ?? index)),
      source: stringValue(payload.topic_source) || "indexed_material",
    }];
  });
}

export async function getCommunitySubjectWorkspace(
  userId: string,
  communitySlug: string,
  subjectSlug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<CommunitySubjectWorkspace | null> {
  const communityResult = await admin
    .from("communities")
    .select("id,creator_id,study_course_id,contribution_threshold")
    .eq("slug", communitySlug)
    .eq("status", "active")
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) return null;
  const communityId = String(communityResult.data.id);
  const membershipResult = await admin
    .from("community_memberships")
    .select("status")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  if (membershipResult.data?.status !== "active") return null;

  const subjectResult = await admin
    .from("community_subjects")
    .select("id,folder_path,external_subject_slug,topic_sync_status,topic_sync_error")
    .eq("community_id", communityId)
    .eq("slug", subjectSlug)
    .eq("status", "active")
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data) return null;
  const subjectId = String(subjectResult.data.id);
  const courseId = communityResult.data.study_course_id
    ? String(communityResult.data.study_course_id)
    : null;

  const [topicsResult, masteryResult, postsResult, votesResult] = await Promise.all([
    admin
      .from("community_subject_topics")
      .select("id,topic_key,title,blurb,unit_number,position")
      .eq("community_subject_id", subjectId)
      .order("position", { ascending: true }),
    courseId
      ? admin
          .from("student_topic_mastery")
          .select("topic_key,status,percentage")
          .eq("user_id", userId)
          .eq("course_id", courseId)
          .eq("subject_slug", String(subjectResult.data.external_subject_slug || ""))
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("community_posts")
      .select("id,author_id,title,body,post_type,shelf,attachment_name,status,vote_count,created_at")
      .eq("subject_id", subjectId)
      .neq("status", "hidden")
      .order("created_at", { ascending: false }),
    admin.from("community_post_votes").select("post_id").eq("user_id", userId),
  ]);
  for (const result of [topicsResult, masteryResult, postsResult, votesResult]) {
    if (result.error) throw result.error;
  }
  const mastery = new Map(
    (masteryResult.data || []).map((row) => [String(row.topic_key), row]),
  );
  const voted = new Set((votesResult.data || []).map((row) => String(row.post_id)));
  return {
    subjectId,
    communityId,
    courseId,
    canManage: String(communityResult.data.creator_id) === userId,
    folderPath: String(subjectResult.data.folder_path || ""),
    externalSubjectSlug: subjectResult.data.external_subject_slug
      ? String(subjectResult.data.external_subject_slug)
      : null,
    topicSyncStatus:
      subjectResult.data.topic_sync_status === "ready" ||
      subjectResult.data.topic_sync_status === "empty" ||
      subjectResult.data.topic_sync_status === "error"
        ? subjectResult.data.topic_sync_status
        : "pending",
    topicSyncError: subjectResult.data.topic_sync_error
      ? String(subjectResult.data.topic_sync_error)
      : null,
    contributionThreshold: Number(communityResult.data.contribution_threshold) || 10,
    topics: (topicsResult.data || []).map((row) => {
      const progress = mastery.get(String(row.topic_key));
      const status = stringValue(progress?.status);
      return {
        id: String(row.id),
        topicKey: String(row.topic_key),
        title: String(row.title),
        blurb: String(row.blurb || ""),
        unitNumber: row.unit_number ? String(row.unit_number) : null,
        position: Number(row.position) || 0,
        masteryStatus:
          status === "weak" || status === "developing" || status === "strong"
            ? status
            : "not_attempted",
        percentage: numberValue(progress?.percentage),
      };
    }),
    posts: (postsResult.data || []).map((row) => ({
      id: String(row.id),
      authorId: String(row.author_id),
      title: String(row.title),
      body: String(row.body || ""),
      postType: row.post_type === "discussion" ? "discussion" : "resource",
      shelf:
        row.shelf === "Syllabus" || row.shelf === "Notes" ? row.shelf : "Question Bank",
      attachmentName: row.attachment_name ? String(row.attachment_name) : null,
      status:
        row.status === "merge_pending" || row.status === "merged" || row.status === "merge_error"
          ? row.status
          : "pending",
      voteCount: Number(row.vote_count) || 0,
      viewerVoted: voted.has(String(row.id)),
      createdAt: String(row.created_at),
    })),
  };
}

export async function syncCommunitySubjectTopics(
  userId: string,
  communitySlug: string,
  subjectId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const subjectResult = await admin
    .from("community_subjects")
    .select("id,community_id,name,external_subject_slug,teacher_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data) throw new CommunityError("Subject not found.", 404);
  const communityResult = await admin
    .from("communities")
    .select("id,slug,creator_id,study_course_id")
    .eq("id", subjectResult.data.community_id)
    .eq("slug", communitySlug)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) throw new CommunityError("Community not found.", 404);
  if (String(communityResult.data.creator_id) !== userId) {
    throw new CommunityError("Only the community creator can refresh extracted topics.", 403);
  }
  const teacherResult = await admin
    .from("teachers")
    .select("collection_sk,handle")
    .eq("id", subjectResult.data.teacher_id)
    .maybeSingle();
  if (teacherResult.error) throw teacherResult.error;
  if (!teacherResult.data?.collection_sk) throw new Error("Subject learning space is not ready.");

  try {
    const payload = await getTeacherPracticeTopics(
      String(teacherResult.data.collection_sk),
      String(subjectResult.data.name),
      { refresh: true },
    );
    const topics = extractedTopics(payload);
    if (topics.length) {
      const upsert = await admin.from("community_subject_topics").upsert(
        topics.map((topic) => ({ community_subject_id: subjectId, ...topic, updated_at: new Date().toISOString() })),
        { onConflict: "community_subject_id,topic_key" },
      );
      if (upsert.error) throw upsert.error;
      const keys = new Set(topics.map((topic) => topic.topic_key));
      const existing = await admin
        .from("community_subject_topics")
        .select("id,topic_key")
        .eq("community_subject_id", subjectId)
      if (existing.error) throw existing.error;
      const staleIds = (existing.data || [])
        .filter((row) => !keys.has(String(row.topic_key)))
        .map((row) => String(row.id));
      if (staleIds.length) {
        const stale = await admin.from("community_subject_topics").delete().in("id", staleIds);
        if (stale.error) throw stale.error;
      }
    } else {
      const cleared = await admin.from("community_subject_topics").delete().eq("community_subject_id", subjectId);
      if (cleared.error) throw cleared.error;
    }
    const syncedAt = new Date().toISOString();
    const update = await admin
      .from("community_subjects")
      .update({
        topic_sync_status: topics.length ? "ready" : "empty",
        topic_synced_at: syncedAt,
        topic_sync_error: null,
      })
      .eq("id", subjectId);
    if (update.error) throw update.error;

    if (topics.length && communityResult.data.study_course_id) {
      const studyCourseId = String(communityResult.data.study_course_id);
      const externalSubjectSlug = String(subjectResult.data.external_subject_slug || "");
      const subjectName = String(subjectResult.data.name);
      const namespace = String(teacherResult.data.handle || communitySlug);
      const memberships = await admin
        .from("community_memberships")
        .select("user_id")
        .eq("community_id", communityResult.data.id)
        .eq("status", "active");
      if (memberships.error) throw memberships.error;
      const recommendations = topics.map((topic) => ({
        courseId: studyCourseId,
        subjectSlug: externalSubjectSlug,
        subjectName,
        namespace,
        topicKey: topic.topic_key,
        topicTitle: topic.title,
        topicBlurb: topic.blurb,
        reason: "Newly extracted from this community's indexed learning material.",
      }));
      await Promise.all(
        (memberships.data || []).map((membership) =>
          ensureDailyChallenges(String(membership.user_id), recommendations),
        ),
      );
    }
    return { topics, topicSyncStatus: topics.length ? "ready" : "empty", syncedAt };
  } catch (error) {
    await admin
      .from("community_subjects")
      .update({
        topic_sync_status: "error",
        topic_sync_error: (error instanceof Error ? error.message : "Topic extraction failed.").slice(0, 1000),
      })
      .eq("id", subjectId);
    throw error;
  }
}

const CONTRIBUTION_MAX_BYTES = 20 * 1024 * 1024;
const contributionMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function createCommunityPost(input: {
  userId: string;
  communitySlug: string;
  subjectId: string;
  title: string;
  body: string;
  postType: "resource" | "discussion";
  shelf: "Syllabus" | "Notes" | "Question Bank";
  file?: File | null;
  admin?: SupabaseClient;
}) {
  const admin = input.admin || createSupabaseAdminClient();
  const subjectResult = await admin
    .from("community_subjects")
    .select("id,community_id")
    .eq("id", input.subjectId)
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data) throw new CommunityError("Subject not found.", 404);
  const communityResult = await admin
    .from("communities")
    .select("id,slug")
    .eq("id", subjectResult.data.community_id)
    .eq("slug", input.communitySlug)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) throw new CommunityError("Community not found.", 404);
  const membership = await admin
    .from("community_memberships")
    .select("status")
    .eq("community_id", communityResult.data.id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (membership.data?.status !== "active") {
    throw new CommunityError("Join the community before posting.", 403);
  }
  const recent = await admin
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", input.userId)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent.error) throw recent.error;
  if ((recent.count || 0) >= 10) {
    throw new CommunityError("You have reached the hourly posting limit. Try again later.", 429);
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 160) {
    throw new CommunityError("Post title must be between 3 and 160 characters.", 400);
  }
  const file = input.file;
  if (input.postType === "resource" && (!file || file.size === 0)) {
    throw new CommunityError("Attach the resource you want the community to review.", 400);
  }
  if (file && file.size > CONTRIBUTION_MAX_BYTES) {
    throw new CommunityError("Upload a contribution up to 20 MB.", 413);
  }
  if (file && !contributionMimeTypes.has(file.type)) {
    throw new CommunityError("Use a PDF, image, DOCX, or plain-text contribution.", 400);
  }

  let attachmentPath: string | null = null;
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "resource";
    attachmentPath = `${communityResult.data.id}/${input.subjectId}/${input.userId}/${randomUUID()}-${safeName}`;
    const upload = await admin.storage
      .from("community-contributions")
      .upload(attachmentPath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upload.error) throw upload.error;
  }
  const insert = await admin
    .from("community_posts")
    .insert({
      community_id: communityResult.data.id,
      subject_id: input.subjectId,
      author_id: input.userId,
      post_type: input.postType,
      title,
      body,
      shelf: input.shelf,
      attachment_bucket: attachmentPath ? "community-contributions" : null,
      attachment_path: attachmentPath,
      attachment_name: file?.name || null,
      attachment_mime_type: file?.type || null,
      attachment_size_bytes: file?.size || null,
    })
    .select("id")
    .single();
  if (insert.error) {
    if (attachmentPath) await admin.storage.from("community-contributions").remove([attachmentPath]);
    throw insert.error;
  }
  return { id: String(insert.data.id) };
}

export async function getCommunityPostAttachment(
  userId: string,
  postId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const postResult = await admin
    .from("community_posts")
    .select(
      "id,community_id,status,attachment_bucket,attachment_path,attachment_name,attachment_mime_type",
    )
    .eq("id", postId)
    .maybeSingle();
  if (postResult.error) throw postResult.error;
  const post = postResult.data;
  if (!post || post.status === "hidden" || !post.attachment_path) {
    throw new CommunityError("Attachment not found.", 404);
  }

  const membershipResult = await admin
    .from("community_memberships")
    .select("status")
    .eq("community_id", post.community_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  if (membershipResult.data?.status !== "active") {
    throw new CommunityError("Join the community to open this attachment.", 403);
  }

  return {
    bucket: String(post.attachment_bucket || "community-contributions"),
    path: String(post.attachment_path),
    name: String(post.attachment_name || "community-resource"),
    mimeType: String(post.attachment_mime_type || "application/octet-stream"),
  };
}

async function mergeCommunityPost(admin: SupabaseClient, postId: string, actorId: string) {
  const postResult = await admin
    .from("community_posts")
    .select("id,community_id,subject_id,shelf,attachment_bucket,attachment_path,attachment_name,attachment_mime_type,status")
    .eq("id", postId)
    .maybeSingle();
  if (postResult.error) throw postResult.error;
  const post = postResult.data;
  if (!post || post.status !== "merge_pending" || !post.attachment_path) return { merged: false };
  const subjectResult = await admin
    .from("community_subjects")
    .select("teacher_id,folder_path")
    .eq("id", post.subject_id)
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  const teacherResult = await admin
    .from("teachers")
    .select("collection_sk")
    .eq("id", subjectResult.data?.teacher_id)
    .maybeSingle();
  if (teacherResult.error) throw teacherResult.error;
  if (!subjectResult.data?.folder_path || !teacherResult.data?.collection_sk) {
    throw new Error("The subject repository is not ready for contributions.");
  }
  await admin.from("community_merge_events").insert({
    community_id: post.community_id,
    subject_id: post.subject_id,
    post_id: post.id,
    event_type: "merge_started",
    actor_id: actorId,
  });
  try {
    const download = await admin.storage
      .from(String(post.attachment_bucket || "community-contributions"))
      .download(String(post.attachment_path));
    if (download.error || !download.data) throw download.error || new Error("Contribution file is missing.");
    const result = await ingestTeacherDocument({
      collectionKey: String(teacherResult.data.collection_sk),
      fileName: String(post.attachment_name || "community-resource"),
      mimeType: String(post.attachment_mime_type || "application/octet-stream"),
      buffer: Buffer.from(await download.data.arrayBuffer()),
      path: `${subjectResult.data.folder_path}/${post.shelf || "Question Bank"}`,
      metadata: { community_post_id: post.id, community_id: post.community_id, contributed_by: actorId },
    });
    const now = new Date().toISOString();
    const update = await admin
      .from("community_posts")
      .update({ status: "merged", merged_at: now, merge_error: null, updated_at: now })
      .eq("id", postId)
      .eq("status", "merge_pending");
    if (update.error) throw update.error;
    await admin.from("community_merge_events").insert({
      community_id: post.community_id,
      subject_id: post.subject_id,
      post_id: post.id,
      event_type: "merged",
      actor_id: actorId,
      details: { collection_path: result.collectionPath },
    });
    return { merged: true };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Automatic merge failed.").slice(0, 1000);
    await admin
      .from("community_posts")
      .update({ status: "merge_error", merge_error: message, updated_at: new Date().toISOString() })
      .eq("id", postId);
    await admin.from("community_merge_events").insert({
      community_id: post.community_id,
      subject_id: post.subject_id,
      post_id: post.id,
      event_type: "merge_failed",
      actor_id: actorId,
      details: { error: message },
    });
    throw error;
  }
}

export async function voteCommunityPost(
  userId: string,
  postId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const vote = await admin.rpc("vote_community_post", {
    target_user_id: userId,
    target_post_id: postId,
  });
  if (vote.error) {
    if (vote.error.code === "P0002") throw new CommunityError("Post not found.", 404);
    if (vote.error.code === "42501") throw new CommunityError("Join the community before voting.", 403);
    throw vote.error;
  }
  const row = Array.isArray(vote.data) ? vote.data[0] : vote.data;
  let mergeError: string | null = null;
  let merged = row?.status === "merged";
  if (row?.should_merge) {
    try {
      const result = await mergeCommunityPost(admin, postId, userId);
      merged = result.merged;
    } catch (error) {
      mergeError = error instanceof Error ? error.message : "Automatic merge failed.";
    }
  }
  return {
    postId,
    voteCount: Number(row?.vote_count) || 0,
    threshold: Number(row?.threshold) || 10,
    merged,
    mergeError,
  };
}

export async function reportCommunityPost(
  userId: string,
  postId: string,
  reason: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const postResult = await admin.from("community_posts").select("id,community_id,status").eq("id", postId).maybeSingle();
  if (postResult.error) throw postResult.error;
  if (!postResult.data || postResult.data.status === "hidden") throw new CommunityError("Post not found.", 404);
  const membership = await admin
    .from("community_memberships")
    .select("status")
    .eq("community_id", postResult.data.community_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (membership.data?.status !== "active") throw new CommunityError("Join the community before reporting.", 403);
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new CommunityError("Add a short report reason.", 400);
  const report = await admin.from("community_post_reports").upsert(
    { post_id: postId, reporter_id: userId, reason: cleanReason, updated_at: new Date().toISOString() },
    { onConflict: "post_id,reporter_id" },
  );
  if (report.error) throw report.error;
  return { reported: true };
}

export async function hideCommunityPost(
  userId: string,
  postId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const postResult = await admin
    .from("community_posts")
    .select("id,community_id,subject_id,status")
    .eq("id", postId)
    .maybeSingle();
  if (postResult.error) throw postResult.error;
  if (!postResult.data) throw new CommunityError("Post not found.", 404);
  const community = await admin
    .from("communities")
    .select("creator_id")
    .eq("id", postResult.data.community_id)
    .maybeSingle();
  if (community.error) throw community.error;
  if (String(community.data?.creator_id || "") !== userId) {
    throw new CommunityError("Only the community creator can hide a post.", 403);
  }
  const update = await admin
    .from("community_posts")
    .update({ status: "hidden", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (update.error) throw update.error;
  const event = await admin.from("community_merge_events").insert({
    community_id: postResult.data.community_id,
    subject_id: postResult.data.subject_id,
    post_id: postId,
    event_type: "hidden",
    actor_id: userId,
  });
  if (event.error) throw event.error;
  return { hidden: true };
}
