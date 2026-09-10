import type {
  StudentChallengeDetail,
  StudentChallengeSummary,
} from "@/lib/data/student-challenges";
import type { StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";

/**
 * Move the Challenge Hub's own numbers without asking the server again.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The hub used to call `router.refresh()` after every write. That is not a
 * targeted refresh: `router.refresh()` clears the **entire** client Router
 * Cache, so submitting one challenge threw away the cached payload of every
 * other tab the student had visited. Measured, one refresh took Today from a
 * 47ms in-memory read back to a 9.4s server render.
 *
 * So the write patches instead, the same way `applyChallengeCompletion` does
 * for the Daily Dashboard — these are the Challenge Hub's copy of the same
 * numbers, and both have to move for the two screens to agree.
 *
 * These are pure functions over the dashboard object. The component holds it in
 * state and replaces it with the result; nothing here touches a cache directly.
 */

/**
 * Reflect a challenge the student just passed.
 *
 * Moves, and why:
 *   - the challenge's `status`, in whichever list it is in
 *   - `todayCompletedCount` / `todayCompleted`
 *   - `passedThisWeek` / `passedThisMonth`
 *   - `currentStreak`, but ONLY when this is the day's first completion — a
 *     second challenge today does not extend a streak. `todayCompleted` is the
 *     guard, and it is read before it is overwritten.
 *
 * Deliberately NOT touched: `readiness`, `practicedTopics` and
 * `practiceScoreChange`. Those are aggregates over graded topic attempts, and
 * this client cannot know how one pass moves an average without refetching the
 * thing the patch exists to avoid. They correct themselves on the next load.
 */
export function applyChallengePassed(
  dashboard: StudentChallengeDashboard,
  challengeId: string | undefined,
): StudentChallengeDashboard {
  const firstToday = !dashboard.todayCompleted;

  const completed = challengeId
    ? dashboard.challenges.find((challenge) => challenge.id === challengeId)
    : undefined;

  return {
    ...dashboard,
    challenges: dashboard.challenges.map((challenge) =>
      challenge.id === challengeId ? { ...challenge, status: "completed" as const } : challenge,
    ),
    /**
     * A newly passed challenge belongs at the front of the completed list,
     * which is ordered most-recent-first — but only when the student is looking
     * at page 1. Prepending onto page 3 would put a row on screen that does not
     * belong to that page, and the total would then disagree with the rows.
     */
    completedChallenges:
      completed && dashboard.completedChallengePage === 1
        ? [
            { ...completed, status: "completed" as const },
            ...dashboard.completedChallenges.filter((c) => c.id !== completed.id),
          ]
        : dashboard.completedChallenges,
    completedChallengeTotal:
      completed && !dashboard.completedChallenges.some((c) => c.id === completed.id)
        ? dashboard.completedChallengeTotal + 1
        : dashboard.completedChallengeTotal,
    todayCompleted: true,
    todayCompletedCount: dashboard.todayCompletedCount + 1,
    passedThisWeek: dashboard.passedThisWeek + 1,
    passedThisMonth: dashboard.passedThisMonth + 1,
    currentStreak: firstToday ? dashboard.currentStreak + 1 : dashboard.currentStreak,
  };
}

/**
 * Sync one challenge's row from a detail object the server just returned.
 *
 * Used by the writes that change a challenge's state without completing it —
 * starting, restarting, saving a step, opening the next one. The server's row
 * is authoritative for that challenge, and no counter moves.
 */
export function applyChallengeState(
  dashboard: StudentChallengeDashboard,
  challenge: StudentChallengeDetail | StudentChallengeSummary | null | undefined,
): StudentChallengeDashboard {
  if (!challenge) return dashboard;

  const sync = (list: StudentChallengeSummary[]) => {
    let changed = false;
    const next = list.map((row) => {
      if (row.id !== challenge.id) return row;
      changed = true;
      return {
        ...row,
        status: challenge.status,
        attemptCount: challenge.attemptCount,
        lastScore: challenge.lastScore,
        lastTotalMarks: challenge.lastTotalMarks,
        lessonRead: challenge.lessonRead,
        examplesReviewed: challenge.examplesReviewed,
      };
    });
    // Keep the original array when nothing matched, so React can skip the
    // subtree instead of re-rendering a list of identical rows.
    return changed ? next : list;
  };

  return {
    ...dashboard,
    challenges: sync(dashboard.challenges),
    completedChallenges: sync(dashboard.completedChallenges),
  };
}
