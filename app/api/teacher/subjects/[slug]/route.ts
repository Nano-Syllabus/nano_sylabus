import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearTeacherSubjectTrails } from "@/lib/data/study-trail-cleanup";
import {
  deleteTeacherSubject,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";
import { detachTeacherSubjectFromCourses } from "@/lib/teacher-course-links";

type RouteContext = { params: Promise<{ slug: string }> };

type LocalDocumentMirror = {
  id?: unknown;
  collection_path?: unknown;
  storage_path?: unknown;
};

/**
 * Remove the local mirrors that make a teacher subject appear in the workspace.
 *
 * The operator collection is the source of truth for indexed content, but the
 * teacher workspace also keeps subject metadata and uploaded-file mirrors in
 * Supabase. If those rows survive a remote delete, the next workspace refresh
 * rebuilds the card from `teacher_subject_profiles`, making deletion look like
 * it did nothing.
 */
async function deleteLocalSubjectMetadata(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherId: string,
  subjectSlug: string,
  folderPath: string,
  deleteFiles: boolean,
) {
  const profileDelete = await admin
    .from("teacher_subject_profiles")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_slug", subjectSlug)
    .select("id");
  if (profileDelete.error) throw profileDelete.error;

  const syllabusDelete = await admin
    .from("teacher_subject_syllabi")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_slug", subjectSlug)
    .select("id");
  if (syllabusDelete.error) throw syllabusDelete.error;

  if (!deleteFiles || !folderPath) return 0;

  const mirrorsQuery = admin
    .from("teacher_document_files")
    .select("id,collection_path,storage_path");
  const mirrorsResult = await mirrorsQuery.eq("teacher_id", teacherId);
  if (mirrorsResult.error) throw mirrorsResult.error;

  const mirrors = ((mirrorsResult.data || []) as LocalDocumentMirror[]).filter((mirror) => {
    const collectionPath = typeof mirror.collection_path === "string"
      ? mirror.collection_path.trim()
      : "";
    return collectionPath === folderPath || collectionPath.startsWith(`${folderPath}/`);
  });
  const mirrorIds = mirrors
    .map((mirror) => (typeof mirror.id === "string" ? mirror.id : ""))
    .filter(Boolean);
  const storagePaths = Array.from(
    new Set(
      mirrors
        .map((mirror) => (typeof mirror.storage_path === "string" ? mirror.storage_path : ""))
        .filter(Boolean),
    ),
  );

  // The operator has already removed the canonical files at this point. The
  // following mirrors are best-effort cleanup so a storage hiccup cannot make
  // a successfully deleted subject reappear in the UI.
  if (storagePaths.length) {
    const { error } = await admin.storage.from("teacher-documents").remove(storagePaths);
    if (error) console.warn("[DELETE subject] local document storage cleanup failed", error);
  }
  if (mirrorIds.length) {
    const mirrorDelete = await admin
      .from("teacher_document_files")
      .delete()
      .in("id", mirrorIds);
    if (mirrorDelete.error) {
      console.warn("[DELETE subject] local document mirror cleanup failed", mirrorDelete.error);
    }
  }

  return mirrorIds.length;
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug } = await params;
    const trimmedSlug = slug.trim();
    if (!trimmedSlug || trimmedSlug.length > 200) {
      return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => {
      const record = item as ApiRecord;
      return (
        item.slug === trimmedSlug ||
        String(record.slug || "").trim() === trimmedSlug ||
        String(record.name || "").trim() === trimmedSlug ||
        String(record.folder_path || "").trim() === trimmedSlug
      );
    });

    let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    let localProfile: { subject_slug?: unknown; folder_path?: unknown } | null = null;
    if (!subject) {
      // A previous failed delete could leave the local profile behind after
      // the operator collection has already removed the subject. Treat that
      // as an idempotent delete so the workspace card can still be removed.
      admin = createSupabaseAdminClient();
      const localProfileResult = await admin
        .from("teacher_subject_profiles")
        .select("subject_slug,folder_path")
        .eq("teacher_id", teacher.id)
        .eq("subject_slug", trimmedSlug)
        .maybeSingle();
      if (localProfileResult.error) throw localProfileResult.error;
      localProfile = localProfileResult.data;
      if (!localProfile) {
        return NextResponse.json(
          { error: "Subject not found in this teacher collection." },
          { status: 404 },
        );
      }
    }

    const deleteFiles = new URL(request.url).searchParams.get("deleteFiles") === "1";
    const folderPath = subject
      ? typeof (subject as ApiRecord).folder_path === "string"
        ? String((subject as ApiRecord).folder_path).trim()
        : ""
      : typeof localProfile?.folder_path === "string"
        ? localProfile.folder_path.trim()
        : "";
    if (deleteFiles) {
      const unsafeFolder = !folderPath || folderPath.startsWith("/") || folderPath.includes("\\")
        || folderPath.split("/").some((part) => !part || part === "." || part === "..");
      if (unsafeFolder) {
        return NextResponse.json(
          { error: "This subject does not have a safe collection folder to delete." },
          { status: 400 },
        );
      }
    }

    const resolvedSlug = subject
      ? String((subject as ApiRecord).slug || subject.slug).trim()
      : String(localProfile?.subject_slug || trimmedSlug).trim();
    const db = admin || createSupabaseAdminClient();

    // The operator DELETE endpoint owns both behaviours. Calling
    // source-tree DELETE first and then unpinning (the old flow) removed the
    // folder before the subject endpoint could process `delete_folder=true`,
    // which made the UI report an upstream 404 and left local metadata behind.
    if (subject) {
      try {
        await deleteTeacherSubject(teacher.collection_sk, resolvedSlug, {
          deleteFolder: deleteFiles,
        });
      } catch (error) {
        // A subject can disappear remotely between the list and delete
        // requests. Continue with local cleanup in that case; the operation
        // is already in the desired final state.
        if (!(error instanceof TeacherApiError) || error.status !== 404) throw error;
      }
    }

    // Capture descendants before detaching the subject. The link delete
    // below cascades only course membership rows; chats, practice history,
    // revision notes and exam submissions have to be removed explicitly.
    const linkedCoursesResult = await db
      .from("teacher_course_subjects")
      .select("course_id")
      .eq("teacher_id", teacher.id)
      .eq("subject_slug", resolvedSlug);
    if (linkedCoursesResult.error) throw linkedCoursesResult.error;
    const linkedCourseIds = Array.from(
      new Set(
        (linkedCoursesResult.data || [])
          .map((row) => String(row.course_id || ""))
          .filter(Boolean),
      ),
    );
    const enrolledStudentIds = linkedCourseIds.length
      ? await db
          .from("teacher_course_enrollments")
          .select("student_id")
          .in("course_id", linkedCourseIds)
          .then((result) => {
            if (result.error) throw result.error;
            return (result.data || [])
              .map((row) => String(row.student_id || ""))
              .filter(Boolean);
          })
      : [];
    await clearTeacherSubjectTrails(
      db,
      teacher.id,
      teacher.user_id,
      [{
        subjectSlug: resolvedSlug,
        subjectName: subject ? String((subject as ApiRecord).name || "") : "",
      }],
      linkedCourseIds,
      enrolledStudentIds,
    );

    const detachedCourseIds = await detachTeacherSubjectFromCourses(db, teacher.id, resolvedSlug);
    const localFilesDeleted = await deleteLocalSubjectMetadata(
      db,
      teacher.id,
      resolvedSlug,
      folderPath,
      deleteFiles,
    );
    return NextResponse.json({
      deleted: true,
      filesDeleted: deleteFiles,
      coursesUpdated: detachedCourseIds.length,
      localFilesDeleted,
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const status = apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502;
    const detail =
      apiError?.status === 401
        ? "This teacher workspace key is no longer valid."
        : apiError?.status === 404
          ? "Subject or source folder was not found on the operator."
          : apiError
            ? `Upstream error (${apiError.status}): ${apiError.message}`
            : error instanceof Error
              ? error.message
              : "Could not remove the subject.";
    console.error("[DELETE /api/teacher/subjects/[slug]]", detail, error);
    return NextResponse.json({ error: detail }, { status });
  }
}
