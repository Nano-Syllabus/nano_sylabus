import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearStudentStudyTrails } from "@/lib/data/study-trail-cleanup";
import { mapTeacherCourse, type TeacherCourse } from "@/lib/teacher-courses";
import { profileFromUser, withTeacherAvatar } from "@/lib/teacher-public-profile";

const courseColumns =
  "id,teacher_id,slug,name,short_name,category,authority,tagline,description,duration_weeks,level,language_modes,access_model,price_paisa,visibility,status,diagnostic_question_count,daily_minutes,pass_percentage,negative_marking,exam_date,outcomes,invite_code,invite_created_at,created_at,updated_at,published_at";

export type StudentCourse = TeacherCourse & {
  enrollmentStatus: "active" | "completed";
  enrolledAt: string;
  completedAt: string | null;
};

export class StudentCourseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StudentCourseError";
    this.status = status;
  }
}

export type StudentCommunityLearningScope = {
  communityId: string;
  communitySlug: string;
  communityName: string;
  courseId: string | null;
};

/**
 * Returns the selected learner community. Both creator and regular member
 * rows grant learner access; the unique-index limit still applies only to the
 * single external `member` row.
 */
export async function getStudentCommunityLearningScope(
  studentId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
  preferred?: { communitySlug?: string; courseId?: string },
): Promise<StudentCommunityLearningScope | null> {
  const membershipResult = await admin
    .from("community_memberships")
    .select("community_id,role,joined_at")
    .eq("user_id", studentId)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  if (membershipResult.error) throw membershipResult.error;
  const memberships = membershipResult.data || [];
  const communityIds = memberships
    .map((row) => String(row.community_id || ""))
    .filter(Boolean);
  if (!communityIds.length) return null;

  const communityResult = await admin
    .from("communities")
    .select("id,slug,name,study_course_id")
    .in("id", communityIds)
    .eq("status", "active");
  if (communityResult.error) throw communityResult.error;
  const communities = communityResult.data || [];
  const communityById = new Map(communities.map((row) => [String(row.id), row]));
  const activeMemberships = memberships.filter((row) =>
    communityById.has(String(row.community_id || "")),
  );
  const normalizedSlug = preferred?.communitySlug?.trim().toLowerCase();
  const preferredMembership = activeMemberships.find((membership) => {
    const community = communityById.get(String(membership.community_id));
    return (
      (normalizedSlug && String(community?.slug || "").toLowerCase() === normalizedSlug) ||
      (preferred?.courseId && String(community?.study_course_id || "") === preferred.courseId)
    );
  });
  const membership =
    preferredMembership ||
    activeMemberships.find((row) => row.role === "member") ||
    activeMemberships[0];
  const community = membership
    ? communityById.get(String(membership.community_id || ""))
    : undefined;
  if (!community) return null;

  return {
    communityId: String(community.id),
    communitySlug: String(community.slug || ""),
    communityName: String(community.name || "Community"),
    courseId: community.study_course_id ? String(community.study_course_id) : null,
  };
}

type TeacherDocumentFileRow = {
  teacher_id: string | null;
  collection_path: string | null;
  size_bytes: number | string | null;
};

function normalizeCollectionPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function documentBelongsToSubject(documentPath: string, subjectFolderPath: string) {
  const document = normalizeCollectionPath(documentPath).toLowerCase();
  const subject = normalizeCollectionPath(subjectFolderPath).toLowerCase();
  return Boolean(subject) && (document === subject || document.startsWith(`${subject}/`));
}

function documentShelf(documentPath: string, subjectFolderPath: string) {
  const document = normalizeCollectionPath(documentPath);
  const subject = normalizeCollectionPath(subjectFolderPath);
  if (!subject || !documentBelongsToSubject(document, subject)) return "";
  return document.slice(subject.length).replace(/^\/+/, "").split("/")[0] || "";
}

function courseSourceStats(
  subjects: Record<string, unknown>[],
  documents: TeacherDocumentFileRow[],
): TeacherCourse["sourceStats"] {
  const matchedPaths = new Set<string>();
  let syllabusFileCount = 0;
  let notesFileCount = 0;
  let questionBankFileCount = 0;
  let totalBytes = 0;

  // Normalizing each subject folder once instead of once per document: a
  // teacher with a large library turned this into tens of thousands of
  // throwaway lowercase/replace allocations per page render.
  const subjectPaths = subjects.map((item) => {
    const raw = String(item.folder_path || "");
    return { raw, normalized: normalizeCollectionPath(raw).toLowerCase() };
  });

  for (const document of documents) {
    const path = String(document.collection_path || "");
    if (!path || matchedPaths.has(path)) continue;

    const normalizedPath = normalizeCollectionPath(path).toLowerCase();
    const subject = subjectPaths.find(
      (item) =>
        Boolean(item.normalized) &&
        (normalizedPath === item.normalized || normalizedPath.startsWith(`${item.normalized}/`)),
    );
    if (!subject) continue;

    matchedPaths.add(path);
    totalBytes += Number(document.size_bytes) || 0;

    const shelf = documentShelf(path, subject.raw);
    if (shelf === "Syllabus") syllabusFileCount += 1;
    if (shelf === "Notes") notesFileCount += 1;
    if (shelf === "Question Bank") questionBankFileCount += 1;
  }

  return {
    subjectCount: subjects.length,
    sourceFileCount: matchedPaths.size,
    syllabusFileCount,
    notesFileCount,
    questionBankFileCount,
    totalBytes,
  };
}

/**
 * The author block behind each course card costs two round trips to build — an
 * Auth Admin lookup for the profile metadata and a storage call to sign the
 * avatar. That ran once per teacher on every render of the chat, exams and
 * explore pages, for data that changes when a teacher edits their profile.
 * Caching it briefly takes those calls off the critical path.
 *
 * The signed avatar URL is good for an hour, so a five minute TTL never hands
 * out an expired link.
 */
const COURSE_AUTHOR_TTL_MS = 5 * 60_000;
const courseAuthorCache = new Map<string, { author: TeacherCourse["author"]; expiresAt: number }>();

async function loadCourseAuthor(
  admin: SupabaseClient,
  teacher: { id: string; user_id: string; handle: string },
): Promise<TeacherCourse["author"]> {
  const cached = courseAuthorCache.get(teacher.id);
  if (cached && cached.expiresAt > Date.now()) return cached.author;

  const authResult = await admin.auth.admin.getUserById(teacher.user_id);
  const base = profileFromUser(authResult.data.user, teacher.handle);
  const profile = await withTeacherAvatar(admin, base);
  const author: TeacherCourse["author"] = {
    handle: teacher.handle,
    displayName: profile.displayName,
    headline: profile.headline,
    bio: profile.bio,
    institution: profile.institution,
    location: profile.location,
    expertise: profile.expertise,
    yearsExperience: profile.yearsExperience,
    website: profile.website,
    avatarUrl: profile.avatarUrl,
    complete: profile.complete,
  };

  courseAuthorCache.set(teacher.id, { author, expiresAt: Date.now() + COURSE_AUTHOR_TTL_MS });
  return author;
}

/** Drops a teacher's cached author block after they edit their public profile. */
export function invalidateCourseAuthor(teacherId: string) {
  courseAuthorCache.delete(teacherId);
}

async function mapCourseRows(admin: SupabaseClient, rows: Record<string, unknown>[]) {
  const ids = rows.map((row) => String(row.id || "")).filter(Boolean);
  if (!ids.length) return [];

  const teacherIds = [...new Set(rows.map((row) => String(row.teacher_id || "")).filter(Boolean))];
  const [subjectsResult, enrollmentsResult, teachersResult, documentFilesResult] =
    await Promise.all([
      admin
        .from("teacher_course_subjects")
        .select("course_id,subject_slug,subject_name,folder_path,position")
        .in("course_id", ids),
      admin
        .from("teacher_course_enrollments")
        .select("course_id")
        .in("course_id", ids)
        .eq("status", "active"),
      admin.from("teachers").select("id,user_id,handle").in("id", teacherIds),
      admin
        .from("teacher_document_files")
        .select("teacher_id,collection_path,size_bytes")
        .in("teacher_id", teacherIds),
    ]);
  if (subjectsResult.error) throw subjectsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;
  if (teachersResult.error) throw teachersResult.error;
  if (documentFilesResult.error) throw documentFilesResult.error;

  const authorsByTeacher = new Map<string, TeacherCourse["author"]>();
  await Promise.all(
    ((teachersResult.data || []) as Array<{ id: string; user_id: string; handle: string }>).map(
      async (teacher) => {
        authorsByTeacher.set(teacher.id, await loadCourseAuthor(admin, teacher));
      },
    ),
  );

  const subjectsByCourse = new Map<string, Record<string, unknown>[]>();
  for (const subject of (subjectsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(subject.course_id || "");
    const bucket = subjectsByCourse.get(courseId);
    if (bucket) bucket.push(subject);
    else subjectsByCourse.set(courseId, [subject]);
  }

  const enrollmentCounts = new Map<string, number>();
  for (const enrollment of (enrollmentsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(enrollment.course_id || "");
    enrollmentCounts.set(courseId, (enrollmentCounts.get(courseId) || 0) + 1);
  }

  const documentsByTeacher = new Map<string, TeacherDocumentFileRow[]>();
  for (const document of (documentFilesResult.data || []) as TeacherDocumentFileRow[]) {
    const teacherId = String(document.teacher_id || "");
    const bucket = documentsByTeacher.get(teacherId);
    if (bucket) bucket.push(document);
    else documentsByTeacher.set(teacherId, [document]);
  }

  return rows.map((row) => {
    const courseId = String(row.id || "");
    const teacherId = String(row.teacher_id || "");
    const subjects = subjectsByCourse.get(courseId) || [];
    return mapTeacherCourse(
      row,
      subjects,
      enrollmentCounts.get(courseId) || 0,
      authorsByTeacher.get(teacherId) || {
        handle: "teacher",
        displayName: "Course teacher",
        headline: "",
        bio: "",
        institution: "",
        location: "",
        expertise: [],
        yearsExperience: 0,
        website: "",
        avatarUrl: "",
        complete: false,
      },
      courseSourceStats(subjects, documentsByTeacher.get(teacherId) || []),
    );
  });
}

export type StudentCourseSubject = {
  courseId: string;
  teacherId: string;
  courseName: string;
  courseSlug: string;
  courseCategory: string;
  courseAuthority: string;
  courseLevel: string;
  subjectSlug: string;
  subjectName: string;
  folderPath: string;
  position: number;
};

function isStudentVisibleCourse(row: Record<string, unknown>) {
  return (
    row.status === "published" && (row.visibility === "public" || row.visibility === "unlisted")
  );
}

/**
 * The subject list for a student's enrolled courses, and nothing else.
 *
 * `listStudentCourses` builds full course cards: author profiles (an Auth
 * lookup plus a signed storage URL per teacher), platform-wide enrollment
 * counts, and every document row the teacher owns so it can total up file
 * stats. The chat and exams pages need none of that — they only want subject
 * names and folder paths — but they were paying for all of it on every render.
 * This walks enrollments, then courses and subjects together: two round trips
 * with small payloads.
 */
export const listStudentCourseSubjects = cache(async function listStudentCourseSubjects(
  studentId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubject[]> {
  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .in("status", ["active", "completed"]);
  if (enrollmentResult.error) throw enrollmentResult.error;

  const courseIds = [
    ...new Set(
      (enrollmentResult.data || []).map((row) => String(row.course_id || "")).filter(Boolean),
    ),
  ];
  if (!courseIds.length) return [];

  const [courseResult, subjectResult] = await Promise.all([
    admin
      .from("teacher_courses")
      .select("id,teacher_id,name,slug,category,authority,level,status,visibility")
      .in("id", courseIds)
      .is("archived_at", null),
    admin
      .from("teacher_course_subjects")
      .select("course_id,subject_slug,subject_name,folder_path,position")
      .in("course_id", courseIds),
  ]);
  if (courseResult.error) throw courseResult.error;
  if (subjectResult.error) throw subjectResult.error;

  const courseById = new Map(
    (courseResult.data || [])
      .filter((row) => isStudentVisibleCourse(row as Record<string, unknown>))
      .map((row) => [
        String(row.id || ""),
        {
          name: String(row.name || ""),
          teacherId: String(row.teacher_id || ""),
          slug: String(row.slug || ""),
          category: String(row.category || ""),
          authority: String(row.authority || ""),
          level: String(row.level || ""),
        },
      ]),
  );

  return (subjectResult.data || [])
    .flatMap((row) => {
      const courseId = String(row.course_id || "");
      const course = courseById.get(courseId);
      // Archived, draft, and private courses are not student-visible, so
      // their subjects must drop out here too.
      if (!course) return [];
      return [
        {
          courseId,
          teacherId: course.teacherId,
          courseName: course.name,
          courseSlug: course.slug,
          courseCategory: course.category,
          courseAuthority: course.authority,
          courseLevel: course.level,
          subjectSlug: String(row.subject_slug || ""),
          subjectName: String(row.subject_name || ""),
          folderPath: String(row.folder_path || ""),
          position: Number(row.position) || 0,
        },
      ];
    })
    .sort((left, right) => left.position - right.position);
});

export async function listPublishedCourses(
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<TeacherCourse[]> {
  const result = await admin
    .from("teacher_courses")
    .select(courseColumns)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("archived_at", null)
    .order("published_at", { ascending: false });
  if (result.error) throw result.error;

  return mapCourseRows(admin, (result.data || []) as Record<string, unknown>[]);
}

export async function getPublishedCourse(
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<TeacherCourse | null> {
  const result = await admin
    .from("teacher_courses")
    .select(courseColumns)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("archived_at", null)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;

  const [course] = await mapCourseRows(admin, [result.data as Record<string, unknown>]);
  return course || null;
}

function normalizeCourseInviteCode(value: string) {
  return value.trim().toUpperCase();
}

export async function getPublishedCourseByInviteCode(
  inviteCode: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<TeacherCourse | null> {
  const code = normalizeCourseInviteCode(inviteCode);
  if (!/^[A-Z0-9]{16,64}$/.test(code)) return null;

  const result = await admin
    .from("teacher_courses")
    .select(courseColumns)
    .eq("invite_code", code)
    .eq("status", "published")
    .eq("visibility", "unlisted")
    .is("archived_at", null)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;

  const [course] = await mapCourseRows(admin, [result.data as Record<string, unknown>]);
  return course || null;
}

export async function isCourseCreator(
  userId: string,
  course: Pick<TeacherCourse, "teacherId">,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  if (!course.teacherId) return false;
  const result = await admin
    .from("teachers")
    .select("user_id")
    .eq("id", course.teacherId)
    .maybeSingle();
  if (result.error) throw result.error;
  return String(result.data?.user_id || "") === userId;
}

/**
 * Deduped per request. A single navigation can reach this from the page, a
 * nested segment and an API handler, and each hit is a multi-query fan-out over
 * enrollments, courses, subjects and the teacher's file list.
 */
export const listStudentCourses = cache(async function listStudentCourses(
  studentId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourse[]> {
  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id,status,enrolled_at,completed_at")
    .eq("student_id", studentId)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false });
  if (enrollmentResult.error) throw enrollmentResult.error;

  const enrollments = (enrollmentResult.data || []) as Record<string, unknown>[];
  const courseIds = enrollments.map((row) => String(row.course_id || "")).filter(Boolean);
  if (!courseIds.length) return [];

  const courseResult = await admin
    .from("teacher_courses")
    .select(courseColumns)
    .in("id", courseIds)
    .is("archived_at", null);
  if (courseResult.error) throw courseResult.error;

  const courses = await mapCourseRows(
    admin,
    ((courseResult.data || []) as Record<string, unknown>[]).filter(isStudentVisibleCourse),
  );
  const courseById = new Map(courses.map((course) => [course.id, course]));

  return enrollments.flatMap((row) => {
    const course = courseById.get(String(row.course_id || ""));
    if (!course) return [];
    return [
      {
        ...course,
        enrollmentStatus: row.status === "completed" ? "completed" : "active",
        enrolledAt: String(row.enrolled_at || ""),
        completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
      } satisfies StudentCourse,
    ];
  });
});

export async function getStudentCourse(
  studentId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const courses = await listStudentCourses(studentId, admin);
  return courses.find((course) => course.slug === slug) || null;
}

function subjectAccessKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function studentHasCourseSubjectAccess(
  studentId: string,
  subject: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  return Boolean(await getStudentCourseSubjectAccess(studentId, subject, admin));
}

export type StudentCourseSubjectAccess = {
  courseId: string;
  teacherId: string;
  subjectSlug: string;
  subjectName: string;
  folderPath: string;
  accessKind?: "course" | "community" | "owner-private";
  community?: {
    id: string;
    name: string;
  };
  term?: {
    id: string;
    yearNumber: number;
    semesterNumber: number;
    semesterInYear: number;
    position: number;
  };
};

async function getCommunitySubjectAccessForCourse(
  studentId: string,
  courseId: string,
  subjectSlug: string,
  admin: SupabaseClient,
): Promise<StudentCourseSubjectAccess | null> {
  const communityResult = await admin
    .from("communities")
    .select("id")
    .eq("study_course_id", courseId)
    .eq("status", "active")
    .maybeSingle();
  if (communityResult.error) throw communityResult.error;
  if (!communityResult.data?.id) return null;

  const communityId = String(communityResult.data.id);
  const membershipResult = await admin
    .from("community_memberships")
    .select("status")
    .eq("community_id", communityId)
    .eq("user_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  if (!membershipResult.data) return null;

  const subjectResult = await admin
    .from("community_subjects")
    .select("teacher_id,external_subject_slug,name,folder_path")
    .eq("community_id", communityId)
    .eq("external_subject_slug", subjectSlug)
    .eq("status", "active")
    .eq("publication_status", "published")
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data?.teacher_id || !subjectResult.data.external_subject_slug) return null;

  return {
    courseId,
    teacherId: String(subjectResult.data.teacher_id),
    subjectSlug: String(subjectResult.data.external_subject_slug),
    subjectName: String(subjectResult.data.name || subjectSlug),
    folderPath: String(subjectResult.data.folder_path || subjectResult.data.name || subjectSlug),
    accessKind: "community",
  };
}

/** Community subjects keep their source workspace while using a hidden course for mastery. */
export async function listStudentCommunitySubjectAccess(
  studentId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess[]> {
  const membershipResult = await admin
    .from("community_memberships")
    .select("community_id")
    .eq("user_id", studentId)
    .eq("status", "active");
  if (membershipResult.error) throw membershipResult.error;

  const communityIds = [
    ...new Set(
      (membershipResult.data || []).map((row) => String(row.community_id || "")).filter(Boolean),
    ),
  ];
  if (!communityIds.length) return [];

  const communitiesResult = await admin
    .from("communities")
    .select("id,name,study_course_id")
    .in("id", communityIds)
    .eq("status", "active");
  if (communitiesResult.error) throw communitiesResult.error;

  const courseByCommunity = new Map(
    (communitiesResult.data || [])
      .filter((row) => Boolean(row.study_course_id))
      .map((row) => [String(row.id), String(row.study_course_id)]),
  );
  const communityNameById = new Map(
    (communitiesResult.data || []).map((row) => [
      String(row.id || ""),
      String(row.name || "Community"),
    ]),
  );
  const readyCommunityIds = [...courseByCommunity.keys()];
  if (!readyCommunityIds.length) return [];

  const subjectResult = await admin
    .from("community_subjects")
    .select("community_id,term_id,teacher_id,external_subject_slug,name,folder_path")
    .in("community_id", readyCommunityIds)
    .eq("status", "active")
    .eq("publication_status", "published");
  if (subjectResult.error) throw subjectResult.error;

  const termIds = [
    ...new Set((subjectResult.data || []).map((row) => String(row.term_id || "")).filter(Boolean)),
  ];
  const termsResult = termIds.length
    ? await admin
        .from("community_terms")
        .select("id,year_number,semester_number,semester_in_year,position")
        .in("id", termIds)
    : { data: [], error: null };
  if (termsResult.error) throw termsResult.error;
  const termById = new Map((termsResult.data || []).map((row) => [String(row.id || ""), row]));

  return (subjectResult.data || []).flatMap((row) => {
    const courseId = courseByCommunity.get(String(row.community_id || ""));
    const teacherId = String(row.teacher_id || "");
    const slug = String(row.external_subject_slug || "");
    const communityId = String(row.community_id || "");
    const termId = String(row.term_id || "");
    const term = termById.get(termId);
    if (!courseId || !teacherId || !slug) return [];
    return [
      {
        courseId,
        teacherId,
        subjectSlug: slug,
        subjectName: String(row.name || slug),
        folderPath: String(row.folder_path || row.name || slug),
        accessKind: "community",
        community: {
          id: communityId,
          name: communityNameById.get(communityId) || "Community",
        },
        term: term
          ? {
              id: termId,
              yearNumber: Number(term.year_number) || 1,
              semesterNumber: Number(term.semester_number) || 1,
              semesterInYear: Number(term.semester_in_year) || 1,
              position: Number(term.position) || 0,
            }
          : undefined,
      } satisfies StudentCourseSubjectAccess,
    ];
  });
}

type PrivateSubjectProfile = {
  id: string;
  teacher_id: string;
  subject_slug: string;
  subject_name: string;
  folder_path: string | null;
};

function privateSubjectAccess(profile: PrivateSubjectProfile): StudentCourseSubjectAccess {
  return {
    courseId: `private:${profile.id}`,
    teacherId: profile.teacher_id,
    subjectSlug: profile.subject_slug,
    subjectName: profile.subject_name,
    folderPath: profile.folder_path || profile.subject_name,
    accessKind: "owner-private",
  };
}

export async function listCreatorPrivateSubjectAccess(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess[]> {
  const teacherResult = await admin
    .from("teachers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (teacherResult.error) throw teacherResult.error;
  if (!teacherResult.data?.id) return [];

  const profileResult = await admin
    .from("teacher_subject_profiles")
    .select("id,teacher_id,subject_slug,subject_name,folder_path")
    .eq("teacher_id", teacherResult.data.id)
    .order("updated_at", { ascending: false });
  if (profileResult.error) throw profileResult.error;

  return ((profileResult.data || []) as PrivateSubjectProfile[]).map(privateSubjectAccess);
}

async function getCreatorPrivateSubjectAccess(
  userId: string,
  subject: string,
  admin: SupabaseClient,
) {
  const requested = subjectAccessKey(subject);
  if (!requested) return null;
  const subjects = await listCreatorPrivateSubjectAccess(userId, admin);
  return (
    subjects.find(
      (item) =>
        subjectAccessKey(item.subjectSlug) === requested ||
        subjectAccessKey(item.subjectName) === requested,
    ) || null
  );
}

export async function getStudentCourseSubjectAccessForCourse(
  studentId: string,
  courseId: string,
  subjectSlug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess | null> {
  if (courseId.startsWith("private:")) {
    const access = await getCreatorPrivateSubjectAccess(studentId, subjectSlug, admin);
    return access?.courseId === courseId ? access : null;
  }
  // Community membership is the primary entitlement for community subjects.
  // The hidden study-course enrollment is only a compatibility/mastery row;
  // preserve the community access kind for authorization and diagnostics.
  const communityAccess = await getCommunitySubjectAccessForCourse(
    studentId,
    courseId,
    subjectSlug,
    admin,
  );
  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .in("status", ["active", "completed"])
    .maybeSingle();
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (!enrollmentResult.data && !communityAccess) return null;

  const courseResult = await admin
    .from("teacher_courses")
    .select("id,teacher_id,status,visibility")
    .eq("id", courseId)
    .is("archived_at", null)
    .maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data || !isStudentVisibleCourse(courseResult.data)) return null;
  if (communityAccess) return communityAccess;

  const subjectResult = await admin
    .from("teacher_course_subjects")
    .select("course_id,teacher_id,subject_slug,subject_name,folder_path")
    .eq("course_id", courseId)
    .eq("subject_slug", subjectSlug)
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data) {
    return getCommunitySubjectAccessForCourse(studentId, courseId, subjectSlug, admin);
  }

  return {
    courseId: String(subjectResult.data.course_id || courseId),
    teacherId: String(subjectResult.data.teacher_id || courseResult.data.teacher_id || ""),
    subjectSlug: String(subjectResult.data.subject_slug || ""),
    subjectName: String(subjectResult.data.subject_name || ""),
    folderPath: String(subjectResult.data.folder_path || ""),
  };
}

export async function getStudentCourseSubjectAccess(
  studentId: string,
  subject: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess | null> {
  const requested = subjectAccessKey(subject);
  if (!requested) return null;

  const privateAccess = await getCreatorPrivateSubjectAccess(studentId, subject, admin);
  if (privateAccess) return privateAccess;

  // A community membership is itself the student's entitlement to every
  // active subject attached to that community. Community workspaces use a
  // hidden course for mastery data, but membership must not depend on a
  // duplicate legacy teacher_course_enrollments row.
  const communityAccess = (await listStudentCommunitySubjectAccess(studentId, admin)).find(
    (item) =>
      subjectAccessKey(item.subjectSlug) === requested ||
      subjectAccessKey(item.subjectName) === requested,
  );
  if (communityAccess) return communityAccess;

  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .in("status", ["active", "completed"]);
  if (enrollmentResult.error) throw enrollmentResult.error;

  const enrolledCourseIds = (enrollmentResult.data || [])
    .map((row) => String(row.course_id || ""))
    .filter(Boolean);
  if (!enrolledCourseIds.length) return null;

  const courseResult = await admin
    .from("teacher_courses")
    .select("id,teacher_id,status,visibility")
    .in("id", enrolledCourseIds)
    .is("archived_at", null);
  if (courseResult.error) throw courseResult.error;

  const courses = ((courseResult.data || []) as Array<Record<string, unknown>>).filter(
    isStudentVisibleCourse,
  ) as Array<{ id: string; teacher_id: string }>;
  const teacherByCourse = new Map(courses.map((course) => [course.id, course.teacher_id]));
  const courseIds = courses.map((course) => course.id);
  if (!courseIds.length) return null;

  const subjectResult = await admin
    .from("teacher_course_subjects")
    .select("course_id,teacher_id,subject_slug,subject_name,folder_path")
    .in("course_id", courseIds);
  if (subjectResult.error) throw subjectResult.error;

  const match = (subjectResult.data || []).find(
    (item) =>
      subjectAccessKey(String(item.subject_slug || "")) === requested ||
      subjectAccessKey(String(item.subject_name || "")) === requested,
  );
  if (!match) return null;

  const courseId = String(match.course_id || "");
  const teacherId = String(match.teacher_id || teacherByCourse.get(courseId) || "");
  if (!courseId || !teacherId) return null;

  return {
    courseId,
    teacherId,
    subjectSlug: String(match.subject_slug || ""),
    subjectName: String(match.subject_name || ""),
    folderPath: String(match.folder_path || ""),
  };
}

export async function getStudentCourseSubjectAccessForDocumentPath(
  studentId: string,
  teacherId: string,
  collectionPath: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess | null> {
  const normalizedDocumentPath = normalizeCollectionPath(collectionPath).toLowerCase();
  if (!teacherId || !normalizedDocumentPath) return null;

  const privateSubjects = await listCreatorPrivateSubjectAccess(studentId, admin);
  const privateMatch = privateSubjects
    .filter((item) => item.teacherId === teacherId)
    .filter((item) => {
      const folder = normalizeCollectionPath(item.folderPath).toLowerCase();
      return (
        Boolean(folder) &&
        (normalizedDocumentPath === folder || normalizedDocumentPath.startsWith(`${folder}/`))
      );
    })
    .sort((left, right) => right.folderPath.length - left.folderPath.length)[0];
  if (privateMatch) return privateMatch;

  const communityMatch = (await listStudentCommunitySubjectAccess(studentId, admin))
    .filter((item) => item.teacherId === teacherId)
    .filter((item) => {
      const folder = normalizeCollectionPath(item.folderPath).toLowerCase();
      return (
        Boolean(folder) &&
        (normalizedDocumentPath === folder || normalizedDocumentPath.startsWith(`${folder}/`))
      );
    })
    .sort((left, right) => right.folderPath.length - left.folderPath.length)[0];
  if (communityMatch) return communityMatch;

  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .in("status", ["active", "completed"]);
  if (enrollmentResult.error) throw enrollmentResult.error;

  const enrolledCourseIds = (enrollmentResult.data || [])
    .map((row) => String(row.course_id || ""))
    .filter(Boolean);
  if (!enrolledCourseIds.length) return null;

  const courseResult = await admin
    .from("teacher_courses")
    .select("id,status,visibility")
    .in("id", enrolledCourseIds)
    .is("archived_at", null);
  if (courseResult.error) throw courseResult.error;
  const visibleCourseIds = (courseResult.data || [])
    .filter((row) => isStudentVisibleCourse(row as Record<string, unknown>))
    .map((row) => String(row.id || ""))
    .filter(Boolean);
  if (!visibleCourseIds.length) return null;

  const subjectResult = await admin
    .from("teacher_course_subjects")
    .select("course_id,teacher_id,subject_slug,subject_name,folder_path")
    .in("course_id", visibleCourseIds)
    .eq("teacher_id", teacherId);
  if (subjectResult.error) throw subjectResult.error;

  const matches = (subjectResult.data || [])
    .filter((item) => {
      const folder = normalizeCollectionPath(String(item.folder_path || "")).toLowerCase();
      return (
        Boolean(folder) &&
        (normalizedDocumentPath === folder || normalizedDocumentPath.startsWith(`${folder}/`))
      );
    })
    .sort(
      (left, right) =>
        normalizeCollectionPath(String(right.folder_path || "")).length -
        normalizeCollectionPath(String(left.folder_path || "")).length,
    );
  const match = matches[0];
  if (!match) return null;

  return {
    courseId: String(match.course_id || ""),
    teacherId: String(match.teacher_id || teacherId),
    subjectSlug: String(match.subject_slug || ""),
    subjectName: String(match.subject_name || ""),
    folderPath: String(match.folder_path || ""),
  };
}

export async function enrollStudentInCourse(
  studentId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const course = await getPublishedCourse(slug, admin);
  if (!course) throw new StudentCourseError("Course not found.", 404);

  if (await isCourseCreator(studentId, course, admin)) {
    throw new StudentCourseError("You created this course and do not need to enroll in it.", 409);
  }

  const result = await admin.from("teacher_course_enrollments").upsert(
    {
      course_id: course.id,
      student_id: studentId,
      status: "active",
      enrolled_at: new Date().toISOString(),
      completed_at: null,
    },
    { onConflict: "course_id,student_id" },
  );
  if (result.error) throw result.error;

  return course;
}

export async function enrollStudentInCourseByInviteCode(
  studentId: string,
  inviteCode: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const course = await getPublishedCourseByInviteCode(inviteCode, admin);
  if (!course) {
    throw new StudentCourseError("This course invite is invalid or no longer active.", 404);
  }
  if (await isCourseCreator(studentId, course, admin)) {
    throw new StudentCourseError("You created this course and do not need to join it.", 409);
  }

  const result = await admin.from("teacher_course_enrollments").upsert(
    {
      course_id: course.id,
      student_id: studentId,
      status: "active",
      enrolled_at: new Date().toISOString(),
      completed_at: null,
    },
    { onConflict: "course_id,student_id" },
  );
  if (result.error) throw result.error;

  return course;
}

export async function leaveStudentCourse(
  studentId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const courseResult = await admin
    .from("teacher_courses")
    .select("id,teacher_id,slug,name")
    .eq("slug", slug)
    .maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) throw new StudentCourseError("Course not found.", 404);

  const courseId = String(courseResult.data.id || "");
  const teacherId = String(courseResult.data.teacher_id || "");
  const [subjectsResult, enrollmentResult] = await Promise.all([
    admin
      .from("teacher_course_subjects")
      .select("course_id,subject_slug,subject_name")
      .eq("course_id", courseId),
    admin
      .from("teacher_course_enrollments")
      .select("course_id")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .in("status", ["active", "completed"])
      .maybeSingle(),
  ]);
  if (subjectsResult.error) throw subjectsResult.error;
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (!enrollmentResult.data) {
    throw new StudentCourseError("You are not enrolled in this course.", 404);
  }

  const subjects = (subjectsResult.data || []).map((subject) => ({
    subjectSlug: String(subject.subject_slug || ""),
    subjectName: String(subject.subject_name || ""),
    courseId,
  }));

  // Clear the student's trails before removing the enrollment. If cleanup
  // fails, the leave is not committed and the user can retry without a silent
  // half-deleted state.
  await clearStudentStudyTrails(
    admin,
    [studentId],
    subjects,
    [courseId],
    teacherId || undefined,
    true,
  );

  const result = await admin
    .from("teacher_course_enrollments")
    .delete()
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .in("status", ["active", "completed"])
    .select("course_id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new StudentCourseError("You are not enrolled in this course.", 404);
  }

  return {
    id: String(courseResult.data.id || ""),
    slug: String(courseResult.data.slug || slug),
    name: String(courseResult.data.name || ""),
  };
}
