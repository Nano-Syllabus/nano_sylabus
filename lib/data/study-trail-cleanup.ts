import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

export type CleanupSubject = {
  subjectSlug: string;
  subjectName?: string;
  courseId?: string;
};

function normalizedSubjectKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01";
}

function throwDatabaseError(error: { code?: string; message?: string } | null) {
  if (error && !isMissingTable(error)) throw error;
}

function subjectKeys(subjects: CleanupSubject[]) {
  return new Set(
    subjects.flatMap((subject) =>
      [subject.subjectSlug, subject.subjectName].map(normalizedSubjectKey).filter(Boolean),
    ),
  );
}

function rowBelongsToTrail(
  row: { course_id?: unknown; subject_slug?: unknown },
  keys: Set<string>,
  courseIds: Set<string>,
  courseWide = false,
) {
  const courseId = typeof row.course_id === "string" ? row.course_id : "";
  const subjectKey = normalizedSubjectKey(row.subject_slug);
  if (courseId) {
    return courseIds.has(courseId) && (courseWide || !keys.size || keys.has(subjectKey));
  }
  return Boolean(subjectKey && keys.has(subjectKey));
}

function sessionBelongsToSubjects(
  row: { subject_context?: unknown; subject_tags?: unknown },
  keys: Set<string>,
) {
  const context = normalizedSubjectKey(row.subject_context);
  if (context && keys.has(context)) return true;

  // A session is normally tagged with one selected subject. Do not delete a
  // deliberately multi-subject session just because one tag happens to match.
  const tags = Array.isArray(row.subject_tags)
    ? row.subject_tags.map(normalizedSubjectKey).filter(Boolean)
    : [];
  return tags.length === 1 && keys.has(tags[0]);
}

async function deleteRevisionNotesForUsers(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[],
  courseWide = false,
) {
  if (!userIds.length) return;

  const result = await admin
    .from("revision_notes")
    .select("id,course_id,subject_slug")
    .in("user_id", userIds);
  throwDatabaseError(result.error);
  if (isMissingTable(result.error)) return;

  const keys = subjectKeys(subjects);
  const courseIdSet = new Set(courseIds);
  const ids = ((result.data || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const courseId = typeof row.course_id === "string" ? row.course_id : "";
      const slug = normalizedSubjectKey(row.subject_slug);
      // Once the note is linked to a course, both dimensions must match. The
      // slug-only fallback is only for legacy notes created before course_id
      // was added; otherwise the same subject name in another course would
      // be erased when a student leaves this one.
      if (courseIdSet.size) {
        return courseId
          ? courseIdSet.has(courseId) && (courseWide || !keys.size || keys.has(slug))
          : Boolean(slug && keys.has(slug));
      }
      return Boolean(slug && keys.has(slug));
    })
    .map((row) => String(row.id || ""))
    .filter(Boolean);

  if (!ids.length) return;
  const deletion = await admin.from("revision_notes").delete().in("id", ids);
  throwDatabaseError(deletion.error);
}

async function deleteRevisionNotesForCourses(
  admin: AdminClient,
  courseIds: string[],
  subjects: CleanupSubject[] = [],
) {
  if (!courseIds.length) return;
  const keys = subjectKeys(subjects);
  if (!keys.size) {
    const deletion = await admin.from("revision_notes").delete().in("course_id", courseIds);
    throwDatabaseError(deletion.error);
    return;
  }

  // A subject can share a course with other subjects. Deleting a subject must
  // never erase the other subjects' notes, so first narrow the course rows by
  // their subject key and delete only those IDs.
  const result = await admin
    .from("revision_notes")
    .select("id,course_id,subject_slug")
    .in("course_id", courseIds);
  throwDatabaseError(result.error);
  if (isMissingTable(result.error)) return;
  const ids = ((result.data || []) as Array<Record<string, unknown>>)
    .filter((row) => keys.has(normalizedSubjectKey(row.subject_slug)))
    .map((row) => String(row.id || ""))
    .filter(Boolean);
  if (!ids.length) return;
  const deletion = await admin.from("revision_notes").delete().in("id", ids);
  throwDatabaseError(deletion.error);
}

async function deleteStudentTeacherExamTrails(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  teacherId?: string,
) {
  if (!userIds.length || !subjects.length) return;
  const slugs = unique(subjects.map((subject) => subject.subjectSlug));
  if (!slugs.length) return;

  // Teacher exam submissions are separate from practice attempts. They are
  // the rows that power the student's Exams page and must disappear when the
  // student leaves a course, even though the teacher's paper remains alive.
  let papersQuery = admin.from("teacher_exam_papers").select("id").in("subject_slug", slugs);
  if (teacherId) papersQuery = papersQuery.eq("teacher_id", teacherId);
  const papersResult = await papersQuery;
  throwDatabaseError(papersResult.error);
  if (isMissingTable(papersResult.error)) return;
  const paperIds = ((papersResult.data || []) as Array<Record<string, unknown>>)
    .map((row) => String(row.id || ""))
    .filter(Boolean);
  if (!paperIds.length) return;

  const deletion = await admin
    .from("teacher_exam_submissions")
    .delete()
    .in("paper_id", paperIds)
    .in("student_id", userIds);
  throwDatabaseError(deletion.error);
}

async function deleteStudentPracticeTrails(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[],
  courseWide: boolean,
) {
  if (!userIds.length || (!subjects.length && !courseIds.length)) return;
  const keys = subjectKeys(subjects);
  const courseIdSet = new Set(courseIds);

  const attemptsResult = await admin
    .from("student_practice_attempts")
    .select("id,course_id,subject_slug")
    .in("user_id", userIds);
  throwDatabaseError(attemptsResult.error);
  if (isMissingTable(attemptsResult.error)) return;

  const attemptIds = ((attemptsResult.data || []) as Array<Record<string, unknown>>)
    .filter((row) => rowBelongsToTrail(row, keys, courseIdSet, courseWide))
    .map((row) => String(row.id || ""))
    .filter(Boolean);

  // The database cascades all normalized paper/question/answer rows from the
  // attempt. Remove uploaded answer-sheet objects too, otherwise storage would
  // retain an invisible orphan even after the database rows are gone.
  if (attemptIds.length) {
    const sheetsResult = await admin
      .from("student_practice_answer_sheets")
      .select("storage_path")
      .in("attempt_id", attemptIds);
    throwDatabaseError(sheetsResult.error);
    if (!isMissingTable(sheetsResult.error)) {
      const paths = unique(
        ((sheetsResult.data || []) as Array<Record<string, unknown>>)
          .map((row) => String(row.storage_path || ""))
          .filter(Boolean),
      );
      if (paths.length) {
        const storageResult = await admin.storage
          .from("student-practice-answer-sheets")
          .remove(paths);
        // Leaving a course promises complete cleanup. Keep the enrollment and
        // database trail intact when storage is unavailable so the student can
        // retry instead of silently leaving an invisible answer-sheet object.
        if (storageResult.error) throw storageResult.error;
      }
    }

    const attemptsDelete = await admin
      .from("student_practice_attempts")
      .delete()
      .in("id", attemptIds);
    throwDatabaseError(attemptsDelete.error);
  }

  const masteryResult = await admin
    .from("student_topic_mastery")
    .select("id,course_id,subject_slug")
    .in("user_id", userIds);
  throwDatabaseError(masteryResult.error);
  if (!isMissingTable(masteryResult.error)) {
    const masteryIds = ((masteryResult.data || []) as Array<Record<string, unknown>>)
      .filter((row) => rowBelongsToTrail(row, keys, courseIdSet, courseWide))
      .map((row) => String(row.id || ""))
      .filter(Boolean);
    if (masteryIds.length) {
      const masteryDelete = await admin.from("student_topic_mastery").delete().in("id", masteryIds);
      throwDatabaseError(masteryDelete.error);
    }
  }
}

async function deleteSubjectChatTrails(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[],
  courseWide: boolean,
) {
  if (!userIds.length || (!subjects.length && !courseIds.length)) return;
  const keys = subjectKeys(subjects);
  const courseIdSet = new Set(courseIds);

  const sessionsResult = await admin
    .from("chat_sessions")
    .select("id,user_id,course_id,subject_slug,subject_tags,subject_context")
    .in("user_id", userIds);
  throwDatabaseError(sessionsResult.error);
  if (isMissingTable(sessionsResult.error)) return;

  const sessionIds = ((sessionsResult.data || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      if (row.course_id) return rowBelongsToTrail(row, keys, courseIdSet, courseWide);
      return sessionBelongsToSubjects(row, keys);
    })
    .map((row) => String(row.id || ""))
    .filter(Boolean);

  if (!sessionIds.length) return;
  const deletion = await admin.from("chat_sessions").delete().in("id", sessionIds);
  throwDatabaseError(deletion.error);
}

async function deleteStudentChallenges(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[],
  courseWide: boolean,
) {
  if (!userIds.length || (!subjects.length && !courseIds.length)) return;
  const result = await admin
    .from("student_challenges")
    .select("id,course_id,subject_slug")
    .in("user_id", userIds);
  throwDatabaseError(result.error);
  if (isMissingTable(result.error)) return;
  const keys = subjectKeys(subjects);
  const courseIdSet = new Set(courseIds);
  const ids = ((result.data || []) as Array<Record<string, unknown>>)
    .filter((row) => rowBelongsToTrail(row, keys, courseIdSet, courseWide))
    .map((row) => String(row.id || ""))
    .filter(Boolean);
  if (!ids.length) return;
  const deletion = await admin.from("student_challenges").delete().in("id", ids);
  throwDatabaseError(deletion.error);
}

async function deleteStudentClassroomMemberships(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[],
  teacherId?: string,
  courseWide = false,
) {
  if (!userIds.length || (!subjects.length && !courseIds.length)) return;

  // A classroom is another way a student can reach a teacher exam. Leaving
  // the course must remove that access as well as the submitted grade; the
  // classroom itself belongs to the teacher and must remain intact.
  let classroomsQuery = admin.from("teacher_classrooms").select("id,course_id,subject_slug");
  if (teacherId) classroomsQuery = classroomsQuery.eq("teacher_id", teacherId);
  const classroomsResult = await classroomsQuery;
  throwDatabaseError(classroomsResult.error);
  if (isMissingTable(classroomsResult.error)) return;

  const keys = subjectKeys(subjects);
  const courseIdSet = new Set(courseIds);
  const classroomIds = ((classroomsResult.data || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const classroomCourseId = typeof row.course_id === "string" ? row.course_id : "";
      const subjectSlug = normalizedSubjectKey(row.subject_slug);
      // Prefer the course dimension whenever it is available. The subject
      // slug is only a legacy fallback for classrooms created before
      // course_id was stored; otherwise two courses sharing a subject slug
      // could lose the student's access to the wrong classroom.
      return courseIdSet.size
        ? classroomCourseId
          ? courseIdSet.has(classroomCourseId) && (courseWide || !keys.size || keys.has(subjectSlug))
          : Boolean(subjectSlug && keys.has(subjectSlug))
        : Boolean(subjectSlug && keys.has(subjectSlug));
    })
    .map((row) => String(row.id || ""))
    .filter(Boolean);
  if (!classroomIds.length) return;

  const activityDeletion = await admin
    .from("teacher_classroom_activity")
    .delete()
    .in("classroom_id", classroomIds)
    .in("actor_id", userIds);
  throwDatabaseError(activityDeletion.error);

  const deletion = await admin
    .from("teacher_classroom_members")
    .delete()
    .in("classroom_id", classroomIds)
    .in("student_id", userIds);
  throwDatabaseError(deletion.error);
}

/**
 * Deletes a student's study history for the supplied course subjects. This is
 * intentionally scoped by user id: leaving one course must never erase another
 * student's records or a teacher's source collection.
 */
export async function clearStudentStudyTrails(
  admin: AdminClient,
  userIds: string[],
  subjects: CleanupSubject[],
  courseIds: string[] = [],
  teacherId?: string,
  courseWide = false,
) {
  const users = unique(userIds);
  const cleanSubjects = subjects.filter((subject) => subject.subjectSlug);
  const cleanCourseIds = unique(courseIds);
  if (!users.length || (!cleanSubjects.length && !cleanCourseIds.length)) return;

  // Practice goes first because it performs the external storage deletion
  // before touching its database rows. A storage failure therefore aborts the
  // leave before any of the other course trails are removed.
  await deleteStudentPracticeTrails(admin, users, cleanSubjects, cleanCourseIds, courseWide);
  await deleteRevisionNotesForUsers(admin, users, cleanSubjects, cleanCourseIds, courseWide);
  await deleteSubjectChatTrails(admin, users, cleanSubjects, cleanCourseIds, courseWide);
  await deleteStudentChallenges(admin, users, cleanSubjects, cleanCourseIds, courseWide);
  await deleteStudentTeacherExamTrails(admin, users, cleanSubjects, teacherId);
  await deleteStudentClassroomMemberships(
    admin,
    users,
    cleanSubjects,
    cleanCourseIds,
    teacherId,
    courseWide,
  );
}

/** Deletes all notes that were explicitly linked to a deleted course. */
export async function clearCourseRevisionTrails(admin: AdminClient, courseIds: string[]) {
  await deleteRevisionNotesForCourses(admin, unique(courseIds));
}

async function deleteTeacherExamTrails(
  admin: AdminClient,
  teacherId: string,
  subjectSlugs: string[],
  courseId?: string,
) {
  const classroomQuery = admin.from("teacher_classrooms").select("id").eq("teacher_id", teacherId);
  const classroomsResult = courseId
    ? await classroomQuery.eq("course_id", courseId)
    : await classroomQuery.in("subject_slug", subjectSlugs);
  throwDatabaseError(classroomsResult.error);
  const classroomIds = isMissingTable(classroomsResult.error)
    ? []
    : ((classroomsResult.data || []) as Array<Record<string, unknown>>)
        .map((row) => String(row.id || ""))
        .filter(Boolean);

  // Exam papers are owned by the teacher and subject. Deleting the paper
  // cascades assignments and submissions, including every student's grade.
  if (subjectSlugs.length) {
    const papersResult = await admin
      .from("teacher_exam_papers")
      .select("id")
      .eq("teacher_id", teacherId)
      .in("subject_slug", subjectSlugs);
    throwDatabaseError(papersResult.error);
    if (!isMissingTable(papersResult.error)) {
      const paperIds = ((papersResult.data || []) as Array<Record<string, unknown>>)
        .map((row) => String(row.id || ""))
        .filter(Boolean);
      if (paperIds.length) {
        const paperDelete = await admin.from("teacher_exam_papers").delete().in("id", paperIds);
        throwDatabaseError(paperDelete.error);
      }
    }
  }

  if (classroomIds.length) {
    const classroomDelete = await admin.from("teacher_classrooms").delete().in("id", classroomIds);
    throwDatabaseError(classroomDelete.error);
  }
}

/** Cleanup used by a teacher's subject delete endpoint. */
export async function clearTeacherSubjectTrails(
  admin: AdminClient,
  teacherId: string,
  teacherUserId: string | null | undefined,
  subjects: CleanupSubject[],
  linkedCourseIds: string[] = [],
  enrolledStudentIds: string[] = [],
) {
  const users = unique([...enrolledStudentIds, teacherUserId || ""]);
  const courseIds = unique(linkedCourseIds);
  await deleteRevisionNotesForCourses(admin, courseIds, subjects);
  await clearStudentStudyTrails(admin, users, subjects, courseIds, teacherId);
  await deleteTeacherExamTrails(
    admin,
    teacherId,
    unique(subjects.map((subject) => subject.subjectSlug)),
  );
}

/** Cleanup used by a teacher's course delete endpoint. */
export async function clearTeacherCourseTrails(
  admin: AdminClient,
  teacherId: string,
  courseId: string,
  subjects: CleanupSubject[],
  enrolledStudentIds: string[],
  teacherUserId?: string,
) {
  await clearCourseRevisionTrails(admin, [courseId]);
  const users = unique([...enrolledStudentIds, teacherUserId || ""]);
  await clearStudentStudyTrails(admin, users, subjects, [courseId], teacherId, true);
  await deleteTeacherExamTrails(
    admin,
    teacherId,
    unique(subjects.map((subject) => subject.subjectSlug)),
    courseId,
  );
}
