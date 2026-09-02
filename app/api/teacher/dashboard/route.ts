import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getCommunity } from "@/lib/data/communities";
import { getCommunitySubjectWorkspace } from "@/lib/data/community-subjects";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildTeacherDashboard } from "@/lib/teacher-dashboard";

const classroomColumns =
  "id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice";

async function getCommunityAdminOverview(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  creatorId: string,
  requestedSlug: string,
) {
  const communitiesResult = await admin
    .from("communities")
    .select(
      "id,slug,name,university,faculty,total_years,total_semesters,contribution_threshold,created_at",
    )
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (communitiesResult.error) throw communitiesResult.error;

  const communities = communitiesResult.data || [];
  const communityIds = communities.map((community) => community.id);
  const [allMembersResult, allSubjectsResult] = communityIds.length
    ? await Promise.all([
        admin
          .from("community_memberships")
          .select("community_id")
          .in("community_id", communityIds)
          .eq("status", "active"),
        admin
          .from("community_subjects")
          .select("community_id")
          .in("community_id", communityIds)
          .eq("status", "active"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (allMembersResult.error) throw allMembersResult.error;
  if (allSubjectsResult.error) throw allSubjectsResult.error;
  const countByCommunity = (rows: { community_id: string }[]) => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      counts.set(row.community_id, (counts.get(row.community_id) || 0) + 1);
    });
    return counts;
  };
  const memberCounts = countByCommunity(allMembersResult.data || []);
  const subjectCounts = countByCommunity(allSubjectsResult.data || []);
  const managedCommunities = communities.map((community) => ({
    id: community.id,
    slug: community.slug,
    name: community.name,
    university: community.university,
    faculty: community.faculty,
    totalYears: community.total_years,
    totalSemesters: community.total_semesters,
    memberCount: memberCounts.get(community.id) || 0,
    subjectCount: subjectCounts.get(community.id) || 0,
    createdAt: community.created_at,
  }));
  const community = requestedSlug ? communities.find((item) => item.slug === requestedSlug) : null;
  if (!community) return { managedCommunities, communityAdmin: null };

  const [
    membersResult,
    recentMembershipsResult,
    subjectsResult,
    pendingResourcesResult,
    mergedResourcesResult,
    discussionsResult,
  ] = await Promise.all([
    admin
      .from("community_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("community_id", community.id)
      .eq("status", "active"),
    admin
      .from("community_memberships")
      .select("user_id,role,joined_at")
      .eq("community_id", community.id)
      .eq("status", "active")
      .order("joined_at", { ascending: false })
      .limit(5),
    admin
      .from("community_subjects")
      .select("id,term_id,name")
      .eq("community_id", community.id)
      .eq("status", "active"),
    admin
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id)
      .eq("post_type", "resource")
      .in("status", ["pending", "merge_pending", "merge_error"]),
    admin
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id)
      .eq("post_type", "resource")
      .eq("status", "merged"),
    admin
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id)
      .eq("post_type", "discussion")
      .neq("status", "hidden"),
  ]);

  const queryError = [
    membersResult.error,
    recentMembershipsResult.error,
    subjectsResult.error,
    pendingResourcesResult.error,
    mergedResourcesResult.error,
    discussionsResult.error,
  ].find(Boolean);
  if (queryError) throw queryError;

  const recentMemberships = recentMembershipsResult.data || [];
  const recentUserIds = recentMemberships.map((item) => item.user_id).filter(Boolean);
  const profilesResult = recentUserIds.length
    ? await admin.from("student_profiles").select("user_id,full_name").in("user_id", recentUserIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const names = new Map((profilesResult.data || []).map((item) => [item.user_id, item.full_name]));
  const subjects = subjectsResult.data || [];

  return {
    managedCommunities,
    communityAdmin: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      university: community.university,
      faculty: community.faculty,
      totalYears: community.total_years,
      totalSemesters: community.total_semesters,
      contributionThreshold: community.contribution_threshold,
      memberCount: membersResult.count || 0,
      subjectCount: subjects.length,
      filledSemesterCount: new Set(subjects.map((item) => item.term_id)).size,
      pendingResourceCount: pendingResourcesResult.count || 0,
      mergedResourceCount: mergedResourcesResult.count || 0,
      discussionCount: discussionsResult.count || 0,
      recentMembers: recentMemberships.map((item) => ({
        userId: item.user_id,
        name:
          names.get(item.user_id) ||
          (item.role === "creator" ? "Community creator" : "Community member"),
        role: item.role,
        joinedAt: item.joined_at,
      })),
    },
  };
}

export async function GET(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const searchParams = new URL(request.url).searchParams;
    const requestedCommunitySlug = searchParams.get("community")?.trim() || "";
    const requestedCommunitySubjectSlug = searchParams.get("communitySubject")?.trim() || "";
    const linksResult = await admin
      .from("teacher_classroom_teachers")
      .select("classroom_id")
      .eq("teacher_id", teacher.id);
    if (linksResult.error) throw linksResult.error;
    const linkedIds = (linksResult.data || []).map((item) => item.classroom_id);
    const [ownResult, linkedResult, papersResult] = await Promise.all([
      admin
        .from("teacher_classrooms")
        .select(classroomColumns)
        .eq("teacher_id", teacher.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      linkedIds.length
        ? admin
            .from("teacher_classrooms")
            .select(classroomColumns)
            .in("id", linkedIds)
            .is("archived_at", null)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("teacher_exam_papers")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacher.id)
        .is("archived_at", null),
    ]);
    if (ownResult.error) throw ownResult.error;
    if (linkedResult.error) throw linkedResult.error;
    if (papersResult.error) throw papersResult.error;
    const classrooms = Array.from(
      new Map(
        [...(ownResult.data || []), ...(linkedResult.data || [])].map((item) => [item.id, item]),
      ).values(),
    );
    const classroomIds = classrooms.map((classroom) => classroom.id);
    const [membersResult, assignmentsResult] = await Promise.all([
      classroomIds.length
        ? admin
            .from("teacher_classroom_members")
            .select("classroom_id,student_id")
            .in("classroom_id", classroomIds)
        : Promise.resolve({ data: [], error: null }),
      classroomIds.length
        ? admin
            .from("teacher_exam_assignments")
            .select("id,classroom_id")
            .in("classroom_id", classroomIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    const assignments = assignmentsResult.data || [];
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const submissionsResult = assignmentIds.length
      ? await admin
          .from("teacher_exam_submissions")
          .select("id,assignment_id,student_id,student_name,grade,created_at")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [], error: null };
    if (submissionsResult.error) throw submissionsResult.error;
    const studentIds = Array.from(
      new Set((membersResult.data || []).map((member) => member.student_id)),
    );
    const profilesResult = studentIds.length
      ? await admin.from("student_profiles").select("user_id,full_name").in("user_id", studentIds)
      : { data: [], error: null };
    if (profilesResult.error) throw profilesResult.error;
    const communityData = await getCommunityAdminOverview(
      admin,
      teacher.user_id,
      requestedCommunitySlug,
    );
    const selectedCommunityIsManaged = communityData.managedCommunities.some(
      (community) => community.slug === requestedCommunitySlug,
    );
    const communityWorkspace = selectedCommunityIsManaged
      ? await getCommunity(requestedCommunitySlug, teacher.user_id, admin)
      : null;
    const communitySubjectWorkspace =
      selectedCommunityIsManaged && requestedCommunitySubjectSlug
        ? await getCommunitySubjectWorkspace(
            teacher.user_id,
            requestedCommunitySlug,
            requestedCommunitySubjectSlug,
            admin,
          )
        : null;
    return NextResponse.json({
      ...buildTeacherDashboard({
        classrooms,
        members: membersResult.data || [],
        assignments,
        submissions: submissionsResult.data || [],
        profiles: profilesResult.data || [],
        paperCount: papersResult.count || 0,
      }),
      ...communityData,
      communityWorkspace,
      communitySubjectWorkspace,
    });
  } catch {
    return NextResponse.json({ error: "Could not load the teacher dashboard." }, { status: 502 });
  }
}
