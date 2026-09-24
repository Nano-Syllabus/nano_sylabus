import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type { StudentChallengeDetail, StudentChallengeSummary } from "@/lib/data/student-challenges";

/** Past this the student is told their result, and the card arrives on the next load. */
const TOP_UP_BUDGET_MS = 8_000;

/**
 * The next challenge in the subject a student has just passed.
 *
 * The hub is one open card per subject. Passing one used to leave the subject
 * with only its green "Completed" row until the whole dashboard was rebuilt —
 * the hub is cache-first and reconciles once per page load — so a student who
 * finished Digital Logic's card saw no way on in Digital Logic. Loading the
 * dashboard scoped to that subject tops its queue up (the same path the Next
 * button takes), and the new card is handed back with the result so the hub
 * can show it at once.
 */
export async function nextChallengeInSubject(
  userId: string,
  challenge: Pick<StudentChallengeDetail, "id" | "courseId" | "subjectSlug">,
): Promise<StudentChallengeSummary | null> {
  if (!challenge.courseId || !challenge.subjectSlug) return null;
  const sameSubject = (item: StudentChallengeSummary) =>
    item.id !== challenge.id &&
    item.status !== "completed" &&
    item.subjectSlug.trim().toLowerCase() === challenge.subjectSlug.trim().toLowerCase();
  const topUp = getStudentChallengeDashboard(userId, 1, {
    courseId: challenge.courseId,
    subjectSlug: challenge.subjectSlug,
  }).then((dashboard) => dashboard.challenges.find(sameSubject) ?? null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TOP_UP_BUDGET_MS));
  try {
    return await Promise.race([topUp, timeout]);
  } catch (error) {
    console.warn("[challenge] next-in-subject top-up failed", error);
    return null;
  }
}
