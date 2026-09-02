import type { SupabaseClient } from "@supabase/supabase-js";
import {
  communitySlug,
  mapCommunitySummary,
  type CommunityDetail,
  type CommunityInput,
  type CommunitySubject,
  type CommunitySubjectInput,
  type CommunitySummary,
  type CommunityTerm,
  type CreatorSubjectOption,
} from "@/lib/communities";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureCommunityLearningSpace, markCommunityLearningError } from "@/lib/community-learning";

const communityColumns =
  "id,creator_id,slug,name,university,faculty,description,total_years,total_semesters,visibility,status,contribution_threshold,study_course_id,learning_status,learning_error,learning_ready_at,created_at,updated_at";

export class CommunityError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CommunityError";
    this.status = status;
  }
}

type CommunityStorageErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function normalizeCommunityStorageError(error: unknown) {
  if (error instanceof Error) return error;
  const source = (error || {}) as CommunityStorageErrorLike;
  const normalized = new Error(source.message || "The community service could not be reached.");
  normalized.name = "CommunityStorageError";
  normalized.cause = error;
  return normalized;
}

function isTransientCommunityReadError(error: unknown) {
  if (error instanceof CommunityError) return false;
  const source = (error || {}) as CommunityStorageErrorLike;
  const code = String(source.code || "").toUpperCase();
  const message = [source.message, source.details, source.hint].filter(Boolean).join(" ");

  return (
    [
      "PGRST000",
      "PGRST001",
      "PGRST002",
      "08000",
      "08001",
      "08003",
      "08004",
      "08006",
      "53300",
      "57P01",
    ].includes(code) || /fetch failed|network|timeout|timed out|connection|gateway/i.test(message)
  );
}

async function withCommunityReadRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientCommunityReadError(error)) throw normalizeCommunityStorageError(error);
  }

  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    return await operation();
  } catch (error) {
    throw normalizeCommunityStorageError(error);
  }
}

function groupedCounts(rows: Record<string, unknown>[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const communityId = String(row.community_id || "");
    if (communityId) counts.set(communityId, (counts.get(communityId) || 0) + 1);
  }
  return counts;
}

function membershipsByCommunity(rows: Record<string, unknown>[]) {
  return new Map(rows.map((row) => [String(row.community_id || ""), row]));
}

async function hydrateCommunitySummaries(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
  viewerId?: string | null,
): Promise<CommunitySummary[]> {
  const ids = rows.map((row) => String(row.id || "")).filter(Boolean);
  if (!ids.length) return [];

  const [membersResult, subjectsResult, viewerMembershipResult] = await Promise.all([
    admin
      .from("community_memberships")
      .select("community_id")
      .in("community_id", ids)
      .eq("status", "active"),
    admin
      .from("community_subjects")
      .select("community_id")
      .in("community_id", ids)
      .eq("status", "active"),
    viewerId
      ? admin
          .from("community_memberships")
          .select("community_id,role,status,joined_at")
          .in("community_id", ids)
          .eq("user_id", viewerId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (viewerMembershipResult.error) throw viewerMembershipResult.error;

  const memberCounts = groupedCounts((membersResult.data || []) as Record<string, unknown>[]);
  const subjectCounts = groupedCounts((subjectsResult.data || []) as Record<string, unknown>[]);
  const viewerMemberships = membershipsByCommunity(
    (viewerMembershipResult.data || []) as Record<string, unknown>[],
  );

  return rows.map((row) => {
    const id = String(row.id || "");
    return mapCommunitySummary(
      row,
      memberCounts.get(id) || 0,
      subjectCounts.get(id) || 0,
      viewerMemberships.get(id) || null,
    );
  });
}

export async function listPublicCommunities(
  viewerId?: string | null,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const result = await admin
    .from("communities")
    .select(communityColumns)
    .eq("status", "active")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return hydrateCommunitySummaries(
    admin,
    (result.data || []) as Record<string, unknown>[],
    viewerId,
  );
}

async function listJoinedCommunitiesOnce(userId: string, admin: SupabaseClient) {
  const membershipResult = await admin
    .from("community_memberships")
    .select("community_id,role,status,joined_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  if (membershipResult.error) throw membershipResult.error;

  const memberships = (membershipResult.data || []) as Record<string, unknown>[];
  const communityIds = memberships.map((row) => String(row.community_id || "")).filter(Boolean);
  if (!communityIds.length) return [];

  const communityResult = await admin
    .from("communities")
    .select(communityColumns)
    .in("id", communityIds)
    .eq("status", "active");
  if (communityResult.error) throw communityResult.error;

  const order = new Map(communityIds.map((id, index) => [id, index]));
  const summaries = await hydrateCommunitySummaries(
    admin,
    (communityResult.data || []) as Record<string, unknown>[],
    userId,
  );
  return summaries.sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0));
}

export async function listJoinedCommunities(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  return withCommunityReadRetry(() => listJoinedCommunitiesOnce(userId, admin));
}

async function getCommunityOnce(
  slug: string,
  viewerId: string | null | undefined,
  admin: SupabaseClient,
): Promise<CommunityDetail | null> {
  const communityResult = await admin
    .from("communities")
    .select(communityColumns)
    .eq("slug", slug)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) return null;

  const row = communityResult.data as Record<string, unknown>;
  const communityId = String(row.id || "");
  const [summary] = await hydrateCommunitySummaries(admin, [row], viewerId);
  const canManage = Boolean(viewerId && viewerId === String(row.creator_id || ""));
  const canView =
    row.status === "active" &&
    (row.visibility === "public" || canManage || summary.membership?.status === "active");
  if (!canView) return null;

  const [termsResult, subjectsResult] = await Promise.all([
    admin
      .from("community_terms")
      .select("id,year_number,semester_number,semester_in_year,position")
      .eq("community_id", communityId)
      .order("position", { ascending: true }),
    admin
      .from("community_subjects")
      .select(
        "id,term_id,slug,name,code,description,position,teacher_id,external_subject_slug,folder_path,topic_sync_status,topic_synced_at",
      )
      .eq("community_id", communityId)
      .eq("status", "active")
      .order("position", { ascending: true }),
  ]);
  if (termsResult.error) throw termsResult.error;
  if (subjectsResult.error) throw subjectsResult.error;

  const subjectsByTerm = new Map<string, CommunitySubject[]>();
  for (const item of (subjectsResult.data || []) as Record<string, unknown>[]) {
    const termId = String(item.term_id || "");
    const subject: CommunitySubject = {
      id: String(item.id || ""),
      termId,
      slug: String(item.slug || ""),
      name: String(item.name || ""),
      code: String(item.code || ""),
      description: String(item.description || ""),
      position: Number(item.position) || 0,
      teacherId: item.teacher_id ? String(item.teacher_id) : null,
      externalSubjectSlug: item.external_subject_slug ? String(item.external_subject_slug) : null,
      folderPath: String(item.folder_path || ""),
      topicSyncStatus:
        item.topic_sync_status === "ready" ||
        item.topic_sync_status === "empty" ||
        item.topic_sync_status === "error"
          ? item.topic_sync_status
          : "pending",
      topicSyncedAt: item.topic_synced_at ? String(item.topic_synced_at) : null,
    };
    const bucket = subjectsByTerm.get(termId);
    if (bucket) bucket.push(subject);
    else subjectsByTerm.set(termId, [subject]);
  }

  const terms: CommunityTerm[] = ((termsResult.data || []) as Record<string, unknown>[]).map(
    (item) => {
      const id = String(item.id || "");
      return {
        id,
        yearNumber: Number(item.year_number) || 1,
        semesterNumber: Number(item.semester_number) || 1,
        semesterInYear: Number(item.semester_in_year) || 1,
        position: Number(item.position) || 0,
        subjects: subjectsByTerm.get(id) || [],
      };
    },
  );

  return { ...summary, terms, canManage };
}

export async function getCommunity(
  slug: string,
  viewerId?: string | null,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  return withCommunityReadRetry(() => getCommunityOnce(slug, viewerId, admin));
}

async function availableCommunitySlug(admin: SupabaseClient, name: string) {
  const base = communitySlug(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const result = await admin.from("communities").select("id").eq("slug", candidate).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return candidate;
  }
  throw new CommunityError("Could not create a unique community URL.", 409);
}

export async function createCommunity(
  creatorId: string,
  input: CommunityInput,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const slug = await availableCommunitySlug(admin, input.name);
  const result = await admin.rpc("create_community_with_terms", {
    target_creator_id: creatorId,
    target_slug: slug,
    target_name: input.name,
    target_university: input.university,
    target_faculty: input.faculty,
    target_description: input.description,
    target_total_years: input.totalYears,
    target_total_semesters: input.totalSemesters,
    target_visibility: input.visibility,
  });
  if (result.error) {
    if (result.error.code === "23505") {
      throw new CommunityError(
        "A community with this name already exists. Try a clearer name.",
        409,
      );
    }
    throw result.error;
  }
  const createdId = String(result.data || "");
  if (createdId) {
    try {
      await ensureCommunityLearningSpace(admin, createdId);
    } catch (error) {
      await markCommunityLearningError(admin, createdId, error);
    }
  }
  const community = await getCommunity(slug, creatorId, admin);
  if (!community) throw new Error("Community was created but could not be loaded.");
  return community;
}

export async function joinCommunity(
  userId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const targetResult = await admin
    .from("communities")
    .select("id,creator_id,status,visibility")
    .eq("slug", slug)
    .maybeSingle();
  if (targetResult.error) throw targetResult.error;
  if (!targetResult.data) throw new CommunityError("Community not found.", 404);

  const targetCommunityId = String(targetResult.data.id);
  const isCreator = String(targetResult.data.creator_id) === userId;
  if (!isCreator) {
    const activeMembershipResult = await admin
      .from("community_memberships")
      .select("community_id")
      .eq("user_id", userId)
      .eq("role", "member")
      .eq("status", "active")
      .neq("community_id", targetCommunityId)
      .limit(1);
    if (activeMembershipResult.error) throw activeMembershipResult.error;
    if (activeMembershipResult.data?.length) {
      throw new CommunityError(
        "You already joined another community. Students can join one community at a time.",
        409,
      );
    }
  }

  const result = await admin.rpc("join_community", {
    target_user_id: userId,
    target_community_slug: slug,
  });
  if (result.error) {
    if (result.error.code === "P0002") throw new CommunityError("Community not found.", 404);
    if (result.error.code === "42501") {
      throw new CommunityError("This community is not open to new members.", 403);
    }
    if (result.error.code === "P0001" || result.error.code === "23505") {
      throw new CommunityError(
        "You already joined another community. Students can join one community at a time.",
        409,
      );
    }
    throw result.error;
  }
  const joinedCommunityId = String(result.data || "");
  if (joinedCommunityId) {
    try {
      const learning = await ensureCommunityLearningSpace(admin, joinedCommunityId);
      const enrollment = await admin
        .from("teacher_course_enrollments")
        .upsert(
          { course_id: learning.courseId, student_id: userId, status: "active" },
          { onConflict: "course_id,student_id" },
        );
      if (enrollment.error) throw enrollment.error;
    } catch (error) {
      await markCommunityLearningError(admin, joinedCommunityId, error);
    }
  }
  const community = await getCommunity(slug, userId, admin);
  if (!community) throw new CommunityError("Community not found.", 404);
  return community;
}

export async function listCommunityCreatorSubjects(
  creatorId: string,
  communitySlugValue: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<CreatorSubjectOption[]> {
  const communityResult = await admin
    .from("communities")
    .select("id,creator_id,status")
    .eq("slug", communitySlugValue)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data || communityResult.data.status !== "active") {
    throw new CommunityError("Community not found.", 404);
  }
  if (String(communityResult.data.creator_id) !== creatorId) {
    throw new CommunityError("Only the community creator can manage semester subjects.", 403);
  }

  const teacherResult = await admin
    .from("teachers")
    .select("id")
    .eq("user_id", creatorId)
    .maybeSingle();
  if (teacherResult.error) throw teacherResult.error;
  if (!teacherResult.data) return [];

  const teacherId = String(teacherResult.data.id);
  const [profilesResult, attachedResult] = await Promise.all([
    admin
      .from("teacher_subject_profiles")
      .select("subject_slug,subject_name,folder_path,subject_code,university,programme,updated_at")
      .eq("teacher_id", teacherId)
      .order("updated_at", { ascending: false }),
    admin
      .from("community_subjects")
      .select("external_subject_slug,term_id")
      .eq("community_id", communityResult.data.id)
      .eq("teacher_id", teacherId)
      .eq("status", "active"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (attachedResult.error) throw attachedResult.error;

  const attachedTerms = new Map(
    (attachedResult.data || []).map((row) => [
      String(row.external_subject_slug || ""),
      String(row.term_id || ""),
    ]),
  );
  return (profilesResult.data || []).flatMap((row) => {
    const slug = String(row.subject_slug || "").trim();
    const name = String(row.subject_name || "").trim();
    if (!slug || !name) return [];
    return [
      {
        slug,
        name,
        folderPath: String(row.folder_path || name),
        code: String(row.subject_code || ""),
        university: String(row.university || ""),
        programme: String(row.programme || ""),
        attachedTermId: attachedTerms.get(slug) || null,
      } satisfies CreatorSubjectOption,
    ];
  });
}

export async function attachCommunitySubject(
  creatorId: string,
  communitySlugValue: string,
  input: CommunitySubjectInput,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const communityResult = await admin
    .from("communities")
    .select("id,creator_id,status")
    .eq("slug", communitySlugValue)
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data || communityResult.data.status !== "active") {
    throw new CommunityError("Community not found.", 404);
  }
  if (communityResult.data.creator_id !== creatorId) {
    throw new CommunityError("Only the community creator can add subjects right now.", 403);
  }

  const termResult = await admin
    .from("community_terms")
    .select("id")
    .eq("id", input.termId)
    .eq("community_id", communityResult.data.id)
    .maybeSingle();
  if (termResult.error) throw termResult.error;
  if (!termResult.data) throw new CommunityError("Choose a semester from this community.", 400);

  const learning = await ensureCommunityLearningSpace(admin, String(communityResult.data.id));

  const profileResult = await admin
    .from("teacher_subject_profiles")
    .select("subject_slug,subject_name,folder_path,subject_code")
    .eq("teacher_id", learning.teacher.id)
    .eq("subject_slug", input.subjectSlug)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) {
    throw new CommunityError("Choose a subject from your Creator Workspace.", 404);
  }

  const alreadyAttached = await admin
    .from("community_subjects")
    .select("id,term_id")
    .eq("community_id", communityResult.data.id)
    .eq("teacher_id", learning.teacher.id)
    .eq("external_subject_slug", input.subjectSlug)
    .eq("status", "active")
    .maybeSingle();
  if (alreadyAttached.error) throw alreadyAttached.error;
  if (alreadyAttached.data) {
    throw new CommunityError(
      "This Creator Workspace subject is already attached to the community.",
      409,
    );
  }

  const subjectName = String(profileResult.data.subject_name || "").trim();
  const folderPath = String(profileResult.data.folder_path || subjectName).trim();
  const slug = communitySlug(subjectName);
  const countResult = await admin
    .from("community_subjects")
    .select("id", { count: "exact", head: true })
    .eq("term_id", input.termId)
    .eq("status", "active");
  if (countResult.error) throw countResult.error;

  const insertResult = await admin.from("community_subjects").insert({
    community_id: communityResult.data.id,
    term_id: input.termId,
    created_by: creatorId,
    slug,
    name: subjectName,
    code: String(profileResult.data.subject_code || ""),
    description: "",
    position: countResult.count || 0,
    teacher_id: learning.teacher.id,
    external_subject_slug: input.subjectSlug,
    folder_path: folderPath,
  });
  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      throw new CommunityError(
        "This subject is already attached to the selected semester or community.",
        409,
      );
    }
    throw insertResult.error;
  }

  const community = await getCommunity(communitySlugValue, creatorId, admin);
  if (!community) throw new CommunityError("Community not found.", 404);
  return community;
}

export function communityStorageError(error: unknown) {
  if (error instanceof CommunityError) return error;
  return new CommunityError("The community service is temporarily unavailable. Try again.", 502);
}
