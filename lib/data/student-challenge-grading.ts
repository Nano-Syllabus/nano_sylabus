import type { StudentChallengeDetail } from "@/lib/data/student-challenges";
import {
  recordStudentChallengeGrade,
  refreshStudentChallengeExam,
} from "@/lib/data/student-challenges";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createPracticeAttemptHistory } from "@/lib/practice-history";
import type { StudentExam } from "@/lib/practice-sitting";
import type { TeacherChallengeGradeResponse } from "@/lib/teacher-app/client";

export async function persistStudentChallengeGrade(input: {
  userId: string;
  studentName: string;
  challengeId: string;
  challenge: StudentChallengeDetail;
  externalPaperId: string;
  graded: TeacherChallengeGradeResponse;
  answers?: Array<{ questionId: string; answerText: string }>;
}) {
  const { challenge, graded } = input;
  if (!challenge.content) throw new Error("Challenge content is missing.");
  if (!graded.graded) throw new Error("Grading is temporarily unavailable. Try again.");
  if (!graded.evaluation) throw new Error("The challenge grader returned marks without a topic evaluation.");
  const answers = input.answers || graded.results.map((result) => ({
    questionId: result.question_id,
    answerText: result.student_answer || "[Handwritten answer]",
  }));
  const exam: StudentExam = {
    id: input.externalPaperId,
    subject: challenge.subjectName,
    title: challenge.title,
    kind: "challenge",
    counts: true,
    marks: graded.total_marks,
    passMarks: challenge.passMarks,
    minutes: challenge.durationMinutes,
    attempts: null,
    window: "practice",
    windowLabel: "Daily challenge",
    questions: challenge.content.examQuestions.map((question) => ({
      id: question.id,
      type: "short",
      questionType: question.questionType,
      marks: question.marks,
      topic: question.topic || challenge.topicTitle,
      prompt: question.question,
    })),
  };
  const attemptId = await recordPracticeEvaluation({
    userId: input.userId,
    courseId: challenge.courseId,
    subjectSlug: challenge.subjectSlug,
    subjectName: challenge.subjectName,
    source: "challenge",
    sessionId: input.externalPaperId,
    totalScore: graded.total_score,
    totalMarks: graded.total_marks,
    passed: graded.passed,
    passMarks: challenge.passMarks,
    evaluation: graded.evaluation,
    history: createPracticeAttemptHistory({
      exam,
      results: graded.results,
      answers,
      studentName: input.studentName,
    }),
  });
  let updated = await recordStudentChallengeGrade({
    userId: input.userId,
    challengeId: input.challengeId,
    attemptId,
    score: graded.total_score,
    totalMarks: graded.total_marks,
    passed: graded.passed,
  });
  if (!updated) throw new Error("The grade was saved, but the challenge could not be updated.");
  if (!graded.passed) {
    try { updated = (await refreshStudentChallengeExam(input.userId, input.challengeId)) ?? updated; } catch {}
  }
  return updated;
}
