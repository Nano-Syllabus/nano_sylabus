import { errorJson, privateJson, CACHE } from "@/lib/http/cache";
import { getCurrentAuth } from "@/lib/auth";
import { listCreatorPrivateSubjectAccess, listStudentCourseSubjects } from "@/lib/student-courses";

/**
 * What the floating NanoAI bubble needs before it can render the chat — the
 * same profile fields and save-to-notes subjects /app/chat reads on the server.
 * Fetched once, the first time the bubble is opened, not on every page.
 * The session list is not here: the chat loads its own on mount.
 */
export async function GET(request: Request) {
  try {
    const { user, profile } = await getCurrentAuth();
    if (!user || !profile) {
      return errorJson("Unauthorized", 401);
    }

    const [courseSubjects, privateSubjects] = await Promise.all([
      listStudentCourseSubjects(user.id),
      listCreatorPrivateSubjectAccess(user.id),
    ]);

    const noteSubjectOptions = [
      ...privateSubjects.map((subject) => ({
        courseId: subject.courseId,
        courseName: "Private",
        subjectSlug: subject.subjectSlug,
        subjectName: subject.subjectName,
      })),
      ...courseSubjects.map((subject) => ({
        courseId: subject.courseId,
        courseName: subject.courseName,
        subjectSlug: subject.subjectSlug,
        subjectName: subject.subjectName,
      })),
    ];

    return privateJson(
      {
        profile: {
          languagePref: profile.languagePref,
          board: profile.board,
          grade: profile.grade,
          subjects: profile.subjects,
        },
        noteSubjectOptions,
      },
      { request, profile: CACHE.REVALIDATE },
    );
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Failed to load NanoAI.",
      500,
    );
  }
}
