import { listPracticeAttempts, listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PracticeTopicStatus } from "@/lib/tenant/client";
import type { StudentProfile } from "@/lib/types";

export type TodayChapter = {
  topicKey: string;
  topicTitle: string;
  subjectName: string;
  status: PracticeTopicStatus;
  percentage: number;
  /** Ranks the list: what this chapter has actually cost in marks. */
  lostWeightage: number;
  attempts: number;
};

export type TodayExam = {
  assignmentId: string;
  title: string;
  subjectName: string;
  classroomName: string;
  totalMarks: number;
  opensAt: string | null;
  closesAt: string | null;
  windowLabel: string;
  windowState: "before" | "open" | "closed";
  submitted: boolean;
  canAttempt: boolean;
};

export type StudentToday = {
  subjectCount: number;
  subjects: string[];
  examsToSit: number;
  nextExam: TodayExam | null;
  upcomingExams: TodayExam[];
  /** null until a graded sitting exists — shown as an em dash, never as 0%. */
  averagePercentage: number | null;
  publishedResultCount: number;
  chaptersStillRed: number;
  weakestChapters: TodayChapter[];
  hasMasteryData: boolean;
};

function formatWindow(opensAt: string | null, closesAt: string | null) {
  const now = Date.now();
  const opens = opensAt ? Date.parse(opensAt) : null;
  const closes = closesAt ? Date.parse(closesAt) : null;

  const stamp = (value: number) =>
    new Date(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (opens && now < opens) {
    return { windowState: "before" as const, windowLabel: `Opens ${stamp(opens)}` };
  }
  if (closes && now > closes) {
    return { windowState: "closed" as const, windowLabel: "Closed" };
  }
  if (closes) {
    return { windowState: "open" as const, windowLabel: `Closes ${stamp(closes)}` };
  }
  return { windowState: "open" as const, windowLabel: "Whenever you like" };
}

function paperTitle(paper: unknown, fallback: string) {
  if (paper && typeof paper === "object") {
    const title = (paper as Record<string, unknown>).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return fallback;
}

function paperMarks(paper: unknown) {
  if (paper && typeof paper === "object") {
    const value = (paper as Record<string, unknown>).totalMarks ?? (paper as Record<string, unknown>).total_marks;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

async function loadAssignedExams(userId: string): Promise<TodayExam[]> {
  const admin = createSupabaseAdminClient();

  const { data: memberships, error: memberError } = await admin
    .from("teacher_classroom_members")
    .select("classroom_id")
    .eq("student_id", userId);
  if (memberError) throw memberError;

  const classroomIds = (memberships ?? [])
    .map((row) => row.classroom_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!classroomIds.length) return [];

  const { data, error } = await admin
    .from("teacher_exam_assignments")
    .select(
      "id,opens_at,closes_at,created_at,max_attempts,teacher_exam_papers!inner(paper),teacher_classrooms!inner(name,subject_name)",
    )
    .in("classroom_id", classroomIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const assignmentIds = (data ?? []).map((row) => row.id);
  const { data: submissions } = assignmentIds.length
    ? await admin
        .from("teacher_exam_submissions")
        .select("assignment_id")
        .eq("student_id", userId)
        .in("assignment_id", assignmentIds)
    : { data: [] as Array<{ assignment_id: string }> };

  const attemptCounts = new Map<string, number>();
  for (const row of submissions ?? []) {
    attemptCounts.set(row.assignment_id, (attemptCounts.get(row.assignment_id) ?? 0) + 1);
  }

  return (data ?? []).map((row) => {
    const paperRow = Array.isArray(row.teacher_exam_papers)
      ? row.teacher_exam_papers[0]
      : row.teacher_exam_papers;
    const classroom = Array.isArray(row.teacher_classrooms)
      ? row.teacher_classrooms[0]
      : row.teacher_classrooms;

    const attempts = attemptCounts.get(row.id) ?? 0;
    const maxAttempts = Math.max(1, Number(row.max_attempts) || 1);
    const { windowState, windowLabel } = formatWindow(row.opens_at, row.closes_at);

    return {
      assignmentId: row.id,
      title: paperTitle(paperRow?.paper, "Exam"),
      subjectName: classroom?.subject_name || "Subject",
      classroomName: classroom?.name || "Classroom",
      totalMarks: paperMarks(paperRow?.paper),
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      windowLabel,
      windowState,
      submitted: attempts > 0,
      canAttempt: attempts < maxAttempts && windowState !== "closed",
    };
  });
}

function rankWeakest(mastery: TopicMastery[]): TodayChapter[] {
  return mastery
    .filter((topic) => topic.status === "weak" || topic.status === "developing")
    .sort((left, right) => {
      // What cost the most marks first, not simply the worst percentage.
      if (right.lostWeightage !== left.lostWeightage) {
        return right.lostWeightage - left.lostWeightage;
      }
      return left.percentage - right.percentage;
    })
    .map((topic) => ({
      topicKey: topic.topicKey,
      topicTitle: topic.topicTitle,
      subjectName: topic.subjectName,
      status: topic.status,
      percentage: topic.percentage,
      lostWeightage: topic.lostWeightage,
      attempts: topic.attempts,
    }));
}

export async function getStudentToday(
  userId: string,
  profile: StudentProfile | null,
): Promise<StudentToday> {
  const [mastery, attempts, exams] = await Promise.all([
    listTopicMastery(userId),
    listPracticeAttempts(userId),
    loadAssignedExams(userId),
  ]);

  const scored = attempts.filter((attempt) => attempt.totalMarks > 0);
  const averagePercentage = scored.length
    ? scored.reduce((total, attempt) => total + attempt.totalScore / attempt.totalMarks, 0) /
      scored.length
    : null;

  const toSit = exams.filter((exam) => exam.canAttempt && exam.windowState !== "closed");
  const weakest = rankWeakest(mastery);

  return {
    subjectCount: profile?.subjects.length ?? 0,
    subjects: profile?.subjects ?? [],
    examsToSit: toSit.length,
    nextExam: toSit[0] ?? null,
    upcomingExams: toSit.slice(1, 4),
    averagePercentage,
    publishedResultCount: scored.length,
    chaptersStillRed: mastery.filter((topic) => topic.status === "weak").length,
    weakestChapters: weakest.slice(0, 3),
    hasMasteryData: mastery.length > 0,
  };
}
