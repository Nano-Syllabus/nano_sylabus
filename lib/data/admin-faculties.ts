import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { communityLevel, communityLevelStructure } from "@/lib/communities";
import { attachCommunitySubject, CommunityError } from "@/lib/data/communities";
import { publishCommunitySubject } from "@/lib/data/community-subjects";
import { ensureCommunityLearningSpace } from "@/lib/community-learning";
import { createTeacherSubject } from "@/lib/teacher-app/client";
import { invalidateCommunityCatalog } from "@/lib/data/communities";
import { invalidateMemo } from "@/lib/http/memo";
import {
  facultyUpdateSchema,
  subjectCreateSchema,
  subjectUpdateSchema,
  type AdminFacultySummary,
  type AdminFacultyDetail,
} from "@/lib/admin-faculties";

const columns = "id,slug,name,faculty,university,level,visibility,status";
export async function listAdminFaculties(
  admin = createSupabaseAdminClient(),
): Promise<AdminFacultySummary[]> {
  const result = await admin.from("communities").select(columns).order("name");
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    ...row,
    level: communityLevel(row),
  })) as AdminFacultySummary[];
}

async function facultyRow(slug: string, admin: SupabaseClient) {
  const result = await admin
    .from("communities")
    .select(`${columns},creator_id,description,total_years,total_semesters,study_course_id`)
    .eq("slug", slug)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new CommunityError("Faculty not found.", 404);
  return result.data;
}

export async function getAdminFaculty(
  slug: string,
  admin = createSupabaseAdminClient(),
): Promise<AdminFacultyDetail> {
  const row = await facultyRow(slug, admin);
  const [terms, subjects, teacher] = await Promise.all([
    admin
      .from("community_terms")
      .select("id,year_number,semester_number")
      .eq("community_id", row.id)
      .order("position"),
    admin
      .from("community_subjects")
      .select(
        "id,name,code,description,term_id,position,status,publication_status,external_subject_slug",
      )
      .eq("community_id", row.id)
      .order("position"),
    admin.from("teachers").select("id").eq("user_id", row.creator_id).maybeSingle(),
  ]);
  for (const result of [terms, subjects, teacher]) if (result.error) throw result.error;
  const profiles = teacher.data
    ? await admin
        .from("teacher_subject_profiles")
        .select("subject_slug,subject_name")
        .eq("teacher_id", teacher.data.id)
        .order("subject_name")
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    faculty: row.faculty,
    university: row.university,
    level: communityLevel(row),
    visibility: row.visibility,
    status: row.status,
    description: row.description,
    totalYears: row.total_years,
    totalSemesters: row.total_semesters,
    terms: (terms.data ?? []).map((t) => ({
      id: t.id,
      yearNumber: t.year_number,
      semesterNumber: t.semester_number,
    })),
    subjects: (subjects.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      description: s.description,
      termId: s.term_id,
      position: s.position,
      status: s.status,
      publicationStatus: s.publication_status,
      externalSubjectSlug: s.external_subject_slug,
    })),
    availableSubjects: (profiles.data ?? []).map((s) => ({
      slug: s.subject_slug,
      name: s.subject_name,
    })),
  };
}

function refresh(slug: string) {
  invalidateCommunityCatalog();
  invalidateMemo("student:course-subject-access");
  revalidatePath("/admin/sites");
  revalidatePath("/communities");
  revalidatePath(`/communities/${slug}`);
  revalidatePath("/prepare/[slug]", "page");
  revalidatePath("/");
  revalidatePath("/sites/[slug]", "page");
  revalidatePath("/exams");
  revalidatePath("/app", "layout");
}

export async function updateAdminFaculty(
  slug: string,
  input: z.infer<typeof facultyUpdateSchema>,
  admin = createSupabaseAdminClient(),
) {
  const row = await facultyRow(slug, admin);
  if (communityLevelStructure(input.level) !== communityLevelStructure(communityLevel(row)))
    throw new CommunityError(
      "This level needs a different subject structure. Create a new faculty for that level.",
      400,
    );
  if (input.status !== "active" || input.visibility !== "public") {
    const [mapping, locks] = await Promise.all([
      admin
        .from("landing_exam_faculties")
        .select("exam_slug")
        .eq("community_id", row.id)
        .eq("is_active", true)
        .limit(1),
      admin.from("student_exam_enrollments").select("user_id").eq("community_id", row.id).limit(1),
    ]);
    if (mapping.error) throw mapping.error;
    if (locks.error) throw locks.error;
    if (locks.data?.length || mapping.data?.length)
      throw new CommunityError(
        "This faculty is used by an exam or a locked student. Remove it from exam settings and reassign its students before hiding or archiving it.",
        409,
      );
  }
  const result = await admin.from("communities").update(input).eq("id", row.id);
  if (result.error) throw result.error;
  refresh(slug);
  return getAdminFaculty(slug, admin);
}

export async function addAdminFacultySubject(
  slug: string,
  input: z.infer<typeof subjectCreateSchema>,
  admin = createSupabaseAdminClient(),
) {
  const row = await facultyRow(slug, admin);
  const term = await admin
    .from("community_terms")
    .select("id")
    .eq("id", input.termId)
    .eq("community_id", row.id)
    .maybeSingle();
  if (term.error) throw term.error;
  if (!term.data) throw new CommunityError("Choose a term from this faculty.", 400);
  if (row.status !== "active")
    throw new CommunityError("Restore this faculty before adding subjects.", 409);
  let subjectSlug = input.subjectSlug;
  if (!subjectSlug) {
    const learning = await ensureCommunityLearningSpace(admin, row.id);
    const subject = await createTeacherSubject(learning.teacher.collectionKey, input.name!);
    subjectSlug = String(subject.slug);
    const profile = await admin.from("teacher_subject_profiles").upsert(
      {
        teacher_id: learning.teacher.id,
        subject_slug: subjectSlug,
        subject_name: input.name,
        subject_code: input.code,
        folder_path: String(subject.folder_path || input.name),
        university: row.university,
        programme: row.faculty,
        visibility: "private",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "teacher_id,subject_slug" },
    );
    if (profile.error) throw profile.error;
  }
  // The creator identity comes from the database, only after the route verified admin access.
  await attachCommunitySubject(row.creator_id, slug, { termId: input.termId, subjectSlug }, admin);
  refresh(slug);
  return getAdminFaculty(slug, admin);
}

export async function updateAdminFacultySubject(
  slug: string,
  subjectId: string,
  input: z.infer<typeof subjectUpdateSchema>,
  admin = createSupabaseAdminClient(),
) {
  const row = await facultyRow(slug, admin);
  const subject = await admin
    .from("community_subjects")
    .select("id,publication_status")
    .eq("id", subjectId)
    .eq("community_id", row.id)
    .maybeSingle();
  if (subject.error) throw subject.error;
  if (!subject.data) throw new CommunityError("Subject not found in this faculty.", 404);
  if (input.action === "publish") {
    await publishCommunitySubject(row.creator_id, slug, subjectId, admin);
  } else {
    const term = await admin
      .from("community_terms")
      .select("id")
      .eq("id", input.termId)
      .eq("community_id", row.id)
      .maybeSingle();
    if (term.error) throw term.error;
    if (!term.data) throw new CommunityError("Choose a term from this faculty.", 400);
    if (input.publicationStatus === "published" && subject.data.publication_status !== "published")
      throw new CommunityError("Use Publish & sync to publish a subject with its syllabus.", 400);
    const result = await admin
      .from("community_subjects")
      .update({
        name: input.name,
        code: input.code,
        description: input.description,
        term_id: input.termId,
        position: input.position,
        status: input.status,
        publication_status: input.publicationStatus,
      })
      .eq("id", subjectId)
      .eq("community_id", row.id);
    if (result.error) throw result.error;
  }
  refresh(slug);
  return getAdminFaculty(slug, admin);
}
