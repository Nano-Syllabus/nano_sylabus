import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCommunitySubjectAccess,
  listStudentCourses,
} from "@/lib/student-courses";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/** The subjects this student may scope chat and practice to. */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return errorJson("Unauthorized", 401);
    }

    const [courses, communitySubjects, privateSubjects] = await Promise.all([
      listStudentCourses(user.id),
      listStudentCommunitySubjectAccess(user.id),
      listCreatorPrivateSubjectAccess(user.id),
    ]);
    const subjects = [
      ...privateSubjects.map((subject) => ({
        courseId: subject.courseId,
        name: subject.subjectName,
        slug: subject.subjectSlug,
        namespaceSlug: subject.subjectSlug,
        folderPath: subject.folderPath,
        private: true,
      })),
      ...communitySubjects.map((subject) => ({
        courseId: subject.courseId,
        name: subject.subjectName,
        slug: subject.subjectSlug,
        namespaceSlug: subject.subjectSlug,
        folderPath: subject.folderPath,
        community: true,
      })),
      ...courses.flatMap((course) =>
        course.subjects.map((subject) => ({
          courseId: course.id,
          name: subject.name,
          slug: subject.slug,
          namespaceSlug: subject.slug,
          folderPath: subject.folderPath,
        })),
      ),
    ];

    // SHORT, not SESSION: joining a course has to show up in the chat subject
    // picker on the next navigation, and the mutation that joins one lives in a
    // different component from the one that reads this.
    return privateJson({ subjects }, { request, profile: CACHE.SHORT });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Failed to load tenant subjects.",
      500,
    );
  }
}
