import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityDetail, CommunityTerm } from "@/lib/communities";
import { selectStudentCommunity } from "@/lib/communities";
import { CommunityError, getCommunity, listJoinedCommunities } from "@/lib/data/communities";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";
import { readCommunityLearningTopics } from "@/lib/data/community-learning-topics";
import { ensureCommunityLearningSpace, markCommunityLearningError } from "@/lib/community-learning";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CommunityHubSubject = {
  id: string;
  slug: string;
  name: string;
  code: string;
  termId: string;
  termLabel: string;
  topicCount: number | null;
  materialCount: number | null;
  progress: number | null;
};

export type CommunityHubMember = {
  id: string;
  name: string;
  initials: string;
  role: "creator" | "member";
  joinedAt: string;
  xp: number;
  rank: number;
  completedChallenges: number;
  todayAttempts: number;
  streak: number;
  isViewer: boolean;
};

export type CommunityHubPost = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  authorName: string;
  authorInitials: string;
  title: string;
  body: string;
  postType: "resource" | "discussion";
  shelf: "Syllabus" | "Notes" | "Question Bank";
  status: "pending" | "merge_pending" | "merged" | "merge_error";
  attachmentName: string | null;
  voteCount: number;
  viewerVoted: boolean;
  createdAt: string;
};

export type CommunityAnnouncement = {
  id: string;
  authorName: string;
  title: string;
  body: string;
  publishedAt: string;
};

export type CommunityHubActivity = {
  id: string;
  kind: "announcement" | "post" | "challenge";
  title: string;
  detail: string;
  value: string;
  occurredAt: string;
};

export type CommunityHubData = {
  community: CommunityDetail;
  currentTerm: CommunityTerm;
  currentTermId: string;
  canManage: boolean;
  memberCount: number;
  activeToday: number;
  materialCount: number;
  topicCount: number;
  contentReadiness: number | null;
  subjects: CommunityHubSubject[];
  members: CommunityHubMember[];
  posts: CommunityHubPost[];
  announcements: CommunityAnnouncement[];
  activity: CommunityHubActivity[];
  viewer: {
    rank: number | null;
    xp: number;
    weeklyXp: number;
    completedThisWeek: number;
    streak: number;
    bestScore: number | null;
  };
};

type MembershipRow = {
  user_id: string;
  role: string;
  joined_at: string;
  current_term_id: string | null;
};

type ChallengeRow = {
  id: string;
  user_id: string;
  status: string;
  topic_title: string;
  completed_at: string | null;
  last_score: number | null;
  last_total_marks: number | null;
};

type DailyActivityRow = {
  user_id: string;
  activity_date: string;
  attempt_count: number;
  completed_count: number;
};

type CommunityPracticeAttemptRow = {
  user_id: string;
  created_at: string;
  passed: boolean | null;
};

type XpRow = {
  user_id: string;
  event_key: string;
  points: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const kathmanduDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function communityDateKey(value: Date | string) {
  const parts = kathmanduDate.formatToParts(typeof value === "string" ? new Date(value) : value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function calculateActivityStreak(
  rows: Array<{ activity_date: string; completed_count: number }>,
  now = new Date(),
) {
  const completedDates = new Set(
    rows.filter((row) => Number(row.completed_count) > 0).map((row) => row.activity_date),
  );
  const cursor = new Date(now);
  const today = communityDateKey(cursor);
  if (!completedDates.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!completedDates.has(communityDateKey(cursor))) return 0;
  }
  let streak = 0;
  while (completedDates.has(communityDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function aggregateCommunityDailyActivity(
  rows: CommunityPracticeAttemptRow[],
): DailyActivityRow[] {
  const activity = new Map<string, DailyActivityRow>();
  for (const row of rows) {
    const activityDate = communityDateKey(row.created_at);
    const key = `${row.user_id}:${activityDate}`;
    const current = activity.get(key) ?? {
      user_id: row.user_id,
      activity_date: activityDate,
      attempt_count: 0,
      completed_count: 0,
    };
    current.attempt_count += 1;
    if (row.passed === true) current.completed_count += 1;
    activity.set(key, current);
  }
  return [...activity.values()];
}

function initials(name: string) {
  const value = name.trim();
  if (!value) return "?";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function normalizedPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function documentBelongsToSubject(
  document: { teacher_id: string; collection_path: string | null },
  subject: { teacherId: string | null; folderPath: string; name: string },
) {
  if (subject.teacherId && document.teacher_id !== subject.teacherId) return false;
  const path = normalizedPath(document.collection_path || "");
  const folder = normalizedPath(subject.folderPath || subject.name);
  return path === folder || path.startsWith(`${folder}/`);
}

function documentShelf(pathValue: string | null) {
  const segments = normalizedPath(pathValue || "").split("/");
  if (segments.includes("syllabus")) return "syllabus";
  if (segments.includes("question bank")) return "question-bank";
  if (segments.includes("notes")) return "notes";
  return "other";
}

/** Builds one honest, community-scoped snapshot for the student hub. */
export async function getCommunityHubForUser(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
  preferredCommunitySlug?: string | null,
): Promise<CommunityHubData | null> {
  const joined = selectStudentCommunity(
    await listJoinedCommunities(userId, admin),
    preferredCommunitySlug,
  );
  if (!joined) return null;
  const community = await getCommunity(joined.slug, userId, admin);
  if (!community || community.membership?.status !== "active" || !community.terms.length)
    return null;

  const membershipResult = await admin
    .from("community_memberships")
    .select("user_id,role,joined_at,current_term_id")
    .eq("community_id", community.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (membershipResult.error) throw membershipResult.error;
  const membershipRows = (membershipResult.data || []) as MembershipRow[];
  const memberIds = membershipRows.map((row) => String(row.user_id));
  const subjectRows = community.terms.flatMap((term) => term.subjects);
  const teacherIds = [
    ...new Set(
      subjectRows.map((subject) => subject.teacherId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const viewerMembership = membershipRows.find((row) => row.user_id === userId);
  const currentTerm =
    community.terms.find((term) => term.id === viewerMembership?.current_term_id) ||
    [...community.terms].sort((left, right) => left.position - right.position)[0];
  const today = communityDateKey(new Date());
  const thirtyDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    profilesResult,
    topicsResult,
    documentsResult,
    challengesResult,
    practiceResult,
    xpResult,
    postsResult,
    votesResult,
    announcementsResult,
    insights,
  ] = await Promise.all([
    memberIds.length
      ? admin.from("student_profiles").select("user_id,full_name").in("user_id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    readCommunityLearningTopics(
      community.terms.flatMap((term) => term.subjects),
      admin,
    ).then((data) => ({ data, error: null })),
    teacherIds.length
      ? admin
          .from("teacher_document_files")
          .select("teacher_id,collection_path")
          .in("teacher_id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    community.studyCourseId && memberIds.length
      ? admin
          .from("student_challenges")
          .select("id,user_id,status,topic_title,completed_at,last_score,last_total_marks")
          .eq("course_id", community.studyCourseId)
          .in("user_id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    community.studyCourseId && memberIds.length
      ? admin
          .from("student_practice_attempts")
          .select("user_id,created_at,passed")
          .in("user_id", memberIds)
          .eq("course_id", community.studyCourseId)
          .eq("source", "challenge")
          .gte("created_at", `${thirtyDaysAgo}T00:00:00.000Z`)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? admin
          .from("student_xp_ledger")
          .select("user_id,event_key,points,metadata,created_at")
          .in("user_id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("community_posts")
      .select(
        "id,subject_id,author_id,title,body,post_type,shelf,attachment_name,status,vote_count,created_at",
      )
      .eq("community_id", community.id)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("community_post_votes").select("post_id").eq("user_id", userId),
    admin
      .from("community_announcements")
      .select("id,author_id,title,body,published_at")
      .eq("community_id", community.id)
      .is("archived_at", null)
      .order("published_at", { ascending: false })
      .limit(20),
    getCommunitySubjectExplorerInsights(userId, community),
  ]);

  for (const result of [
    profilesResult,
    topicsResult,
    documentsResult,
    challengesResult,
    practiceResult,
    xpResult,
    postsResult,
    votesResult,
    announcementsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const profiles = new Map(
    (profilesResult.data || []).map((row) => [
      String(row.user_id),
      String(row.full_name || "").trim(),
    ]),
  );
  const topics = (topicsResult.data || []) as Array<{
    community_subject_id: string;
    topic_key: string;
  }>;
  const documents = (documentsResult.data || []) as Array<{
    teacher_id: string;
    collection_path: string | null;
  }>;
  const challengeRows = (challengesResult.data || []) as ChallengeRow[];
  const challengeIds = new Set(challengeRows.map((row) => String(row.id)));
  const dailyRows = aggregateCommunityDailyActivity(
    (practiceResult.data || []) as CommunityPracticeAttemptRow[],
  );
  const scopedXpRows = ((xpResult.data || []) as XpRow[]).filter((row) => {
    const metadata = row.metadata || {};
    return (
      String(metadata.community_id || "") === community.id ||
      challengeIds.has(String(metadata.challenge_id || "")) ||
      (row.event_key.startsWith("challenge:") && challengeIds.has(row.event_key.slice(10)))
    );
  });
  const postRows = postsResult.data || [];
  const voted = new Set((votesResult.data || []).map((row) => String(row.post_id)));
  const subjectById = new Map(subjectRows.map((subject) => [subject.id, subject]));

  const subjects = subjectRows.map((subject) => {
    const term = community.terms.find((item) => item.id === subject.termId)!;
    const insight = insights[subject.id];
    return {
      id: subject.id,
      slug: subject.slug,
      name: subject.name,
      code: subject.code,
      termId: subject.termId,
      termLabel: `Year ${term.yearNumber} · Semester ${term.semesterNumber}`,
      topicCount: insight?.topicCount ?? null,
      materialCount: insight?.materialCount ?? null,
      progress: insight?.readiness ?? null,
    } satisfies CommunityHubSubject;
  });

  const contentReadySubjects = subjectRows.filter((subject) => {
    const subjectDocuments = documents.filter((document) =>
      documentBelongsToSubject(document, subject),
    );
    const shelves = new Set(
      subjectDocuments.map((document) => documentShelf(document.collection_path)),
    );
    return shelves.has("syllabus") && shelves.has("question-bank");
  }).length;

  const members = membershipRows
    .map((membership) => {
      const id = String(membership.user_id);
      const name = profiles.get(id) || "Unnamed member";
      const memberChallenges = challengeRows.filter(
        (row) => row.user_id === id && row.status === "completed",
      );
      const memberDailyRows = dailyRows.filter((row) => row.user_id === id);
      return {
        id,
        name,
        initials: initials(name),
        role: membership.role === "creator" ? "creator" : "member",
        joinedAt: String(membership.joined_at),
        xp: scopedXpRows
          .filter((row) => row.user_id === id)
          .reduce((sum, row) => sum + Number(row.points || 0), 0),
        rank: 0,
        completedChallenges: memberChallenges.length,
        todayAttempts: memberDailyRows
          .filter((row) => row.activity_date === today)
          .reduce((sum, row) => sum + Number(row.attempt_count || 0), 0),
        streak: calculateActivityStreak(memberDailyRows),
        isViewer: id === userId,
      } satisfies CommunityHubMember;
    })
    .sort(
      (left, right) =>
        right.xp - left.xp ||
        right.completedChallenges - left.completedChallenges ||
        left.joinedAt.localeCompare(right.joinedAt),
    )
    .map((member, index) => ({ ...member, rank: index + 1 }));

  const posts: CommunityHubPost[] = postRows.flatMap((row) => {
    const subject = subjectById.get(String(row.subject_id));
    if (!subject) return [];
    const authorName = profiles.get(String(row.author_id)) || "Unnamed member";
    return [
      {
        id: String(row.id),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectSlug: subject.slug,
        authorName,
        authorInitials: initials(authorName),
        title: String(row.title),
        body: String(row.body || ""),
        postType: row.post_type === "discussion" ? "discussion" : "resource",
        shelf: row.shelf === "Syllabus" || row.shelf === "Notes" ? row.shelf : "Question Bank",
        status:
          row.status === "merge_pending" || row.status === "merged" || row.status === "merge_error"
            ? row.status
            : "pending",
        attachmentName: row.attachment_name ? String(row.attachment_name) : null,
        voteCount: Number(row.vote_count) || 0,
        viewerVoted: voted.has(String(row.id)),
        createdAt: String(row.created_at),
      },
    ];
  });

  const announcements: CommunityAnnouncement[] = (announcementsResult.data || []).map((row) => ({
    id: String(row.id),
    authorName: profiles.get(String(row.author_id)) || "Community creator",
    title: String(row.title),
    body: String(row.body),
    publishedAt: String(row.published_at),
  }));

  const activity: CommunityHubActivity[] = [
    ...announcements.map((item) => ({
      id: `announcement:${item.id}`,
      kind: "announcement" as const,
      title: item.title,
      detail: `${item.authorName} published an announcement.`,
      value: "Announcement",
      occurredAt: item.publishedAt,
    })),
    ...posts.map((post) => ({
      id: `post:${post.id}`,
      kind: "post" as const,
      title: post.title,
      detail: `${post.authorName} shared ${post.postType === "resource" ? `a ${post.shelf.toLowerCase()} resource` : "a discussion"} in ${post.subjectName}.`,
      value: post.postType === "resource" ? `${post.voteCount} votes` : "Discussion",
      occurredAt: post.createdAt,
    })),
    ...challengeRows
      .filter((row) => row.status === "completed" && row.completed_at)
      .map((row) => ({
        id: `challenge:${row.id}`,
        kind: "challenge" as const,
        title: `${profiles.get(row.user_id) || "A community member"} completed a challenge`,
        detail: row.topic_title || "Community topic challenge",
        value:
          Number(row.last_total_marks || 0) > 0
            ? `${Math.round((Number(row.last_score || 0) / Number(row.last_total_marks)) * 100)}%`
            : "Passed",
        occurredAt: String(row.completed_at),
      })),
  ]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 10);

  const viewerMember = members.find((member) => member.isViewer);
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const viewerChallenges = challengeRows.filter((row) => row.user_id === userId);
  const bestScores = viewerChallenges.flatMap((row) => {
    const total = Number(row.last_total_marks || 0);
    return total > 0 ? [Math.round((Number(row.last_score || 0) / total) * 100)] : [];
  });

  return {
    community,
    currentTerm,
    currentTermId: currentTerm.id,
    canManage: community.canManage,
    memberCount: membershipRows.length,
    activeToday: members.filter((member) => member.todayAttempts > 0).length,
    materialCount: subjects.reduce((sum, subject) => sum + Number(subject.materialCount || 0), 0),
    topicCount: topics.length,
    contentReadiness: subjectRows.length
      ? Math.round((contentReadySubjects / subjectRows.length) * 100)
      : null,
    subjects,
    members,
    posts,
    announcements,
    activity,
    viewer: {
      rank: viewerMember?.rank || null,
      xp: viewerMember?.xp || 0,
      weeklyXp: scopedXpRows
        .filter((row) => row.user_id === userId && Date.parse(row.created_at) >= weekStart)
        .reduce((sum, row) => sum + Number(row.points || 0), 0),
      completedThisWeek: viewerChallenges.filter(
        (row) =>
          row.status === "completed" &&
          row.completed_at &&
          Date.parse(row.completed_at) >= weekStart,
      ).length,
      streak: viewerMember?.streak || 0,
      bestScore: bestScores.length ? Math.max(...bestScores) : null,
    },
  };
}

async function requireActiveCommunityMembership(
  admin: SupabaseClient,
  userId: string,
  slug: string,
) {
  const communityResult = await admin
    .from("communities")
    .select("id,slug,name,university,faculty,creator_id,status,study_course_id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data) throw new CommunityError("Community not found.", 404);
  const membershipResult = await admin
    .from("community_memberships")
    .select("role,status")
    .eq("community_id", communityResult.data.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  if (membershipResult.data?.status !== "active") {
    throw new CommunityError("Join the community first.", 403);
  }
  return { community: communityResult.data, membership: membershipResult.data };
}

export async function createCommunityAnnouncement(
  userId: string,
  slug: string,
  input: { title: string; body: string },
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const { community } = await requireActiveCommunityMembership(admin, userId, slug);
  if (String(community.creator_id) !== userId) {
    throw new CommunityError("Only the community creator can publish announcements.", 403);
  }
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 140) {
    throw new CommunityError("Announcement title must be between 3 and 140 characters.", 400);
  }
  if (body.length < 3 || body.length > 2000) {
    throw new CommunityError("Announcement must be between 3 and 2,000 characters.", 400);
  }
  const result = await admin
    .from("community_announcements")
    .insert({ community_id: community.id, author_id: userId, title, body })
    .select("id,title,body,published_at")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function archiveCommunityAnnouncement(
  userId: string,
  slug: string,
  announcementId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const { community } = await requireActiveCommunityMembership(admin, userId, slug);
  if (String(community.creator_id) !== userId) {
    throw new CommunityError("Only the community creator can archive announcements.", 403);
  }
  const result = await admin
    .from("community_announcements")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", announcementId)
    .eq("community_id", community.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new CommunityError("Announcement not found.", 404);
  return { archived: true };
}

export async function createCommunityInvite(
  userId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const { community } = await requireActiveCommunityMembership(admin, userId, slug);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await admin
    .from("community_invites")
    .insert({
      community_id: community.id,
      created_by: userId,
      expires_at: expiresAt,
      max_uses: 25,
    })
    .select("token,expires_at,max_uses,use_count")
    .single();
  if (result.error) throw result.error;
  return {
    token: String(result.data.token),
    expiresAt: String(result.data.expires_at),
    maxUses: Number(result.data.max_uses),
    useCount: Number(result.data.use_count),
  };
}

export async function getCommunityInvite(
  token: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const result = await admin
    .from("community_invites")
    .select(
      "id,token,expires_at,max_uses,use_count,revoked_at,communities(id,slug,name,university,faculty,status)",
    )
    .eq("token", token)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const community = Array.isArray(result.data.communities)
    ? result.data.communities[0]
    : result.data.communities;
  if (!community) return null;
  const available =
    community.status === "active" &&
    !result.data.revoked_at &&
    (!result.data.expires_at || Date.parse(result.data.expires_at) > Date.now()) &&
    (!result.data.max_uses || Number(result.data.use_count) < Number(result.data.max_uses));
  return {
    token: String(result.data.token),
    expiresAt: result.data.expires_at ? String(result.data.expires_at) : null,
    available,
    community: {
      slug: String(community.slug),
      name: String(community.name),
      university: String(community.university),
      faculty: String(community.faculty),
    },
  };
}

export async function redeemCommunityInvite(
  userId: string,
  token: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const result = await admin.rpc("redeem_community_invite", {
    target_user_id: userId,
    target_token: token,
  });
  if (result.error) {
    if (result.error.code === "P0002") throw new CommunityError("Invite not found.", 404);
    if (result.error.code === "42501")
      throw new CommunityError("This invite is no longer active.", 410);
    if (result.error.code === "P0001" || result.error.code === "23505") {
      throw new CommunityError("Leave your current community before joining another one.", 409);
    }
    throw result.error;
  }
  const slug = String(result.data || "");
  const community = await getCommunity(slug, userId, admin);
  if (!community) throw new CommunityError("Community not found.", 404);
  try {
    const learning = await ensureCommunityLearningSpace(admin, community.id);
    const enrollment = await admin
      .from("teacher_course_enrollments")
      .upsert(
        { course_id: learning.courseId, student_id: userId, status: "active" },
        { onConflict: "course_id,student_id" },
      );
    if (enrollment.error) throw enrollment.error;
  } catch (error) {
    await markCommunityLearningError(admin, community.id, error);
  }
  return community;
}

export async function setCommunityCurrentTerm(
  userId: string,
  slug: string,
  termId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const { community } = await requireActiveCommunityMembership(admin, userId, slug);
  const result = await admin.rpc("set_community_current_term", {
    target_user_id: userId,
    target_community_id: community.id,
    target_term_id: termId,
  });
  if (result.error) {
    if (result.error.code === "22023")
      throw new CommunityError("Choose a semester from this community.", 400);
    if (result.error.code === "42501") throw new CommunityError("Join the community first.", 403);
    throw result.error;
  }
  return { currentTermId: termId };
}

export async function leaveCommunityMembership(
  userId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const { community, membership } = await requireActiveCommunityMembership(admin, userId, slug);
  if (membership.role === "creator" || String(community.creator_id) === userId) {
    throw new CommunityError("Community creators cannot leave their own community.", 403);
  }
  const result = await admin.rpc("leave_community", {
    target_user_id: userId,
    target_community_id: community.id,
  });
  if (result.error) throw result.error;
  return { left: true };
}
