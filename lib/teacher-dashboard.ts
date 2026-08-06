import { submissionReviewStatus } from "@/lib/teacher-submission-review";

export type TeacherDashboardClassroomRow = {
  id: string;
  subject_slug: string;
  subject_name: string;
  name: string;
  join_code: string;
  created_at: string;
  term_key?: string;
  meeting_schedule?: string;
  notice?: string;
};

export type TeacherDashboardMemberRow = {
  classroom_id: string;
  student_id: string;
};

export type TeacherDashboardAssignmentRow = {
  id: string;
  classroom_id: string;
};

export type TeacherDashboardSubmissionRow = {
  id: string;
  assignment_id: string | null;
  student_id: string | null;
  student_name: string;
  grade: unknown;
  created_at: string;
};

export type TeacherDashboardProfileRow = {
  user_id: string;
  full_name: string | null;
};

type DashboardInput = {
  classrooms: TeacherDashboardClassroomRow[];
  members: TeacherDashboardMemberRow[];
  assignments: TeacherDashboardAssignmentRow[];
  submissions: TeacherDashboardSubmissionRow[];
  profiles: TeacherDashboardProfileRow[];
  paperCount: number;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function submissionPercentage(grade: unknown) {
  if (!grade || typeof grade !== "object") return null;
  const record = grade as Record<string, unknown>;
  const totalScore = finiteNumber(record.total_score ?? record.score ?? record.earned_marks);
  const totalMarks = finiteNumber(record.total_marks ?? record.out_of ?? record.max_marks);
  if (totalScore === null || totalMarks === null || totalMarks <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((totalScore / totalMarks) * 100)));
}

export function buildTeacherDashboard(input: DashboardInput) {
  const assignmentClassroom = new Map(
    input.assignments.map((assignment) => [assignment.id, assignment.classroom_id]),
  );
  const classroomMemberCounts = new Map<string, number>();
  const uniqueStudentIds = new Set<string>();
  for (const member of input.members) {
    classroomMemberCounts.set(
      member.classroom_id,
      (classroomMemberCounts.get(member.classroom_id) || 0) + 1,
    );
    uniqueStudentIds.add(member.student_id);
  }

  const classroomSubmissionCounts = new Map<string, number>();
  const classroomActionRequiredCounts = new Map<string, number>();
  for (const submission of input.submissions) {
    if (!submission.assignment_id) continue;
    const classroomId = assignmentClassroom.get(submission.assignment_id);
    if (!classroomId) continue;
    classroomSubmissionCounts.set(
      classroomId,
      (classroomSubmissionCounts.get(classroomId) || 0) + 1,
    );
    if (submissionReviewStatus(submission.grade) !== "published") {
      classroomActionRequiredCounts.set(
        classroomId,
        (classroomActionRequiredCounts.get(classroomId) || 0) + 1,
      );
    }
  }

  const profileNames = new Map(
    input.profiles.map((profile) => [profile.user_id, profile.full_name?.trim() || ""]),
  );
  const studentScores = new Map<
    string,
    { studentId: string | null; name: string; scores: number[]; latestAt: string }
  >();
  for (const submission of input.submissions) {
    const percentage = submissionPercentage(submission.grade);
    if (percentage === null) continue;
    const key = submission.student_id || `name:${submission.student_name}`;
    const current = studentScores.get(key) || {
      studentId: submission.student_id,
      name:
        (submission.student_id && profileNames.get(submission.student_id)) ||
        submission.student_name ||
        "Student",
      scores: [],
      latestAt: submission.created_at,
    };
    current.scores.push(percentage);
    if (submission.created_at > current.latestAt) current.latestAt = submission.created_at;
    studentScores.set(key, current);
  }

  const needsAttention = Array.from(studentScores.values())
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      averagePercent: Math.round(
        student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length,
      ),
      submissionCount: student.scores.length,
      latestAt: student.latestAt,
    }))
    .filter((student) => student.averagePercent < 70)
    .sort((a, b) => a.averagePercent - b.averagePercent || b.latestAt.localeCompare(a.latestAt))
    .slice(0, 10);

  return {
    summary: {
      classroomCount: input.classrooms.length,
      studentCount: uniqueStudentIds.size,
      paperCount: input.paperCount,
      submissionCount: input.submissions.length,
      actionRequiredCount: input.submissions.filter(
        (submission) => submissionReviewStatus(submission.grade) !== "published",
      ).length,
      needsAttentionCount: needsAttention.length,
    },
    classrooms: input.classrooms.map((classroom) => ({
      id: classroom.id,
      subjectSlug: classroom.subject_slug,
      subjectName: classroom.subject_name,
      name: classroom.name,
      joinCode: classroom.join_code,
      memberCount: classroomMemberCounts.get(classroom.id) || 0,
      assignmentCount: input.assignments.filter(
        (assignment) => assignment.classroom_id === classroom.id,
      ).length,
      submissionCount: classroomSubmissionCounts.get(classroom.id) || 0,
      actionRequiredCount: classroomActionRequiredCounts.get(classroom.id) || 0,
      createdAt: classroom.created_at,
      termKey: classroom.term_key || "2026",
      meetingSchedule: classroom.meeting_schedule || "",
      notice: classroom.notice || "",
    })),
    needsAttention,
  };
}
