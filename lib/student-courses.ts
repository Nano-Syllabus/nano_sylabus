import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapTeacherCourse, type TeacherCourse } from "@/lib/teacher-courses";

const courseColumns =
  "id,teacher_id,slug,name,short_name,category,authority,tagline,description,duration_weeks,level,language_modes,access_model,price_paisa,visibility,status,diagnostic_question_count,daily_minutes,pass_percentage,negative_marking,exam_date,outcomes,created_at,updated_at,published_at";

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

async function mapCourseRows(admin: SupabaseClient, rows: Record<string, unknown>[]) {
  const ids = rows.map((row) => String(row.id || "")).filter(Boolean);
  if (!ids.length) return [];

  const [subjectsResult, enrollmentsResult] = await Promise.all([
    admin
      .from("teacher_course_subjects")
      .select("course_id,subject_slug,subject_name,folder_path,position")
      .in("course_id", ids),
    admin
      .from("teacher_course_enrollments")
      .select("course_id")
      .in("course_id", ids)
      .eq("status", "active"),
  ]);
  if (subjectsResult.error) throw subjectsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const subjectsByCourse = new Map<string, Record<string, unknown>[]>();
  for (const subject of (subjectsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(subject.course_id || "");
    subjectsByCourse.set(courseId, [...(subjectsByCourse.get(courseId) || []), subject]);
  }

  const enrollmentCounts = new Map<string, number>();
  for (const enrollment of (enrollmentsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(enrollment.course_id || "");
    enrollmentCounts.set(courseId, (enrollmentCounts.get(courseId) || 0) + 1);
  }

  return rows.map((row) => {
    const courseId = String(row.id || "");
    return mapTeacherCourse(
      row,
      subjectsByCourse.get(courseId) || [],
      enrollmentCounts.get(courseId) || 0,
    );
  });
}

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
    .in("visibility", ["public", "unlisted"])
    .is("archived_at", null)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;

  const [course] = await mapCourseRows(admin, [result.data as Record<string, unknown>]);
  return course || null;
}

export async function listStudentCourses(
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
    (courseResult.data || []) as Record<string, unknown>[],
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
}

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
};

export async function getStudentCourseSubjectAccessForCourse(
  studentId: string,
  courseId: string,
  subjectSlug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentCourseSubjectAccess | null> {
  const enrollmentResult = await admin
    .from("teacher_course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .in("status", ["active", "completed"])
    .maybeSingle();
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (!enrollmentResult.data) return null;

  const courseResult = await admin
    .from("teacher_courses")
    .select("id,teacher_id")
    .eq("id", courseId)
    .is("archived_at", null)
    .maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) return null;

  const subjectResult = await admin
    .from("teacher_course_subjects")
    .select("course_id,teacher_id,subject_slug,subject_name,folder_path")
    .eq("course_id", courseId)
    .eq("subject_slug", subjectSlug)
    .maybeSingle();
  if (subjectResult.error) throw subjectResult.error;
  if (!subjectResult.data) return null;

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
    .select("id,teacher_id")
    .in("id", enrolledCourseIds)
    .is("archived_at", null);
  if (courseResult.error) throw courseResult.error;

  const courses = (courseResult.data || []) as Array<{ id: string; teacher_id: string }>;
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

export async function enrollStudentInCourse(
  studentId: string,
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const course = await getPublishedCourse(slug, admin);
  if (!course) throw new StudentCourseError("Course not found.", 404);
  if (course.accessModel !== "free") {
    throw new StudentCourseError("Paid enrollment is not available yet.", 409);
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
    .select("id,slug,name")
    .eq("slug", slug)
    .maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) throw new StudentCourseError("Course not found.", 404);

  const result = await admin
    .from("teacher_course_enrollments")
    .update({
      status: "cancelled",
      completed_at: null,
    })
    .eq("course_id", String(courseResult.data.id || ""))
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
