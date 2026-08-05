import { submissionPercentage } from "@/lib/teacher-dashboard";

type Member = { student_id: string; joined_at: string };
type Profile = { user_id: string; full_name: string | null };
type Assignment = {
  id: string;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  max_attempts?: number;
  teacher_exam_papers: unknown;
};
type Submission = {
  id: string;
  assignment_id: string | null;
  student_id: string | null;
  student_name: string;
  source: string;
  grade: unknown;
  attempt_no?: number;
  created_at: string;
};
type ClassroomTeacher = { teacher_id: string; role: "lead" | "helper"; teachers?: unknown };
type ChatEvidence = { user_id: string; content: string };

function relation(value: unknown) {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : {};
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function buildTeacherClassroomDetail(input: {
  classroom: { id: string; subject_slug: string; subject_name: string; name: string; join_code: string; created_at: string; term_key?: string; meeting_schedule?: string; notice?: string; notice_updated_at?: string | null };
  members: Member[];
  profiles: Profile[];
  assignments: Assignment[];
  submissions: Submission[];
  classroomTeachers?: ClassroomTeacher[];
  syllabus?: unknown;
  chatEvidence?: ChatEvidence[];
}) {
  const profileNames = new Map(input.profiles.map((profile) => [profile.user_id, profile.full_name?.trim() || ""]));
  const assignmentTitles = new Map(input.assignments.map((assignment) => {
    const paperRelation = relation(assignment.teacher_exam_papers);
    const paper = relation(paperRelation.paper);
    return [assignment.id, stringValue(paper.title) || "Untitled exam"];
  }));
  const submissionsByStudent = new Map<string, Submission[]>();
  for (const submission of input.submissions) {
    if (!submission.student_id) continue;
    const current = submissionsByStudent.get(submission.student_id) || [];
    current.push(submission);
    submissionsByStudent.set(submission.student_id, current);
  }
  const latestByAssignmentStudent = new Map<string, Submission>();
  for (const submission of input.submissions) {
    if (!submission.assignment_id || !submission.student_id) continue;
    const key = `${submission.assignment_id}:${submission.student_id}`;
    const current = latestByAssignmentStudent.get(key);
    if (!current || (Number(submission.attempt_no) || 1) > (Number(current.attempt_no) || 1)) latestByAssignmentStudent.set(key, submission);
  }
  const analyticalSubmissions = Array.from(latestByAssignmentStudent.values());

  const syllabus = Array.isArray(input.syllabus) ? input.syllabus : [];
  const topicNames = syllabus.flatMap((unit) => {
    if (!unit || typeof unit !== "object") return [];
    const record = unit as Record<string, unknown>;
    return Array.isArray(record.topics) ? record.topics.flatMap((topic) => {
      if (!topic || typeof topic !== "object") return [];
      const name = stringValue((topic as Record<string, unknown>).name).trim();
      return name ? [name] : [];
    }) : [];
  });
  const topicStats = new Map<string, { score: number; marks: number; testedStudents: Set<string>; askedStudents: Set<string> }>();
  const studentTopicStats = new Map<string, Map<string, { score: number; marks: number }>>();
  const ensureTopic = (name: string) => {
    const clean = name.trim() || "Uncategorized";
    const current = topicStats.get(clean) || { score: 0, marks: 0, testedStudents: new Set<string>(), askedStudents: new Set<string>() };
    topicStats.set(clean, current);
    return current;
  };
  topicNames.forEach((name) => ensureTopic(name));
  const assignmentsById = new Map(input.assignments.map((assignment) => [assignment.id, assignment]));
  for (const submission of analyticalSubmissions) {
    const assignment = submission.assignment_id ? assignmentsById.get(submission.assignment_id) : null;
    if (!assignment) continue;
    const paperRelation = relation(assignment.teacher_exam_papers);
    const paper = relation(paperRelation.paper);
    const questions = Array.isArray(paper.questions) ? paper.questions.filter((question): question is Record<string, unknown> => Boolean(question && typeof question === "object")) : [];
    const questionTopics = new Map(questions.map((question) => [stringValue(question.id), stringValue(question.chapter || question.topic || question.bandLabel) || "Uncategorized"]));
    const grade = relation(submission.grade);
    const results = Array.isArray(grade.results) ? grade.results.filter((result): result is Record<string, unknown> => Boolean(result && typeof result === "object")) : [];
    for (const result of results) {
      const questionId = stringValue(result.question_id || result.id);
      const topicName = (questionTopics.get(questionId) || stringValue(result.chapter || result.topic) || "Uncategorized").trim() || "Uncategorized";
      const topic = ensureTopic(topicName);
      const score = Number(result.score) || 0;
      const marks = Number(result.marks) || Number(questions.find((question) => stringValue(question.id) === questionId)?.marks) || 0;
      topic.score += score;
      topic.marks += marks;
      if (submission.student_id) {
        topic.testedStudents.add(submission.student_id);
        const perStudent = studentTopicStats.get(submission.student_id) || new Map<string, { score: number; marks: number }>();
        const current = perStudent.get(topicName) || { score: 0, marks: 0 };
        current.score += score;
        current.marks += marks;
        perStudent.set(topicName, current);
        studentTopicStats.set(submission.student_id, perStudent);
      }
    }
  }
  for (const evidence of input.chatEvidence || []) {
    const lower = evidence.content.toLowerCase();
    topicNames.forEach((name) => { if (lower.includes(name.toLowerCase())) ensureTopic(name).askedStudents.add(evidence.user_id); });
  }

  const roster = input.members.map((member) => {
    const submissions = submissionsByStudent.get(member.student_id) || [];
    const latestSubmissions = analyticalSubmissions.filter((submission) => submission.student_id === member.student_id);
    const scores = latestSubmissions.map((submission) => submissionPercentage(submission.grade)).filter((score): score is number => score !== null);
    const averagePercent = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    return {
      studentId: member.student_id,
      name: profileNames.get(member.student_id) || submissions[0]?.student_name || "Student",
      joinedAt: member.joined_at,
      submissionCount: submissions.length,
      submissions: submissions.map((submission) => ({
        id: submission.id,
        assignmentId: submission.assignment_id,
        title: submission.assignment_id ? assignmentTitles.get(submission.assignment_id) || "Exam" : "Unassigned grading",
        source: submission.source,
        attemptNo: Math.max(1, Number(submission.attempt_no) || 1),
        percentage: submissionPercentage(submission.grade),
        createdAt: submission.created_at,
      })),
      averagePercent,
      status: averagePercent === null ? "not-started" : averagePercent < 45 ? "needs-attention" : averagePercent >= 80 ? "doing-well" : "on-track",
      topics: Array.from(topicStats.entries()).map(([name, topic]) => {
        const studentTopic = studentTopicStats.get(member.student_id)?.get(name);
        return {
        name,
        percentage: studentTopic && studentTopic.marks > 0 ? Math.round(studentTopic.score / studentTopic.marks * 100) : null,
        asked: topic.askedStudents.has(member.student_id),
        tested: Boolean(studentTopic),
      };
      }),
    };
  }).sort((a, b) => (a.averagePercent ?? -1) - (b.averagePercent ?? -1) || a.name.localeCompare(b.name));

  const exams = input.assignments.map((assignment) => {
    const paperRelation = relation(assignment.teacher_exam_papers);
    const paper = relation(paperRelation.paper);
    const submissions = analyticalSubmissions.filter((submission) => submission.assignment_id === assignment.id);
    const scores = submissions.map((submission) => submissionPercentage(submission.grade)).filter((score): score is number => score !== null);
    return {
      assignmentId: assignment.id,
      externalPaperId: stringValue(paperRelation.external_paper_id),
      title: stringValue(paper.title) || "Untitled exam",
      totalMarks: Number(paper.total_marks) || 0,
      questionCount: Array.isArray(paper.questions) ? paper.questions.length : 0,
      opensAt: assignment.opens_at,
      closesAt: assignment.closes_at,
      createdAt: assignment.created_at,
      submissionCount: submissions.length,
      maxAttempts: Math.max(1, Number(assignment.max_attempts) || 1),
      averagePercent: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    };
  });

  return {
    classroom: {
      id: input.classroom.id,
      subjectSlug: input.classroom.subject_slug,
      subjectName: input.classroom.subject_name,
      name: input.classroom.name,
      joinCode: input.classroom.join_code,
      createdAt: input.classroom.created_at,
      termKey: input.classroom.term_key || "2026",
      meetingSchedule: input.classroom.meeting_schedule || "",
      notice: input.classroom.notice || "",
      noticeUpdatedAt: input.classroom.notice_updated_at || null,
      memberCount: roster.length,
      averagePercent: roster.some((student) => student.averagePercent !== null)
        ? Math.round(roster.reduce((sum, student) => sum + (student.averagePercent || 0), 0) / roster.filter((student) => student.averagePercent !== null).length)
        : null,
    },
    roster,
    exams,
    teachers: (input.classroomTeachers || []).map((item) => {
      const teacher = relation(item.teachers);
      return { teacherId: item.teacher_id, handle: stringValue(teacher.handle) || "Teacher", role: item.role };
    }),
    topics: Array.from(topicStats.entries()).map(([name, topic]) => {
      const percentage = topic.marks > 0 ? Math.round(topic.score / topic.marks * 100) : null;
      return {
        name,
        percentage,
        testedStudentCount: topic.testedStudents.size,
        askedStudentCount: topic.askedStudents.size,
        strugglingStudents: roster.filter((student) => student.topics.some((item) => item.name === name && item.percentage !== null && item.percentage < 45)).map((student) => ({ studentId: student.studentId, name: student.name, percentage: student.topics.find((item) => item.name === name)?.percentage || 0 })),
      };
    }),
  };
}
