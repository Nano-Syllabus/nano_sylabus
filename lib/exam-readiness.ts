/** Each subject contributes equally, including subjects with no completed topics. */
export function calculateExamReadiness(subjects: readonly { completedTopics: number; totalTopics: number }[]) {
  if (!subjects.length) return 0;
  return subjects.reduce((sum, subject) => {
    const total = Number.isFinite(subject.totalTopics) ? Math.max(0, subject.totalTopics) : 0;
    const completed = Number.isFinite(subject.completedTopics) ? Math.max(0, subject.completedTopics) : 0;
    return sum + (total > 0 ? Math.min(completed, total) / total * 100 : 0);
  }, 0) / subjects.length;
}
