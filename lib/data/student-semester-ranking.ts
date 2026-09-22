export type SemesterSubjectForRanking = {
  id: string;
  slug: string;
  name: string;
  code: string;
  topicCount: number | null;
  materialCount: number | null;
  readiness: number | null;
};

export function rankSemesterSubjects<T extends SemesterSubjectForRanking>(
  subjects: readonly T[],
): T[] {
  return [...subjects].sort(
    (left, right) =>
      (right.readiness ?? -1) - (left.readiness ?? -1) ||
      left.name.localeCompare(right.name),
  );
}
