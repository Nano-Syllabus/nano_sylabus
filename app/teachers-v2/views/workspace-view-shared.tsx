"use client";

import { useEffect, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { teacherUploadSizeError } from "@/lib/teacher-upload";
import {
  ApiRecord,
  Shelf,
  TeacherSubject,
  TeacherDocument,
  TeacherDashboard,
  SyllabusUnit,
  asRecord,
  text,
  numberValue,
  list,
  responsePayload,
  SkeletonBlock,
  SkeletonCard,
} from "@/app/teachers-v2/workspace-shared";

export type ClassroomTab = "students" | "exams" | "performance" | "material" | "activity" | "settings";

export type ClassroomDetail = {
  classroom: TeacherDashboard["classrooms"][number] & {
    averagePercent: number | null;
    noticeUpdatedAt: string | null;
  };
  roster: {
    studentId: string;
    name: string;
    joinedAt: string;
    submissionCount: number;
    submissions: {
      id: string;
      assignmentId: string | null;
      title: string;
      source: string;
      attemptNo: number;
      percentage: number | null;
      createdAt: string;
    }[];
    averagePercent: number | null;
    status: "not-started" | "needs-attention" | "doing-well" | "on-track";
    topics: { name: string; percentage: number | null; asked: boolean; tested: boolean }[];
  }[];
  exams: {
    assignmentId: string;
    externalPaperId: string;
    title: string;
    totalMarks: number;
    questionCount: number;
    opensAt: string | null;
    closesAt: string | null;
    createdAt: string;
    submissionCount: number;
    averagePercent: number | null;
    maxAttempts: number;
    actionRequiredCount: number;
    onPaperCount: number;
  }[];
  teachers: { teacherId: string; handle: string; role: "lead" | "helper" }[];
  chapters?: {
    name: string;
    topics: {
      id: string;
      name: string;
      after?: string[];
      percentage: number | null;
      testedStudentCount?: number;
      askedStudentCount?: number;
    }[];
  }[];
  topics: {
    name: string;
    percentage: number | null;
    testedStudentCount: number;
    askedStudentCount: number;
    strugglingStudents: { studentId: string; name: string; percentage: number }[];
  }[];
  canManage: boolean;
  activity: {
    id: string;
    eventType: string;
    summary: string;
    actorKind: string;
    actorName: string;
    metadata: ApiRecord;
    createdAt: string;
  }[];
};

export type ExamPaper = {
  id: string;
  appPaperId: string;
  title: string;
  subject: string;
  subjectSlug: string;
  totalMarks: number;
  passMarks: number;
  kind: "exam" | "class-test" | "assignment" | "quiz";
  timeLimitMinutes: number;
  attempts: number;
  shareUrl: string;
  createdAt: string;
  questions: {
    id: string;
    chapter: string;
    bandLabel: string;
    questionType: string;
    marks: number;
    text: string;
    referenceAnswer: string;
  }[];
};

export type ExamBandDraft = {
  id: string;
  label: string;
  questionType: string;
  count: number;
  marksEach: number;
};

export type ExamSubmission = {
  id: string;
  studentId: string | null;
  assignmentId: string | null;
  groupName: string;
  studentName: string;
  source: string;
  grade: ApiRecord;
  reviewStatus: "pending" | "reviewed" | "published";
  answerSheetUrl: string;
  answerSheetName: string;
  answerSheetMimeType: string;
  attemptNo: number;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionAnnotation = {
  id: string;
  type: "tick" | "cross" | "mark" | "note";
  page: number;
  x: number;
  y: number;
  value: string;
};

export type SubjectInsights = {
  readiness: ApiRecord;
  capture: ApiRecord;
  weightage: ApiRecord;
  topics: ApiRecord;
  chapters: ApiRecord;
  usage: ApiRecord;
  partialErrors: Record<string, string>;
};

export type SubjectCreationResult = {
  name: string;
  slug: string;
  jobs: { id: string; label: string }[];
  failedUploads: { name: string; shelf: Shelf; error: string }[];
};

export const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong";

export function byteSizeLabel(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileSizeLabel(file: File) {
  return byteSizeLabel(file.size);
}

export function selectedFilesTitle(files: File[], singular: string, plural: string) {
  if (!files.length) return "";
  return `${files.length} ${files.length === 1 ? singular : plural} selected`;
}

export function selectedFilesHint(files: File[]) {
  if (!files.length) return "";
  const latest = files[files.length - 1];
  const more = files.length > 1 ? ` + ${files.length - 1} more` : "";
  return `${latest.name}${more} · ${fileSizeLabel(latest)} · Tap to add more`;
}

export function uploadShelfLabel(shelf: string) {
  if (shelf === "Question Bank") return "Question bank";
  if (shelf === "Notes") return "Notes";
  if (shelf === "Syllabus") return "Syllabus";
  return "subject files";
}

export function parseSyllabusOutline(raw: string): SyllabusUnit[] {
  return raw
    .trim()
    .split(/\n\s*\n|\n(?=(?:Unit|Chapter|Module)\s*\d+)/i)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block
        .split("\n")
        .flatMap((line) => line.split(/,(?=\s*\S)/))
        .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter(Boolean);
      return {
        title:
          (lines.shift() || `Unit ${index + 1}`).replace(
            /^(Unit|Chapter|Module)\s*\d*[:.)-]?\s*/i,
            "",
          ) || `Unit ${index + 1}`,
        topics: lines.map((name) => ({ name })),
      };
    });
}

export function sourceTreeFolderPaths(tree: ApiRecord, subject: TeacherSubject, shelf: Shelf) {
  const paths = new Set<string>();
  const roots = list(tree.tree).length ? list(tree.tree) : [tree];
  const shelfRoot = `${subject.folderPath}/${shelf}`;

  function walk(node: ApiRecord, parentPath = "") {
    const name = text(node.name);
    const rawPath = text(node.path) || [parentPath, name].filter(Boolean).join("/");
    const marker = `/${shelfRoot}/`;
    const canonicalPath = rawPath.startsWith(`${shelfRoot}/`)
      ? rawPath
      : rawPath.includes(marker)
        ? rawPath.slice(rawPath.indexOf(marker) + 1)
        : rawPath;
    const childrenValue = node.children;
    const isFolder =
      Array.isArray(childrenValue) ||
      ["folder", "directory", "dir"].includes(text(node.type || node.kind).toLowerCase());
    if (isFolder && canonicalPath.startsWith(`${shelfRoot}/`)) paths.add(canonicalPath);
    list(childrenValue).forEach((child) => walk(child, rawPath));
  }

  roots.forEach((node) => walk(node));
  return Array.from(paths).sort((a, b) => a.localeCompare(b));
}

export function fallbackExamBands(): ExamBandDraft[] {
  return [
    {
      id: "suggested-2",
      label: "Very short answer (2 marks)",
      questionType: "Definition / one-liner",
      count: 10,
      marksEach: 2,
    },
    {
      id: "suggested-5",
      label: "Short answer (5 marks)",
      questionType: "Short answer",
      count: 5,
      marksEach: 5,
    },
    {
      id: "suggested-10",
      label: "Comprehensive (10 marks)",
      questionType: "Full derivation with diagram",
      count: 2,
      marksEach: 10,
    },
  ];
}

export function weightageBands(weightage: ApiRecord): ExamBandDraft[] {
  const bands = namedItems(weightage, ["bands", "suggested_bands", "distribution"]).flatMap(
    (band, index) => {
      const label = text(band.label || band.name);
      const questionType = text(band.question_type || band.type);
      const count = Math.max(0, Math.round(numberValue(band.count || band.questions)));
      const marksEach = Math.max(0.5, numberValue(band.marks_each || band.marks));
      if (!label || !questionType || !count) return [];
      return [{ id: `suggested-${index}-${marksEach}`, label, questionType, count, marksEach }];
    },
  );
  return bands.length ? bands : fallbackExamBands();
}

export function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fullDate(value: string | null) {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function normalizeClassroomDetail(payload: ApiRecord): ClassroomDetail {
  const classroom = asRecord(payload.classroom);
  return {
    classroom: {
      id: text(classroom.id),
      subjectSlug: text(classroom.subjectSlug),
      subjectName: text(classroom.subjectName),
      name: text(classroom.name),
      joinCode: text(classroom.joinCode),
      memberCount: numberValue(classroom.memberCount),
      assignmentCount: list(payload.exams).length,
      submissionCount: list(payload.roster).reduce(
        (sum, student) => sum + numberValue(student.submissionCount),
        0,
      ),
      createdAt: text(classroom.createdAt),
      averagePercent:
        classroom.averagePercent === null ? null : numberValue(classroom.averagePercent),
      termKey: text(classroom.termKey) || String(new Date().getFullYear()),
      meetingSchedule: text(classroom.meetingSchedule),
      notice: text(classroom.notice),
      noticeUpdatedAt: text(classroom.noticeUpdatedAt) || null,
      actionRequiredCount: numberValue(classroom.actionRequiredCount),
    },
    roster: list(payload.roster).flatMap((student) => {
      const studentId = text(student.studentId);
      if (!studentId) return [];
      const rawStatus = text(student.status);
      const status: ClassroomDetail["roster"][number]["status"] =
        rawStatus === "needs-attention" || rawStatus === "doing-well" || rawStatus === "on-track"
          ? rawStatus
          : "not-started";
      return [
        {
          studentId,
          name: text(student.name) || "Student",
          joinedAt: text(student.joinedAt),
          submissionCount: numberValue(student.submissionCount),
          submissions: list(student.submissions).flatMap((submission) => {
            const id = text(submission.id);
            if (!id) return [];
            return [
              {
                id,
                assignmentId: text(submission.assignmentId) || null,
                title: text(submission.title) || "Exam",
                source: text(submission.source) || "typed",
                attemptNo: Math.max(1, numberValue(submission.attemptNo) || 1),
                percentage:
                  submission.percentage === null ? null : numberValue(submission.percentage),
                createdAt: text(submission.createdAt),
              },
            ];
          }),
          averagePercent:
            student.averagePercent === null ? null : numberValue(student.averagePercent),
          status,
          topics: list(student.topics).flatMap((topic) => {
            const name = text(topic.name);
            return name
              ? [
                  {
                    name,
                    percentage: topic.percentage === null ? null : numberValue(topic.percentage),
                    asked: Boolean(topic.asked),
                    tested: Boolean(topic.tested),
                  },
                ]
              : [];
          }),
        },
      ];
    }),
    exams: list(payload.exams).flatMap((exam) => {
      const assignmentId = text(exam.assignmentId);
      if (!assignmentId) return [];
      return [
        {
          assignmentId,
          externalPaperId: text(exam.externalPaperId),
          title: text(exam.title) || "Untitled exam",
          totalMarks: numberValue(exam.totalMarks),
          questionCount: numberValue(exam.questionCount),
          opensAt: text(exam.opensAt) || null,
          closesAt: text(exam.closesAt) || null,
          createdAt: text(exam.createdAt),
          submissionCount: numberValue(exam.submissionCount),
          averagePercent: exam.averagePercent === null ? null : numberValue(exam.averagePercent),
          maxAttempts: Math.max(1, numberValue(exam.maxAttempts) || 1),
          actionRequiredCount: numberValue(exam.actionRequiredCount),
          onPaperCount: numberValue(exam.onPaperCount),
        },
      ];
    }),
    teachers: list(payload.teachers).flatMap((teacher) => {
      const teacherId = text(teacher.teacherId);
      if (!teacherId) return [];
      return [
        {
          teacherId,
          handle: text(teacher.handle) || "Teacher",
          role: text(teacher.role) === "helper" ? ("helper" as const) : ("lead" as const),
        },
      ];
    }),
    chapters: list(payload.chapters).flatMap((chapter) => {
      const name = text(chapter.name);
      const topics = list(chapter.topics).flatMap((topic) => {
        const topicName = text(topic.name);
        if (!topicName) return [];
        return [
          {
            id: text(topic.id) || topicName,
            name: topicName,
            after: list(topic.after)
              .map((item) => text(item))
              .filter(Boolean),
            percentage: topic.percentage === null ? null : numberValue(topic.percentage),
            testedStudentCount: numberValue(topic.testedStudentCount),
            askedStudentCount: numberValue(topic.askedStudentCount),
          },
        ];
      });
      return name && topics.length ? [{ name, topics }] : [];
    }),
    topics: list(payload.topics).flatMap((topic) => {
      const name = text(topic.name);
      if (!name) return [];
      return [
        {
          name,
          percentage: topic.percentage === null ? null : numberValue(topic.percentage),
          testedStudentCount: numberValue(topic.testedStudentCount),
          askedStudentCount: numberValue(topic.askedStudentCount),
          strugglingStudents: list(topic.strugglingStudents).flatMap((student) =>
            text(student.studentId)
              ? [
                  {
                    studentId: text(student.studentId),
                    name: text(student.name) || "Student",
                    percentage: numberValue(student.percentage),
                  },
                ]
              : [],
          ),
        },
      ];
    }),
    canManage: Boolean(payload.canManage),
    activity: list(payload.activity).flatMap((item) => {
      const id = text(item.id);
      return id
        ? [
            {
              id,
              eventType: text(item.eventType),
              summary: text(item.summary) || "Classroom updated",
              actorKind: text(item.actorKind),
              actorName: text(item.actorName) || "System",
              metadata: asRecord(item.metadata),
              createdAt: text(item.createdAt),
            },
          ]
        : [];
    }),
  };
}

export function normalizeExamPaper(value: unknown): ExamPaper | null {
  const paper = asRecord(value);
  const id = text(paper.id);
  if (!id) return null;
  return {
    id,
    appPaperId: text(paper.appPaperId),
    title: text(paper.title) || "Untitled exam",
    subject: text(paper.subject) || "Subject",
    subjectSlug: text(paper.subjectSlug),
    totalMarks: numberValue(paper.totalMarks),
    passMarks: numberValue(paper.passMarks),
    kind: (["exam", "class-test", "assignment", "quiz"].includes(text(paper.kind))
      ? text(paper.kind)
      : "exam") as ExamPaper["kind"],
    timeLimitMinutes: Math.max(5, numberValue(paper.timeLimitMinutes) || 60),
    attempts: Math.max(1, numberValue(paper.attempts) || 1),
    shareUrl: text(paper.shareUrl),
    createdAt: text(paper.createdAt),
    questions: list(paper.questions).flatMap((question) => {
      const questionId = text(question.id);
      if (!questionId) return [];
      return [
        {
          id: questionId,
          chapter: text(question.chapter),
          bandLabel: text(question.bandLabel),
          questionType: text(question.questionType),
          marks: numberValue(question.marks),
          text: text(question.text),
          referenceAnswer: text(question.referenceAnswer),
        },
      ];
    }),
  };
}

export function normalizeSubmission(value: unknown): ExamSubmission | null {
  const submission = asRecord(value);
  const id = text(submission.id);
  if (!id) return null;
  const status = text(submission.reviewStatus);
  return {
    id,
    studentId: text(submission.studentId) || null,
    assignmentId: text(submission.assignmentId) || null,
    groupName: text(submission.groupName) || "Unassigned grading",
    studentName: text(submission.studentName) || "Student",
    source: text(submission.source) || "typed",
    grade: asRecord(submission.grade),
    reviewStatus: status === "reviewed" || status === "published" ? status : "pending",
    answerSheetUrl: text(submission.answerSheetUrl),
    answerSheetName: text(submission.answerSheetName),
    answerSheetMimeType: text(submission.answerSheetMimeType),
    attemptNo: Math.max(1, numberValue(submission.attemptNo) || 1),
    attemptCount: Math.max(1, numberValue(submission.attemptCount) || 1),
    createdAt: text(submission.createdAt),
    updatedAt: text(submission.updatedAt),
  };
}

export async function uploadTeacherDocument(file: File, path: string) {
  const sizeError = teacherUploadSizeError(file.size);
  if (sizeError) throw new Error(sizeError);

  const prepared = await responsePayload(
    await fetch("/api/teacher/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "prepare",
        path,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    }),
  );
  const bucket = text(prepared.bucket);
  const storagePath = text(prepared.storagePath);
  const token = text(prepared.token);
  if (!bucket || !storagePath || !token) {
    throw new Error("Private upload storage was not prepared correctly.");
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(storagePath, token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw new Error(`The file could not be uploaded: ${error.message}`);

  return responsePayload(
    await fetch("/api/teacher/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "complete",
        path,
        storagePath,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    }),
  );
}

/**
 * Whether folder links work here — null until a `drive-resolve` has told us.
 *
 * It starts UNKNOWN rather than true because the hint text is read before
 * anything is pasted, and promising a folder import that this deployment cannot
 * do is worse than saying nothing about folders at all.
 */
let driveFolderSupport: boolean | null = null;

/**
 * Read and write it through functions, because the only writer that is not in
 * this file is in another module now. An imported binding is read-only, so the
 * upload dialog cannot assign to it the way it did when the whole workspace was
 * one 12,000-line file — and a silent `undefined` would be worse than the
 * compile error, since the hint would simply stop mentioning folders.
 */
export function knownDriveFolderSupport() {
  return driveFolderSupport;
}

export function rememberDriveFolderSupport(value: boolean | null) {
  driveFolderSupport = value;
}

export type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  supported: boolean;
  tooLarge: boolean;
};

/** Ask the server what a pasted Drive link points at, without importing it yet. */
export async function resolveDriveLink(link: string, path: string) {
  const payload = await responsePayload(
    await fetch("/api/teacher/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "drive-resolve", path, link }),
    }),
  );
  // Whether a FOLDER link can be read at all depends on the deployment having a
  // Drive API key: listing a folder's children is an API call, and there is no
  // credential-free way to make it. A single public file needs no key.
  driveFolderSupport = payload.folderSupport === true;
  const files = Array.isArray(payload.files) ? payload.files : [];
  return files.map((item) => {
    const record = asRecord(item);
    return {
      id: text(record.id),
      name: text(record.name),
      mimeType: text(record.mimeType),
      sizeBytes: Number(record.sizeBytes) || 0,
      supported: record.supported !== false,
      tooLarge: record.tooLarge === true,
    } satisfies DriveCandidate;
  });
}

/**
 * Hand a set of Drive files to the import queue and return immediately.
 *
 * Deliberately NOT the two-step staged flow `uploadTeacherDocument` uses. That
 * one exists because the bytes start in the creator's browser and must not pass
 * through the deployment's request-body limit; these bytes never touch the
 * browser at all — the server fetches them from Drive directly.
 *
 * And deliberately not one request per file any more. The whole folder is one
 * enqueue, the importing happens behind it, and the creator is free to close
 * the dialog the moment this resolves.
 */
export async function enqueueDriveImports(files: DriveCandidate[], path: string, link: string) {
  const payload = await responsePayload(
    await fetch("/api/teacher/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "drive-enqueue",
        path,
        link,
        files: files.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        })),
      }),
    }),
  );
  return Number(payload.queuedCount) || 0;
}

export function Dialog({
  title,
  onClose,
  closeDisabled = false,
  children,
}: {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        disabled={closeDisabled}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-dialog-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-bg-primary shadow-xl"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg-primary px-5 py-4">
          <h2 id="teacher-dialog-title" className="font-display text-xl font-semibold">
            {title}
          </h2>
          <span className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={closeDisabled}
            autoFocus
          >
            Close
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

export function StatusChip({ status }: { status: TeacherDocument["status"] }) {
  // "Indexed", not "Ready": the number beside it counts indexed sections, and the
  // state a creator is waiting to see is the one the rest of this screen calls
  // indexing.
  const label =
    status === "ready"
      ? "Indexed"
      : status === "processing"
        ? "Indexing"
        : status === "unindexed"
          ? "Not indexed"
          : "Needs attention";
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium",
        status === "ready" && "border-success/30 text-success",
        status === "processing" && "border-warning/30 text-warning",
        status === "unindexed" && "border-border-strong text-text-secondary",
        status === "error" && "border-destructive/30 text-destructive",
      )}
    >
      {label}
    </span>
  );
}

export function ClassroomDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading classroom">
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-56 max-w-full" />
        <SkeletonBlock className="h-3 w-72 max-w-full" />
        <SkeletonBlock className="h-10 w-64 max-w-full" />
        <SkeletonBlock className="h-4 w-48 max-w-full" />
      </div>
      <SkeletonBlock className="mt-8 h-32 rounded-xl" />
      <div className="mt-8 flex gap-6 border-b border-border pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-5 w-24" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <SkeletonBlock className="h-12 w-full max-w-xl" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full" />
      </div>
      <div className="mt-5 rounded-lg border border-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
          >
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-3 w-56 max-w-full" />
            </div>
            <SkeletonBlock className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubmissionsSkeleton() {
  return (
    <div className="mt-6 space-y-4" role="status" aria-label="Loading submissions">
      {Array.from({ length: 3 }).map((_, index) => (
        <SkeletonCard key={index} lines={4} />
      ))}
    </div>
  );
}

export function EmptyClassrooms({ onClassrooms }: { onClassrooms: () => void }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
      <h3 className="font-display text-xl font-semibold">No classrooms yet</h3>
      <p className="mt-2 text-sm text-text-secondary">
        Start one, then share its join code with students.
      </p>
      <Button className="mt-5" variant="outline" onClick={onClassrooms}>
        Open classrooms
      </Button>
    </div>
  );
}

export function humanizedExamWindowChip(
  opensAt: string | null,
  closesAt: string | null,
): { label: string; badgeClass: string } {
  const now = Date.now();
  if (opensAt && new Date(opensAt).getTime() > now) {
    const openTime = new Date(opensAt).getTime();
    const diffHours = Math.round((openTime - now) / 3600000);
    const label =
      diffHours > 24 ? `Opens ${new Date(opensAt).toLocaleDateString()}` : `Opens in ${diffHours}h`;
    return { label, badgeClass: "border-warning/40 text-warning bg-warning/10" };
  }
  if (closesAt) {
    const closeTime = new Date(closesAt).getTime();
    if (closeTime < now) {
      return { label: "Closed", badgeClass: "border-border text-text-muted bg-bg-tertiary" };
    }
    const diffHours = Math.round((closeTime - now) / 3600000);
    if (diffHours <= 24) {
      return {
        label: `Closes today (${diffHours}h left)`,
        badgeClass: "border-destructive/40 text-destructive bg-destructive/10",
      };
    }
    const diffDays = Math.ceil(diffHours / 24);
    return {
      label: `Closes in ${diffDays}d`,
      badgeClass: "border-success/40 text-success bg-success/10",
    };
  }
  return { label: "Open anytime", badgeClass: "border-success/40 text-success bg-success/10" };
}

export function masteryLabelAndColor(percentage: number | null): {
  label: string;
  color: string;
  bgDot: string;
} {
  if (percentage === null || percentage === undefined) {
    return { label: "Not tested", color: "text-text-muted", bgDot: "bg-text-muted/40" };
  }
  if (percentage < 40) {
    return { label: "Needs practice", color: "text-destructive", bgDot: "bg-destructive" };
  }
  if (percentage < 70) {
    return { label: "Getting there", color: "text-warning", bgDot: "bg-warning" };
  }
  return { label: "Solid", color: "text-success", bgDot: "bg-success" };
}

export function namedItems(value: ApiRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(value[key])) return list(value[key]);
  }
  return [];
}

export function insightName(value: ApiRecord) {
  return (
    text(value.title) ||
    text(value.name) ||
    text(value.label) ||
    text(value.chapter) ||
    text(value.topic)
  );
}
