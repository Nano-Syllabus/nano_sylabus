"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { CommunityStudySpaceClient } from "@/components/community-study-space-client";
import { CommunityTopicExtractionControl } from "@/components/community-topic-extraction-control";
import { TeacherCoursesClient } from "@/components/teacher-courses-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  aheadOfCount,
  gradeTopicEvaluation,
  scoreDistribution,
} from "@/lib/teacher-score-insights";
import {
  isTeacherSyllabusFileSupported,
  TEACHER_SYLLABUS_FILE_ACCEPT,
  TEACHER_UPLOAD_MAX_LABEL,
  teacherUploadSizeError,
} from "@/lib/teacher-upload";
import { teacherLegacySubjectHref, teacherSubjectsHref } from "@/lib/teacher-subject-navigation";
import { CommunityDeleteControl } from "@/components/community-delete-control";
import { subjectAccessLabel, type SubjectCommunity } from "@/lib/teacher-subject-access";
import type { CommunityDetail } from "@/lib/communities";
import type { CommunitySubjectWorkspace } from "@/lib/data/community-subjects";
import { cn, titleCase } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";

type ApiRecord = Record<string, unknown>;
type WorkspaceState = "loading" | "ready" | "error";
type RecoveryState = "idle" | "recovering" | "missing" | "recreating";
type DashboardState = "loading" | "ready" | "error";
type MainView =
  | "today"
  | "communities"
  | "subjects"
  | "courses"
  | "classrooms"
  | "exams"
  | "settings";
type SubjectTab =
  | "overview"
  | "syllabus"
  | "material"
  | "bank"
  | "source-search"
  | "test-chat"
  | "config";
type ClassroomTab = "students" | "exams" | "performance" | "material" | "activity" | "settings";
type Shelf = "Syllabus" | "Notes" | "Question Bank";

type TeacherSubject = {
  slug: string;
  name: string;
  folderPath: string;
  code: string;
  university: string;
  programme: string;
  visibility: "public" | "private";
  communities: SubjectCommunity[];
};

type TeacherDocument = {
  id: string;
  name: string;
  path: string;
  shelf: Shelf | "Other";
  sizeBytes: number;
  status: "ready" | "processing" | "error";
  chunks: number;
  previewAvailable: boolean;
};

type Workspace = {
  teacher: {
    handle: string;
    email: string;
    fullName: string;
    language: "EN" | "RN";
    answerStyle: "concise" | "exam_focused";
    publicProfile: {
      headline: string;
      bio: string;
      institution: string;
      location: string;
      expertise: string[];
      yearsExperience: number;
      website: string;
      avatarUrl: string;
      complete: boolean;
    };
  };
  collection: ApiRecord;
  subjects: TeacherSubject[];
  documents: TeacherDocument[];
  sourceTree: ApiRecord;
};

type TeacherDashboard = {
  summary: {
    classroomCount: number;
    studentCount: number;
    paperCount: number;
    submissionCount: number;
    actionRequiredCount: number;
    needsAttentionCount: number;
  };
  classrooms: {
    id: string;
    subjectSlug: string;
    subjectName: string;
    name: string;
    joinCode: string;
    memberCount: number;
    assignmentCount: number;
    submissionCount: number;
    actionRequiredCount: number;
    createdAt: string;
    termKey: string;
    meetingSchedule: string;
    notice: string;
  }[];
  needsAttention: {
    studentId: string | null;
    name: string;
    averagePercent: number;
    submissionCount: number;
    latestAt: string;
  }[];
  managedCommunities: {
    id: string;
    slug: string;
    name: string;
    university: string;
    faculty: string;
    totalYears: number;
    totalSemesters: number;
    memberCount: number;
    subjectCount: number;
    createdAt: string;
  }[];
  communityWorkspace: CommunityDetail | null;
  communitySubjectWorkspace: CommunitySubjectWorkspace | null;
  communityAdmin: {
    id: string;
    slug: string;
    name: string;
    university: string;
    faculty: string;
    totalYears: number;
    totalSemesters: number;
    contributionThreshold: number;
    memberCount: number;
    subjectCount: number;
    filledSemesterCount: number;
    pendingResourceCount: number;
    mergedResourceCount: number;
    discussionCount: number;
    recentMembers: {
      userId: string;
      name: string;
      role: string;
      joinedAt: string;
    }[];
  } | null;
};

type ClassroomDetail = {
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

type ExamPaper = {
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

type ExamBandDraft = {
  id: string;
  label: string;
  questionType: string;
  count: number;
  marksEach: number;
};

type ExamSubmission = {
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

type SubmissionAnnotation = {
  id: string;
  type: "tick" | "cross" | "mark" | "note";
  page: number;
  x: number;
  y: number;
  value: string;
};

type SyllabusUnit = { title: string; topics: { name: string }[] };
type SyllabusState = {
  state: "idle" | "loading" | "ready" | "error";
  structure: SyllabusUnit[];
  updatedAt: string | null;
  error: string;
};

type SubjectInsights = {
  readiness: ApiRecord;
  capture: ApiRecord;
  weightage: ApiRecord;
  topics: ApiRecord;
  chapters: ApiRecord;
  usage: ApiRecord;
  partialErrors: Record<string, string>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { name: string; where: string }[];
};

type DialogState =
  | {
      type: "create-subject";
      returnTo?: "create-classroom" | "exams";
      communityReturnTo?: string;
      communityAttach?: {
        slug: string;
        termId: string;
        university: string;
        programme: string;
      };
    }
  | { type: "create-classroom"; subjectSlug?: string }
  | { type: "upload"; shelf: Shelf }
  | { type: "create-folder"; shelf: Shelf }
  | { type: "document"; document: TeacherDocument }
  | { type: "collection-overview" }
  | null;

type SubjectCreationResult = {
  name: string;
  slug: string;
  jobs: { id: string; label: string }[];
  failedUploads: { name: string; shelf: Shelf; error: string }[];
};

const interactive =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong";

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" ? (value as ApiRecord) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeCommunityReturnTo(value: string | null) {
  if (!value || !value.startsWith("/app/communities/") || value.startsWith("//")) return "";
  try {
    const url = new URL(value, "http://nanosyllabus.local");
    if (url.origin !== "http://nanosyllabus.local") return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function fileSizeLabel(file: File) {
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedFilesTitle(files: File[], singular: string, plural: string) {
  if (!files.length) return "";
  return `${files.length} ${files.length === 1 ? singular : plural} selected`;
}

function selectedFilesHint(files: File[]) {
  if (!files.length) return "";
  const latest = files[files.length - 1];
  const more = files.length > 1 ? ` + ${files.length - 1} more` : "";
  return `${latest.name}${more} · ${fileSizeLabel(latest)} · Tap to add more`;
}

function uploadShelfLabel(shelf: string) {
  if (shelf === "Question Bank") return "Question bank";
  if (shelf === "Notes") return "Notes";
  if (shelf === "Syllabus") return "Syllabus";
  return "subject files";
}

function parseSyllabusOutline(raw: string): SyllabusUnit[] {
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

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function list(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function sourceTreeFolderPaths(tree: ApiRecord, subject: TeacherSubject, shelf: Shelf) {
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

function indexingJobState(payload: ApiRecord): "pending" | "complete" | "error" {
  const job = asRecord(payload.job);
  const status = text(
    job.status || job.state || job.job_status || payload.status || payload.state,
  ).toLowerCase();
  if (
    ["completed", "complete", "success", "succeeded", "done", "finished", "indexed"].includes(
      status,
    )
  )
    return "complete";
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "error";
  return "pending";
}

function fallbackExamBands(): ExamBandDraft[] {
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

function weightageBands(weightage: ApiRecord): ExamBandDraft[] {
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

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fullDate(value: string | null) {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function normalizeWorkspace(payload: ApiRecord): Workspace {
  const subjectsPayload = asRecord(payload.subjects);
  const remoteSubjects = (
    Array.isArray(payload.subjects) ? payload.subjects : list(subjectsPayload.subjects)
  ).map(asRecord);
  const subjects: TeacherSubject[] = list(payload.subjectProfiles).flatMap((profile) => {
    const slug = text(profile.subject_slug);
    const name = text(profile.subject_name);
    if (!slug || !name) return [];
    const remote =
      remoteSubjects.find((subject) => text(subject.slug) === slug) ||
      remoteSubjects.find(
        (subject) =>
          text(subject.folder_path) === text(profile.folder_path) ||
          text(subject.name).toLowerCase() === name.toLowerCase(),
      ) ||
      {};
    return [
      {
        slug,
        name,
        folderPath: text(profile.folder_path) || text(remote.folder_path) || name,
        code: text(profile.subject_code),
        university: text(profile.university),
        programme: text(profile.programme),
        // Library storage visibility is separate from community member access.
        visibility: profile.visibility === "public" ? "public" : "private",
        communities: list(profile.communities).flatMap((community) => {
          const slug = text(community.slug);
          const name = text(community.name);
          return slug && name ? [{ slug, name }] : [];
        }),
      },
    ];
  });
  const rawDocuments = Array.isArray(payload.documents)
    ? list(payload.documents)
    : list(asRecord(payload.documents).documents);

  const previewPaths = new Set(
    Array.isArray(payload.previewPaths)
      ? payload.previewPaths.filter((item): item is string => typeof item === "string")
      : [],
  );
  const documents = rawDocuments.flatMap((document) => {
    const path = text(document.path) || text(document.source_path) || text(document.source_file);
    const id = text(document.document_id) || text(document.id);
    if (!path || !id) return [];
    const subject = subjects.find(
      (item) => path === item.folderPath || path.startsWith(`${item.folderPath}/`),
    );
    const relativePath = subject ? path.slice(subject.folderPath.length).replace(/^\//, "") : path;
    const shelfName = relativePath.split("/")[0];
    const shelf: TeacherDocument["shelf"] =
      shelfName === "Syllabus" || shelfName === "Notes" || shelfName === "Question Bank"
        ? shelfName
        : "Other";
    const rawStatus = text(document.status).toLowerCase();
    const status: TeacherDocument["status"] =
      document.indexed ||
      ["ready", "indexed", "complete", "completed", "success"].includes(rawStatus)
        ? "ready"
        : ["failed", "error", "cancelled", "canceled"].includes(rawStatus)
          ? "error"
          : "processing";
    return [
      {
        id,
        name:
          text(document.name) ||
          text(document.filename) ||
          path.split("/").pop() ||
          "Untitled document",
        path,
        shelf,
        sizeBytes: numberValue(document.size_bytes || document.size),
        status,
        chunks: numberValue(document.chunk_count || document.chunks_indexed || document.chunks),
        previewAvailable: previewPaths.has(path) || previewPaths.has(id),
      },
    ];
  });

  return {
    teacher: {
      handle: text(asRecord(payload.teacher).handle) || "teacher",
      email: text(asRecord(payload.teacher).email),
      fullName:
        text(asRecord(payload.teacher).fullName) ||
        text(asRecord(payload.teacher).handle) ||
        "Teacher",
      language: text(asRecord(payload.teacher).language) === "RN" ? "RN" : "EN",
      answerStyle:
        text(asRecord(payload.teacher).answerStyle) === "concise" ? "concise" : "exam_focused",
      publicProfile: {
        headline: text(asRecord(asRecord(payload.teacher).publicProfile).headline),
        bio: text(asRecord(asRecord(payload.teacher).publicProfile).bio),
        institution: text(asRecord(asRecord(payload.teacher).publicProfile).institution),
        location: text(asRecord(asRecord(payload.teacher).publicProfile).location),
        expertise: stringList(asRecord(asRecord(payload.teacher).publicProfile).expertise),
        yearsExperience: numberValue(
          asRecord(asRecord(payload.teacher).publicProfile).yearsExperience,
        ),
        website: text(asRecord(asRecord(payload.teacher).publicProfile).website),
        avatarUrl: text(asRecord(asRecord(payload.teacher).publicProfile).avatarUrl),
        complete: Boolean(asRecord(asRecord(payload.teacher).publicProfile).complete),
      },
    },
    collection: asRecord(payload.collection),
    subjects,
    documents,
    sourceTree: asRecord(payload.sourceTree),
  };
}

function normalizeDashboard(payload: ApiRecord): TeacherDashboard {
  const summary = asRecord(payload.summary);
  const community = asRecord(payload.communityAdmin);
  const communityId = text(community.id);
  return {
    summary: {
      classroomCount: numberValue(summary.classroomCount),
      studentCount: numberValue(summary.studentCount),
      paperCount: numberValue(summary.paperCount),
      submissionCount: numberValue(summary.submissionCount),
      actionRequiredCount: numberValue(summary.actionRequiredCount),
      needsAttentionCount: numberValue(summary.needsAttentionCount),
    },
    classrooms: list(payload.classrooms).flatMap((classroom) => {
      const id = text(classroom.id);
      if (!id) return [];
      return [
        {
          id,
          subjectSlug: text(classroom.subjectSlug),
          subjectName: text(classroom.subjectName) || "Subject",
          name: text(classroom.name) || "Classroom",
          joinCode: text(classroom.joinCode),
          memberCount: numberValue(classroom.memberCount),
          assignmentCount: numberValue(classroom.assignmentCount),
          submissionCount: numberValue(classroom.submissionCount),
          actionRequiredCount: numberValue(classroom.actionRequiredCount),
          createdAt: text(classroom.createdAt),
          termKey: text(classroom.termKey) || String(new Date().getFullYear()),
          meetingSchedule: text(classroom.meetingSchedule),
          notice: text(classroom.notice),
        },
      ];
    }),
    needsAttention: list(payload.needsAttention).flatMap((student) => {
      const name = text(student.name);
      if (!name) return [];
      return [
        {
          studentId: text(student.studentId) || null,
          name,
          averagePercent: numberValue(student.averagePercent),
          submissionCount: numberValue(student.submissionCount),
          latestAt: text(student.latestAt),
        },
      ];
    }),
    managedCommunities: list(payload.managedCommunities).flatMap((community) => {
      const id = text(community.id);
      const slug = text(community.slug);
      if (!id || !slug) return [];
      return [
        {
          id,
          slug,
          name: text(community.name) || "Community",
          university: text(community.university),
          faculty: text(community.faculty),
          totalYears: numberValue(community.totalYears),
          totalSemesters: numberValue(community.totalSemesters),
          memberCount: numberValue(community.memberCount),
          subjectCount: numberValue(community.subjectCount),
          createdAt: text(community.createdAt),
        },
      ];
    }),
    communityWorkspace:
      payload.communityWorkspace && typeof payload.communityWorkspace === "object"
        ? (payload.communityWorkspace as CommunityDetail)
        : null,
    communitySubjectWorkspace:
      payload.communitySubjectWorkspace && typeof payload.communitySubjectWorkspace === "object"
        ? (payload.communitySubjectWorkspace as CommunitySubjectWorkspace)
        : null,
    communityAdmin: communityId
      ? {
          id: communityId,
          slug: text(community.slug),
          name: text(community.name) || "Community",
          university: text(community.university),
          faculty: text(community.faculty),
          totalYears: numberValue(community.totalYears),
          totalSemesters: numberValue(community.totalSemesters),
          contributionThreshold: numberValue(community.contributionThreshold) || 10,
          memberCount: numberValue(community.memberCount),
          subjectCount: numberValue(community.subjectCount),
          filledSemesterCount: numberValue(community.filledSemesterCount),
          pendingResourceCount: numberValue(community.pendingResourceCount),
          mergedResourceCount: numberValue(community.mergedResourceCount),
          discussionCount: numberValue(community.discussionCount),
          recentMembers: list(community.recentMembers).flatMap((member) => {
            const userId = text(member.userId);
            if (!userId) return [];
            return [
              {
                userId,
                name: text(member.name) || "Community member",
                role: text(member.role) || "member",
                joinedAt: text(member.joinedAt),
              },
            ];
          }),
        }
      : null,
  };
}

function normalizeClassroomDetail(payload: ApiRecord): ClassroomDetail {
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

function normalizeExamPaper(value: unknown): ExamPaper | null {
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

function normalizeSubmission(value: unknown): ExamSubmission | null {
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

async function responsePayload(response: Response) {
  const raw = await response.text();
  let payload: ApiRecord = {};
  const contentType = response.headers.get("content-type") || "";
  try {
    payload = raw && contentType.includes("application/json") ? (JSON.parse(raw) as ApiRecord) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const plainError = raw.trim();
    const isHtmlError =
      contentType.includes("text/html") ||
      /^<!doctype html/i.test(plainError) ||
      /<html[\s>]/i.test(plainError);
    const fallback =
      response.status === 413
        ? `This file is too large. Upload a file up to ${TEACHER_UPLOAD_MAX_LABEL}.`
        : isHtmlError
          ? `The request could not be completed (${response.status}).`
          : plainError || `The request could not be completed (${response.status}).`;
    throw new Error(text(payload.error) || fallback);
  }
  return payload;
}

async function uploadTeacherDocument(file: File, path: string) {
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

function Dialog({
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

function StatusChip({ status }: { status: TeacherDocument["status"] }) {
  const label =
    status === "ready" ? "Ready" : status === "processing" ? "Indexing" : "Needs attention";
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium",
        status === "ready" && "border-success/30 text-success",
        status === "processing" && "border-warning/30 text-warning",
        status === "error" && "border-destructive/30 text-destructive",
      )}
    >
      {label}
    </span>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse-soft rounded-lg bg-bg-tertiary motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border p-5", className)} aria-hidden="true">
      <div className="flex items-start gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-5 w-3/4" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div
      className="grid min-h-screen lg:grid-cols-[280px_1fr]"
      role="status"
      aria-label="Loading creator workspace"
    >
      <aside className="hidden border-r border-border p-6 lg:block">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-11 w-11 rounded-full" />
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
        </div>
        <div className="mt-16 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12" />
          ))}
        </div>
      </aside>
      <main className="p-5 md:p-8">
        <div className="mb-8 rounded-xl border border-border bg-bg-primary p-5">
          <p className="font-mono-ui text-xs uppercase tracking-[0.28em] text-text-muted">
            Creator workspace
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Loading your workspace…
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Fetching your subjects, courses, exams, and material.
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <SkeletonBlock className="h-3 w-32" />
            <SkeletonBlock className="h-10 w-72 max-w-full" />
            <SkeletonBlock className="h-4 w-56 max-w-full" />
          </div>
          <SkeletonBlock className="hidden h-12 w-44 sm:block" />
        </div>
        <SkeletonBlock className="mt-8 h-36 rounded-xl" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} className="h-44" />
          ))}
        </div>
      </main>
    </div>
  );
}

export function TeacherWorkspaceV2({ teacherHandle }: { teacherHandle: string }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const communitySlug = searchParams.get("community") || searchParams.get("attachCommunity") || "";
  const communitySubjectSlug = searchParams.get("communitySubject") || "";
  const communityTermId = searchParams.get("term") || searchParams.get("attachTerm") || "";
  const showSubjectLibrary = searchParams.get("library") === "1";
  const dashboardKey = JSON.stringify([communitySlug]);
  const dashboardRequest = useRef(0);
  const [loadedDashboardKey, setLoadedDashboardKey] = useState("");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("loading");
  const [workspaceError, setWorkspaceError] = useState("");
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("idle");
  const [recoveryError, setRecoveryError] = useState("");
  const [recreateConfirmation, setRecreateConfirmation] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState>("loading");
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardData, setDashboard] = useState<TeacherDashboard | null>(null);
  const dashboard = loadedDashboardKey === dashboardKey ? dashboardData : null;
  const [view, setView] = useState<MainView>("communities");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [subjectTab, setSubjectTab] = useState<SubjectTab>("syllabus");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState("");
  const [syllabi, setSyllabi] = useState<Record<string, SyllabusState>>({});
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [requestedPaperId, setRequestedPaperId] = useState("");
  const [indexingJobs, setIndexingJobs] = useState<Record<string, string>>({});
  const [communityReturnTo, setCommunityReturnTo] = useState("");

  const loadWorkspace = useCallback(async () => {
    setWorkspaceState("loading");
    setWorkspaceError("");
    try {
      const response = await fetch("/api/teacher/workspace", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await responsePayload(response);
      const next = normalizeWorkspace(payload);
      setWorkspace(next);
      setSelectedSlug((current) =>
        current && next.subjects.some((subject) => subject.slug === current) ? current : "",
      );
      setWorkspaceState("ready");
      return next;
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Could not load the creator workspace.",
      );
      setWorkspaceState("error");
      return null;
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    const request = ++dashboardRequest.current;
    setDashboardState("loading");
    setDashboardError("");
    try {
      const communityParams = new URLSearchParams();
      if (communitySlug) communityParams.set("community", communitySlug);
      const communityQuery = communityParams.size ? `?${communityParams.toString()}` : "";
      const response = await fetch(`/api/teacher/dashboard${communityQuery}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await responsePayload(response);
      if (request !== dashboardRequest.current) return;
      setDashboard(normalizeDashboard(payload));
      setLoadedDashboardKey(dashboardKey);
      setDashboardState("ready");
    } catch (error) {
      if (request !== dashboardRequest.current) return;
      setDashboardError(
        error instanceof Error ? error.message : "Could not load the teacher dashboard.",
      );
      setDashboardState("error");
    }
  }, [communitySlug, dashboardKey]);

  const pollIndexingJob = useCallback(
    async (jobId: string, fileName: string) => {
      if (!jobId) return;
      setIndexingJobs((current) => ({ ...current, [jobId]: fileName }));
      let consecutiveErrors = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        try {
          const payload = await responsePayload(
            await fetch(`/api/teacher/jobs/${encodeURIComponent(jobId)}`, {
              headers: { Accept: "application/json" },
              cache: "no-store",
            }),
          );
          consecutiveErrors = 0;
          const state = indexingJobState(payload);
          if (state === "pending") continue;
          setIndexingJobs((current) => {
            const next = { ...current };
            delete next[jobId];
            return next;
          });
          await loadWorkspace();
          setToast(
            state === "complete"
              ? `${fileName} is indexed. Extract challenge topics from Create Subjects to update the community learning map.`
              : `${fileName} could not be indexed`,
          );
          return;
        } catch {
          consecutiveErrors += 1;
          if (consecutiveErrors < 4) continue;
          break;
        }
      }
      setIndexingJobs((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      await loadWorkspace();
      setToast(`${fileName} is still processing. Its status will update on the next refresh.`);
    },
    [loadWorkspace],
  );

  const recoverWorkspace = useCallback(
    async (recreate = false) => {
      setRecoveryState(recreate ? "recreating" : "recovering");
      setRecoveryError("");
      try {
        const response = await fetch("/api/teacher/recover", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(
            recreate ? { recreate: true, confirmation: recreateConfirmation } : {},
          ),
        });
        const payload = (await response.json()) as ApiRecord;
        if (!response.ok) {
          if (response.status === 409 && payload.missing === true) {
            setRecoveryState("missing");
            setRecoveryError(text(payload.error));
            return;
          }
          throw new Error(text(payload.error) || "Could not reconnect the creator workspace.");
        }

        setRecoveryState("idle");
        setRecreateConfirmation("");
        await Promise.all([loadWorkspace(), loadDashboard()]);
      } catch (error) {
        setRecoveryState(recreate ? "missing" : "idle");
        setRecoveryError(
          error instanceof Error ? error.message : "Could not reconnect the creator workspace.",
        );
      }
    },
    [loadDashboard, loadWorkspace, recreateConfirmation],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);
  useEffect(() => {
    void loadDashboard();
    return () => {
      dashboardRequest.current += 1;
    };
  }, [loadDashboard]);
  useEffect(() => {
    const params = new URLSearchParams(search);
    const paperId = params.get("paper") || "";
    if (paperId) {
      setRequestedPaperId(paperId);
      setView("exams");
      return;
    }

    const returnTo = safeCommunityReturnTo(params.get("returnTo"));
    setCommunityReturnTo(returnTo);
    const requestedView = params.get("view") || "communities";
    if (
      requestedView === "today" ||
      requestedView === "communities" ||
      requestedView === "subjects" ||
      requestedView === "courses" ||
      requestedView === "classrooms" ||
      requestedView === "exams" ||
      requestedView === "settings"
    ) {
      setView(requestedView);
    }
    if (params.get("community") && requestedView !== "subjects") setView("communities");
    if (params.get("view") === "subjects" || params.get("subject") || params.get("newSubject")) {
      setView("subjects");
    }
    const subjectSlug = params.get("subject") || "";
    setSelectedSlug(subjectSlug);
    const requestedTab = params.get("tab");
    if (
      requestedTab === "overview" ||
      requestedTab === "syllabus" ||
      requestedTab === "material" ||
      requestedTab === "bank" ||
      requestedTab === "source-search" ||
      requestedTab === "test-chat" ||
      requestedTab === "config"
    ) {
      setSubjectTab(requestedTab);
    }
    if (params.get("newSubject") === "1") {
      const attachCommunity = params.get("attachCommunity") || "";
      const attachTerm = params.get("attachTerm") || "";
      setDialog((current) =>
        current?.type === "create-subject" &&
        current.communityAttach?.slug === attachCommunity &&
        current.communityAttach?.termId === attachTerm
          ? current
          : {
              type: "create-subject",
              communityReturnTo: returnTo || undefined,
              communityAttach:
                attachCommunity && attachTerm
                  ? {
                      slug: attachCommunity,
                      termId: attachTerm,
                      university: "",
                      programme: "",
                    }
                  : undefined,
            },
      );
    } else {
      setDialog((current) =>
        current?.type === "create-subject" && current.communityAttach ? null : current,
      );
    }
  }, [search]);
  useEffect(() => {
    if (!communitySubjectSlug || searchParams.get("subject") || !dashboard?.communityWorkspace) {
      return;
    }
    const href = teacherLegacySubjectHref(
      dashboard.communityWorkspace,
      communitySubjectSlug,
      communityTermId,
    );
    if (href) window.history.replaceState(null, "", href);
  }, [communitySubjectSlug, communityTermId, dashboard, searchParams]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedSubject =
    workspace?.subjects.find((subject) => subject.slug === selectedSlug) || null;
  const selectedCommunitySubject = dashboard?.communityWorkspace?.canManage
    ? dashboard.communityWorkspace.terms.flatMap((term) => term.subjects)
        .find((subject) => subject.externalSubjectSlug === selectedSubject?.slug)
    : undefined;
  const subjectDocuments = useMemo(
    () =>
      selectedSubject && workspace
        ? workspace.documents.filter(
            (document) =>
              document.path === selectedSubject.folderPath ||
              document.path.startsWith(`${selectedSubject.folderPath}/`),
          )
        : [],
    [selectedSubject, workspace],
  );

  useEffect(() => {
    if (!selectedSubject || subjectTab !== "syllabus" || syllabi[selectedSubject.slug]) return;
    const slug = selectedSubject.slug;
    setSyllabi((current) => ({
      ...current,
      [slug]: { state: "loading", structure: [], updatedAt: null, error: "" },
    }));
    void fetch(`/api/teacher/subjects/${encodeURIComponent(slug)}/syllabus`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        const structure = Array.isArray(payload.structure)
          ? (payload.structure as SyllabusUnit[])
          : [];
        setSyllabi((current) => ({
          ...current,
          [slug]: {
            state: "ready",
            structure,
            updatedAt: text(payload.updatedAt) || null,
            error: "",
          },
        }));
      })
      .catch((error) => {
        setSyllabi((current) => ({
          ...current,
          [slug]: {
            state: "error",
            structure: [],
            updatedAt: null,
            error:
              error instanceof Error ? error.message : "Could not load the syllabus structure.",
          },
        }));
      });
  }, [selectedSubject, subjectTab, syllabi]);

  function navigate(next: MainView) {
    window.history.pushState(null, "", `/teachers?view=${next}`);
    setView(next);
    setSelectedSlug("");
    setDialog(null);
    if (next !== "classrooms") setSelectedClassroomId("");
  }

  function openSubject(subject: TeacherSubject) {
    window.history.pushState(
      null,
      "",
      teacherSubjectsHref({
        community: communitySlug,
        term: communityTermId,
        library: true,
        subject: subject.slug,
      }),
    );
    setView("subjects");
    setSelectedSlug(subject.slug);
    setSubjectTab("overview");
  }

  function openCommunitySubjectCreator(communityAttach: {
    slug: string;
    termId: string;
    university: string;
    programme: string;
  }) {
    window.history.pushState(
      null,
      "",
      teacherSubjectsHref({
        community: communityAttach.slug,
        term: communityAttach.termId,
        create: true,
      }),
    );
    setView("subjects");
    setSelectedSlug("");
    setSelectedClassroomId("");
    setDialog({ type: "create-subject", communityAttach });
  }

  function closeCreateSubjectDialog() {
    if (dialog?.type === "create-subject" && dialog.communityAttach) {
      window.history.replaceState(
        null,
        "",
        teacherSubjectsHref({
          community: dialog.communityAttach.slug,
          term: dialog.communityAttach.termId,
        }),
      );
    }
    setDialog(null);
  }

  if (workspaceState === "loading" && !workspace) return <WorkspaceSkeleton />;

  if (workspaceState === "error" && !workspace) {
    const isRecreating = recoveryState === "recreating";
    const isBusy = recoveryState === "recovering" || isRecreating;
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Creator workspace
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold">
          Couldn&apos;t load your workspace
        </h1>
        <p className="mt-3 leading-7 text-text-secondary">{workspaceError}</p>
        {recoveryError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {recoveryError}
          </p>
        ) : null}

        {recoveryState === "missing" ? (
          <div className="mt-6 rounded-lg border border-border-strong bg-bg-secondary p-5">
            <h2 className="font-display text-lg font-semibold">
              The old collection is not in this operator tenant
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              You can create a new empty workspace for this account. This will not restore files or
              subjects from the previous collection.
            </p>
            <label htmlFor="recreate-workspace" className="mt-4 block text-sm font-medium">
              Type RECREATE to confirm
            </label>
            <input
              id="recreate-workspace"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={recreateConfirmation}
              onChange={(event) => setRecreateConfirmation(event.target.value)}
              className={cn(
                "mt-2 h-11 w-full rounded-lg border border-border-strong bg-bg-primary px-3 text-sm",
                interactive,
              )}
              aria-describedby="recreate-workspace-help"
            />
            <p id="recreate-workspace-help" className="mt-2 text-xs text-text-muted">
              This creates a clean collection under the current operator key.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={recreateConfirmation !== "RECREATE" || isBusy}
                aria-busy={isRecreating}
                onClick={() => void recoverWorkspace(true)}
              >
                {isRecreating ? "Creating workspace…" : "Create new empty workspace"}
              </Button>
              <Button variant="outline" disabled={isBusy} onClick={() => void loadWorkspace()}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button disabled={isBusy} aria-busy={isBusy} onClick={() => void recoverWorkspace()}>
              {recoveryState === "recovering" ? "Reconnecting…" : "Reconnect workspace"}
            </Button>
            <Button variant="outline" disabled={isBusy} onClick={() => void loadWorkspace()}>
              Try again
            </Button>
          </div>
        )}
      </main>
    );
  }

  if (!workspace) return null;

  const collectionName = text(workspace.collection.collection) || `${teacherHandle}-teacher`;

  return (
    <div className="min-h-screen bg-bg-secondary text-text-primary lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-bg-primary px-[13px] pb-10 pt-[18px] lg:flex">
        <Link
          href="/"
          aria-label="Go to Nano Syllabus site"
          className="mb-3 flex items-center gap-[10px] rounded-[9px] px-2 pt-0.5 transition hover:opacity-70"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-text-primary font-display text-sm font-extrabold text-text-inverse">
            n
          </span>
          <div>
            <p className="font-display text-[17px] font-semibold tracking-[-0.035em]">
              NanoSyllabus
            </p>
          </div>
        </Link>
        <nav className="space-y-1" aria-label="Creator workspace">
          {(
            [
              ["today", "Analytics"],
              ["communities", "My Communities"],
              ["subjects", "Create Subjects"],
              ["settings", "Your Public Profile"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => navigate(value)}
              className={cn(
                "min-h-10 w-full rounded-[9px] px-[11px] text-left text-sm font-normal transition",
                interactive,
                view === value
                  ? "bg-text-primary font-medium text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <Link
            href="/"
            className={cn(
              "mb-2 flex min-h-10 w-full items-center gap-2 rounded-[9px] px-[11px] text-sm font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary",
              interactive,
            )}
          >
            <svg
              aria-hidden="true"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Site
          </Link>
          <Link
            href="/app/today"
            className={cn(
              "mb-4 flex min-h-10 w-full items-center gap-2 rounded-[9px] border border-border bg-bg-primary px-[11px] text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-bg-secondary",
              interactive,
            )}
          >
            <svg
              aria-hidden="true"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to study portal
          </Link>
          <p className="truncate text-sm font-medium">{workspace.teacher.fullName}</p>
          <p className="mt-1 truncate text-xs text-text-muted">{workspace.teacher.email}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-[53px] items-center gap-3 border-b border-border bg-bg-secondary/95 px-4 backdrop-blur md:px-[26px]">
          <div className="lg:hidden">
            <Link
              href="/"
              aria-label="Go to Nano Syllabus site"
              className="grid h-10 w-10 place-items-center rounded-full bg-text-primary font-display font-semibold text-text-inverse transition hover:opacity-80"
            >
              n
            </Link>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {dashboard?.communityAdmin
                ? `${dashboard.communityAdmin.name} Admin`
                : "Admin Portal"}
            </p>
          </div>
          <span className="flex-1" />
          {communityReturnTo ? (
            <Link
              href={communityReturnTo}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border bg-bg-primary px-3 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-bg-secondary",
                interactive,
              )}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to community
            </Link>
          ) : null}
          <ThemeToggle className="shrink-0 bg-bg-primary" />
          <Link
            href="/app/today"
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border bg-bg-primary px-3 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-bg-secondary lg:hidden",
              interactive,
            )}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="sm:hidden">Study portal</span>
            <span className="hidden sm:inline">Back to study portal</span>
          </Link>
        </header>

        <nav
          className="flex gap-2 overflow-x-auto border-b border-border p-3 lg:hidden"
          aria-label="Creator workspace mobile navigation"
        >
          {(
            [
              ["today", "Analytics"],
              ["communities", "My Communities"],
              ["subjects", "Create Subjects"],
              ["settings", "Your Public Profile"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => navigate(value)}
              className={cn(
                "min-h-10 shrink-0 rounded-full px-4 text-sm font-medium",
                interactive,
                view === value
                  ? "bg-text-primary text-text-inverse"
                  : "border border-border text-text-secondary",
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="w-full max-w-[1240px] p-4 pb-16 md:p-[26px]">
          {view === "today" ? (
            <TodayView
              teacherHandle={workspace.teacher.fullName}
              subjectCount={workspace.subjects.length}
              documentCount={workspace.documents.length}
              sectionCount={workspace.documents.reduce((acc, doc) => acc + (doc.chunks || 0), 0)}
              dashboard={dashboard}
              state={dashboardState}
              error={dashboardError}
              onSetExam={() => navigate("exams")}
              profileComplete={workspace.teacher.publicProfile.complete}
              communityAdmin={dashboard?.communityAdmin || null}
              onSubjects={() => navigate("subjects")}
              onSettings={() => navigate("settings")}
              onRetry={() => void loadDashboard()}
            />
          ) : null}
          {view === "communities" ? (
            <CommunitiesView
              dashboard={dashboard}
              state={dashboardState}
              error={dashboardError}
              onRetry={() => void loadDashboard()}
              selectedSubjectSlug={communitySubjectSlug}
              selectedTermId={communityTermId}
              onRefresh={async () => {
                await Promise.all([loadDashboard(), loadWorkspace()]);
              }}
              onCreateSubject={openCommunitySubjectCreator}
            />
          ) : null}
          {view === "courses" ? (
            <TeacherCoursesClient
              subjects={workspace.subjects}
              onCreateSubject={() => setDialog({ type: "create-subject" })}
            />
          ) : null}
          {view === "classrooms" ? (
            <ClassroomsView
              dashboard={dashboard}
              state={dashboardState}
              error={dashboardError}
              subjects={workspace.subjects}
              documents={workspace.documents}
              selectedClassroomId={selectedClassroomId}
              onSelect={setSelectedClassroomId}
              onCreate={() => setDialog({ type: "create-classroom" })}
              onExams={() => navigate("exams")}
              onSubjectMaterial={(subjectSlug) => {
                const subject = workspace.subjects.find((item) => item.slug === subjectSlug);
                if (!subject) return;
                setView("subjects");
                setSelectedSlug(subject.slug);
                setSubjectTab("material");
                setSelectedClassroomId("");
              }}
              onRetry={() => void loadDashboard()}
              onChanged={async (message) => {
                setToast(message);
                await loadDashboard();
              }}
            />
          ) : null}
          {view === "exams" ? (
            <ExamsView
              subjects={workspace.subjects}
              classrooms={dashboard?.classrooms || []}
              initialPaperId={requestedPaperId}
              onAddSubject={() => setDialog({ type: "create-subject", returnTo: "exams" })}
              onClassrooms={() => navigate("classrooms")}
              onDashboardRefresh={() => void loadDashboard()}
            />
          ) : null}
          {view === "subjects" && !selectedSubject && !showSubjectLibrary ? (
            <CommunitiesView
              subjectsMode
              dashboard={dashboard}
              state={dashboardState}
              error={dashboardError}
              onRetry={() => void loadDashboard()}
              selectedSubjectSlug={communitySubjectSlug}
              selectedTermId={communityTermId}
              onRefresh={async () => {
                await Promise.all([loadDashboard(), loadWorkspace()]);
              }}
              onCreateSubject={openCommunitySubjectCreator}
            />
          ) : null}
          {view === "subjects" && !selectedSubject && showSubjectLibrary ? (
            <>
              <Link
                href={teacherSubjectsHref({ community: communitySlug, term: communityTermId })}
                className={cn(
                  "mb-5 inline-flex min-h-10 items-center text-sm text-text-secondary hover:text-text-primary",
                  interactive,
                )}
              >
                ← Community subjects
              </Link>
              <SubjectsView
                workspace={workspace}
                onCreate={() => setDialog({ type: "create-subject" })}
                onOpen={openSubject}
                onCollectionOverview={() => setDialog({ type: "collection-overview" })}
              />
            </>
          ) : null}
          {view === "subjects" && selectedSubject ? (
            <>
            {selectedCommunitySubject && dashboard?.communityWorkspace ? (
              <div className="mb-5">
                <CommunityTopicExtractionControl
                  key={selectedCommunitySubject.id}
                  communitySlug={dashboard.communityWorkspace.slug}
                  subject={selectedCommunitySubject}
                  onExtracted={loadDashboard}
                />
              </div>
            ) : null}
            <SubjectView
              subject={selectedSubject}
              documents={subjectDocuments}
              sourceTree={workspace.sourceTree}
              tab={subjectTab}
              onTab={setSubjectTab}
              onBack={() => {
                setSelectedSlug("");
                window.history.pushState(
                  null,
                  "",
                  teacherSubjectsHref({
                    community: communitySlug,
                    term: communityTermId,
                    library: showSubjectLibrary || !communitySlug,
                  }),
                );
              }}
              onUpload={(shelf) => setDialog({ type: "upload", shelf })}
              onCreateFolder={(shelf) => setDialog({ type: "create-folder", shelf })}
              onDocument={(document) => setDialog({ type: "document", document })}
              syllabus={
                syllabi[selectedSubject.slug] || {
                  state: "idle",
                  structure: [],
                  updatedAt: null,
                  error: "",
                }
              }
              setSyllabus={(next) =>
                setSyllabi((current) => ({ ...current, [selectedSubject.slug]: next }))
              }
              chat={chatMessages[selectedSubject.slug] || []}
              setChat={(next) =>
                setChatMessages((current) => ({ ...current, [selectedSubject.slug]: next }))
              }
              onSubjectRemoved={async (message) => {
                setSelectedSlug("");
                setToast(message);
                await Promise.all([loadWorkspace(), loadDashboard()]);
              }}
            />
            </>
          ) : null}
          {view === "settings" ? (
            <TeacherSettingsView
              teacher={workspace.teacher}
              onSaved={async () => {
                setToast("Teacher preferences saved");
                await loadWorkspace();
              }}
            />
          ) : null}
        </main>
      </div>

      {dialog?.type === "create-subject" ? (
        <CreateSubjectDialog
          communityContext={
            dialog.communityAttach
              ? {
                  name: dashboard?.communityWorkspace?.name || dialog.communityAttach.slug,
                  semester: dashboard?.communityWorkspace?.terms.find(
                    (term) => term.id === dialog.communityAttach?.termId,
                  )?.semesterNumber,
                }
              : undefined
          }
          initialUniversity={
            dialog.communityAttach?.university || dashboard?.communityWorkspace?.university
          }
          initialProgramme={
            dialog.communityAttach?.programme || dashboard?.communityWorkspace?.faculty
          }
          onClose={closeCreateSubjectDialog}
          onCreated={async (result) => {
            const returnTo = dialog.returnTo;
            const creatorReturnTo = dialog.communityReturnTo;
            const communityAttach = dialog.communityAttach;
            const nextWorkspace = await loadWorkspace();
            const createdSubject = nextWorkspace?.subjects.find(
              (subject) => subject.slug === result.slug || subject.name === result.name,
            );
            result.jobs.forEach((job) => void pollIndexingJob(job.id, job.label));
            if (communityAttach) {
              await responsePayload(
                await fetch(
                  `/api/communities/${encodeURIComponent(communityAttach.slug)}/subjects`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({
                      termId: communityAttach.termId,
                      subjectSlug: result.slug,
                    }),
                  },
                ),
              );
              await Promise.all([loadDashboard(), loadWorkspace()]);
              setDialog(null);
              setView("subjects");
              setSelectedSlug("");
              window.history.replaceState(
                null,
                "",
                teacherSubjectsHref({
                  community: communityAttach.slug,
                  term: communityAttach.termId,
                }),
              );
              setToast(
                `${result.name} created as a draft. Once indexing finishes, publish the subject to extract topics and prepare member challenges.${result.failedUploads.length ? ` ${result.failedUploads.length} file uploads failed; retry them from the source library.` : ""}`,
              );
              return;
            }
            setDialog(
              returnTo === "create-classroom"
                ? { type: "create-classroom", subjectSlug: createdSubject?.slug }
                : null,
            );
            if (returnTo === "exams") setView("exams");
            if (creatorReturnTo) {
              const destination = new URL(creatorReturnTo, window.location.origin);
              destination.searchParams.set("attach", result.slug);
              window.location.assign(
                `${destination.pathname}${destination.search}${destination.hash}`,
              );
              return;
            }
            setToast(
              result.failedUploads.length
                ? `${result.name} created. ${result.failedUploads.length} file upload${result.failedUploads.length === 1 ? "" : "s"} failed.`
                : `${result.name} created`,
            );
          }}
        />
      ) : null}
      {dialog?.type === "create-classroom" ? (
        <CreateClassroomDialog
          subjects={workspace.subjects}
          classrooms={dashboard?.classrooms || []}
          initialSubjectSlug={dialog.subjectSlug}
          onClose={() => setDialog(null)}
          onAddSubject={() => setDialog({ type: "create-subject", returnTo: "create-classroom" })}
          onCreated={async (classroom) => {
            setDialog(null);
            setToast("Classroom created — share the join code");
            await loadDashboard();
            setView("classrooms");
            setSelectedClassroomId(classroom.id);
          }}
        />
      ) : null}
      {dialog?.type === "upload" && selectedSubject ? (
        <UploadDialog
          subject={selectedSubject}
          shelf={dialog.shelf}
          onClose={() => setDialog(null)}
          onUploaded={async ({ message, jobs }) => {
            setDialog(null);
            setToast(message);
            await loadWorkspace();
            jobs.forEach(({ jobId, fileName }) => {
              if (jobId) void pollIndexingJob(jobId, fileName);
            });
          }}
        />
      ) : null}
      {dialog?.type === "create-folder" && selectedSubject ? (
        <CreateFolderDialog
          subject={selectedSubject}
          shelf={dialog.shelf}
          onClose={() => setDialog(null)}
          onCreated={async (path) => {
            setDialog(null);
            await loadWorkspace();
            setToast(`${path} created`);
          }}
        />
      ) : null}
      {dialog?.type === "document" ? (
        <DocumentDialog
          document={dialog.document}
          onClose={() => setDialog(null)}
          onChanged={async (message, jobId, jobLabel) => {
            setDialog(null);
            setToast(message);
            await loadWorkspace();
            if (jobId) void pollIndexingJob(jobId, jobLabel || dialog.document.name);
          }}
        />
      ) : null}
      {dialog?.type === "collection-overview" ? (
        <CollectionOverviewDialog
          workspace={workspace}
          onClose={() => setDialog(null)}
          onChanged={async (message, jobId, jobLabel) => {
            setDialog(null);
            setToast(message);
            await loadWorkspace();
            if (jobId) void pollIndexingJob(jobId, jobLabel || "Collection documents");
          }}
        />
      ) : null}

      {Object.keys(indexingJobs).length ? (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[59] max-w-sm rounded-lg border border-border bg-bg-primary p-4 shadow-lg"
        >
          <p className="text-sm font-medium">
            Indexing {Object.keys(indexingJobs).length}{" "}
            {Object.keys(indexingJobs).length === 1 ? "file" : "files"}
          </p>
          <p className="mt-1 truncate text-xs text-text-muted">
            {Object.values(indexingJobs).join(", ")}
          </p>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-text-primary px-5 py-3 text-sm text-text-inverse shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function CommunitiesView({
  dashboard,
  state,
  error,
  onRetry,
  onCreateSubject,
  selectedTermId,
  onRefresh,
  subjectsMode = false,
}: {
  dashboard: TeacherDashboard | null;
  state: DashboardState;
  error: string;
  onRetry: () => void;
  selectedSubjectSlug: string;
  selectedTermId: string;
  onRefresh: () => Promise<unknown>;
  subjectsMode?: boolean;
  onCreateSubject: (communityAttach: {
    slug: string;
    termId: string;
    university: string;
    programme: string;
  }) => void;
}) {
  if (state === "loading" && !dashboard) return <DashboardSkeleton />;
  if (state === "error") {
    return <DashboardError message={error} onRetry={onRetry} />;
  }
  if (!dashboard) return null;

  const selected = dashboard.communityWorkspace;
  const admin = dashboard.communityAdmin;
  const workspaceHref = (slug: string, term?: string) =>
    subjectsMode
      ? teacherSubjectsHref({ community: slug, term })
      : `/teachers?${new URLSearchParams({ view: "communities", community: slug, ...(term ? { term } : {}) })}`;

  if (!selected) {
    return (
      <>
        <header className="flex flex-wrap items-end gap-4 border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
              {subjectsMode ? "Community curriculum" : "Community admin"}
            </p>
            <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.04em]">
              {subjectsMode ? "Create Subjects" : "My communities"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              {subjectsMode
                ? "Choose a community to see its semesters, create subjects, and manage their details in one place."
                : "Open a community you created to view its overview and members. Manage its subjects from Create Subjects."}
            </p>
          </div>
          {!subjectsMode ? (
            <Link
              href="/communities?create=1"
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90",
                interactive,
              )}
            >
              Create community
            </Link>
          ) : null}
        </header>
        {subjectsMode ? (
          <Link
            href={teacherSubjectsHref({ library: true })}
            className={cn(
              "mt-3 inline-flex min-h-10 items-center text-sm text-text-secondary hover:text-text-primary",
              interactive,
            )}
          >
            Browse reusable subject library →
          </Link>
        ) : null}

        {dashboard.managedCommunities.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.managedCommunities.map((community) => (
              <article
                key={community.id}
                className="flex min-h-56 flex-col rounded-xl border border-border bg-bg-primary p-5"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
                  {community.university}
                </p>
                <h2 className="mt-3 font-display text-xl font-semibold">
                  {titleCase(community.name)}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                  {community.faculty}
                </p>
                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
                  <span>{community.totalYears} years</span>
                  <span>{community.totalSemesters} semesters</span>
                  <span>{community.subjectCount} subjects</span>
                  <span>{community.memberCount} members</span>
                </div>
                <Link
                  href={workspaceHref(community.slug)}
                  className={cn(
                    "mt-auto inline-flex min-h-10 items-center justify-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90",
                    interactive,
                  )}
                >
                  {subjectsMode ? "Manage subjects →" : "Open admin workspace →"}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <section className="mt-6 rounded-xl border border-dashed border-border bg-bg-primary px-6 py-14 text-center">
            <h2 className="font-display text-xl font-semibold">
              {subjectsMode ? "No communities available" : "Create your first community"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {subjectsMode
                ? "Create a community from My Communities, then return here to organise its subjects by semester. Your reusable subject library is still available."
                : "Once created, every community you own will appear here as a separate admin workspace."}
            </p>
            {subjectsMode ? (
              <Link
                href="/teachers?view=communities"
                className={cn(
                  "mt-5 inline-flex min-h-10 items-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse",
                  interactive,
                )}
              >
                Open My Communities →
              </Link>
            ) : (
              <Link
                href="/communities?create=1"
                className={cn(
                  "mt-5 inline-flex min-h-10 items-center rounded-lg bg-text-primary px-4 text-sm font-medium text-text-inverse",
                  interactive,
                )}
              >
                Create community
              </Link>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      {subjectsMode ? (
        <header className="flex flex-wrap items-end gap-5 border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
              Community curriculum
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em]">
              Create Subjects
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Add subjects by semester. Every subject here is available to this community&apos;s
              members.
            </p>
            <Link
              href={teacherSubjectsHref({
                community: selected.slug,
                term: selectedTermId,
                library: true,
              })}
              className={cn(
                "mt-2 inline-flex min-h-10 items-center text-sm text-text-secondary hover:text-text-primary",
                interactive,
              )}
            >
              All saved subjects →
            </Link>
          </div>
          <div className="w-full sm:w-72">
            <label htmlFor="subject-community" className="mb-2 block text-sm font-medium">
              Community
            </label>
            <select
              id="subject-community"
              value={selected.slug}
              onChange={(event) =>
                window.history.pushState(
                  null,
                  "",
                  teacherSubjectsHref({ community: event.target.value }),
                )
              }
              className={cn(
                "min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary",
                interactive,
              )}
            >
              <option value="">Choose another community…</option>
              {dashboard.managedCommunities.map((community) => (
                <option key={community.id} value={community.slug}>
                  {titleCase(community.name)} · {community.faculty}
                </option>
              ))}
            </select>
          </div>
        </header>
      ) : (
        <>
          <Link
            href="/teachers?view=communities"
            className={cn(
              "inline-flex min-h-10 items-center text-sm text-text-secondary hover:text-text-primary",
              interactive,
            )}
          >
            ← My communities
          </Link>

          <section className="mt-3 overflow-hidden rounded-xl border border-border bg-bg-primary">
            <div className="bg-[var(--community-banner)] px-5 py-6 text-white sm:px-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">
                    Community workspace
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em]">
                    {titleCase(selected.name)}
                  </h1>
                  <p className="mt-2 text-sm text-white/65">
                    {selected.university} · {selected.faculty}
                  </p>
                </div>
                <Link
                  href={`/app/communities/${encodeURIComponent(selected.slug)}`}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-medium text-white transition hover:bg-white/10",
                    interactive,
                  )}
                >
                  Preview student view →
                </Link>
              </div>
            </div>

            {admin ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                <CommunityMetric label="Active members" value={admin.memberCount} />
                <CommunityMetric label="Linked subjects" value={admin.subjectCount} />
                <CommunityMetric
                  label="Semesters filled"
                  value={`${admin.filledSemesterCount}/${admin.totalSemesters}`}
                />
                <CommunityMetric label="Resources waiting" value={admin.pendingResourceCount} />
                <CommunityMetric label="Resources merged" value={admin.mergedResourceCount} />
                <CommunityMetric label="Discussions" value={admin.discussionCount} />
              </div>
            ) : null}
          </section>
        </>
      )}

      {subjectsMode ? (
        <section className="mt-7" aria-labelledby="community-curriculum-heading">
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="community-curriculum-heading" className="font-display text-xl font-semibold">
                Subjects by semester
              </h2>
            </div>
          </div>
          <CommunityStudySpaceClient
            key={selected.slug}
            initialCommunity={selected}
            mode="teacher"
            teacherWorkspaceBaseHref={workspaceHref(selected.slug)}
            onSubjectAttached={onRefresh}
            onCreateSubject={(termId) =>
              onCreateSubject({
                slug: selected.slug,
                termId,
                university: selected.university,
                programme: selected.faculty,
              })
            }
          />
        </section>
      ) : null}

      {!subjectsMode && selected.canManage ? (
        <section className="mt-7 rounded-xl border border-border bg-bg-primary p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">Delete community</h2>
          <p className="mb-4 mt-2 text-sm text-text-secondary">
            Only the creator can delete this community. Your reusable subject library will be kept.
          </p>
          <CommunityDeleteControl
            key={selected.id}
            slug={selected.slug}
            name={selected.name}
            onDeleted={async () => {
              window.history.replaceState(null, "", "/teachers?view=communities");
              await onRefresh();
            }}
          />
        </section>
      ) : null}

      {admin && !subjectsMode ? (
        <section className="mt-7 rounded-xl border border-border bg-bg-primary p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold">Community members</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Newest active members in this community.
              </p>
            </div>
            <span className="text-sm text-text-muted">{admin.memberCount} active</span>
          </div>
          {admin.recentMembers.length ? (
            <div className="divide-y divide-border">
              {admin.recentMembers.map((member) => (
                <div key={member.userId} className="flex min-h-16 items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="mt-0.5 text-xs capitalize text-text-muted">{member.role}</p>
                  </div>
                  <time className="text-xs text-text-muted" dateTime={member.joinedAt}>
                    {formatDate(member.joinedAt)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-text-secondary">
              Members will appear here when students join.
            </p>
          )}
        </section>
      ) : null}
    </>
  );
}

function TodayView({
  teacherHandle,
  subjectCount,
  documentCount = 0,
  sectionCount = 0,
  dashboard,
  state,
  error,
  onSetExam,
  profileComplete,
  communityAdmin,
  onSubjects,
  onSettings,
  onRetry,
}: {
  teacherHandle: string;
  subjectCount: number;
  documentCount?: number;
  sectionCount?: number;
  dashboard: TeacherDashboard | null;
  state: DashboardState;
  error: string;
  onSetExam: () => void;
  profileComplete: boolean;
  communityAdmin: TeacherDashboard["communityAdmin"];
  onSubjects: () => void;
  onSettings: () => void;
  onRetry: () => void;
}) {
  const [usage, setUsage] = useState<ApiRecord>({});
  const [usageState, setUsageState] = useState<WorkspaceState>("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/teacher/collection/usage", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        if (!active) return;
        setUsage(asRecord(payload.usage));
        setUsageState("ready");
      })
      .catch(() => {
        if (active) setUsageState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading" && !dashboard) return <DashboardSkeleton />;
  if (state === "error" && !dashboard) {
    return <DashboardError message={error} onRetry={onRetry} />;
  }
  if (!dashboard) return null;

  const { summary, needsAttention } = dashboard;
  const totalTokens = numberValue(usage.total_tokens || asRecord(usage.totals).total_tokens);
  const inputTokens = numberValue(
    usage.input_tokens || usage.prompt_tokens || asRecord(usage.totals).input_tokens,
  );
  const outputTokens = numberValue(
    usage.output_tokens || usage.completion_tokens || asRecord(usage.totals).output_tokens,
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Today</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.04em]">
            Good morning, {teacherHandle}
          </h1>
          <p className="mt-[7px] text-text-secondary">
            {subjectCount} indexed {subjectCount === 1 ? "subject" : "subjects"},{" "}
            {summary.studentCount} {summary.studentCount === 1 ? "student" : "students"}.
          </p>
        </div>
      </div>

      {!profileComplete ? (
        <section className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-bg-primary p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Your public teacher profile is not complete
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Add your photo, expertise, institution, and bio so students know who created each
              course.
            </p>
          </div>
          <span className="flex-1" />
          <Button type="button" variant="outline" className="shrink-0" onClick={onSettings}>
            Complete profile
          </Button>
        </section>
      ) : null}

      {communityAdmin ? (
        <section
          className="mt-5 overflow-hidden rounded-xl border border-border bg-bg-primary"
          aria-labelledby="community-admin-heading"
        >
          <div className="bg-[var(--community-banner)] px-5 py-5 text-white sm:px-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">
                  Community admin
                </p>
                <h2
                  id="community-admin-heading"
                  className="mt-1 truncate font-display text-2xl font-semibold tracking-[-0.03em]"
                >
                  {communityAdmin.name}
                </h2>
                <p className="mt-1 text-sm text-white/65">
                  {communityAdmin.university} · {communityAdmin.faculty}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white text-[#0b2859] hover:bg-white/90"
                  onClick={onSubjects}
                >
                  Create subjects
                </Button>
                <Link
                  href={`/app/communities/${encodeURIComponent(communityAdmin.slug)}`}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-medium text-white transition hover:bg-white/10",
                    interactive,
                  )}
                >
                  Manage semesters →
                </Link>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
            <div className="grid grid-cols-2 border-b border-border lg:border-b-0 lg:border-r sm:grid-cols-3">
              <CommunityMetric label="Active members" value={communityAdmin.memberCount} />
              <CommunityMetric label="Linked subjects" value={communityAdmin.subjectCount} />
              <CommunityMetric
                label="Semesters filled"
                value={`${communityAdmin.filledSemesterCount}/${communityAdmin.totalSemesters}`}
              />
              <CommunityMetric
                label="Resources waiting"
                value={communityAdmin.pendingResourceCount}
              />
              <CommunityMetric
                label="Resources merged"
                value={communityAdmin.mergedResourceCount}
              />
              <CommunityMetric label="Discussions" value={communityAdmin.discussionCount} />
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-sm font-semibold">Recent members</h3>
                <span className="text-xs text-text-muted">Newest first</span>
              </div>
              {communityAdmin.recentMembers.length ? (
                <div className="mt-4 space-y-3">
                  {communityAdmin.recentMembers.slice(0, 4).map((member) => (
                    <div key={member.userId} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-[10px] font-semibold">
                        {initials(member.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{member.name}</p>
                        <p className="text-xs capitalize text-text-muted">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  Members will appear here when students join this community.
                </p>
              )}
              <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-text-muted">
                Resources merge automatically after {communityAdmin.contributionThreshold} upvotes.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Real Live Collection & Teacher Stats Grid */}
      <section
        className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4"
        aria-label="Collection summary"
      >
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-muted">Indexed subjects</p>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">
            {subjectCount}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-muted">Files</p>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">
            {documentCount}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-muted">Indexed sections</p>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">
            {sectionCount}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-muted">Enrolled students</p>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">
            {summary.studentCount}
          </p>
        </div>
      </section>

      {/* Real Live AI Usage Tokens Grid */}
      <section
        className="mt-4 rounded-xl border border-border bg-bg-surface p-5"
        aria-label="AI usage"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-text-primary">
            AI processing & token usage
          </h3>
          <span className="text-xs text-text-muted">Live from collection</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-bg-secondary p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Total tokens
            </p>
            <p className="mt-1.5 font-display text-xl font-semibold text-text-primary">
              {usageState === "loading" ? "…" : Number(totalTokens).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-bg-secondary p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Input tokens
            </p>
            <p className="mt-1.5 font-display text-xl font-semibold text-text-primary">
              {usageState === "loading" ? "…" : Number(inputTokens).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-bg-secondary p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Output tokens
            </p>
            <p className="mt-1.5 font-display text-xl font-semibold text-text-primary">
              {usageState === "loading" ? "…" : Number(outputTokens).toLocaleString()}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function CommunityMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-b border-r border-border p-4 last:border-r-0 sm:p-5">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-text-primary">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-10 w-72 max-w-full" />
        <SkeletonBlock className="h-4 w-56 max-w-full" />
      </div>
      <SkeletonBlock className="mt-8 h-36 rounded-xl" />
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} lines={3} className="h-48" />
        ))}
      </div>
    </div>
  );
}

function ClassroomDetailSkeleton() {
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

function ExamWorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Loading exams">
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-44" />
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="h-4 w-[30rem] max-w-full" />
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-5">
          <SkeletonBlock className="h-52 rounded-xl" />
          <SkeletonBlock className="h-80 rounded-xl" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SubmissionsSkeleton() {
  return (
    <div className="mt-6 space-y-4" role="status" aria-label="Loading submissions">
      {Array.from({ length: 3 }).map((_, index) => (
        <SkeletonCard key={index} lines={4} />
      ))}
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-lg border border-destructive/30 p-6">
      <h1 className="font-display text-2xl font-semibold">Couldn&apos;t load the dashboard</h1>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
      <Button className="mt-5" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently joined";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function EmptyClassrooms({ onClassrooms }: { onClassrooms: () => void }) {
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

function humanizedExamWindowChip(
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

function masteryLabelAndColor(percentage: number | null): {
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

function ClassroomConceptMapSVG({
  subjectName,
  chapters,
  topicsDetail,
  selectedTopic,
  onSelectTopic,
  source,
  onSourceChange,
}: {
  subjectName: string;
  chapters: {
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
  topicsDetail?: {
    name: string;
    percentage: number | null;
    testedStudentCount: number;
    askedStudentCount: number;
    strugglingStudents: { studentId: string; name: string; percentage: number }[];
  }[];
  selectedTopic: string;
  onSelectTopic: (topicName: string) => void;
  source: "tests" | "chat";
  onSourceChange: (source: "tests" | "chat") => void;
}) {
  const cx = 500;
  const cy = 360;
  const RX = 232;
  const RY = 150;

  const totalChapters = chapters.length || 1;
  const startAngle = totalChapters === 2 ? 0 : -Math.PI / 2;

  const chapterNodes = chapters.map((ch, i) => {
    const angle = startAngle + i * ((2 * Math.PI) / totalChapters);
    const chx = cx + RX * Math.cos(angle);
    const chy = cy + RY * Math.sin(angle);

    const n = ch.topics.length;
    const spread = Math.PI * (n > 4 ? 1.1 : 0.95);

    const topicNodes = ch.topics.map((t, j) => {
      const ta = n === 1 ? angle : angle - spread / 2 + (j * spread) / Math.max(1, n - 1);
      const R2 = 104 + (j % 2 === 1 ? 34 : 0);
      const tx = chx + R2 * Math.cos(ta);
      const ty = chy + R2 * Math.sin(ta);

      let score = t.percentage;
      if (source === "chat") {
        score = (t.askedStudentCount || 0) > 0 ? (score !== null ? score : 50) : null;
      }

      let fill = "#C8C8C5";
      if (score !== null) {
        if (score < 40) fill = "#C43D2E";
        else if (score < 70) fill = "#E0A800";
        else fill = "#2E7D4F";
      }

      const matchDetail = topicsDetail?.find((td) => td.name === t.name);

      return {
        id: t.id,
        name: t.name,
        chapterName: ch.name,
        after: t.after || [],
        tx,
        ty,
        fill,
        percentage: t.percentage,
        askedCount: t.askedStudentCount || 0,
        testedCount: t.testedStudentCount || 0,
        strugglingStudents: matchDetail?.strugglingStudents || [],
      };
    });

    return {
      name: ch.name,
      chx,
      chy,
      topics: topicNodes,
    };
  });

  const allTopics = chapterNodes.flatMap((ch) => ch.topics);

  const solidCount = allTopics.filter((t) => t.percentage !== null && t.percentage >= 70).length;
  const gettingThereCount = allTopics.filter(
    (t) => t.percentage !== null && t.percentage >= 40 && t.percentage < 70,
  ).length;
  const strugglingCount = allTopics.filter(
    (t) => t.percentage !== null && t.percentage < 40,
  ).length;
  const notStartedCount = allTopics.filter((t) => t.percentage === null).length;

  const selectedNode = allTopics.find((t) => t.name === selectedTopic) || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSourceChange("tests")}
            className={cn(
              "min-h-9 rounded-md px-3 text-xs font-medium transition",
              source === "tests"
                ? "bg-text-primary text-bg-primary"
                : "bg-bg-secondary text-text-secondary hover:text-text-primary",
            )}
          >
            From class tests
          </button>
          <button
            type="button"
            onClick={() => onSourceChange("chat")}
            className={cn(
              "min-h-9 rounded-md px-3 text-xs font-medium transition",
              source === "chat"
                ? "bg-text-primary text-bg-primary"
                : "bg-bg-secondary text-text-secondary hover:text-text-primary",
            )}
          >
            From what they ask
          </button>
        </div>
        <p className="text-xs text-text-muted">
          {source === "tests"
            ? "How this classroom answered test questions on each topic."
            : "What this classroom keeps asking the tutor about."}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="relative overflow-hidden rounded-lg border border-border bg-bg-primary p-2">
          <svg viewBox="100 80 800 540" className="w-full h-auto max-h-[540px]">
            {chapterNodes.map((ch) => (
              <line
                key={`line-ch-${ch.name}`}
                x1={cx}
                y1={cy}
                x2={ch.chx}
                y2={ch.chy}
                stroke="#0B0B0B"
                strokeWidth="1.6"
                strokeOpacity="0.3"
              />
            ))}

            {chapterNodes.flatMap((ch) =>
              ch.topics.map((t) => (
                <line
                  key={`line-tp-${t.name}`}
                  x1={ch.chx}
                  y1={ch.chy}
                  x2={t.tx}
                  y2={t.ty}
                  stroke="#0B0B0B"
                  strokeWidth="1"
                  strokeOpacity="0.2"
                />
              )),
            )}

            {allTopics.flatMap((t) =>
              (t.after || []).flatMap((afterName) => {
                const target = allTopics.find(
                  (item) => item.name === afterName || item.id === afterName,
                );
                if (!target) return [];
                return (
                  <line
                    key={`prereq-${t.name}-${target.name}`}
                    x1={t.tx}
                    y1={t.ty}
                    x2={target.tx}
                    y2={target.ty}
                    stroke="#0B0B0B"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />
                );
              }),
            )}

            <g transform={`translate(${cx}, ${cy})`}>
              <circle r="34" fill="#0B0B0B" />
              <text
                textAnchor="middle"
                dy="4"
                fill="#FFFFFF"
                fontSize="12"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                {subjectName.length > 15 ? `${subjectName.slice(0, 13)}…` : subjectName}
              </text>
            </g>

            {chapterNodes.map((ch) => (
              <g key={`ch-node-${ch.name}`} transform={`translate(${ch.chx}, ${ch.chy})`}>
                <circle r="15" fill="#FFFFFF" stroke="#0B0B0B" strokeWidth="1.6" />
                <text textAnchor="middle" dy="28" fill="#0B0B0B" fontSize="12.5" fontWeight="600">
                  {ch.name.length > 17 ? `${ch.name.slice(0, 15)}…` : ch.name}
                </text>
              </g>
            ))}

            {allTopics.map((t) => {
              const isSelected = selectedTopic === t.name;
              const radius = t.percentage === null ? 9 : 13;
              return (
                <g
                  key={`tp-node-${t.name}`}
                  transform={`translate(${t.tx}, ${t.ty})`}
                  className="cursor-pointer transition-transform hover:scale-110"
                  onClick={() => onSelectTopic(t.name)}
                >
                  {isSelected && (
                    <circle r={radius + 7} fill="none" stroke="#0B0B0B" strokeWidth="1.5" />
                  )}
                  <circle
                    r={radius}
                    fill={t.fill}
                    stroke={t.percentage === null ? "#B4B4B0" : "#0B0B0B"}
                    strokeWidth={t.percentage === null ? 1 : 1.4}
                    strokeDasharray={t.percentage === null ? "3 3" : undefined}
                  />
                  <text
                    textAnchor="middle"
                    dy={radius + 15}
                    fill="#3A3A38"
                    fontSize="11.5"
                    fontWeight={isSelected ? "700" : "500"}
                  >
                    {t.name.length > 15 ? `${t.name.slice(0, 13)}…` : t.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-4">
          {selectedNode ? (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {selectedNode.chapterName}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectTopic("")}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Clear
                </button>
              </div>
              <h3 className="font-display text-base font-semibold">{selectedNode.name}</h3>
              <div className="space-y-2 border-t border-border pt-3 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        masteryLabelAndColor(selectedNode.percentage).bgDot,
                      )}
                    />
                    From class tests
                  </span>
                  <strong className="font-mono">
                    {selectedNode.percentage === null ? "—" : `${selectedNode.percentage}%`}
                  </strong>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        selectedNode.askedCount > 0 ? "bg-warning" : "bg-text-muted/40",
                      )}
                    />
                    From what they ask
                  </span>
                  <strong>{selectedNode.askedCount} asked</strong>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-text-muted mb-2">
                  Struggling students ({selectedNode.strugglingStudents.length})
                </h4>
                {selectedNode.strugglingStudents.length ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedNode.strugglingStudents.map((student) => (
                      <div
                        key={student.studentId}
                        className="flex items-center justify-between rounded bg-bg-secondary px-3 py-2 text-xs"
                      >
                        <span>{student.name}</span>
                        <span className="font-mono font-semibold text-destructive">
                          {student.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    No student scoring below 40% on this topic.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-display text-sm font-semibold">How to read it</h3>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D4F]" /> Solid
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E0A800]" /> Getting there
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#C43D2E]" /> Struggling
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#C8C8C5]" /> Not started
                  </span>
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Dotted lines join topics that build on each other. Tap any topic for detail.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="font-display text-sm font-semibold">Where the classroom stands</h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center p-2 rounded bg-bg-secondary">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D4F]" /> Solid
                    </span>
                    <strong>{solidCount}</strong>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-bg-secondary">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#E0A800]" /> Getting there
                    </span>
                    <strong>{gettingThereCount}</strong>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-bg-secondary">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#C43D2E]" /> Struggling
                    </span>
                    <strong>{strugglingCount}</strong>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-bg-secondary">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#C8C8C5]" /> Not started
                    </span>
                    <strong>{notStartedCount}</strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassroomCard({
  classroom,
  onOpen,
}: {
  classroom: TeacherDashboard["classrooms"][number];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "min-h-48 rounded-lg border border-border p-5 text-left transition hover:border-border-strong",
        interactive,
      )}
    >
      <div className="flex items-center gap-3">
        <p className="truncate font-mono text-xs uppercase tracking-wider text-text-muted">
          {classroom.subjectName}
        </p>
        <span className="flex-1" />
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning"
          aria-label="Active classroom"
        />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">{classroom.name}</h3>
      <p className="mt-2 text-sm text-text-muted">
        {classroom.memberCount} {classroom.memberCount === 1 ? "student" : "students"}
      </p>
      {classroom.meetingSchedule ? (
        <p className="mt-2 text-xs text-text-secondary">{classroom.meetingSchedule}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <span className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs">
          {classroom.submissionCount
            ? classroom.actionRequiredCount
              ? `${classroom.actionRequiredCount} ${classroom.actionRequiredCount === 1 ? "paper" : "papers"} waiting`
              : `${classroom.submissionCount} graded ${classroom.submissionCount === 1 ? "paper" : "papers"}`
            : classroom.assignmentCount
              ? "No submissions yet"
              : "No exam set"}
        </span>
      </div>
    </button>
  );
}

function ClassroomsView({
  dashboard,
  state,
  error,
  subjects,
  documents,
  selectedClassroomId,
  onSelect,
  onCreate,
  onExams,
  onSubjectMaterial,
  onRetry,
  onChanged,
}: {
  dashboard: TeacherDashboard | null;
  state: DashboardState;
  error: string;
  subjects: TeacherSubject[];
  documents: TeacherDocument[];
  selectedClassroomId: string;
  onSelect: (classroomId: string) => void;
  onCreate: () => void;
  onExams: () => void;
  onSubjectMaterial: (subjectSlug: string) => void;
  onRetry: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [termView, setTermView] = useState<"current" | "earlier">("current");
  const [classroomSearch, setClassroomSearch] = useState("");
  if (state === "loading" && !dashboard) return <DashboardSkeleton />;
  if (state === "error" && !dashboard) return <DashboardError message={error} onRetry={onRetry} />;
  if (!dashboard) return null;

  if (selectedClassroomId) {
    return (
      <ClassroomDetailView
        classroomId={selectedClassroomId}
        subjects={subjects}
        documents={documents}
        onBack={() => onSelect("")}
        onExams={onExams}
        onSubjectMaterial={onSubjectMaterial}
        onChanged={onChanged}
      />
    );
  }

  const currentTerm = String(new Date().getFullYear());
  const termClassrooms = dashboard.classrooms.filter((classroom) =>
    termView === "current" ? classroom.termKey === currentTerm : classroom.termKey !== currentTerm,
  );
  const visibleClassrooms = termClassrooms
    .filter((classroom) =>
      `${classroom.name} ${classroom.subjectName}`
        .toLowerCase()
        .includes(classroomSearch.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.subjectName.localeCompare(b.subjectName));
  const currentCount = dashboard.classrooms.filter(
    (classroom) => classroom.termKey === currentTerm,
  ).length;
  const earlierCount = dashboard.classrooms.length - currentCount;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Classrooms</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Classrooms</h1>
          <p className="mt-2 text-text-secondary">
            Join codes, members, assignments and submissions come from Supabase.
          </p>
        </div>
        <span className="flex-1" />
        <Button onClick={onCreate}>Create classroom</Button>
      </div>
      {dashboard.classrooms.length ? (
        <>
          <div className="mt-8 flex flex-wrap items-end gap-3">
            <div
              role="tablist"
              aria-label="Classroom terms"
              className="flex rounded-lg border border-border p-1"
            >
              {(
                [
                  ["current", `This term ${currentCount}`],
                  ["earlier", `Earlier ${earlierCount}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={termView === value}
                  onClick={() => setTermView(value)}
                  className={cn(
                    "min-h-10 rounded-md px-4 text-sm",
                    interactive,
                    termView === value ? "bg-text-primary text-bg-primary" : "text-text-secondary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <div className="w-full sm:w-80">
              <label htmlFor="classroom-search" className="sr-only">
                Search classrooms
              </label>
              <input
                id="classroom-search"
                type="search"
                value={classroomSearch}
                onChange={(event) => setClassroomSearch(event.target.value)}
                placeholder="Search class or subject"
                className={inputClass}
              />
            </div>
          </div>
          {visibleClassrooms.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleClassrooms.map((classroom) => (
                <ClassroomCard
                  key={classroom.id}
                  classroom={classroom}
                  onOpen={() => onSelect(classroom.id)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <h3 className="font-display text-xl font-semibold">No matching classrooms</h3>
              <p className="mt-2 text-sm text-text-secondary">
                {termClassrooms.length
                  ? "Try another classroom or subject name."
                  : termView === "current"
                    ? `No classrooms are assigned to ${currentTerm} yet.`
                    : "No earlier classrooms are stored yet."}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="font-display text-xl font-semibold">No classrooms yet</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Create one for a subject, then share its join code with students.
          </p>
          <Button className="mt-5" onClick={onCreate}>
            Create classroom
          </Button>
        </div>
      )}
    </>
  );
}

function ClassroomDetailView({
  classroomId,
  subjects,
  documents,
  onBack,
  onExams,
  onSubjectMaterial,
  onChanged,
}: {
  classroomId: string;
  subjects: TeacherSubject[];
  documents: TeacherDocument[];
  onBack: () => void;
  onExams: () => void;
  onSubjectMaterial: (subjectSlug: string) => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [state, setState] = useState<DashboardState>("loading");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ClassroomDetail | null>(null);
  const [tab, setTab] = useState<ClassroomTab>("students");
  const [search, setSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState<
    "all" | "needs-help" | ClassroomDetail["roster"][number]["status"]
  >("all");
  const [studentSort, setStudentSort] = useState<"lowest" | "highest" | "az">("lowest");
  const [visibleStudents, setVisibleStudents] = useState(9);
  const [rename, setRename] = useState("");
  const [termKey, setTermKey] = useState("");
  const [meetingSchedule, setMeetingSchedule] = useState("");
  const [notice, setNotice] = useState("");
  const [helperHandle, setHelperHandle] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [managingAssignmentId, setManagingAssignmentId] = useState("");
  const [assignmentOpensAt, setAssignmentOpensAt] = useState("");
  const [assignmentClosesAt, setAssignmentClosesAt] = useState("");
  const [assignmentMaxAttempts, setAssignmentMaxAttempts] = useState(1);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmCodeRotation, setConfirmCodeRotation] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [mapSource, setMapSource] = useState<"tests" | "chat">("tests");
  const [showReuseModal, setShowReuseModal] = useState(false);
  const [selectedReusePaperId, setSelectedReusePaperId] = useState("");
  const [reuseOpensAt, setReuseOpensAt] = useState("");
  const [reuseClosesAt, setReuseClosesAt] = useState("");
  const [showUploadMaterialModal, setShowUploadMaterialModal] = useState(false);
  const [materialDocumentId, setMaterialDocumentId] = useState("");
  const [showCsvPreviewModal, setShowCsvPreviewModal] = useState(false);
  const [csvPreviewText, setCsvPreviewText] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      const next = normalizeClassroomDetail(payload);
      setDetail(next);
      setRename(next.classroom.name);
      setTermKey(next.classroom.termKey);
      setMeetingSchedule(next.classroom.meetingSchedule);
      setNotice(next.classroom.notice);
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the classroom.");
      setState("error");
    }
  }, [classroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading" && !detail) return <ClassroomDetailSkeleton />;
  if (state === "error" && !detail)
    return <DashboardError message={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const roster = detail.roster
    .filter((student) => student.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(
      (student) =>
        studentStatus === "all" ||
        (studentStatus === "needs-help"
          ? student.status === "needs-attention" || student.status === "not-started"
          : student.status === studentStatus),
    )
    .sort((a, b) =>
      studentSort === "az"
        ? a.name.localeCompare(b.name)
        : studentSort === "highest"
          ? (b.averagePercent ?? -1) - (a.averagePercent ?? -1) || a.name.localeCompare(b.name)
          : (a.averagePercent ?? -1) - (b.averagePercent ?? -1) || a.name.localeCompare(b.name),
    );
  const shownRoster = roster.slice(0, visibleStudents);
  const selectedStudent =
    detail.roster.find((student) => student.studentId === selectedStudentId) || null;
  const selectedTopicDetail = detail.topics.find((topic) => topic.name === selectedTopic) || null;
  const subject = subjects.find((item) => item.slug === detail.classroom.subjectSlug);
  const classroomDocuments = subject
    ? documents.filter(
        (document) =>
          (document.path === subject.folderPath ||
            document.path.startsWith(`${subject.folderPath}/`)) &&
          document.shelf !== "Syllabus",
      )
    : [];
  const materialDocument = materialDocumentId
    ? classroomDocuments.find((d) => d.id === materialDocumentId) || null
    : null;
  const invitePath = `/app/exams?join=${encodeURIComponent(detail.classroom.joinCode)}`;
  const inviteUrl =
    typeof window === "undefined" ? invitePath : `${window.location.origin}${invitePath}`;
  const invitePrintPath = `/teachers/invite/${encodeURIComponent(detail.classroom.joinCode)}?classroom=${encodeURIComponent(detail.classroom.name)}&subject=${encodeURIComponent(detail.classroom.subjectName)}`;
  const statusLabel = (status: ClassroomDetail["roster"][number]["status"]) =>
    status === "needs-attention"
      ? "Needs attention"
      : status === "doing-well"
        ? "Doing well"
        : status === "on-track"
          ? "On track"
          : "Nothing handed in";

  async function renameClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ name: rename }),
        }),
      );
      await load();
      await onChanged("Classroom renamed");
    } catch (renameError) {
      setActionError(
        renameError instanceof Error ? renameError.message : "Could not rename the classroom.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveClassroomDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ termKey, meetingSchedule }),
        }),
      );
      await load();
      await onChanged("Classroom term and meeting schedule saved");
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : "Could not save classroom details.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ notice }),
        }),
      );
      await load();
      await onChanged(notice.trim() ? "Classroom notice posted" : "Classroom notice removed");
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Could not save the notice.");
    } finally {
      setSaving(false);
    }
  }

  async function addHelper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}/teachers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ handle: helperHandle }),
        }),
      );
      setHelperHandle("");
      await load();
      await onChanged("Co-teacher added as helper");
    } catch (addError) {
      setActionError(
        addError instanceof Error ? addError.message : "Could not add the co-teacher.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeHelper(teacherId: string) {
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(
          `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/teachers?teacherId=${encodeURIComponent(teacherId)}`,
          { method: "DELETE", headers: { Accept: "application/json" } },
        ),
      );
      await load();
      await onChanged("Co-teacher removed");
    } catch (removeError) {
      setActionError(
        removeError instanceof Error ? removeError.message : "Could not remove the co-teacher.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveClassroom() {
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      await onChanged("Classroom archived — submissions and papers were kept");
      onBack();
    } catch (archiveError) {
      setActionError(
        archiveError instanceof Error ? archiveError.message : "Could not archive the classroom.",
      );
      setSaving(false);
    }
  }

  async function rotateJoinCode() {
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/classrooms/${encodeURIComponent(classroomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ rotateJoinCode: true }),
        }),
      );
      setConfirmCodeRotation(false);
      await load();
      await onChanged("New classroom join code created");
    } catch (rotateError) {
      setActionError(
        rotateError instanceof Error ? rotateError.message : "Could not create a new join code.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishReusedExam() {
    if (!selectedReusePaperId || !detail) return;
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(selectedReusePaperId)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            classroomId: detail.classroom.id,
            opensAt: reuseOpensAt ? new Date(reuseOpensAt).toISOString() : null,
            closesAt: reuseClosesAt ? new Date(reuseClosesAt).toISOString() : null,
            maxAttempts: 1,
          }),
        }),
      );
      setShowReuseModal(false);
      setSelectedReusePaperId("");
      await load();
      await onChanged("Exam reused for classroom");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not assign exam to classroom.");
    } finally {
      setSaving(false);
    }
  }

  function exportMarks() {
    if (!detail) return;
    const examTitles = detail.exams.map((e) => e.title);
    const headers = ["Student Name", "Status", "Average %", ...examTitles];
    const rows = [
      headers,
      ...detail.roster.map((student) => {
        const studentExamScores = detail.exams.map((exam) => {
          const sub = student.submissions.find((s) => s.assignmentId === exam.assignmentId);
          return sub && sub.percentage !== null ? `${sub.percentage}%` : "—";
        });
        return [
          student.name,
          statusLabel(student.status),
          student.averagePercent === null ? "—" : `${student.averagePercent}%`,
          ...studentExamScores,
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    setCsvPreviewText(csv);
    setShowCsvPreviewModal(true);
  }

  function downloadCsv() {
    if (!detail || !csvPreviewText) return;
    const url = URL.createObjectURL(new Blob([csvPreviewText], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${detail.classroom.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-marks.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function manageAssignment(assignment: ClassroomDetail["exams"][number]) {
    setManagingAssignmentId(assignment.assignmentId);
    setAssignmentOpensAt(localDateTimeValue(assignment.opensAt));
    setAssignmentClosesAt(localDateTimeValue(assignment.closesAt));
    setAssignmentMaxAttempts(assignment.maxAttempts);
    setConfirmUnpublish(false);
    setActionError("");
  }

  async function saveAssignmentWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(
          `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/assignments/${encodeURIComponent(managingAssignmentId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              opensAt: assignmentOpensAt ? new Date(assignmentOpensAt).toISOString() : null,
              closesAt: assignmentClosesAt ? new Date(assignmentClosesAt).toISOString() : null,
              maxAttempts: assignmentMaxAttempts,
            }),
          },
        ),
      );
      setManagingAssignmentId("");
      await load();
      await onChanged("Exam window updated");
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : "Could not update the exam window.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function unpublishAssignment() {
    setSaving(true);
    setActionError("");
    try {
      await responsePayload(
        await fetch(
          `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/assignments/${encodeURIComponent(managingAssignmentId)}`,
          { method: "DELETE", headers: { Accept: "application/json" } },
        ),
      );
      setManagingAssignmentId("");
      await load();
      await onChanged("Exam removed from classroom — saved submissions were kept");
    } catch (removeError) {
      setActionError(
        removeError instanceof Error ? removeError.message : "Could not remove the exam.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishWaitingResults() {
    setPublishingResults(true);
    setActionError("");
    try {
      const payload = await responsePayload(
        await fetch(
          `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/submissions/publish`,
          { method: "POST", headers: { Accept: "application/json" } },
        ),
      );
      const published = numberValue(payload.published);
      await load();
      await onChanged(
        `${published} ${published === 1 ? "result" : "results"} published to students`,
      );
    } catch (publishError) {
      setActionError(
        publishError instanceof Error
          ? publishError.message
          : "Could not publish the waiting results.",
      );
    } finally {
      setPublishingResults(false);
    }
  }

  const conceptMapChapters =
    detail?.chapters && detail.chapters.length
      ? detail.chapters
      : detail?.topics.length
        ? [
            {
              name: detail.classroom.subjectName || "Subject",
              topics: detail.topics.map((topic, index) => ({
                id: `topic-${index + 1}`,
                name: topic.name,
                after: [],
                percentage: topic.percentage,
                testedStudentCount: topic.testedStudentCount,
                askedStudentCount: topic.askedStudentCount,
              })),
            },
          ]
        : [];

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={cn("min-h-10 text-sm text-text-secondary hover:text-text-primary", interactive)}
      >
        ← Classrooms
      </button>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            {detail.classroom.subjectName}
            {detail.classroom.meetingSchedule ? (
              <>
                <span className="mx-2">·</span>
                {detail.classroom.meetingSchedule}
              </>
            ) : null}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold">{detail.classroom.name}</h1>
          <p className="mt-2 text-text-secondary">
            {detail.classroom.memberCount} students
            {detail.classroom.averagePercent === null
              ? ""
              : ` · class average ${detail.classroom.averagePercent}%`}
          </p>
        </div>
        <span className="flex-1" />
        <Button variant="outline" onClick={() => setShowInvite(true)}>
          Invite students
        </Button>
        <Button variant="outline" onClick={exportMarks}>
          Export marks
        </Button>
        <Button onClick={onExams}>New exam</Button>
      </div>
      {detail.classroom.notice ? (
        <aside
          className="mt-6 rounded-lg border border-border bg-bg-secondary p-5"
          aria-label="Classroom notice"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Class notice
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
                {detail.classroom.notice}
              </p>
            </div>
            {detail.classroom.noticeUpdatedAt ? (
              <time className="text-xs text-text-muted">
                Updated {fullDate(detail.classroom.noticeUpdatedAt)}
              </time>
            ) : null}
          </div>
        </aside>
      ) : null}
      {detail.classroom.actionRequiredCount ? (
        <aside className="mt-6 flex flex-wrap items-center gap-4 rounded-lg bg-text-primary p-6 text-text-inverse">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold">
              {detail.classroom.actionRequiredCount} papers waiting to be published
            </h2>
            <p className="mt-2 text-sm opacity-70">
              Students cannot see these marks until you publish them.
            </p>
          </div>
          {detail.canManage ? (
            <Button
              variant="inverse"
              onClick={() => void publishWaitingResults()}
              disabled={publishingResults}
            >
              {publishingResults
                ? "Publishing…"
                : `Publish all ${detail.classroom.actionRequiredCount}`}
            </Button>
          ) : null}
        </aside>
      ) : null}

      <div
        role="tablist"
        aria-label="Classroom workspace"
        className="mt-8 flex gap-2 overflow-x-auto border-b border-border"
      >
        {(
          [
            ["students", "Students", detail.roster.length],
            ["exams", "Exams", detail.exams.length],
            ["performance", "Class performance", null],
            ["material", "Material", classroomDocuments.length],
            ["activity", "Activity", detail.activity.length],
            ["settings", "Settings", null],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "min-h-12 shrink-0 border-b-2 px-4 text-sm font-medium",
              interactive,
              tab === value
                ? "border-text-primary text-text-primary"
                : "border-transparent text-text-muted",
            )}
          >
            {label}
            {count === null ? "" : ` ${count}`}
          </button>
        ))}
      </div>

      {tab === "students" ? (
        <section className="mt-6">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_190px]">
            <div>
              <label htmlFor="classroom-roster-search" className="sr-only">
                Find a student by name
              </label>
              <input
                id="classroom-roster-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleStudents(9);
                }}
                placeholder="Find a student by name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="student-status-filter" className="sr-only">
                Filter student status
              </label>
              <select
                id="student-status-filter"
                value={studentStatus}
                onChange={(event) => {
                  setStudentStatus(event.target.value as typeof studentStatus);
                  setVisibleStudents(9);
                }}
                className={inputClass}
              >
                <option value="all">All student statuses</option>
                <option value="needs-help">Needs help</option>
                <option value="needs-attention">Needs attention</option>
                <option value="on-track">On track</option>
                <option value="doing-well">Doing well</option>
                <option value="not-started">Nothing handed in</option>
              </select>
            </div>
            <div>
              <label htmlFor="student-sort" className="sr-only">
                Sort students
              </label>
              <select
                id="student-sort"
                value={studentSort}
                onChange={(event) => setStudentSort(event.target.value as typeof studentSort)}
                className={inputClass}
              >
                <option value="lowest">Lowest marks first</option>
                <option value="highest">Highest marks first</option>
                <option value="az">Name A–Z</option>
              </select>
            </div>
          </div>
          {roster.length ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-border">
              {shownRoster.map((student, index) => (
                <button
                  type="button"
                  key={student.studentId}
                  onClick={() => setSelectedStudentId(student.studentId)}
                  className={cn(
                    "flex min-h-20 w-full items-center gap-3 p-4 text-left",
                    interactive,
                    index && "border-t border-border",
                    student.status === "needs-attention" && "bg-bg-secondary",
                  )}
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border font-mono text-xs"
                    aria-hidden="true"
                  >
                    {initials(student.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{student.name}</h2>
                    <p className="mt-1 text-xs text-text-muted">
                      {statusLabel(student.status)} · {student.submissionCount} submissions
                    </p>
                  </div>
                  <strong className="font-display text-lg">
                    {student.averagePercent === null ? "—" : `${student.averagePercent}%`}
                  </strong>
                </button>
              ))}
              {shownRoster.length < roster.length ? (
                <div className="border-t border-border p-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleStudents((count) => count + 9)}
                  >
                    Show 9 more
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <h2 className="font-display text-xl font-semibold">
                {detail.roster.length ? "Nobody matches" : "No students have joined yet"}
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                {detail.roster.length
                  ? "Try another name."
                  : `Share join code ${detail.classroom.joinCode} with students.`}
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "performance" ? (
        <section className="mt-6 space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="rounded-lg border border-border p-5">
              <h2 className="font-display text-xl font-semibold">Class performance</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Calculated only from this classroom&apos;s graded submissions.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-bg-secondary p-4">
                  <p className="text-xs text-text-muted">Class average</p>
                  <strong className="mt-2 block font-display text-3xl">
                    {detail.classroom.averagePercent === null
                      ? "—"
                      : `${detail.classroom.averagePercent}%`}
                  </strong>
                </div>
                <div className="rounded-lg bg-bg-secondary p-4">
                  <p className="text-xs text-text-muted">Need attention</p>
                  <strong className="mt-2 block font-display text-3xl">
                    {detail.roster.filter((student) => student.status === "needs-attention").length}
                  </strong>
                </div>
                <div className="rounded-lg bg-bg-secondary p-4">
                  <p className="text-xs text-text-muted">Doing well</p>
                  <strong className="mt-2 block font-display text-3xl">
                    {detail.roster.filter((student) => student.status === "doing-well").length}
                  </strong>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-5">
              <h2 className="font-display text-xl font-semibold">Exam averages</h2>
              <div className="mt-4 space-y-4">
                {detail.exams.length ? (
                  detail.exams.map((exam) => (
                    <div key={exam.assignmentId}>
                      <div className="flex gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{exam.title}</span>
                        <strong>
                          {exam.averagePercent === null ? "—" : `${exam.averagePercent}%`}
                        </strong>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-secondary">
                        <div
                          className="h-full rounded-full bg-text-primary"
                          style={{
                            width: `${Math.max(0, Math.min(100, exam.averagePercent || 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-muted">No assigned exam data yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Topic and chapter map</h2>
            <p className="mt-2 text-sm text-text-secondary mb-4">
              Scores come from graded question results. Asked counts come from student study-chat
              messages for this subject.
            </p>
            {conceptMapChapters.length ? (
              <ClassroomConceptMapSVG
                subjectName={detail.classroom.subjectName}
                chapters={conceptMapChapters}
                topicsDetail={detail.topics}
                selectedTopic={selectedTopic}
                onSelectTopic={setSelectedTopic}
                source={mapSource}
                onSourceChange={setMapSource}
              />
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-text-muted">
                  Add an editable syllabus and grade question-level exams to build this map.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              [
                "Asked, but not tested",
                detail.topics.filter(
                  (topic) => topic.askedStudentCount > 0 && topic.testedStudentCount === 0,
                ),
                "Students asked about these topics, but no graded question has tested them yet.",
              ],
              [
                "Losing marks, never asked",
                detail.topics.filter(
                  (topic) =>
                    topic.percentage !== null &&
                    topic.percentage < 45 &&
                    topic.askedStudentCount === 0,
                ),
                "The class is losing marks here without asking about the topic in study chat.",
              ],
              [
                "Weak on both",
                detail.topics.filter(
                  (topic) =>
                    topic.percentage !== null &&
                    topic.percentage < 45 &&
                    topic.askedStudentCount > 0,
                ),
                "Students asked for help and still scored below 45%.",
              ],
            ].map(([title, topics, description]) => (
              <article key={title as string} className="rounded-lg border border-border p-5">
                <h2 className="font-display text-lg font-semibold">{title as string}</h2>
                <p className="mt-2 text-xs text-text-muted">{description as string}</p>
                <div className="mt-4 space-y-2">
                  {(topics as ClassroomDetail["topics"]).length ? (
                    (topics as ClassroomDetail["topics"]).map((topic) => (
                      <button
                        type="button"
                        key={topic.name}
                        onClick={() => setSelectedTopic(topic.name)}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-3 rounded-md bg-bg-secondary px-3 text-left text-sm",
                          interactive,
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                        <strong>
                          {topic.percentage === null ? "Not tested" : `${topic.percentage}%`}
                        </strong>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-text-muted">
                      Nothing appears here from current evidence.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "material" ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => setShowUploadMaterialModal(true)} disabled={!subject}>
              Add material
            </Button>
            <p className="text-sm text-text-muted">
              Shared by every classroom you teach {detail.classroom.subjectName} to — add it once.
            </p>
          </div>
          {classroomDocuments.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {classroomDocuments.map((doc) => (
                <article
                  key={doc.id}
                  className="flex flex-col justify-between rounded-lg border border-border p-4 transition hover:border-border-strong hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                        {doc.shelf}
                      </span>
                      <span className="flex-1" />
                      <span className="font-mono text-xs text-text-muted">
                        {bytesLabel(doc.sizeBytes)}
                      </span>
                    </div>
                    <h3 className="mt-3 break-words font-semibold leading-snug">{doc.name}</h3>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {doc.status === "ready" ? (
                      <span className="rounded-full border border-border bg-bg-secondary px-2.5 py-0.5 text-xs">
                        ready{doc.chunks ? ` · ${doc.chunks} sections` : ""}
                      </span>
                    ) : doc.status === "processing" ? (
                      <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                        getting ready…
                      </span>
                    ) : (
                      <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                        couldn&apos;t read it
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-xs font-medium text-text-muted hover:text-text-primary"
                      onClick={() => setMaterialDocumentId(doc.id)}
                    >
                      {doc.previewAvailable ? "Preview" : "Details"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <h3 className="font-display text-lg font-semibold">Nothing added yet</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Until there is material here, the tutor has nothing to answer from.
              </p>
            </div>
          )}
          {showUploadMaterialModal && subject ? (
            <UploadDialog
              subject={subject}
              shelf="Notes"
              onClose={() => setShowUploadMaterialModal(false)}
              onUploaded={async (result) => {
                setShowUploadMaterialModal(false);
                await onChanged(result.message);
              }}
            />
          ) : null}
          {materialDocument ? (
            <DocumentDialog
              document={materialDocument}
              onClose={() => setMaterialDocumentId("")}
              onChanged={async (message) => {
                setMaterialDocumentId("");
                await onChanged(message);
              }}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="mt-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">Classroom activity</h2>
            <p className="mt-2 text-sm text-text-secondary">
              A history of classroom, teacher, exam and submission changes.
            </p>
          </div>
          {detail.activity.length ? (
            <ol className="mt-5 overflow-hidden rounded-lg border border-border">
              {detail.activity.map((item, index) => (
                <li
                  key={item.id}
                  className={cn("flex gap-4 p-4", index && "border-t border-border")}
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.summary}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.actorName} · {fullDate(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <h3 className="font-display text-xl font-semibold">No activity recorded yet</h3>
              <p className="mt-2 text-sm text-text-secondary">
                New classroom changes will appear here after the workflow migration is applied.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "exams" ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onExams}>New exam</Button>
            <Button variant="outline" onClick={() => setShowReuseModal(true)}>
              Reuse one I wrote
            </Button>
            <p className="text-sm text-text-muted">
              Generate from indexed teacher material, or reuse an existing exam for this classroom.
            </p>
          </div>
          {detail.exams.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.exams.map((exam) => {
                const chip = humanizedExamWindowChip(exam.opensAt, exam.closesAt);
                return (
                  <article key={exam.assignmentId} className="rounded-lg border border-border p-5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium",
                          chip.badgeClass,
                        )}
                      >
                        {chip.label}
                      </span>
                      <span className="flex-1" />
                      <span className="text-xs text-text-muted">{exam.totalMarks} marks</span>
                    </div>
                    <h2 className="mt-4 font-display text-xl font-semibold">{exam.title}</h2>
                    <p className="mt-2 text-sm text-text-muted">
                      {exam.questionCount} questions · {exam.submissionCount} of{" "}
                      {detail.roster.length} handed in
                      {exam.onPaperCount ? ` · ${exam.onPaperCount} on paper` : ""}
                    </p>
                    <p className="mt-5 text-sm">
                      {exam.actionRequiredCount
                        ? `${exam.actionRequiredCount} to publish`
                        : exam.averagePercent === null
                          ? "No graded submissions yet"
                          : `Class average ${exam.averagePercent}%`}
                    </p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() => manageAssignment(exam)}
                    >
                      Manage dates
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <h2 className="font-display text-xl font-semibold">No exam for this classroom yet</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Generate a paper, then publish it to this classroom.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <form onSubmit={renameClassroom} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Classroom name</h2>
            <label htmlFor="classroom-rename" className="mt-5 block text-sm font-medium">
              Name
            </label>
            <input
              id="classroom-rename"
              value={rename}
              onChange={(event) => setRename(event.target.value)}
              maxLength={120}
              autoComplete="off"
              className={cn(inputClass, "mt-2")}
              disabled={!detail.canManage}
              aria-invalid={actionError ? "true" : undefined}
            />
            <Button
              className="mt-4"
              type="submit"
              disabled={saving || !rename.trim() || !detail.canManage}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save name"}
            </Button>
          </form>
          <div className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Invite students</h2>
            <p className="mt-2 text-sm text-text-secondary">
              One code lets students join this classroom.
            </p>
            <code className="mt-5 inline-block rounded-md bg-bg-secondary px-4 py-3 font-mono">
              {detail.classroom.joinCode}
            </code>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(detail.classroom.joinCode)}
              >
                Copy code
              </Button>
              <a
                href={invitePrintPath}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
                  interactive,
                )}
              >
                Print invite
              </a>
            </div>
            {detail.canManage ? (
              confirmCodeRotation ? (
                <div className="mt-5 rounded-lg bg-bg-secondary p-4">
                  <p className="text-sm text-text-secondary">
                    The old code will immediately stop accepting new students. Already joined
                    students stay in the classroom.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmCodeRotation(false)}
                      disabled={saving}
                    >
                      Keep code
                    </Button>
                    <Button onClick={() => void rotateJoinCode()} disabled={saving}>
                      {saving ? "Creating…" : "Create new code"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => setConfirmCodeRotation(true)}
                >
                  Create new code
                </Button>
              )
            ) : null}
          </div>
          <form onSubmit={saveClassroomDetails} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Term and meeting</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="classroom-term" className="text-sm font-medium">
                  Term or year
                </label>
                <input
                  id="classroom-term"
                  value={termKey}
                  onChange={(event) => setTermKey(event.target.value)}
                  maxLength={40}
                  placeholder={String(new Date().getFullYear())}
                  className={cn(inputClass, "mt-2")}
                  disabled={!detail.canManage}
                />
              </div>
              <div>
                <label htmlFor="classroom-meeting" className="text-sm font-medium">
                  Meeting schedule
                </label>
                <input
                  id="classroom-meeting"
                  value={meetingSchedule}
                  onChange={(event) => setMeetingSchedule(event.target.value)}
                  maxLength={240}
                  placeholder="Sun, Tue · 10:00–11:00 · Room 302"
                  className={cn(inputClass, "mt-2")}
                  disabled={!detail.canManage}
                />
              </div>
            </div>
            <Button
              className="mt-4"
              type="submit"
              disabled={saving || !termKey.trim() || !detail.canManage}
            >
              {saving ? "Saving…" : "Save details"}
            </Button>
          </form>
          <form onSubmit={saveNotice} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Classroom notice</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Post or edit the notice students and teachers see at the top of this classroom.
            </p>
            <label htmlFor="classroom-notice" className="sr-only">
              Classroom notice
            </label>
            <textarea
              id="classroom-notice"
              value={notice}
              onChange={(event) => setNotice(event.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="Next class: bring your lab record."
              className={cn(inputClass, "mt-4 resize-y py-3")}
              disabled={!detail.canManage}
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="submit" disabled={saving || !detail.canManage}>
                {saving ? "Saving…" : notice.trim() ? "Post notice" : "Remove notice"}
              </Button>
              {notice ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNotice("")}
                  disabled={!detail.canManage}
                >
                  Clear draft
                </Button>
              ) : null}
            </div>
          </form>
          <div className="rounded-lg border border-border p-5 lg:col-span-2">
            <h2 className="font-display text-xl font-semibold">Teaching team</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Lead teachers manage the classroom. Helpers can open it and support the class.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detail.teachers.map((item) => (
                <div
                  key={item.teacherId}
                  className="flex items-center gap-3 rounded-lg bg-bg-secondary p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.handle}</p>
                    <p className="mt-1 text-xs capitalize text-text-muted">{item.role} teacher</p>
                  </div>
                  {item.role === "helper" && detail.canManage ? (
                    <Button
                      variant="outline"
                      onClick={() => void removeHelper(item.teacherId)}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  ) : (
                    <span className="rounded-full border border-border px-3 py-1 text-xs capitalize">
                      {item.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {detail.canManage ? (
              <form onSubmit={addHelper} className="mt-5 flex flex-col gap-3 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <label htmlFor="helper-handle" className="sr-only">
                    Co-teacher handle
                  </label>
                  <input
                    id="helper-handle"
                    value={helperHandle}
                    onChange={(event) => setHelperHandle(event.target.value)}
                    placeholder="Exact teacher handle"
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
                <Button type="submit" disabled={saving || !helperHandle.trim()}>
                  {saving ? "Adding…" : "Add co-teacher"}
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-text-muted">
                You are a helper in this classroom. Only a lead teacher can edit the teaching team.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-destructive/30 p-5 lg:col-span-2">
            <h2 className="font-display text-xl font-semibold">Archive classroom</h2>
            <p className="mt-2 text-sm text-text-secondary">
              It disappears from active classrooms. Existing papers and submissions stay stored.
            </p>
            {!detail.canManage ? (
              <p className="mt-4 text-sm text-text-muted">
                Only a lead teacher can archive this classroom.
              </p>
            ) : confirmArchive ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmArchive(false)}
                  disabled={saving}
                >
                  Keep classroom
                </Button>
                <Button
                  onClick={() => void archiveClassroom()}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? "Archiving…" : "Archive now"}
                </Button>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => setConfirmArchive(true)}>
                Archive classroom
              </Button>
            )}
          </div>
          {actionError ? (
            <p role="alert" className="text-sm text-destructive lg:col-span-2">
              {actionError}
            </p>
          ) : null}
        </section>
      ) : null}

      {selectedStudent ? (
        <Dialog title={selectedStudent.name} onClose={() => setSelectedStudentId("")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Average</p>
              <strong className="mt-2 block font-display text-2xl">
                {selectedStudent.averagePercent === null
                  ? "—"
                  : `${selectedStudent.averagePercent}%`}
              </strong>
            </div>
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Submissions</p>
              <strong className="mt-2 block font-display text-2xl">
                {selectedStudent.submissionCount}
              </strong>
            </div>
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Status</p>
              <strong className="mt-2 block text-sm">{statusLabel(selectedStudent.status)}</strong>
            </div>
          </div>
          <p className="mt-5 text-sm text-text-secondary">
            Joined {fullDate(selectedStudent.joinedAt)}. These figures contain only this
            classroom&apos;s saved submissions.
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-display text-lg font-semibold">Chapter by chapter</h3>
            {selectedStudent.topics.length ? (
              <div className="mt-3 space-y-2">
                {selectedStudent.topics.map((topic) => {
                  const mastery = masteryLabelAndColor(topic.percentage);
                  return (
                    <div
                      key={topic.name}
                      className="flex items-center gap-3 rounded-lg bg-bg-secondary p-4"
                    >
                      <span className={cn("h-3 w-3 shrink-0 rounded-full", mastery.bgDot)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{topic.name}</p>
                          <span className={cn("text-xs font-medium", mastery.color)}>
                            · {mastery.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          {topic.asked ? "Asked in study chat" : "Not asked in study chat"} ·{" "}
                          {topic.tested ? "Tested" : "Not tested"}
                        </p>
                      </div>
                      <strong>{topic.percentage === null ? "—" : `${topic.percentage}%`}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-muted">No syllabus topics are available yet.</p>
            )}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-display text-lg font-semibold">Exam and attempt history</h3>
            {selectedStudent.submissions.length ? (
              <div className="mt-3 space-y-3">
                {selectedStudent.submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center gap-3 rounded-lg bg-bg-secondary p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {submission.title} · Attempt {submission.attemptNo}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {submission.source} · {fullDate(submission.createdAt)}
                      </p>
                    </div>
                    <strong>
                      {submission.percentage === null ? "—" : `${submission.percentage}%`}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-muted">No submissions yet.</p>
            )}
          </div>
        </Dialog>
      ) : null}
      {selectedTopicDetail ? (
        <Dialog title={selectedTopicDetail.name} onClose={() => setSelectedTopic("")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Class score</p>
              <strong className="mt-2 block font-display text-2xl">
                {selectedTopicDetail.percentage === null
                  ? "—"
                  : `${selectedTopicDetail.percentage}%`}
              </strong>
            </div>
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Students tested</p>
              <strong className="mt-2 block font-display text-2xl">
                {selectedTopicDetail.testedStudentCount}
              </strong>
            </div>
            <div className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs text-text-muted">Students who asked</p>
              <strong className="mt-2 block font-display text-2xl">
                {selectedTopicDetail.askedStudentCount}
              </strong>
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-display text-lg font-semibold">Struggling students</h3>
            {selectedTopicDetail.strugglingStudents.length ? (
              <div className="mt-3 space-y-2">
                {selectedTopicDetail.strugglingStudents.map((student) => (
                  <button
                    type="button"
                    key={student.studentId}
                    onClick={() => {
                      setSelectedTopic("");
                      setSelectedStudentId(student.studentId);
                    }}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-lg bg-bg-secondary px-4 text-left",
                      interactive,
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{student.name}</span>
                    <strong>{student.percentage}%</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-muted">
                No student with a score below 45% for this topic.
              </p>
            )}
          </div>
        </Dialog>
      ) : null}
      {managingAssignmentId ? (
        <Dialog title="Manage assigned exam" onClose={() => setManagingAssignmentId("")}>
          <form onSubmit={saveAssignmentWindow}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="assignment-opens" className="text-sm font-medium">
                  Opens <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="assignment-opens"
                  type="datetime-local"
                  value={assignmentOpensAt}
                  onChange={(event) => setAssignmentOpensAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
              </div>
              <div>
                <label htmlFor="assignment-closes" className="text-sm font-medium">
                  Closes <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="assignment-closes"
                  type="datetime-local"
                  value={assignmentClosesAt}
                  onChange={(event) => setAssignmentClosesAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
              </div>
            </div>
            <label htmlFor="assignment-attempts" className="mt-4 block text-sm font-medium">
              Attempts allowed
            </label>
            <input
              id="assignment-attempts"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={assignmentMaxAttempts}
              onChange={(event) =>
                setAssignmentMaxAttempts(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
              }
              className={cn(inputClass, "mt-2")}
            />
            <p className="mt-2 text-xs text-text-muted">
              Between 1 and 10. Existing attempts stay in history.
            </p>
            {actionError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setManagingAssignmentId("")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save dates"}
              </Button>
            </div>
          </form>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-medium">Remove from classroom</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Students will stop seeing this assignment. Existing submissions remain stored.
            </p>
            {confirmUnpublish ? (
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmUnpublish(false)}
                  disabled={saving}
                >
                  Keep assigned
                </Button>
                <Button onClick={() => void unpublishAssignment()} disabled={saving}>
                  {saving ? "Removing…" : "Remove now"}
                </Button>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => setConfirmUnpublish(true)}>
                Remove exam
              </Button>
            )}
          </div>
        </Dialog>
      ) : null}
      {showInvite ? (
        <Dialog title="Invite students" onClose={() => setShowInvite(false)}>
          <div className="grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <div className="mx-auto rounded-lg border border-border bg-white p-2">
              <QRCodeSVG
                value={inviteUrl}
                size={160}
                level="M"
                marginSize={1}
                title="Classroom invite QR code"
              />
            </div>
            <div>
              <p className="text-sm text-text-secondary">
                Students can scan the QR, open the link, or type this code in Exams.
              </p>
              <code className="mt-4 inline-block rounded-lg bg-bg-secondary px-4 py-3 font-mono text-lg">
                {detail.classroom.joinCode}
              </code>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  onClick={() => void navigator.clipboard.writeText(detail.classroom.joinCode)}
                >
                  Copy code
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                >
                  Copy link
                </Button>
                <a
                  href={invitePrintPath}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
                    interactive,
                  )}
                >
                  Print invite
                </a>
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}
      {showCsvPreviewModal ? (
        <Dialog title="Export marks — Preview" onClose={() => setShowCsvPreviewModal(false)}>
          <p className="text-sm text-text-secondary">
            Review the CSV data below, then download or copy it.
          </p>
          <textarea
            readOnly
            value={csvPreviewText}
            className="mt-4 h-56 w-full rounded-lg border border-border bg-bg-secondary p-3 font-mono text-xs"
          />
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(csvPreviewText)}
            >
              Copy to clipboard
            </Button>
            <Button onClick={downloadCsv}>Download CSV</Button>
          </div>
        </Dialog>
      ) : null}
      {showReuseModal && detail ? (
        <ReusePaperDialog
          classroomId={detail.classroom.id}
          classroomName={detail.classroom.name}
          subjectSlug={detail.classroom.subjectSlug}
          subjectName={detail.classroom.subjectName}
          assignedPaperIds={detail.exams.map((e) => e.externalPaperId)}
          onClose={() => setShowReuseModal(false)}
          onAssigned={async (message) => {
            setShowReuseModal(false);
            setSelectedReusePaperId("");
            await load();
            await onChanged(message);
          }}
        />
      ) : null}
    </>
  );
}
function ReusePaperDialog({
  classroomId,
  classroomName,
  subjectSlug,
  subjectName,
  assignedPaperIds,
  onClose,
  onAssigned,
}: {
  classroomId: string;
  classroomName: string;
  subjectSlug: string;
  subjectName: string;
  assignedPaperIds: string[];
  onClose: () => void;
  onAssigned: (message: string) => Promise<void>;
}) {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const assignedSet = useMemo(() => new Set(assignedPaperIds), [assignedPaperIds]);

  useEffect(() => {
    void (async () => {
      setState("loading");
      try {
        const payload = await responsePayload(
          await fetch("/api/teacher/exams", {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }),
        );
        const all = list(payload.papers)
          .map(normalizeExamPaper)
          .filter((p): p is ExamPaper => p !== null);
        const available = all.filter(
          (p) =>
            (p.subjectSlug === subjectSlug ||
              p.subject.toLowerCase() === subjectName.toLowerCase()) &&
            !assignedSet.has(p.id),
        );
        setPapers(available);
        setState("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load papers.");
        setState("error");
      }
    })();
  }, [subjectSlug, subjectName, assignedSet]);

  async function assign() {
    if (!selectedId) return;
    setBusy(true);
    setSubmitError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(selectedId)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            classroomId,
            opensAt: opensAt ? new Date(opensAt).toISOString() : null,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            maxAttempts: 1,
          }),
        }),
      );
      const paper = papers.find((p) => p.id === selectedId);
      await onAssigned(`${paper?.title || "Exam"} assigned to ${classroomName}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not assign exam.");
      setBusy(false);
    }
  }

  const kindLabel = (k: string) => (k === "class-test" ? "class test" : k);

  return (
    <Dialog title={`Reuse an exam for ${classroomName}`} onClose={onClose}>
      <p className="text-sm text-text-muted">
        Papers you&apos;ve written for {subjectName}. This classroom gets its own dates and its own
        marks.
      </p>
      {state === "loading" ? (
        <div className="mt-5 space-y-2" role="status" aria-label="Loading reusable exams">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} />
          ))}
        </div>
      ) : state === "error" ? (
        <p className="mt-5 text-sm text-destructive">{error}</p>
      ) : papers.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="font-medium">Nothing else written for this subject yet</p>
          <p className="mt-1 text-sm text-text-muted">
            Generate a new exam first from the Exams workspace.
          </p>
        </div>
      ) : (
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {papers.map((paper) => (
            <button
              key={paper.id}
              type="button"
              onClick={() => setSelectedId(paper.id === selectedId ? "" : paper.id)}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition",
                paper.id === selectedId
                  ? "border-text-primary bg-bg-secondary shadow-sm"
                  : "border-border hover:border-border-strong hover:bg-bg-secondary/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                  {kindLabel(paper.kind)}
                </span>
                <span className="flex-1" />
                <span className="text-xs text-text-muted">
                  {paper.totalMarks} marks · {paper.questions.length} questions
                </span>
              </div>
              <h3 className="mt-2 font-semibold">{paper.title}</h3>
            </button>
          ))}
        </div>
      )}
      {selectedId ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="reuse-opens" className="text-sm font-medium">
              Opens <span className="text-text-muted">(optional)</span>
            </label>
            <input
              id="reuse-opens"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className={cn(inputClass, "mt-2")}
            />
          </div>
          <div>
            <label htmlFor="reuse-closes" className="text-sm font-medium">
              Closes <span className="text-text-muted">(optional)</span>
            </label>
            <input
              id="reuse-closes"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className={cn(inputClass, "mt-2")}
            />
          </div>
        </div>
      ) : null}
      {submitError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!selectedId || busy} onClick={() => void assign()}>
          {busy ? "Assigning…" : "Give this to the classroom"}
        </Button>
      </div>
    </Dialog>
  );
}

function CreateClassroomDialog({
  subjects,
  classrooms,
  initialSubjectSlug,
  onClose,
  onAddSubject,
  onCreated,
}: {
  subjects: TeacherSubject[];
  classrooms: TeacherDashboard["classrooms"];
  initialSubjectSlug?: string;
  onClose: () => void;
  onAddSubject: () => void;
  onCreated: (classroom: { id: string }) => Promise<void>;
}) {
  const [subjectSlug, setSubjectSlug] = useState(
    initialSubjectSlug && subjects.some((subject) => subject.slug === initialSubjectSlug)
      ? initialSubjectSlug
      : subjects[0]?.slug || "",
  );
  const [name, setName] = useState("");
  const [batch, setBatch] = useState("new");
  const [termKey, setTermKey] = useState(String(new Date().getFullYear()));
  const [meetingSchedule, setMeetingSchedule] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reusableBatches = Array.from(
    new Map(classrooms.map((classroom) => [classroom.name, classroom])).values(),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjects.length || !subjectSlug) {
      onAddSubject();
      return;
    }
    const sourceClassroom = batch.startsWith("classroom:")
      ? classrooms.find((classroom) => classroom.id === batch.slice("classroom:".length))
      : null;
    const classroomName =
      batch === "online" ? "Anyone, online" : sourceClassroom?.name || name.trim();
    if (!classroomName) {
      setError("Enter a classroom code or section name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/classrooms", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            subjectSlug,
            name: classroomName,
            termKey,
            meetingSchedule,
            sourceClassroomId: sourceClassroom?.id,
          }),
        }),
      );
      const classroom = asRecord(payload.classroom);
      await onCreated({ id: text(classroom.id) });
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Could not create the classroom.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog title="New classroom" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="create-classroom-subject" className="text-sm font-medium">
            Which subject does it teach?
          </label>
          <select
            id="create-classroom-subject"
            value={subjectSlug}
            onChange={(event) => setSubjectSlug(event.target.value)}
            className={cn(inputClass, "mt-2")}
          >
            {subjects.length ? (
              subjects.map((subject) => (
                <option key={subject.slug} value={subject.slug}>
                  {titleCase(subject.name)}
                  {subject.code ? ` · ${subject.code}` : ""}
                </option>
              ))
            ) : (
              <option value="">I haven&apos;t added it yet</option>
            )}
          </select>
          <p className="mt-1 text-sm text-text-muted">
            {subjects.length ? "Not there? " : "A classroom needs a subject. "}
            <button
              type="button"
              onClick={onAddSubject}
              className={cn("min-h-10 underline underline-offset-4", interactive)}
            >
              Add the subject first
            </button>
          </p>
        </div>
        <div>
          <label htmlFor="create-classroom-batch" className="text-sm font-medium">
            Which batch of students?
          </label>
          <select
            id="create-classroom-batch"
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            className={cn(inputClass, "mt-2")}
          >
            {reusableBatches.map((classroom) => (
              <option key={classroom.id} value={`classroom:${classroom.id}`}>
                {classroom.name}
                {classroom.memberCount ? ` · ${classroom.memberCount} students` : ""}
              </option>
            ))}
            <option value="online">Anyone, online</option>
            <option value="new">A new classroom of students</option>
          </select>
          {batch.startsWith("classroom:") ? (
            <p className="mt-2 text-xs text-text-muted">
              The enrolled students from this classroom will be copied into the new subject
              classroom.
            </p>
          ) : null}
        </div>
        {batch === "new" ? (
          <div>
            <label htmlFor="create-classroom-name" className="text-sm font-medium">
              Classroom code
            </label>
            <input
              id="create-classroom-name"
              value={name}
              onChange={(event) => setName(event.target.value.toUpperCase())}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              placeholder="SEC BEI 076"
              className={cn(inputClass, "mt-2 font-mono uppercase tracking-wider")}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "create-classroom-error" : "create-classroom-name-hint"}
            />
            {error ? (
              <p id="create-classroom-error" role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p id="create-classroom-name-hint" className="mt-2 text-xs text-text-muted">
                This names the classroom. A unique student join code is generated after creation.
              </p>
            )}
          </div>
        ) : null}
        {batch !== "new" && error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? "Creating…" : subjects.length ? "Create the classroom" : "Add subject first"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ExamsView({
  subjects,
  classrooms,
  initialPaperId,
  onAddSubject,
  onClassrooms,
  onDashboardRefresh,
}: {
  subjects: TeacherSubject[];
  classrooms: TeacherDashboard["classrooms"];
  initialPaperId?: string;
  onAddSubject: () => void;
  onClassrooms: () => void;
  onDashboardRefresh: () => void;
}) {
  const [state, setState] = useState<DashboardState>("loading");
  const [error, setError] = useState("");
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedId, setSelectedId] = useState(initialPaperId || "");
  const [creating, setCreating] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState(subjects[0]?.slug || "");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [passMarks, setPassMarks] = useState(8);
  const [kind, setKind] = useState<ExamPaper["kind"]>("exam");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [suggestedBands, setSuggestedBands] = useState<ExamBandDraft[]>(fallbackExamBands);
  const [bands, setBands] = useState<ExamBandDraft[]>(fallbackExamBands);
  const [mimicQuestionBank, setMimicQuestionBank] = useState(true);
  const [availableChapters, setAvailableChapters] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [patternState, setPatternState] = useState<WorkspaceState>("loading");
  const [patternMessage, setPatternMessage] = useState("");
  const [paperDetailState, setPaperDetailState] = useState<WorkspaceState>("ready");
  const [paperDetailError, setPaperDetailError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/exams", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      const next = list(payload.papers)
        .map(normalizeExamPaper)
        .filter((paper): paper is ExamPaper => paper !== null);
      setPapers(next);
      setSelectedId((current) =>
        current && next.some((paper) => paper.id === current) ? current : "",
      );
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load generated papers.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (initialPaperId) setSelectedId(initialPaperId);
  }, [initialPaperId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!subjectSlug) return;
    let cancelled = false;
    const activeSubject = subjects.find((subject) => subject.slug === subjectSlug);
    if (activeSubject) setTitle(`${activeSubject.name} — internal exam`);
    setPatternState("loading");
    setPatternMessage("");
    void fetch(`/api/teacher/subjects/${encodeURIComponent(subjectSlug)}/insights`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        if (cancelled) return;
        const weightage = asRecord(payload.weightage);
        const topicsPayload = asRecord(payload.topics);
        const chaptersPayload = asRecord(payload.chapters);
        const rawTopics = namedItems(topicsPayload, ["topics", "chapters", "items"]);
        const rawChapters = namedItems(chaptersPayload, ["chapters", "items"]);
        const nextChapters = [...rawTopics, ...rawChapters]
          .map(insightName)
          .filter(Boolean)
          .filter((name, index, values) => values.indexOf(name) === index);
        setAvailableChapters(nextChapters);
        setSelectedChapters([]);
        const nextBands = weightageBands(weightage);
        setSuggestedBands(nextBands);
        setBands(nextBands.map((band) => ({ ...band })));
        const suggestedPassMarks = numberValue(weightage.pass_marks);
        if (suggestedPassMarks > 0) setPassMarks(suggestedPassMarks);
        setPatternMessage(
          text(weightage.note) ||
            (weightage.grounded === false
              ? "No measured past-paper pattern yet. These are conventional defaults."
              : "Question mix and pass marks are grounded in this subject's Question Bank."),
        );
        setPatternState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setAvailableChapters([]);
        setSelectedChapters([]);
        setPatternMessage(
          caught instanceof Error ? caught.message : "Could not load the question-bank pattern.",
        );
        setPatternState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [subjectSlug, subjects]);

  const selectedSubject = subjects.find((subject) => subject.slug === subjectSlug) || null;
  const visiblePapers = papers.filter(
    (paper) =>
      paper.subjectSlug === subjectSlug ||
      (!!selectedSubject && paper.subject.toLowerCase() === selectedSubject.name.toLowerCase()),
  );
  const totalQuestions = bands.reduce((total, band) => total + band.count, 0);
  const totalMarks = bands.reduce((total, band) => total + band.count * band.marksEach, 0);

  function resetBands() {
    setBands(suggestedBands.map((band) => ({ ...band })));
    setError("");
  }

  function updateBand(id: string, update: Partial<Omit<ExamBandDraft, "id">>) {
    setBands((current) => current.map((band) => (band.id === id ? { ...band, ...update } : band)));
  }

  function addBand() {
    setBands((current) =>
      current.length >= 6
        ? current
        : [
            ...current,
            {
              id: crypto.randomUUID(),
              label: "New question band",
              questionType: "Short answer",
              count: 1,
              marksEach: 5,
            },
          ],
    );
  }

  const loadPaperDetail = useCallback(async (paperId: string) => {
    if (!paperId) return;
    setPaperDetailState("loading");
    setPaperDetailError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paperId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      const detailed = normalizeExamPaper(payload.paper);
      if (!detailed) throw new Error("The paper detail response was incomplete.");
      setPapers((current) => [detailed, ...current.filter((paper) => paper.id !== detailed.id)]);
      setPaperDetailState("ready");
    } catch (caught) {
      setPaperDetailError(caught instanceof Error ? caught.message : "Could not load the paper.");
      setPaperDetailState("error");
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadPaperDetail(selectedId);
  }, [selectedId, loadPaperDetail]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !bands.length ||
      bands.some(
        (band) =>
          !band.label.trim() || !band.questionType.trim() || band.count < 1 || band.marksEach < 0.5,
      )
    ) {
      setError("Keep at least one complete band with a label, type, count, and marks.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/exams/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            subjectSlug,
            title,
            instruction,
            passMarks,
            kind,
            timeLimitMinutes,
            chapters: selectedChapters,
            mimicQuestionBank,
            useSuggestedWeightage: false,
            bands: bands.map(({ label, questionType, count, marksEach }) => ({
              label,
              questionType,
              count,
              marksEach,
            })),
          }),
        }),
      );
      const paper = normalizeExamPaper(payload.paper);
      if (!paper) throw new Error("The generated paper response was incomplete.");
      setPapers((current) => [paper, ...current.filter((item) => item.id !== paper.id)]);
      setSelectedId(paper.id);
      setTitle(`${selectedSubject?.name || "Subject"} — internal exam`);
      setInstruction("");
      onDashboardRefresh();
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Could not generate the exam.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (selectedId) {
    const paper = papers.find((item) => item.id === selectedId);
    if (paper) {
      if (paperDetailState === "loading" && !paper.questions.length)
        return <ExamWorkspaceSkeleton />;
      if (paperDetailState === "error" && !paper.questions.length)
        return (
          <DashboardError
            message={paperDetailError}
            onRetry={() => void loadPaperDetail(selectedId)}
          />
        );
      return (
        <ExamPaperView
          paper={paper}
          classrooms={classrooms.filter((classroom) => classroom.subjectSlug === paper.subjectSlug)}
          onBack={() => setSelectedId("")}
          onChanged={async (archived) => {
            await load();
            if (archived) setSelectedId("");
            onDashboardRefresh();
          }}
          onClassrooms={onClassrooms}
        />
      );
    }
  }

  if (state === "loading" && !papers.length) return <ExamWorkspaceSkeleton />;
  if (state === "error" && !papers.length)
    return <DashboardError message={error} onRetry={() => void load()} />;

  return (
    <>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Practice API · teacher material
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold">Exams</h1>
        <p className="mt-2 text-text-secondary">
          Generate from indexed subjects, inspect reference answers, and publish to a matching
          classroom.
        </p>
      </div>

      {subjects.length ? (
        <form onSubmit={generate} className="mt-8 rounded-lg border border-border p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="exam-subject" className="text-sm font-medium">
                Subject
              </label>
              <select
                id="exam-subject"
                value={subjectSlug}
                onChange={(event) => setSubjectSlug(event.target.value)}
                className={cn(inputClass, "mt-2")}
              >
                {subjects.map((subject) => (
                  <option key={subject.slug} value={subject.slug}>
                    {titleCase(subject.name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exam-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="exam-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                autoComplete="off"
                placeholder="Midterm exam"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <fieldset className="mt-5 rounded-lg border border-border p-4">
            <legend className="px-2 text-sm font-medium">Marks distribution</legend>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-display text-xl font-semibold">
                  {totalQuestions} question(s) · {totalMarks} marks
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Suggested from the Question Bank. Change anything—the suggestion is evidence, not
                  a rule.
                </p>
              </div>
              <span className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={resetBands}
                disabled={patternState === "loading"}
              >
                Reset to suggested
              </Button>
            </div>
            {patternState === "loading" ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-20" />
                ))}
              </div>
            ) : (
              <>
                <p
                  className={cn(
                    "mt-4 rounded-lg border p-3 text-sm",
                    patternState === "error"
                      ? "border-warning/40 text-warning"
                      : "border-border text-text-secondary",
                  )}
                >
                  {patternMessage}
                </p>
                <div className="mt-4 space-y-3">
                  {bands.map((band, index) => (
                    <div
                      key={band.id}
                      className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)_110px_120px_44px] md:items-end"
                    >
                      <div>
                        <label
                          htmlFor={`exam-band-label-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Band
                        </label>
                        <input
                          id={`exam-band-label-${band.id}`}
                          value={band.label}
                          maxLength={40}
                          onChange={(event) => updateBand(band.id, { label: event.target.value })}
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-type-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Type
                        </label>
                        <input
                          id={`exam-band-type-${band.id}`}
                          value={band.questionType}
                          maxLength={120}
                          onChange={(event) =>
                            updateBand(band.id, { questionType: event.target.value })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-count-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Count
                        </label>
                        <input
                          id={`exam-band-count-${band.id}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={band.count}
                          onChange={(event) =>
                            updateBand(band.id, {
                              count: Math.max(0, Math.min(20, Number(event.target.value) || 0)),
                            })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-marks-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Marks each
                        </label>
                        <input
                          id={`exam-band-marks-${band.id}`}
                          type="text"
                          inputMode="decimal"
                          value={band.marksEach}
                          onChange={(event) =>
                            updateBand(band.id, {
                              marksEach: Math.max(
                                0,
                                Math.min(100, Number(event.target.value) || 0),
                              ),
                            })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 px-0"
                        aria-label={`Remove band ${index + 1}`}
                        onClick={() =>
                          setBands((current) => current.filter((item) => item.id !== band.id))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                {!bands.length ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
                  >
                    Add at least one question band before generating.
                  </p>
                ) : null}
                <Button
                  className="mt-4"
                  type="button"
                  variant="outline"
                  onClick={addBand}
                  disabled={bands.length >= 6}
                >
                  Add band
                </Button>
              </>
            )}
          </fieldset>
          {availableChapters.length ? (
            <fieldset className="mt-5">
              <legend className="text-sm font-medium">
                Chapters{" "}
                <span className="font-normal text-text-muted">
                  (leave all unchecked for the whole subject)
                </span>
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableChapters.map((chapter) => {
                  const checked = selectedChapters.includes(chapter);
                  return (
                    <label
                      key={chapter}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
                        checked ? "border-border-strong bg-bg-secondary" : "border-border",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedChapters((current) =>
                            current.includes(chapter)
                              ? current.filter((item) => item !== chapter)
                              : [...current, chapter],
                          )
                        }
                      />
                      <span>{chapter}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={mimicQuestionBank}
              onChange={(event) => setMimicQuestionBank(event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-border"
            />
            <span>
              <span className="block text-sm font-medium">Match my past-paper style</span>
              <span className="mt-1 block text-xs text-text-muted">
                Uses Question Bank examples for style, scope, and difficulty while answers stay
                grounded in Notes.
              </span>
            </span>
          </label>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-[180px_220px_180px_1fr]">
            <div>
              <label htmlFor="exam-pass-marks" className="text-sm font-medium">
                Pass marks
              </label>
              <input
                id="exam-pass-marks"
                type="text"
                inputMode="decimal"
                value={passMarks}
                onChange={(event) => setPassMarks(Math.max(0, Number(event.target.value) || 0))}
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="exam-kind" className="text-sm font-medium">
                Kind
              </label>
              <select
                id="exam-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as ExamPaper["kind"])}
                className={cn(inputClass, "mt-2")}
              >
                <option value="exam">Exam</option>
                <option value="class-test">Class test</option>
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
            <div>
              <label htmlFor="exam-time-limit" className="text-sm font-medium">
                Time limit (minutes)
              </label>
              <input
                id="exam-time-limit"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={timeLimitMinutes}
                onChange={(event) =>
                  setTimeLimitMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))
                }
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="exam-instruction" className="text-sm font-medium">
                Extra instruction <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="exam-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={1000}
                placeholder="Focus on units 1–3 and include one worked calculation"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={creating || patternState === "loading" || !bands.length}
              aria-busy={creating}
            >
              {creating
                ? "Writing questions from your material…"
                : `Generate ${selectedSubject?.name || "subject"} paper`}
            </Button>
            <p className="text-xs text-text-muted">
              Uses the subject-safe Collection Generate API. Generation can take a little time.
            </p>
          </div>
        </form>
      ) : (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <h2 className="font-display text-xl font-semibold">Create a subject first</h2>
          <p className="mt-2 text-sm text-text-secondary">
            An exam must use one subject from your collection.
          </p>
          <Button className="mt-5" onClick={onAddSubject}>
            Add the subject first
          </Button>
        </div>
      )}

      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-semibold">Papers you have set</h2>
          <span className="text-sm text-text-muted">{visiblePapers.length}</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Every paper generated for {selectedSubject?.name || "this subject"}, newest first. Open
          one to read, print, share, or publish.
        </p>
        {visiblePapers.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePapers.map((paper) => (
              <button
                key={paper.id}
                type="button"
                onClick={() => setSelectedId(paper.id)}
                className={cn(
                  "min-h-48 rounded-lg border border-border p-5 text-left transition hover:border-border-strong",
                  interactive,
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {paper.subject}
                  </span>
                  <span className="flex-1" />
                  <span className="text-xs text-text-muted">{paper.totalMarks} marks</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{paper.title}</h3>
                <p className="mt-2 text-sm text-text-muted">
                  {paper.questions.length
                    ? `${paper.questions.length} generated questions`
                    : "Open to load full questions"}{" "}
                  · {paper.timeLimitMinutes} min · pass {paper.passMarks}
                </p>
                <p className="mt-6 text-sm font-medium">Open paper →</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
            <h3 className="font-display text-xl font-semibold">
              No {selectedSubject?.name || "subject"} papers yet
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              Generate one above—it lands here with its student link.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function ExamPaperView({
  paper,
  classrooms,
  onBack,
  onChanged,
  onClassrooms,
}: {
  paper: ExamPaper;
  classrooms: TeacherDashboard["classrooms"];
  onBack: () => void;
  onChanged: (archived?: boolean) => Promise<void>;
  onClassrooms: () => void;
}) {
  const [title, setTitle] = useState(paper.title);
  const [passMarks, setPassMarks] = useState(paper.passMarks);
  const [kind, setKind] = useState<ExamPaper["kind"]>(paper.kind);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(paper.timeLimitMinutes);
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || "");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmPublishAll, setConfirmPublishAll] = useState(false);
  const usedMarks = paper.questions.reduce((sum, question) => sum + question.marks, 0);

  async function updatePaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ title, passMarks, kind, timeLimitMinutes }),
        }),
      );
      setMessage("Paper details saved");
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the paper.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            classroomId,
            opensAt: opensAt ? new Date(opensAt).toISOString() : null,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            maxAttempts,
          }),
        }),
      );
      setMessage("Exam published to the classroom");
      await onChanged();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Could not publish the exam.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishToAllClassrooms() {
    if (!classrooms.length) return;
    setSaving(true);
    setError("");
    setMessage("");
    const dates = {
      opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
    };
    try {
      const results = await Promise.allSettled(
        classrooms.map(async (classroom) =>
          responsePayload(
            await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ classroomId: classroom.id, maxAttempts, ...dates }),
            }),
          ),
        ),
      );
      const published = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - published;
      if (failed)
        throw new Error(
          `Published to ${published} classrooms; ${failed} could not be updated. You can safely try again.`,
        );
      setMessage(`Exam published to all ${published} matching classrooms`);
      setConfirmPublishAll(false);
      await onChanged();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Could not publish to every classroom.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    setSaving(true);
    setError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      await onChanged(true);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Could not archive the paper.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={cn("min-h-10 text-sm text-text-secondary hover:text-text-primary", interactive)}
      >
        ← Generated papers
      </button>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            {paper.subject}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold">{paper.title}</h1>
          <p className="mt-2 text-text-secondary">
            {paper.kind.replace("-", " ")} · {paper.totalMarks} marks · {paper.questions.length}{" "}
            questions · {paper.timeLimitMinutes} minutes · pass {paper.passMarks}
          </p>
        </div>
        <span className="flex-1" />
        {paper.shareUrl ? (
          <a
            href={paper.shareUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
              interactive,
            )}
          >
            Open shareable paper
          </a>
        ) : null}
        <a
          href={`/teachers/print/${encodeURIComponent(paper.id)}`}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
            interactive,
          )}
        >
          Print or save PDF
        </a>
      </div>

      {message ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-success/30 p-4 text-sm text-success"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-semibold">Questions</h2>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                usedMarks === paper.totalMarks
                  ? "border-success/30 text-success"
                  : "border-warning/40 text-text-secondary",
              )}
            >
              {usedMarks} of {paper.totalMarks} marks used
            </span>
          </div>
          {usedMarks !== paper.totalMarks ? (
            <p role="status" className="mt-3 text-sm text-text-secondary">
              The Practice API returned questions worth {usedMarks} marks for a {paper.totalMarks}
              -mark paper.
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            {paper.questions.map((question, index) => (
              <article key={question.id} className="rounded-lg border border-border p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    Question {index + 1}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {question.bandLabel || question.questionType}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {question.marks} marks
                  </span>
                </div>
                <h3 className="mt-4 text-base font-medium leading-7">{question.text}</h3>
                {question.referenceAnswer ? (
                  <details className="mt-4 rounded-lg bg-bg-secondary p-4">
                    <summary className={cn("cursor-pointer text-sm font-medium", interactive)}>
                      Teacher reference answer
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                      {question.referenceAnswer}
                    </p>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <form onSubmit={publish} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Publish to a classroom</h2>
            {classrooms.length ? (
              <>
                <label htmlFor="publish-classroom" className="mt-5 block text-sm font-medium">
                  Classroom
                </label>
                <select
                  id="publish-classroom"
                  value={classroomId}
                  onChange={(event) => setClassroomId(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                >
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="publish-opens" className="mt-4 block text-sm font-medium">
                  Opens <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="publish-opens"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
                <label htmlFor="publish-closes" className="mt-4 block text-sm font-medium">
                  Closes <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="publish-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
                <label htmlFor="publish-attempts" className="mt-4 block text-sm font-medium">
                  Attempts allowed
                </label>
                <input
                  id="publish-attempts"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxAttempts}
                  onChange={(event) =>
                    setMaxAttempts(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                  }
                  className={cn(inputClass, "mt-2")}
                />
                <Button
                  className="mt-5 w-full"
                  type="submit"
                  disabled={saving || !classroomId}
                  aria-busy={saving}
                >
                  {saving ? "Publishing…" : "Publish exam"}
                </Button>
                {classrooms.length > 1 ? (
                  confirmPublishAll ? (
                    <div className="mt-4 rounded-lg bg-bg-secondary p-4">
                      <p className="text-sm text-text-secondary">
                        Use the same open and close times for all {classrooms.length}{" "}
                        {paper.subject} classrooms?
                      </p>
                      <div className="mt-3 flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setConfirmPublishAll(false)}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void publishToAllClassrooms()}
                          disabled={saving}
                        >
                          {saving ? "Publishing…" : `Publish to all ${classrooms.length}`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="mt-3 w-full"
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmPublishAll(true)}
                    >
                      Give to all {classrooms.length} classrooms
                    </Button>
                  )
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-text-secondary">
                  Create a classroom for {paper.subject} before publishing this paper.
                </p>
                <Button className="mt-5" type="button" variant="outline" onClick={onClassrooms}>
                  Open classrooms
                </Button>
              </>
            )}
          </form>

          <form onSubmit={updatePaper} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Paper settings</h2>
            <label htmlFor="paper-title" className="mt-5 block text-sm font-medium">
              Title
            </label>
            <input
              id="paper-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className={cn(inputClass, "mt-2")}
            />
            <label htmlFor="paper-pass-marks" className="mt-4 block text-sm font-medium">
              Pass marks
            </label>
            <input
              id="paper-pass-marks"
              type="text"
              inputMode="decimal"
              value={passMarks}
              onChange={(event) => setPassMarks(Math.max(0, Number(event.target.value) || 0))}
              className={cn(inputClass, "mt-2")}
            />
            <label htmlFor="paper-kind" className="mt-4 block text-sm font-medium">
              Kind
            </label>
            <select
              id="paper-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as ExamPaper["kind"])}
              className={cn(inputClass, "mt-2")}
            >
              <option value="exam">Exam</option>
              <option value="class-test">Class test</option>
              <option value="assignment">Assignment</option>
              <option value="quiz">Quiz</option>
            </select>
            <label htmlFor="paper-time-limit" className="mt-4 block text-sm font-medium">
              Time limit (minutes)
            </label>
            <input
              id="paper-time-limit"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={timeLimitMinutes}
              onChange={(event) =>
                setTimeLimitMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))
              }
              className={cn(inputClass, "mt-2")}
            />
            <Button
              className="mt-5"
              type="submit"
              variant="outline"
              disabled={saving || !title.trim()}
              aria-busy={saving}
            >
              Save details
            </Button>
          </form>

          <div className="rounded-lg border border-destructive/30 p-5">
            <h2 className="font-display text-xl font-semibold">Archive paper</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Remove it from active history without deleting saved records.
            </p>
            {confirmArchive ? (
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmArchive(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void archive()} disabled={saving}>
                  {saving ? "Archiving…" : "Archive now"}
                </Button>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => setConfirmArchive(true)}>
                Archive paper
              </Button>
            )}
          </div>
        </aside>
      </div>
      <PaperSubmissionWorkflow paper={paper} onDashboardRefresh={() => void onChanged()} />
    </>
  );
}

function PaperSubmissionWorkflow({
  paper,
  onDashboardRefresh,
}: {
  paper: ExamPaper;
  onDashboardRefresh: () => void;
}) {
  const [state, setState] = useState<DashboardState>("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [mode, setMode] = useState<"list" | "typed" | "file" | "bulk">("list");
  const [saving, setSaving] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [bulkQuestionId, setBulkQuestionId] = useState(paper.questions[0]?.id || "");
  const [bulkDelta, setBulkDelta] = useState(0);
  const [bulkFeedback, setBulkFeedback] = useState("");
  const [scoreGroup, setScoreGroup] = useState("all");
  const [attemptView, setAttemptView] = useState<"latest" | "all">("latest");
  const scoreGroups = Array.from(new Set(submissions.map((submission) => submission.groupName)));
  const scoreSubmissions =
    scoreGroup === "all"
      ? submissions
      : submissions.filter((submission) => submission.groupName === scoreGroup);
  const distribution = scoreDistribution(scoreSubmissions.map((submission) => submission.grade));
  const visibleSubmissions =
    attemptView === "all"
      ? submissions
      : Array.from(
          submissions
            .reduce((latest, submission) => {
              const key = `${submission.assignmentId || "unassigned"}:${submission.studentId || submission.studentName}`;
              const current = latest.get(key);
              if (!current || submission.attemptNo > current.attemptNo) latest.set(key, submission);
              return latest;
            }, new Map<string, ExamSubmission>())
            .values(),
        );

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      setSubmissions(
        list(payload.submissions)
          .map(normalizeSubmission)
          .filter((submission): submission is ExamSubmission => submission !== null),
      );
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load submissions.");
      setState("error");
    }
  }, [paper.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gradeTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payloadAnswers = paper.questions.map((question) => ({
      questionId: question.id,
      answerText: answers[question.id]?.trim() || "",
    }));
    if (!payloadAnswers.some((answer) => answer.answerText)) {
      setError("Enter at least one answer.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ studentName, instruction, answers: payloadAnswers }),
        }),
      );
      setMessage("Typed answers graded and saved for teacher review");
      setMode("list");
      setStudentName("");
      setInstruction("");
      setAnswers({});
      await load();
      onDashboardRefresh();
    } catch (gradeError) {
      setError(gradeError instanceof Error ? gradeError.message : "Could not grade typed answers.");
    } finally {
      setSaving(false);
    }
  }

  async function gradeFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an answer sheet first.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("student_name", studentName);
      form.append("instruction", instruction);
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/grade-file`, {
          method: "POST",
          body: form,
        }),
      );
      setMessage("Answer sheet graded and saved for teacher review");
      setMode("list");
      setStudentName("");
      setInstruction("");
      setFile(null);
      await load();
      onDashboardRefresh();
    } catch (gradeError) {
      setError(
        gradeError instanceof Error ? gradeError.message : "Could not grade the answer sheet.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishAll() {
    const waiting = submissions.filter((submission) => submission.reviewStatus !== "published");
    if (!waiting.length) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await Promise.all(
        waiting.map((submission) =>
          fetch(
            `/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions/${encodeURIComponent(submission.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                status: "published",
                teacherNote: text(asRecord(submission.grade._review).teacher_note),
              }),
            },
          ).then(responsePayload),
        ),
      );
      setMessage(
        `${waiting.length} ${waiting.length === 1 ? "result" : "results"} published to students`,
      );
      await load();
      onDashboardRefresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Could not publish all results.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function bulkAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            questionId: bulkQuestionId,
            scoreDelta: bulkDelta,
            feedback: bulkFeedback || undefined,
          }),
        }),
      );
      setMessage(`${numberValue(payload.updated)} submissions adjusted`);
      setMode("list");
      setBulkDelta(0);
      setBulkFeedback("");
      await load();
      onDashboardRefresh();
    } catch (adjustError) {
      setError(
        adjustError instanceof Error ? adjustError.message : "Could not adjust the question.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Submissions</h2>
          <p className="mt-2 text-sm text-text-secondary">
            AI grades first. You review, adjust and publish when ready.
          </p>
        </div>
        <span className="flex-1" />
        {submissions.some((submission) => submission.reviewStatus !== "published") ? (
          <Button variant="outline" onClick={() => void publishAll()} disabled={saving}>
            {saving
              ? "Publishing…"
              : `Publish all ${submissions.filter((submission) => submission.reviewStatus !== "published").length}`}
          </Button>
        ) : null}
        {submissions.length ? (
          <Button variant="outline" onClick={() => setMode(mode === "bulk" ? "list" : "bulk")}>
            Adjust a question for all
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setMode(mode === "typed" ? "list" : "typed")}>
          Grade typed answers
        </Button>
        <Button onClick={() => setMode(mode === "file" ? "list" : "file")}>
          Grade answer sheet
        </Button>
      </div>

      {message ? (
        <div
          role="status"
          className="mt-5 rounded-lg border border-success/30 p-4 text-sm text-success"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {submissions.length ? (
        <section
          className="mt-6 rounded-lg border border-border p-5"
          aria-labelledby="score-distribution-title"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h3 id="score-distribution-title" className="font-display text-xl font-semibold">
                Score distribution
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                {distribution.total} graded{" "}
                {distribution.total === 1 ? "submission" : "submissions"} in this view
              </p>
            </div>
            {scoreGroups.length > 1 ? (
              <div>
                <label htmlFor="score-group" className="sr-only">
                  Classroom score group
                </label>
                <select
                  id="score-group"
                  value={scoreGroup}
                  onChange={(event) => setScoreGroup(event.target.value)}
                  className={cn(inputClass, "min-w-52")}
                >
                  <option value="all">All groups</option>
                  {scoreGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
            ) : scoreGroups[0] ? (
              <span className="rounded-full border border-border px-3 py-2 text-xs">
                {scoreGroups[0]}
              </span>
            ) : null}
          </div>
          {distribution.total ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {distribution.bands.map((band) => {
                const width = Math.round((band.count / distribution.total) * 100);
                return (
                  <div key={band.label} className="rounded-lg bg-bg-secondary p-4">
                    <div className="flex items-baseline gap-3">
                      <p className="min-w-0 flex-1 text-sm text-text-secondary">{band.label}</p>
                      <strong className="font-display text-xl">{band.count}</strong>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary"
                      aria-label={`${band.count} submissions in ${band.label}`}
                    >
                      <div
                        className="h-full rounded-full bg-text-primary"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-text-muted">
              No graded submissions exist in this group yet.
            </p>
          )}
        </section>
      ) : null}

      {mode === "typed" ? (
        <form onSubmit={gradeTyped} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Grade typed answers</h3>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="typed-student-name" className="text-sm font-medium">
                Student name
              </label>
              <input
                id="typed-student-name"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                maxLength={160}
                autoComplete="name"
                placeholder="Student name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="typed-grade-instruction" className="text-sm font-medium">
                Grading instruction <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="typed-grade-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={1000}
                placeholder="Be strict on derivations"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {paper.questions.map((question, index) => (
              <div key={question.id}>
                <label htmlFor={`typed-answer-${question.id}`} className="text-sm font-medium">
                  Question {index + 1} · {question.marks} marks
                </label>
                <p className="mt-1 text-sm text-text-muted">{question.text}</p>
                <textarea
                  id={`typed-answer-${question.id}`}
                  value={answers[question.id] || ""}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  maxLength={20000}
                  placeholder="Student's answer"
                  className={cn(inputClass, "mt-2 min-h-28 py-3")}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Grading…" : "Grade answers"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "file" ? (
        <form onSubmit={gradeFile} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Grade answer sheet</h3>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="file-student-name" className="text-sm font-medium">
                Student name
              </label>
              <input
                id="file-student-name"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                maxLength={160}
                autoComplete="name"
                placeholder="Student name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="answer-sheet-file" className="text-sm font-medium">
                PDF, JPG or PNG answer sheet
              </label>
              <input
                id="answer-sheet-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className={cn(inputClass, "mt-2 py-2")}
              />
            </div>
          </div>
          <label htmlFor="file-grade-instruction" className="mt-5 block text-sm font-medium">
            Grading instruction <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="file-grade-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            maxLength={1000}
            placeholder="Be strict on working steps"
            className={cn(inputClass, "mt-2 min-h-24 py-3")}
          />
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Reading and grading…" : "Upload and grade"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "bulk" ? (
        <form onSubmit={bulkAdjust} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">
            Adjust one question for every submission
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            The change is bounded between zero and each question&apos;s maximum marks.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="bulk-question" className="text-sm font-medium">
                Question
              </label>
              <select
                id="bulk-question"
                value={bulkQuestionId}
                onChange={(event) => setBulkQuestionId(event.target.value)}
                className={cn(inputClass, "mt-2")}
              >
                {paper.questions.map((question, index) => (
                  <option key={question.id} value={question.id}>
                    Question {index + 1} · {question.marks} marks
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bulk-delta" className="text-sm font-medium">
                Add or remove marks
              </label>
              <input
                id="bulk-delta"
                type="text"
                inputMode="decimal"
                value={bulkDelta}
                onChange={(event) => setBulkDelta(Number(event.target.value) || 0)}
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <label htmlFor="bulk-feedback" className="mt-5 block text-sm font-medium">
            Replace feedback <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="bulk-feedback"
            value={bulkFeedback}
            onChange={(event) => setBulkFeedback(event.target.value)}
            maxLength={5000}
            className={cn(inputClass, "mt-2 min-h-20 py-3")}
          />{" "}
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !bulkQuestionId || bulkDelta === 0}
              aria-busy={saving}
            >
              {saving ? "Adjusting…" : "Apply to all"}
            </Button>
          </div>
        </form>
      ) : null}

      {state === "loading" && !submissions.length ? <SubmissionsSkeleton /> : null}
      {state === "error" && !submissions.length ? (
        <DashboardError message={error} onRetry={() => void load()} />
      ) : null}
      {state !== "loading" && submissions.length ? (
        <div className="mt-6 space-y-4">
          {submissions.some((submission) => submission.attemptCount > 1) ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-text-secondary">
                Showing {visibleSubmissions.length} of {submissions.length} saved attempts
              </p>
              <div className="inline-flex rounded-lg border border-border p-1">
                <button
                  type="button"
                  aria-pressed={attemptView === "latest"}
                  onClick={() => setAttemptView("latest")}
                  className={cn(
                    "min-h-10 rounded-md px-4 text-sm",
                    interactive,
                    attemptView === "latest"
                      ? "bg-text-primary text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  Latest attempt
                </button>
                <button
                  type="button"
                  aria-pressed={attemptView === "all"}
                  onClick={() => setAttemptView("all")}
                  className={cn(
                    "min-h-10 rounded-md px-4 text-sm",
                    interactive,
                    attemptView === "all"
                      ? "bg-text-primary text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  All attempts
                </button>
              </div>
            </div>
          ) : null}
          {visibleSubmissions.map((submission) => (
            <SubmissionReviewCard
              key={`${submission.id}-${submission.reviewStatus}-${numberValue(submission.grade.total_score)}`}
              paperId={paper.id}
              submission={submission}
              comparison={aheadOfCount(
                submissions
                  .filter((item) => item.groupName === submission.groupName)
                  .map((item) => item.grade),
                submission.grade,
              )}
              onSaved={async () => {
                await load();
                onDashboardRefresh();
              }}
            />
          ))}
        </div>
      ) : state !== "loading" && state !== "error" ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="font-display text-xl font-semibold">No submissions yet</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Publish this paper, grade typed answers, or upload an answer sheet.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SubmissionReviewCard({
  paperId,
  submission,
  comparison,
  onSaved,
}: {
  paperId: string;
  submission: ExamSubmission;
  comparison: ReturnType<typeof aheadOfCount>;
  onSaved: () => Promise<void>;
}) {
  const results = list(submission.grade.results);
  const evaluation = gradeTopicEvaluation(submission.grade);
  const review = asRecord(submission.grade._review);
  const savedAnnotations = list(review.annotations).flatMap((item): SubmissionAnnotation[] => {
    const type = text(item.type);
    if (!text(item.id) || !["tick", "cross", "mark", "note"].includes(type)) return [];
    return [
      {
        id: text(item.id),
        type: type as SubmissionAnnotation["type"],
        page: Math.max(1, numberValue(item.page) || 1),
        x: Math.max(0, Math.min(1, numberValue(item.x))),
        y: Math.max(0, Math.min(1, numberValue(item.y))),
        value: text(item.value),
      },
    ];
  });
  const [status, setStatus] = useState<ExamSubmission["reviewStatus"]>(submission.reviewStatus);
  const [teacherNote, setTeacherNote] = useState(text(review.teacher_note));
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      results.map((result, index) => [
        text(result.question_id) || text(result.id) || String(index),
        numberValue(result.score),
      ]),
    ),
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      results.map((result, index) => [
        text(result.question_id) || text(result.id) || String(index),
        text(result.feedback),
      ]),
    ),
  );
  const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>(savedAnnotations);
  const [annotationTool, setAnnotationTool] = useState<SubmissionAnnotation["type"]>("tick");
  const [annotationValue, setAnnotationValue] = useState("1");
  const [annotationPage, setAnnotationPage] = useState(1);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementInstruction, setReplacementInstruction] = useState("");
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(submission.reviewStatus !== "published");

  async function persistReview(nextStatus = status) {
    setSaving(true);
    setError("");
    try {
      await responsePayload(
        await fetch(
          `/api/teacher/exams/${encodeURIComponent(paperId)}/submissions/${encodeURIComponent(submission.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              status: nextStatus,
              teacherNote,
              annotations,
              results: results.map((result, index) => {
                const questionId = text(result.question_id) || text(result.id) || String(index);
                return {
                  questionId,
                  score: scores[questionId] || 0,
                  feedback: feedback[questionId] || "",
                };
              }),
            }),
          },
        ),
      );
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the review.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistReview();
  }

  function addAnnotation(event: MouseEvent<HTMLButtonElement>) {
    if ((annotationTool === "mark" || annotationTool === "note") && !annotationValue.trim()) {
      setError(
        annotationTool === "mark"
          ? "Enter the mark to place on the scan."
          : "Write the page note first.",
      );
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnnotations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: annotationTool,
        page: annotationPage,
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        value:
          annotationTool === "tick"
            ? "✓"
            : annotationTool === "cross"
              ? "×"
              : annotationValue.trim(),
      },
    ]);
    setError("");
  }

  async function replaceScan() {
    if (!replacementFile) {
      setError("Choose a replacement answer sheet.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", replacementFile);
      form.append("instruction", replacementInstruction);
      await responsePayload(
        await fetch(
          `/api/teacher/exams/${encodeURIComponent(paperId)}/submissions/${encodeURIComponent(submission.id)}/replace-file`,
          { method: "POST", body: form },
        ),
      );
      setReplacementFile(null);
      setReplacementInstruction("");
      setConfirmReplacement(false);
      setAnnotations([]);
      setStatus("pending");
      await onSaved();
    } catch (replaceError) {
      setError(
        replaceError instanceof Error
          ? replaceError.message
          : "Could not replace the answer sheet.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn("flex min-h-16 w-full items-center gap-4 p-4 text-left", interactive)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold">{submission.studentName}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {submission.groupName} · Attempt {submission.attemptNo} of {submission.attemptCount} ·{" "}
            {submission.source} · {fullDate(submission.createdAt || null)}
            {comparison && comparison.comparedWith > 0
              ? ` · Ahead of ${comparison.aheadOf} of ${comparison.comparedWith} others in this group`
              : ""}
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs">
          {submission.reviewStatus}
        </span>
        <strong className="font-display text-lg">
          {numberValue(submission.grade.total_score)}/{numberValue(submission.grade.total_marks)}
        </strong>
      </button>
      {open ? (
        <form onSubmit={saveReview} className="border-t border-border p-5">
          {submission.answerSheetUrl ? (
            <section
              className="mb-5 rounded-lg border border-border p-4"
              aria-label="Answer sheet annotation workspace"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-lg font-semibold">Mark the answer sheet</h4>
                  <p className="mt-1 truncate text-xs text-text-muted">
                    {submission.answerSheetName || "Uploaded answer sheet"}
                  </p>
                </div>
                <a
                  href={submission.answerSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-lg border border-border-strong bg-bg-primary px-4 text-sm font-medium",
                    interactive,
                  )}
                >
                  Preview or download
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["tick", "cross", "mark", "note"] as const).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={annotationTool === tool}
                    onClick={() => setAnnotationTool(tool)}
                    className={cn(
                      "min-h-10 rounded-lg border px-4 text-sm capitalize",
                      interactive,
                      annotationTool === tool
                        ? "border-text-primary bg-text-primary text-text-inverse"
                        : "border-border text-text-secondary",
                    )}
                  >
                    {tool === "tick" ? "✓ Tick" : tool === "cross" ? "× Cross" : tool}
                  </button>
                ))}
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setAnnotations((current) => {
                      const index = current.map((item) => item.page).lastIndexOf(annotationPage);
                      return index < 0
                        ? current
                        : current.filter((_, itemIndex) => itemIndex !== index);
                    })
                  }
                  disabled={!annotations.some((item) => item.page === annotationPage)}
                >
                  Undo
                </Button>
              </div>
              {annotationTool === "mark" || annotationTool === "note" ? (
                <div className="mt-3">
                  <label
                    htmlFor={`annotation-value-${submission.id}`}
                    className="text-sm font-medium"
                  >
                    {annotationTool === "mark" ? "Mark to place" : "Page note"}
                  </label>
                  {annotationTool === "mark" ? (
                    <input
                      id={`annotation-value-${submission.id}`}
                      type="text"
                      inputMode="decimal"
                      value={annotationValue}
                      onChange={(event) => setAnnotationValue(event.target.value)}
                      maxLength={12}
                      className={cn(inputClass, "mt-2")}
                    />
                  ) : (
                    <textarea
                      id={`annotation-value-${submission.id}`}
                      value={annotationValue}
                      onChange={(event) => setAnnotationValue(event.target.value)}
                      maxLength={500}
                      rows={2}
                      className={cn(inputClass, "mt-2 py-3")}
                    />
                  )}
                </div>
              ) : null}
              <div className="mt-3 flex items-end gap-3">
                <div className="w-32">
                  <label
                    htmlFor={`annotation-page-${submission.id}`}
                    className="text-sm font-medium"
                  >
                    Page
                  </label>
                  <input
                    id={`annotation-page-${submission.id}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={annotationPage}
                    onChange={(event) =>
                      setAnnotationPage(Math.max(1, Math.min(500, Number(event.target.value) || 1)))
                    }
                    className={cn(inputClass, "mt-2")}
                  />
                </div>
                <p className="pb-3 text-xs text-text-muted">
                  Choose a tool, then click where it belongs.
                </p>
              </div>
              <button
                type="button"
                onClick={addAnnotation}
                className={cn(
                  "relative mt-4 block aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-bg-secondary text-left",
                  interactive,
                )}
                aria-label={`Place ${annotationTool} annotation on page ${annotationPage}`}
              >
                {submission.answerSheetMimeType.startsWith("image/") ? (
                  <img
                    src={submission.answerSheetUrl}
                    alt="Student answer sheet"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={submission.answerSheetUrl}
                    title="Student answer sheet PDF"
                    className="pointer-events-none h-full w-full bg-white"
                  />
                )}
                {annotations
                  .filter((item) => item.page === annotationPage)
                  .map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold",
                        item.type === "tick"
                          ? "text-3xl text-success"
                          : item.type === "cross"
                            ? "text-4xl text-destructive"
                            : item.type === "mark"
                              ? "grid min-h-10 min-w-10 place-items-center rounded-full border-2 border-text-primary bg-bg-primary/90 px-2 text-lg"
                              : "max-w-48 rounded-lg border border-border-strong bg-bg-primary/95 p-2 text-sm font-medium",
                      )}
                      style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                    >
                      {item.value}
                    </span>
                  ))}
              </button>
              {annotations.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Saved marks ({annotations.length})</p>
                  {annotations.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg bg-bg-secondary px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        Page {item.page} · {item.type} · {item.value}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setAnnotations((current) =>
                            current.filter((annotation) => annotation.id !== item.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-muted">
                  No handwritten-style annotations yet.
                </p>
              )}
              <div className="mt-5 border-t border-border pt-4">
                <h5 className="font-medium">Attach or replace scan</h5>
                <p className="mt-1 text-sm text-text-secondary">
                  The replacement is regraded with the existing Practice API. Previous scan
                  annotations are cleared.
                </p>
                <label
                  htmlFor={`replacement-file-${submission.id}`}
                  className="mt-3 block text-sm font-medium"
                >
                  PDF, JPG or PNG
                </label>
                <input
                  id={`replacement-file-${submission.id}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    setReplacementFile(event.target.files?.[0] || null);
                    setConfirmReplacement(false);
                  }}
                  className={cn(inputClass, "mt-2 py-2")}
                />
                <label
                  htmlFor={`replacement-instruction-${submission.id}`}
                  className="mt-3 block text-sm font-medium"
                >
                  Grading instruction <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id={`replacement-instruction-${submission.id}`}
                  value={replacementInstruction}
                  onChange={(event) => setReplacementInstruction(event.target.value)}
                  maxLength={1000}
                  className={cn(inputClass, "mt-2")}
                />
                {confirmReplacement ? (
                  <div className="mt-3 rounded-lg bg-bg-secondary p-4">
                    <p className="text-sm">
                      Replace the saved scan and reset this review to pending?
                    </p>
                    <div className="mt-3 flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmReplacement(false)}
                        disabled={saving}
                      >
                        Keep current scan
                      </Button>
                      <Button type="button" onClick={() => void replaceScan()} disabled={saving}>
                        {saving ? "Replacing and grading…" : "Replace and regrade"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="mt-3"
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReplacement(true)}
                    disabled={!replacementFile || saving}
                  >
                    Replace scan
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <section className="mb-5 rounded-lg border border-dashed border-border p-4">
              <h4 className="font-medium">No scan attached</h4>
              <p className="mt-1 text-sm text-text-secondary">
                Attach a scan to this typed submission, then annotate it here.
              </p>
              <label
                htmlFor={`replacement-file-${submission.id}`}
                className="mt-3 block text-sm font-medium"
              >
                PDF, JPG or PNG
              </label>
              <input
                id={`replacement-file-${submission.id}`}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => {
                  setReplacementFile(event.target.files?.[0] || null);
                  setConfirmReplacement(false);
                }}
                className={cn(inputClass, "mt-2 py-2")}
              />
              {confirmReplacement ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReplacement(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void replaceScan()} disabled={saving}>
                    {saving ? "Attaching and grading…" : "Attach and regrade"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-3"
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmReplacement(true)}
                  disabled={!replacementFile || saving}
                >
                  Attach scan
                </Button>
              )}
            </section>
          )}
          {evaluation.topics.length ||
          evaluation.strongTopics.length ||
          evaluation.weakTopics.length ? (
            <section
              className="mb-5 rounded-lg border border-border p-4"
              aria-label="Practice API chapter evaluation"
            >
              <h4 className="font-display text-lg font-semibold">Chapter evaluation</h4>
              <p className="mt-1 text-xs text-text-muted">
                Returned by the Practice API for this grading result.
              </p>
              {evaluation.topics.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {evaluation.topics.map((topic) => (
                    <div key={topic.name} className="rounded-lg bg-bg-secondary p-4">
                      <div className="flex items-baseline gap-3">
                        <p className="min-w-0 flex-1 truncate font-medium">{topic.name}</p>
                        <strong>
                          {topic.marks ? `${topic.earned}/${topic.marks}` : `${topic.percentage}%`}
                        </strong>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary">
                        <div
                          className="h-full rounded-full bg-text-primary"
                          style={{ width: `${topic.percentage}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs capitalize text-text-muted">
                        {topic.status.replaceAll("_", " ")}
                        {topic.lostWeightage ? ` · ${topic.lostWeightage}% paper weight lost` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {evaluation.strongTopics.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Strong topics
                    </p>
                    <p className="mt-2 text-sm">{evaluation.strongTopics.join(", ")}</p>
                  </div>
                ) : null}
                {evaluation.weakTopics.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Weak topics
                    </p>
                    <p className="mt-2 text-sm">{evaluation.weakTopics.join(", ")}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          <div className="space-y-4">
            {results.map((result, index) => {
              const questionId = text(result.question_id) || text(result.id) || String(index);
              return (
                <div key={questionId} className="rounded-lg bg-bg-secondary p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="font-medium">Question {index + 1}</h4>
                    <span className="flex-1" />
                    <label
                      htmlFor={`score-${submission.id}-${index}`}
                      className="text-xs text-text-muted"
                    >
                      Score / {numberValue(result.marks)}
                    </label>
                    <input
                      id={`score-${submission.id}-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={scores[questionId] ?? 0}
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [questionId]: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className={cn(
                        "min-h-10 w-20 rounded-md border border-border bg-bg-primary px-3 text-sm",
                        interactive,
                      )}
                    />
                  </div>
                  {text(result.question) ? (
                    <p className="mt-3 text-sm">{text(result.question)}</p>
                  ) : null}
                  {text(result.student_answer) ? (
                    <details className="mt-3">
                      <summary className={cn("cursor-pointer text-sm", interactive)}>
                        Student answer
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                        {text(result.student_answer)}
                      </p>
                    </details>
                  ) : null}
                  <label
                    htmlFor={`feedback-${submission.id}-${index}`}
                    className="mt-3 block text-xs text-text-muted"
                  >
                    Feedback
                  </label>
                  <textarea
                    id={`feedback-${submission.id}-${index}`}
                    value={feedback[questionId] || ""}
                    onChange={(event) =>
                      setFeedback((current) => ({ ...current, [questionId]: event.target.value }))
                    }
                    maxLength={5000}
                    className={cn(inputClass, "mt-2 min-h-20 py-3")}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[200px_1fr]">
            <div>
              <label htmlFor={`review-status-${submission.id}`} className="text-sm font-medium">
                Result visibility
              </label>
              <select
                id={`review-status-${submission.id}`}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ExamSubmission["reviewStatus"])
                }
                className={cn(inputClass, "mt-2")}
              >
                <option value="pending">Pending review</option>
                <option value="reviewed">Reviewed, keep private</option>
                <option value="published">Publish to student</option>
              </select>
            </div>
            <div>
              <label htmlFor={`teacher-note-${submission.id}`} className="text-sm font-medium">
                Draft teacher comment <span className="text-text-muted">(optional)</span>
              </label>
              <textarea
                id={`teacher-note-${submission.id}`}
                value={teacherNote}
                onChange={(event) => setTeacherNote(event.target.value)}
                maxLength={2000}
                className={cn(inputClass, "mt-2 min-h-20 py-3")}
              />
              <p className="mt-2 text-xs text-text-muted">
                Save as draft to keep it private. Publish when the result is ready.
              </p>
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void persistReview("pending")}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving
                ? "Saving review…"
                : status === "published"
                  ? "Save and publish"
                  : "Save review"}
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function TeacherSettingsView({
  teacher,
  onSaved,
}: {
  teacher: Workspace["teacher"];
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(teacher.fullName);
  const [language, setLanguage] = useState<"EN" | "RN">(teacher.language);
  const [answerStyle, setAnswerStyle] = useState<"concise" | "exam_focused">(teacher.answerStyle);
  const [headline, setHeadline] = useState(teacher.publicProfile.headline);
  const [bio, setBio] = useState(teacher.publicProfile.bio);
  const [institution, setInstitution] = useState(teacher.publicProfile.institution);
  const [location, setLocation] = useState(teacher.publicProfile.location);
  const [expertise, setExpertise] = useState(teacher.publicProfile.expertise.join(", "));
  const [yearsExperience, setYearsExperience] = useState(
    String(teacher.publicProfile.yearsExperience || ""),
  );
  const [website, setWebsite] = useState(teacher.publicProfile.website);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(teacher.publicProfile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!avatar) {
      setAvatarPreview(teacher.publicProfile.avatarUrl);
      return;
    }
    const preview = URL.createObjectURL(avatar);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatar, teacher.publicProfile.avatarUrl]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("fullName", fullName);
      form.set("language", language);
      form.set("answerStyle", answerStyle);
      form.set("headline", headline);
      form.set("bio", bio);
      form.set("institution", institution);
      form.set("location", location);
      form.set("expertise", expertise);
      form.set("yearsExperience", yearsExperience || "0");
      form.set("website", website);
      if (avatar) form.set("avatar", avatar);
      await responsePayload(
        await fetch("/api/teacher/preferences", {
          method: "PATCH",
          headers: { Accept: "application/json" },
          body: form,
        }),
      );
      await onSaved();
      setAvatar(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  const choiceClass = (active: boolean) =>
    cn(
      "min-h-11 rounded-lg px-4 text-sm font-medium",
      interactive,
      active ? "bg-text-primary text-text-inverse" : "border border-border text-text-secondary",
    );

  return (
    <form onSubmit={save} className="max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">You</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">Your Public Profile</h1>
      <p className="mt-2 text-text-secondary">
        Your public profile appears beside every course you publish.
      </p>
      <div className="mt-8 space-y-5">
        <section className="rounded-lg border border-border p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-bg-secondary">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Teacher profile preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-2xl font-semibold" aria-hidden="true">
                  {initials(fullName || teacher.handle)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold">Public teacher profile</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Give students enough context to trust the person behind the course.
              </p>
              <label
                htmlFor="teacher-avatar"
                className="mt-4 inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-bg-secondary"
              >
                {avatarPreview ? "Change photo" : "Add profile photo"}
              </label>
              <input
                id="teacher-avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("Profile photo must be 5 MB or smaller.");
                    event.target.value = "";
                    return;
                  }
                  setError("");
                  setAvatar(file);
                }}
              />
              <p className="mt-2 text-xs text-text-muted">JPG, PNG, or WebP · maximum 5 MB</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="teacher-full-name" className="text-sm font-medium">
                Display name
              </label>
              <input
                id="teacher-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-headline" className="text-sm font-medium">
                Professional headline
              </label>
              <input
                id="teacher-headline"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={120}
                placeholder="Computer Science educator"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-institution" className="text-sm font-medium">
                Institution
              </label>
              <input
                id="teacher-institution"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                maxLength={120}
                placeholder="Tribhuvan University"
                autoComplete="organization"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-location" className="text-sm font-medium">
                Location
              </label>
              <input
                id="teacher-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={100}
                placeholder="Kathmandu, Nepal"
                autoComplete="address-level2"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-expertise" className="text-sm font-medium">
                Expertise
              </label>
              <input
                id="teacher-expertise"
                value={expertise}
                onChange={(event) => setExpertise(event.target.value)}
                maxLength={480}
                placeholder="Programming, Data Structures, C++"
                className={cn(inputClass, "mt-2")}
              />
              <p className="mt-2 text-xs text-text-muted">Separate up to 8 areas with commas.</p>
            </div>
            <div>
              <label htmlFor="teacher-experience" className="text-sm font-medium">
                Years of teaching
              </label>
              <input
                id="teacher-experience"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={yearsExperience}
                onChange={(event) =>
                  setYearsExperience(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="5"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="teacher-website" className="text-sm font-medium">
                Website <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="teacher-website"
                type="url"
                inputMode="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                maxLength={240}
                placeholder="https://yourwebsite.com"
                autoComplete="url"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="teacher-bio" className="text-sm font-medium">
                About you
              </label>
              <textarea
                id="teacher-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={600}
                rows={5}
                placeholder="Tell students what you teach and how you help them prepare."
                className={cn(inputClass, "mt-2 min-h-32 py-3")}
              />
              <p className="mt-2 text-xs text-text-muted">{bio.length}/600 characters</p>
            </div>
          </div>
          <p className="mt-5 text-xs text-text-muted">Signed in as {teacher.email}</p>
        </section>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-6"
        type="submit"
        disabled={saving || !fullName.trim()}
        aria-busy={saving}
      >
        {saving ? "Saving profile…" : "Save profile"}
      </Button>
    </form>
  );
}

function SubjectsView({
  workspace,
  onCreate,
  onOpen,
  onCollectionOverview,
}: {
  workspace: Workspace;
  onCreate: () => void;
  onOpen: (subject: TeacherSubject) => void;
  onCollectionOverview: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            Teacher collection
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Reusable subject library</h1>
          <p className="mt-2 text-text-secondary">
            Your saved subjects and source files. Attach them to a community from its semester list.
          </p>
        </div>
        <span className="flex-1" />
        <Button onClick={onCreate}>Create subject</Button>
      </div>

      {workspace.subjects.length ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspace.subjects.map((subject) => {
            const documents = workspace.documents.filter(
              (document) =>
                document.path === subject.folderPath ||
                document.path.startsWith(`${subject.folderPath}/`),
            );
            const missing = !documents.some((document) => document.shelf === "Syllabus")
              ? "Add a syllabus"
              : !documents.some((document) => document.shelf === "Notes")
                ? "Add study material"
                : !documents.some((document) => document.shelf === "Question Bank")
                  ? "Add past papers"
                  : "Ready for teaching";
            return (
              <button
                key={subject.slug}
                type="button"
                onClick={() => onOpen(subject)}
                className={cn(
                  "min-h-44 rounded-lg border border-border p-5 text-left transition hover:border-border-strong",
                  interactive,
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      subject.communities.length || subject.visibility === "public"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-bg-secondary text-text-secondary",
                    )}
                  >
                    {subjectAccessLabel(subject.communities, subject.visibility)}
                  </span>
                  {subject.code ? (
                    <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs">
                      {subject.code}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border px-3 py-1 font-mono text-xs">
                    {documents.length} files
                  </span>
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold">
                  {titleCase(subject.name)}
                </h2>
                {subject.communities.length ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Shared in{" "}
                    {subject.communities.map((community) => titleCase(community.name)).join(", ")}
                  </p>
                ) : null}
                {subject.programme || subject.university ? (
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {[subject.programme, subject.university].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-text-muted">{missing}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-xl font-semibold">No subjects created yet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Create your first subject, then add its syllabus and material. Add it to a community
            semester to make it available to that community&apos;s members.
          </p>
          <Button className="mt-5" onClick={onCreate}>
            Create first subject
          </Button>
        </section>
      )}
    </>
  );
}

function SubjectView({
  subject,
  documents,
  sourceTree,
  tab,
  onTab,
  onBack,
  onUpload,
  onCreateFolder,
  onDocument,
  syllabus,
  setSyllabus,
  chat,
  setChat,
  onSubjectRemoved,
}: {
  subject: TeacherSubject;
  documents: TeacherDocument[];
  sourceTree: ApiRecord;
  tab: SubjectTab;
  onTab: (tab: SubjectTab) => void;
  onBack: () => void;
  onUpload: (shelf: Shelf) => void;
  onCreateFolder: (shelf: Shelf) => void;
  onDocument: (document: TeacherDocument) => void;
  syllabus: SyllabusState;
  setSyllabus: (next: SyllabusState) => void;
  chat: ChatMessage[];
  setChat: (next: ChatMessage[]) => void;
  onSubjectRemoved: (message: string) => void;
}) {
  const tabs: [SubjectTab, string, number | null][] = [
    ["overview", "Overview", null],
    ["syllabus", "Syllabus", documents.filter((document) => document.shelf === "Syllabus").length],
    ["material", "Material", documents.filter((document) => document.shelf === "Notes").length],
    [
      "bank",
      "Question bank",
      documents.filter((document) => document.shelf === "Question Bank").length,
    ],
    ["source-search", "Search sources", null],
    ["test-chat", "Test chat", null],
    ["config", "Config", null],
  ];
  const shelf = tab === "syllabus" ? "Syllabus" : tab === "material" ? "Notes" : "Question Bank";
  const chapterFolders = sourceTreeFolderPaths(sourceTree, subject, shelf);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={cn("min-h-10 text-sm text-text-secondary hover:text-text-primary", interactive)}
      >
        ← Subjects
      </button>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{titleCase(subject.name)}</h1>
          <p className="mt-2 text-text-secondary">{documents.length} source files</p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Subject workspace"
        className="mt-8 flex gap-2 overflow-x-auto border-b border-border"
      >
        {tabs.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              "min-h-12 shrink-0 border-b-2 px-4 text-sm font-medium",
              interactive,
              tab === value
                ? "border-text-primary text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            {label}
            {count !== null ? ` ${count}` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <SubjectIntelligence subject={subject} />
      ) : tab === "test-chat" ? (
        <TestChat subject={subject} messages={chat} setMessages={setChat} syllabus={syllabus} />
      ) : tab === "source-search" ? (
        <SourceSearch subject={subject} />
      ) : tab === "config" ? (
        <SubjectConfig
          subject={subject}
          documentCount={documents.length}
          onRemoved={onSubjectRemoved}
        />
      ) : (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onUpload(shelf)}>
              {tab === "syllabus"
                ? "Upload syllabus"
                : tab === "material"
                  ? "Add material"
                  : "Add past paper"}
            </Button>
          </div>
          {chapterFolders.length ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label={`${shelf} chapter folders`}>
              {chapterFolders.map((path) => (
                <span
                  key={path}
                  className="rounded-full border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-secondary"
                >
                  {path.slice(`${subject.folderPath}/${shelf}/`.length)}
                </span>
              ))}
            </div>
          ) : null}
          <DocumentList
            documents={documents.filter((document) => document.shelf === shelf)}
            emptyTitle={
              tab === "syllabus"
                ? "No syllabus file yet"
                : tab === "material"
                  ? "No study material yet"
                  : "No past papers yet"
            }
            onUpload={() => onUpload(shelf)}
            onOpen={onDocument}
          />
          {tab === "syllabus" ? (
            <SyllabusEditor subject={subject} syllabus={syllabus} setSyllabus={setSyllabus} />
          ) : null}
        </div>
      )}
    </>
  );
}

function namedItems(value: ApiRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(value[key])) return list(value[key]);
  }
  return [];
}

function insightName(value: ApiRecord) {
  return (
    text(value.title) ||
    text(value.name) ||
    text(value.label) ||
    text(value.chapter) ||
    text(value.topic)
  );
}

function metricLabel(value: number) {
  if (Math.abs(value) < 1000) return value.toLocaleString();
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .toLowerCase();
}

function captureKindLabel(kind: string) {
  return (
    (
      {
        syllabus: "Syllabus",
        notes: "Notes",
        question_bank: "Question Bank",
        answer_key: "Answer Key",
      } as Record<string, string>
    )[kind] || kind.replaceAll("_", " ")
  );
}

function stringItems(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function SubjectIntelligence({ subject }: { subject: TeacherSubject }) {
  const [state, setState] = useState<WorkspaceState>("loading");
  const [data, setData] = useState<SubjectInsights | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setState("loading");
      setError("");
      try {
        const payload = await responsePayload(
          await fetch(
            `/api/teacher/subjects/${encodeURIComponent(subject.slug)}/insights${refresh ? "?refresh=1" : ""}`,
            { headers: { Accept: "application/json" }, cache: "no-store" },
          ),
        );
        setData({
          readiness: asRecord(payload.readiness),
          capture: asRecord(payload.capture),
          weightage: asRecord(payload.weightage),
          topics: asRecord(payload.topics),
          chapters: asRecord(payload.chapters),
          usage: asRecord(payload.usage),
          partialErrors: asRecord(payload.partialErrors) as Record<string, string>,
        });
        setState("ready");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load subject intelligence.");
        setState("error");
      } finally {
        setRefreshing(false);
      }
    },
    [subject.slug],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonCard key={index} lines={2} className="h-36" />
        ))}
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="mt-6 rounded-lg border border-destructive/30 p-5">
        <h2 className="font-display text-xl font-semibold">Couldn&apos;t inspect this subject</h2>
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const readiness = data.readiness;
  const capture = data.capture;
  const weightage = data.weightage;
  const usage = data.usage;
  const topicItems = namedItems(data.topics, ["topics", "chapters", "items"]);
  const chapterItems = namedItems(data.chapters, ["chapters", "items"]);
  const topics = topicItems.length ? topicItems : chapterItems;
  const bands = namedItems(weightage, ["bands", "suggested_bands", "distribution"]);
  const checks = namedItems(readiness, ["checks", "requirements", "actions"]);
  const units = namedItems(readiness, ["units", "chapters"]);
  const ready = readiness.ready === true || readiness.publishable === true;
  const coverage = namedItems(capture, ["coverage", "shelves", "kinds"]);
  const misfiled = namedItems(capture, ["misfiled", "misfiled_documents"]);
  const notesCoverage = numberValue(readiness.notes_coverage);
  const bankCoverage = numberValue(readiness.bank_coverage);
  const unitCount = numberValue(readiness.unit_count) || units.length;
  const usageRows = namedItems(usage, ["by_endpoint", "endpoints", "breakdown"]);
  const totalTokens = numberValue(usage.total_tokens || asRecord(usage.totals).total_tokens);
  const promptTokens = numberValue(
    usage.prompt_tokens ||
      usage.input_tokens ||
      asRecord(usage.totals).prompt_tokens ||
      asRecord(usage.totals).input_tokens,
  );
  const completionTokens = numberValue(
    usage.completion_tokens ||
      usage.output_tokens ||
      asRecord(usage.totals).completion_tokens ||
      asRecord(usage.totals).output_tokens,
  );
  const calls = numberValue(usage.calls || asRecord(usage.totals).calls);
  const partialErrors = Object.entries(data.partialErrors).filter(
    ([, message]) => typeof message === "string" && message,
  );

  return (
    <section className="mt-6" aria-labelledby="subject-intelligence-title">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="subject-intelligence-title" className="font-display text-2xl font-semibold">
            Subject intelligence
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Live checks from the teacher collection—not guesses from filenames.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh syllabus map"}
        </Button>
      </div>

      {partialErrors.length ? (
        <div className="mt-5 rounded-lg border border-warning/40 p-4">
          <p className="font-medium">Some checks are temporarily unavailable</p>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            {partialErrors.map(([name, message]) => (
              <li key={name}>
                <span className="font-medium capitalize">{name}:</span> {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <article className="mt-5 rounded-lg border border-border p-5">
        <h3 className="font-display text-xl font-semibold">What was captured</h3>
        {coverage.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coverage.map((item, index) => {
              const kind = text(item.kind || item.name) || `shelf-${index}`;
              return (
                <div key={kind} className="rounded-lg border border-border bg-bg-secondary p-4">
                  <p className="text-xs uppercase tracking-wider text-text-muted">
                    {captureKindLabel(kind)}
                  </p>
                  <p className="mt-3 font-display text-xl font-semibold">
                    {numberValue(item.documents || item.document_count).toLocaleString()} docs
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {numberValue(item.chunks || item.chunk_count).toLocaleString()} sections
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">No shelf-level capture data was returned.</p>
        )}

        {misfiled.length ? (
          <div className="mt-4 rounded-lg border border-warning/40 p-4">
            <p className="font-medium text-warning">Files may be on the wrong shelf</p>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              {misfiled.map((item, index) => (
                <li key={index}>
                  {text(item.path) || text(item.name) || `Misfiled item ${index + 1}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <article className="mt-5 rounded-lg border border-border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold">Ready for the marketplace?</h3>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium",
              ready ? "border-success/30 text-success" : "border-warning/40 text-warning",
            )}
          >
            {ready ? "Ready to publish" : "Not published"}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-secondary">
          {text(readiness.summary) ||
            text(readiness.message) ||
            (ready
              ? "This subject is publishable."
              : "Complete the checks below before publishing.")}
        </p>

        {checks.length ? (
          <div className="mt-4 space-y-3">
            {checks.map((check, index) => {
              const ok = check.ok === true || check.passed === true;
              return (
                <div
                  key={text(check.id) || index}
                  className={cn(
                    "rounded-lg border p-4",
                    ok ? "border-success/30" : "border-warning/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn("mt-0.5 font-semibold", ok ? "text-success" : "text-warning")}
                      aria-hidden="true"
                    >
                      {ok ? "✓" : "×"}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {text(check.detail) || insightName(check) || `Readiness check ${index + 1}`}
                      </p>
                      {text(check.remedy || check.action || check.message) ? (
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          {text(check.remedy || check.action || check.message)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">No readiness checks were returned.</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Units", unitCount],
            ["With notes", `${notesCoverage}%`],
            ["With past questions", `${bankCoverage}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
              <p className="mt-2 font-display text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {units.length ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-bg-secondary text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="w-2/5 px-5 py-3.5 text-left font-medium">Unit</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Notes</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Past questions</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {units.map((unit, index) => {
                  const notes = numberValue(unit.notes_chunks || unit.notes);
                  const questions = numberValue(unit.bank_questions || unit.past_questions);
                  const marks = numberValue(unit.bank_marks || unit.marks);
                  return (
                    <tr
                      key={`${text(unit.number)}-${insightName(unit)}-${index}`}
                      className="transition-colors hover:bg-bg-secondary/40"
                    >
                      <td className="w-2/5 truncate px-5 py-3.5 font-medium text-text-primary">
                        {[text(unit.number), insightName(unit)].filter(Boolean).join(" ") ||
                          `Unit ${index + 1}`}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {notes}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {questions}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {marks || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="font-medium">No syllabus units yet</p>
            <p className="mt-2 text-sm text-text-secondary">
              Upload and index a syllabus to build the unit coverage map.
            </p>
          </div>
        )}
      </article>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="flex flex-col justify-between rounded-lg border border-border p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">This collection key</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Token spend</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Every AI call made for asking, generating, grading, and parsing is recorded for this
              teacher collection only.
            </p>
            <p className="mt-4 font-display text-2xl font-semibold">
              {metricLabel(totalTokens)} total
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Calls", calls],
              ["Prompt", metricLabel(promptTokens)],
              ["Completion", metricLabel(completionTokens)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-bg-secondary p-4">
                <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
                <p className="mt-2 font-display text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="flex flex-col rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Exam weightage</h3>
          <p className="mt-2 text-sm text-text-secondary">
            The grounded paper generator can use this measured mix.
          </p>
          {bands.length ? (
            <div className="mt-4 space-y-3">
              {bands.map((band, index) => {
                const label = insightName(band) || `Band ${index + 1}`;
                const count = numberValue(band.count || band.question_count);
                const marks = numberValue(band.marks_each || band.marks);
                return (
                  <div
                    key={`${label}-${index}`}
                    className="flex items-center gap-3 rounded-lg bg-bg-secondary p-3"
                  >
                    <span className="min-w-0 flex-1 font-medium">{label}</span>
                    <span className="text-sm text-text-secondary">
                      {count ? `${count} × ` : ""}
                      {marks ? `${marks} marks` : "Suggested"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-text-muted">
              No measured bands yet. Upload marked past papers to Question Bank.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

function SourceSearch({ subject }: { subject: TeacherSubject }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; where: string; content: string; score: number | null }[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setError("Describe what you want to find.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: clean, subjectSlug: subject.slug, topK: 8 }),
        }),
      );
      setResults(
        list(payload.results).map((result, index) => ({
          id: text(result.id) || `source-${index}`,
          name: text(result.name) || "Indexed source",
          where: text(result.where) || "indexed material",
          content: text(result.content),
          score: typeof result.score === "number" ? result.score : null,
        })),
      );
      setSearched(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not search the indexed sources.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="max-w-3xl">
        <h2 className="font-display text-2xl font-semibold">Search the indexed source text</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Uses the teacher-scoped collection query API and returns the closest passages without
          generating an answer.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="source-query" className="sr-only">
            Search source material
          </label>
          <input
            id="source-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={2000}
            placeholder="Search a topic from your uploaded notes"
            className={cn(inputClass, "flex-1")}
          />
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Searching…" : "Search sources"}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {results.length ? (
        <div className="mt-7 space-y-4" aria-live="polite">
          {results.map((result, index) => (
            <article key={result.id} className="rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="rounded-full border border-border px-3 py-1">
                  Match {index + 1}
                </span>
                <span>{result.name}</span>
                <span>·</span>
                <span>{result.where}</span>
                {result.score !== null ? (
                  <>
                    <span className="flex-1" />
                    <span>{Math.round(result.score * 100)}% relevance</span>
                  </>
                ) : null}
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {result.content || "The API returned source metadata without a text excerpt."}
              </p>
            </article>
          ))}
        </div>
      ) : searched && !busy ? (
        <div className="mt-7 rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="font-display text-lg font-semibold">No matching passages</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Try a topic name, formula, or phrase that appears in the uploaded material.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DocumentList({
  documents,
  emptyTitle,
  onUpload,
  onOpen,
}: {
  documents: TeacherDocument[];
  emptyTitle: string;
  onUpload: () => void;
  onOpen: (document: TeacherDocument) => void;
}) {
  if (!documents.length) {
    return (
      <section className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
        <h2 className="font-display text-lg font-semibold">{emptyTitle}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Add a supported file to this collection folder.
        </p>
        <Button className="mt-5" variant="outline" onClick={onUpload}>
          Choose a file
        </Button>
      </section>
    );
  }
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {documents.map((document) => (
        <article key={document.id} className="rounded-lg border border-border p-5">
          <div className="flex items-center gap-2">
            <StatusChip status={document.status} />
            <span className="flex-1" />
            <span className="text-xs text-text-muted">{bytesLabel(document.sizeBytes)}</span>
          </div>
          <h2 className="mt-4 break-words font-display text-lg font-semibold">{document.name}</h2>
          <p className="mt-2 text-sm text-text-muted">{document.chunks} indexed sections</p>
          <Button className="mt-5" variant="outline" onClick={() => onOpen(document)}>
            {document.previewAvailable ? "Preview document" : "Document details"}
          </Button>
        </article>
      ))}
    </div>
  );
}

function SyllabusEditor({
  subject,
  syllabus,
  setSyllabus,
}: {
  subject: TeacherSubject;
  syllabus: SyllabusState;
  setSyllabus: (next: SyllabusState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SyllabusUnit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function extract() {
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}/syllabus`, {
          method: "POST",
          headers: { Accept: "application/json" },
        }),
      );
      const structure = Array.isArray(payload.structure)
        ? (payload.structure as SyllabusUnit[])
        : [];
      setSyllabus({
        state: "ready",
        structure,
        updatedAt: text(payload.updatedAt) || null,
        error: "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not extract the syllabus.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setDraft(
      syllabus.structure.map((unit) => ({
        title: unit.title,
        topics: unit.topics.map((topic) => ({ name: topic.name })),
      })),
    );
    setEditing(true);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = draft.flatMap((unit) => {
      const titleValue = unit.title.trim();
      if (!titleValue) return [];
      return [
        {
          title: titleValue,
          topics: unit.topics
            .filter((topic) => topic.name.trim())
            .map((topic) => ({ name: topic.name.trim() })),
        },
      ];
    });
    if (!clean.length) {
      setError("Add at least one named unit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}/syllabus`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(clean),
        }),
      );
      setSyllabus({
        state: "ready",
        structure: clean,
        updatedAt: text(payload.updatedAt) || null,
        error: "",
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the syllabus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Editable syllabus structure</h2>
          <p className="mt-2 text-sm text-text-muted">Last saved: {fullDate(syllabus.updatedAt)}</p>
        </div>
        <span className="flex-1" />
        <Button variant="outline" onClick={() => void extract()} disabled={busy} aria-busy={busy}>
          {busy && !editing ? "Extracting…" : "Extract from indexed syllabus"}
        </Button>
        {syllabus.structure.length && !editing ? (
          <Button onClick={startEditing}>Edit structure</Button>
        ) : null}
      </div>

      {syllabus.state === "loading" ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} className="h-28" />
          ))}
        </div>
      ) : null}
      {syllabus.state === "error" ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {syllabus.error}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {editing ? (
        <form className="mt-6 space-y-4" onSubmit={save}>
          {draft.map((unit, unitIndex) => (
            <fieldset key={unitIndex} className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-medium">Unit {unitIndex + 1}</legend>
              <label className="block text-sm font-medium" htmlFor={`unit-title-${unitIndex}`}>
                Unit title
              </label>
              <input
                id={`unit-title-${unitIndex}`}
                className={cn(inputClass, "mt-2")}
                value={unit.title}
                onChange={(event) =>
                  setDraft((current) =>
                    current.map((item, index) =>
                      index === unitIndex ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
              <label
                className="mt-4 block text-sm font-medium"
                htmlFor={`unit-topics-${unitIndex}`}
              >
                Topics
              </label>
              <textarea
                id={`unit-topics-${unitIndex}`}
                className={cn(inputClass, "mt-2 min-h-28 resize-y py-3")}
                value={unit.topics.map((topic) => topic.name).join("\n")}
                onChange={(event) =>
                  setDraft((current) =>
                    current.map((item, index) =>
                      index === unitIndex
                        ? {
                            ...item,
                            topics: event.target.value.split("\n").map((name) => ({ name })),
                          }
                        : item,
                    ),
                  )
                }
                aria-describedby={`unit-topics-hint-${unitIndex}`}
              />
              <p id={`unit-topics-hint-${unitIndex}`} className="mt-2 text-xs text-text-muted">
                One topic per line.
              </p>
              <Button
                className="mt-4"
                type="button"
                variant="danger"
                onClick={() =>
                  setDraft((current) => current.filter((_, index) => index !== unitIndex))
                }
              >
                Remove unit
              </Button>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft((current) => [...current, { title: "", topics: [] }])}
            >
              Add unit
            </Button>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save structure"}
            </Button>
          </div>
        </form>
      ) : syllabus.state === "ready" && syllabus.structure.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {syllabus.structure.map((unit, index) => (
            <article key={`${unit.title}-${index}`} className="rounded-lg border border-border p-5">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Unit {index + 1}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold">{unit.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {unit.topics.map((topic) => (
                  <span
                    key={topic.name}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {topic.name}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : syllabus.state === "ready" ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-center">
          <h3 className="font-display text-lg font-semibold">No editable units yet</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Upload and index a syllabus, then extract its structure.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function TestChat({
  subject,
  messages,
  setMessages,
  syllabus,
}: {
  subject: TeacherSubject;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  syllabus: SyllabusState;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo(() => {
    const topics = syllabus.structure
      .flatMap((unit) => unit.topics)
      .map((topic) => topic.name)
      .filter(Boolean);
    if (topics.length) {
      return topics.slice(0, 3).map((name) => `Explain ${name.toLowerCase()} simply`);
    }
    return ["What should a student learn first?", "Summarise the most important concept"];
  }, [syllabus.structure]);

  function fillSuggestion(prompt: string) {
    setQuestion(prompt);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean) {
      setError("Write a question first.");
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: clean };
    const next = [...messages, userMessage];
    setMessages(next);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            question: clean,
            subjectSlug: subject.slug,
            history: messages
              .slice(-10)
              .map((message) => ({ role: message.role, content: message.content })),
          }),
        }),
      );
      const sources = list(payload.sources).map((source) => ({
        name: text(source.name) || "Source",
        where: text(source.where) || "Indexed material",
      }));
      setMessages([
        ...next,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text(payload.answer) || "No answer was returned.",
          sources,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not answer from this subject.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-border">
        <div className="min-h-[360px] space-y-4 p-5" aria-live="polite">
          {messages.length ? (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "max-w-2xl rounded-lg p-4",
                  message.role === "user"
                    ? "ml-auto bg-text-primary text-text-inverse"
                    : "border border-border",
                )}
              >
                <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                {message.sources?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.sources.map((source, index) => (
                      <span
                        key={`${source.name}-${index}`}
                        className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                      >
                        {source.name} · {source.where}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-center">
              <div>
                <h2 className="font-display text-xl font-semibold">Test the student experience</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                  Ask a question and verify that the answer stays grounded in{" "}
                  {titleCase(subject.name)}.
                </p>
              </div>
            </div>
          )}
          {busy ? (
            <div className="rounded-lg border border-border p-4 text-sm text-text-muted">
              Answering from indexed material…
            </div>
          ) : null}
        </div>
        <form className="border-t border-border p-4" onSubmit={submit}>
          <label htmlFor="teacher-test-question" className="text-sm font-medium">
            Ask as a student
          </label>
          {!messages.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => fillSuggestion(prompt)}
                  className={cn(
                    "rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:border-border-strong hover:bg-bg-secondary",
                    interactive,
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="teacher-test-question"
              className={inputClass}
              value={question}
              maxLength={2000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Explain the hardest idea in this subject."
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "teacher-test-question-error" : undefined}
            />
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
          {error ? (
            <p
              id="teacher-test-question-error"
              role="alert"
              className="mt-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </form>
      </div>
      <aside className="rounded-lg border border-border p-5">
        <h2 className="font-display text-lg font-semibold">Grounding check</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Answers use only this subject&apos;s indexed material. Sources appear under each response.
        </p>
        {messages.length ? (
          <Button className="mt-5" variant="outline" onClick={() => setMessages([])}>
            Clear chat
          </Button>
        ) : null}
      </aside>
    </section>
  );
}

function CreateSubjectDialog({
  onClose,
  onCreated,
  initialUniversity = "",
  initialProgramme = "",
  communityContext,
}: {
  onClose: () => void;
  onCreated: (result: SubjectCreationResult) => Promise<void>;
  initialUniversity?: string;
  initialProgramme?: string;
  communityContext?: { name: string; semester?: number };
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [university, setUniversity] = useState(initialUniversity);
  const [programme, setProgramme] = useState(initialProgramme);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusDropActive, setSyllabusDropActive] = useState(false);
  const [syllabusText, setSyllabusText] = useState("");
  const [structure, setStructure] = useState<SyllabusUnit[]>([]);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [materialDropActive, setMaterialDropActive] = useState(false);
  const [bankDropActive, setBankDropActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0, shelf: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const materialInputRef = useRef<HTMLInputElement>(null);
  const bankInputRef = useRef<HTMLInputElement>(null);
  const createdSubjectRef = useRef<{ slug: string; folderPath: string } | null>(null);
  const universityEdited = useRef(false);
  const programmeEdited = useRef(false);
  const completedUploadKeysRef = useRef(new Set<string>());
  const indexingJobsRef = useRef<SubjectCreationResult["jobs"]>([]);

  useEffect(() => {
    if (!universityEdited.current) setUniversity(initialUniversity);
  }, [initialUniversity]);
  useEffect(() => {
    if (!programmeEdited.current) setProgramme(initialProgramme);
  }, [initialProgramme]);

  function addFiles(current: File[], incoming: File[]) {
    const accepted = incoming.filter((file) => !teacherUploadSizeError(file.size));
    const rejected = incoming.find((file) => teacherUploadSizeError(file.size));
    if (rejected) setError(`${rejected.name}: ${teacherUploadSizeError(rejected.size)}`);
    else if (accepted.length) setError("");
    const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    return [
      ...current,
      ...accepted.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`)),
    ];
  }

  function chooseMaterialFiles(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setMaterialFiles((current) => addFiles(current, selected));
  }

  function chooseBankFiles(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setBankFiles((current) => addFiles(current, selected));
  }

  function handleMaterialInput(event: FormEvent<HTMLInputElement>) {
    chooseMaterialFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function handleBankInput(event: FormEvent<HTMLInputElement>) {
    chooseBankFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  async function readSyllabus(file?: File | null) {
    setError("");
    let raw = syllabusText.trim();
    const selectedFile = file === undefined ? syllabusFile : file;
    if (file && /\.(txt|md|csv)$/i.test(file.name)) raw = await file.text();
    else if (!raw && selectedFile && /\.(txt|md|csv)$/i.test(selectedFile.name))
      raw = await selectedFile.text();
    const parsed = parseSyllabusOutline(raw);
    if (!parsed.length) {
      setError(
        selectedFile
          ? "This file will be indexed after creation. Paste its outline here if you want to review units now."
          : "Paste a syllabus or choose a text file first.",
      );
      return;
    }
    setStructure(parsed);
  }

  function chooseSyllabusFile(file: File | null) {
    if (!file) return;
    const sizeError = teacherUploadSizeError(file.size);
    if (sizeError) {
      setError(`${file.name}: ${sizeError}`);
      return;
    }
    if (!isTeacherSyllabusFileSupported(file.name)) {
      setError("Choose a PDF, Word document, text file, or syllabus image.");
      return;
    }
    setError("");
    setSyllabusFile(file);
    setStructure([]);
    if (/\.(txt|md)$/i.test(file.name)) void readSyllabus(file);
  }

  async function uploadSubjectFile(file: File, path: string) {
    const payload = await uploadTeacherDocument(file, path);
    return text(payload.jobId);
  }

  async function createSubject() {
    const clean = name.trim();
    if (!clean) {
      setError("Enter a subject name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let createdSubject = createdSubjectRef.current;
      if (!createdSubject) {
        setProgress("Creating the subject and its shelves…");
        const payload = await responsePayload(
          await fetch("/api/teacher/subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              name: clean,
              university: university.trim(),
              programme: programme.trim(),
            }),
          }),
        );
        const subject = asRecord(payload.subject);
        const slug = text(subject.slug);
        const folderPath = text(subject.folder_path) || clean;
        if (!slug)
          throw new Error("The subject was created but its collection slug was not returned.");
        createdSubject = { slug, folderPath };
        createdSubjectRef.current = createdSubject;
      }
      const { slug, folderPath } = createdSubject;

      if (structure.length) {
        setProgress("Saving the syllabus map…");
        await responsePayload(
          await fetch(`/api/teacher/subjects/${encodeURIComponent(slug)}/syllabus`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(structure),
          }),
        );
      }

      const syllabusUpload =
        syllabusFile ||
        (syllabusText.trim()
          ? new File(
              [syllabusText.trim()],
              `${
                clean
                  .replace(/[^a-z0-9]+/gi, "-")
                  .replace(/^-|-$/g, "")
                  .toLowerCase() || "subject"
              }-syllabus.txt`,
              { type: "text/plain" },
            )
          : null);
      const uploads = [
        ...(syllabusUpload ? [{ file: syllabusUpload, shelf: "Syllabus" as const }] : []),
        ...materialFiles.map((file) => ({ file, shelf: "Notes" as const })),
        ...bankFiles.map((file) => ({ file, shelf: "Question Bank" as const })),
      ].filter(
        ({ file, shelf }) =>
          !completedUploadKeysRef.current.has(`${shelf}:${file.name}:${file.size}`),
      );
      const failedUploads: SubjectCreationResult["failedUploads"] = [];
      setUploadStatus({ current: 0, total: uploads.length, shelf: "" });
      for (const [index, upload] of uploads.entries()) {
        const shelfLabel = uploadShelfLabel(upload.shelf);
        setUploadStatus({ current: index + 1, total: uploads.length, shelf: shelfLabel });
        setProgress(`Uploading ${shelfLabel}: ${upload.file.name}`);
        try {
          const jobId = await uploadSubjectFile(upload.file, `${folderPath}/${upload.shelf}`);
          completedUploadKeysRef.current.add(
            `${upload.shelf}:${upload.file.name}:${upload.file.size}`,
          );
          if (jobId) indexingJobsRef.current.push({ id: jobId, label: upload.file.name });
        } catch (caught) {
          failedUploads.push({
            name: upload.file.name,
            shelf: upload.shelf,
            error: caught instanceof Error ? caught.message : "The upload failed.",
          });
        }
      }
      if (failedUploads.length) {
        const details = failedUploads
          .map(
            (failure) => `${uploadShelfLabel(failure.shelf)} — ${failure.name}: ${failure.error}`,
          )
          .join("\n");
        setError(
          `The subject was created, but ${failedUploads.length} selected file${failedUploads.length === 1 ? "" : "s"} did not finish uploading:\n${details}\n\nYour file selections are still here. Try again; only failed files will be retried.`,
        );
        setBusy(false);
        setProgress("");
        setUploadStatus({ current: 0, total: 0, shelf: "" });
        return;
      }
      setProgress("Opening the subject workspace…");
      await onCreated({ name: clean, slug, jobs: indexingJobsRef.current, failedUploads });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the subject.");
      setBusy(false);
      setProgress("");
      setUploadStatus({ current: 0, total: 0, shelf: "" });
    }
  }

  const stages = ["What it is", "Syllabus", "Material"];
  const selectedFileCount =
    (syllabusFile || syllabusText.trim() ? 1 : 0) + materialFiles.length + bankFiles.length;
  return (
    <Dialog title="Add a subject" onClose={busy ? () => undefined : onClose}>
      {communityContext ? (
        <p className="mb-5 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          {titleCase(communityContext.name)}
          {communityContext.semester
            ? ` · Semester ${communityContext.semester}`
            : " · Selected semester"}
        </p>
      ) : null}
      <ol className="mb-7 grid grid-cols-3 gap-2" aria-label="Create subject progress">
        {stages.map((label, index) => {
          const stage = (index + 1) as 1 | 2 | 3;
          return (
            <li key={label} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    step >= stage
                      ? "border-text-primary bg-text-primary text-text-inverse"
                      : "border-border text-text-muted",
                  )}
                >
                  {step > stage ? "✓" : stage}
                </span>
                <span
                  className={cn(
                    "truncate text-xs",
                    step === stage ? "font-semibold" : "text-text-muted",
                  )}
                >
                  {label}
                </span>
              </div>
              {index < 2 ? <div className="ml-4 mt-2 h-px bg-border" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p
          role="alert"
          className="mb-4 whitespace-pre-line rounded-lg border border-destructive/30 bg-bg-secondary p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError("Give the subject a name before continuing.");
              return;
            }
            setError("");
            setStep(2);
          }}
        >
          <div>
            <label htmlFor="new-subject-name" className="text-sm font-medium">
              Subject name
            </label>
            <input
              id="new-subject-name"
              className={cn(inputClass, "mt-2")}
              value={name}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setName(event.target.value)}
              placeholder="Engineering Physics I"
              required
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-subject-university" className="text-sm font-medium">
                University <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="new-subject-university"
                value={university}
                onChange={(event) => {
                  universityEdited.current = true;
                  setUniversity(event.target.value);
                }}
                className={cn(inputClass, "mt-2")}
                placeholder="Tribhuvan University"
                maxLength={120}
                autoComplete="organization"
              />
            </div>
            <div>
              <label htmlFor="new-subject-programme" className="text-sm font-medium">
                Programme <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="new-subject-programme"
                value={programme}
                onChange={(event) => {
                  programmeEdited.current = true;
                  setProgramme(event.target.value);
                }}
                className={cn(inputClass, "mt-2")}
                placeholder="BE Electronics (BEI)"
                maxLength={120}
                autoComplete="off"
              />
            </div>
          </div>
          <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-text-secondary">
            {communityContext
              ? "This subject will be attached to the selected community semester as a draft. After files are indexed, publish it to extract topics and prepare member challenges."
              : "Save this subject in your library, then add it to a community semester to make it available to that community’s members."}
          </p>
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Next: syllabus</Button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Upload the syllabus your university publishes, or paste it in. Text outlines can be
            reviewed now; PDF and Word outlines can be extracted once indexing finishes.
          </p>
          <input
            id="new-subject-syllabus-file"
            type="file"
            accept={TEACHER_SYLLABUS_FILE_ACCEPT}
            className="peer sr-only"
            onChange={(event) => {
              chooseSyllabusFile(event.target.files?.[0] || null);
              event.currentTarget.value = "";
            }}
          />
          <label
            htmlFor="new-subject-syllabus-file"
            className={cn(
              "mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-border-strong peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-primary",
              syllabusDropActive
                ? "border-border-strong bg-bg-secondary"
                : "border-border-strong hover:bg-bg-secondary",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setSyllabusDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setSyllabusDropActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setSyllabusDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setSyllabusDropActive(false);
              chooseSyllabusFile(event.dataTransfer.files?.[0] || null);
            }}
          >
            <span className="font-display text-base font-semibold">
              {syllabusFile
                ? syllabusFile.name
                : syllabusDropActive
                  ? "Drop it here"
                  : "Drop the syllabus here, or tap to choose"}
            </span>
            <span className="mt-2 text-sm text-text-muted">
              {syllabusFile
                ? `${fileSizeLabel(syllabusFile)} · Tap to replace`
                : "PDF, Word, text, JPG, PNG or WebP"}
            </span>
          </label>
          {syllabusFile ? (
            <SelectedFileRows
              label="Syllabus"
              files={[syllabusFile]}
              onRemove={() => {
                setSyllabusFile(null);
                setStructure([]);
              }}
            />
          ) : null}
          <div className="mt-4">
            <label htmlFor="new-subject-syllabus-text" className="text-sm font-medium">
              Or paste it
            </label>
            <textarea
              id="new-subject-syllabus-text"
              value={syllabusText}
              onChange={(event) => {
                setSyllabusText(event.target.value);
                setStructure([]);
              }}
              className={cn(inputClass, "mt-2 min-h-32 py-3")}
              placeholder={
                "Unit 1: Course foundations\nTopic one\nTopic two\n\nUnit 2: Applied practice\nTopic three\nTopic four"
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void readSyllabus()}>
              {structure.length ? "Read again" : "Read syllabus"}
            </Button>
            {structure.length ? (
              <span className="text-sm text-text-secondary">
                {structure.length} units ·{" "}
                {structure.reduce((sum, unit) => sum + unit.topics.length, 0)} topics found
              </span>
            ) : null}
          </div>
          {structure.length ? (
            <div className="mt-5 space-y-3 border-t border-border pt-5">
              {structure.map((unit, index) => (
                <div key={`${unit.title}-${index}`} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-border px-3 py-1 text-xs">
                      Unit {index + 1}
                    </span>
                    <strong className="min-w-0 flex-1 truncate text-sm">{unit.title}</strong>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setStructure((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {unit.topics.map((topic) => (
                      <span
                        key={topic.name}
                        className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                      >
                        {topic.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError("");
                setStep(3);
              }}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (
                  (syllabusText.trim() ||
                    (syllabusFile && /\.(txt|md|csv)$/i.test(syllabusFile.name))) &&
                  !structure.length
                ) {
                  setError("Read and review the syllabus, or choose Skip for now.");
                  return;
                }
                setError("");
                setStep(3);
              }}
            >
              Next: material
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Notes, slides and textbooks ground answers. Past papers guide question style and
            weightage. Every selected file is uploaded and indexed into the correct shelf.
          </p>
          <input
            ref={materialInputRef}
            id="new-subject-material"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg"
            className="peer sr-only"
            onInput={handleMaterialInput}
            onChange={handleMaterialInput}
          />
          <button
            type="button"
            onClick={() => materialInputRef.current?.click()}
            aria-live="polite"
            className={cn(
              "flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
              materialDropActive
                ? "border-border-strong bg-bg-secondary"
                : materialFiles.length
                  ? "border-success bg-success/5"
                  : "border-border-strong hover:bg-bg-secondary",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setMaterialDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setMaterialDropActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setMaterialDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setMaterialDropActive(false);
              chooseMaterialFiles(event.dataTransfer.files);
            }}
          >
            <span className="font-display text-base font-semibold">
              {materialFiles.length === 1
                ? materialFiles[0].name
                : materialFiles.length > 1
                  ? selectedFilesTitle(materialFiles, "notes file", "notes files")
                  : materialDropActive
                    ? "Drop notes here"
                    : "Drop notes and study content here, or tap to choose"}
            </span>
            <span className="mt-2 text-sm text-text-muted">
              {materialFiles.length
                ? `${selectedFilesHint(materialFiles)} · Selected as Notes · tap to add more`
                : `PDF, Word, PowerPoint, text, or image files · maximum ${TEACHER_UPLOAD_MAX_LABEL} each`}
            </span>
            {materialFiles.length ? (
              <span className="mt-4 w-full rounded-md border border-success/40 bg-bg-primary p-3 text-left">
                <span className="mb-2 inline-flex rounded-full border border-success/40 px-2.5 py-1 text-xs font-semibold text-success">
                  Selected as Notes
                </span>
                <span className="block space-y-1">
                  {materialFiles.slice(0, 3).map((file) => (
                    <span
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="block truncate text-sm font-medium"
                    >
                      {file.name} · {fileSizeLabel(file)}
                    </span>
                  ))}
                  {materialFiles.length > 3 ? (
                    <span className="block text-xs text-text-muted">
                      +{materialFiles.length - 3} more file
                      {materialFiles.length - 3 === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : null}
          </button>
          <SelectedFileRows
            label="Notes"
            files={materialFiles}
            onRemove={(index) =>
              setMaterialFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          />
          <div className="mt-5">
            <input
              ref={bankInputRef}
              id="new-subject-bank"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md"
              className="peer sr-only"
              onInput={handleBankInput}
              onChange={handleBankInput}
            />
            <button
              type="button"
              onClick={() => bankInputRef.current?.click()}
              aria-live="polite"
              className={cn(
                "flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
                bankDropActive
                  ? "border-border-strong bg-bg-secondary"
                  : bankFiles.length
                    ? "border-success bg-success/5"
                    : "border-border-strong hover:bg-bg-secondary",
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setBankDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setBankDropActive(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setBankDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setBankDropActive(false);
                chooseBankFiles(event.dataTransfer.files);
              }}
            >
              <span className="font-display text-base font-semibold">
                {bankFiles.length === 1
                  ? bankFiles[0].name
                  : bankFiles.length > 1
                    ? selectedFilesTitle(bankFiles, "question bank file", "question bank files")
                    : bankDropActive
                      ? "Drop question papers here"
                      : "Drop question bank and past papers here, or tap to choose"}
              </span>
              <span className="mt-2 text-sm text-text-muted">
                {bankFiles.length
                  ? `${selectedFilesHint(bankFiles)} · Selected as Question Bank · tap to add more`
                  : `PDF, Word, Markdown, or plain-text files · maximum ${TEACHER_UPLOAD_MAX_LABEL} each`}
              </span>
              {bankFiles.length ? (
                <span className="mt-4 w-full rounded-md border border-success/40 bg-bg-primary p-3 text-left">
                  <span className="mb-2 inline-flex rounded-full border border-success/40 px-2.5 py-1 text-xs font-semibold text-success">
                    Selected as Question Bank
                  </span>
                  <span className="block space-y-1">
                    {bankFiles.slice(0, 3).map((file) => (
                      <span
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="block truncate text-sm font-medium"
                      >
                        {file.name} · {fileSizeLabel(file)}
                      </span>
                    ))}
                    {bankFiles.length > 3 ? (
                      <span className="block text-xs text-text-muted">
                        +{bankFiles.length - 3} more file
                        {bankFiles.length - 3 === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}
            </button>
            <SelectedFileRows
              label="Question bank"
              files={bankFiles}
              onRemove={(index) =>
                setBankFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
            />
          </div>
          {materialFiles.length || bankFiles.length ? (
            <div
              role="status"
              className="mt-5 rounded-lg border border-success/40 bg-success/5 p-4 text-sm"
            >
              <p className="font-semibold">
                ✓ {materialFiles.length + bankFiles.length} material file
                {materialFiles.length + bankFiles.length === 1 ? "" : "s"} selected and ready
              </p>
              <p className="mt-1 text-text-secondary">
                {materialFiles.length} Notes · {bankFiles.length} Question Bank
              </p>
            </div>
          ) : null}
          {busy ? (
            <div role="status" className="mt-5 rounded-lg border border-border bg-bg-secondary p-4">
              {uploadStatus.total ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      Uploading and indexing {uploadStatus.shelf || "subject files"}
                    </span>
                    <span className="shrink-0 text-text-secondary">
                      {uploadStatus.current} of {uploadStatus.total}
                    </span>
                  </div>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-label={`Uploading ${uploadStatus.shelf || "subject files"}`}
                    aria-valuemin={0}
                    aria-valuemax={uploadStatus.total}
                    aria-valuenow={uploadStatus.current}
                  >
                    <div
                      className="h-full rounded-full bg-text-primary transition-[width] duration-300"
                      style={{
                        width: `${Math.max(
                          8,
                          Math.round((uploadStatus.current / uploadStatus.total) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-text-secondary">
                    {progress || `Uploading ${uploadStatus.shelf || "subject files"}…`}
                  </p>
                </>
              ) : (
                <p className="text-sm">{progress || "Creating…"}</p>
              )}
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={busy}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => void createSubject()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? "Creating…"
                : selectedFileCount
                  ? `Create subject · upload ${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`
                  : "Create the subject"}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function SelectedFileRows({
  label,
  files,
  onRemove,
  disabled = false,
}: {
  label: string;
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (!files.length) return null;
  return (
    <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-secondary/70">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.size}-${file.lastModified}`}
          className="flex min-h-12 items-center gap-3 bg-bg-primary px-3 py-2"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs text-success">
            ✓
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">{label}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <span className="text-xs text-text-muted">{fileSizeLabel(file)}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRemove(index)}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function CreateFolderDialog({
  subject,
  shelf,
  onClose,
  onCreated,
}: {
  subject: TeacherSubject;
  shelf: Shelf;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 80 || /[\\/]/.test(clean)) {
      setError("Enter a folder name up to 80 characters without slashes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ subjectSlug: subject.slug, shelf, name: clean }),
        }),
      );
      onCreated(text(payload.path) || `${subject.folderPath}/${shelf}/${clean}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the chapter folder.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={`New folder in ${shelf}`} onClose={onClose}>
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <p className="font-medium">{titleCase(subject.name)}</p>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">
          {subject.folderPath}/{shelf}
        </p>
      </div>
      <form className="mt-5" onSubmit={submit}>
        <label htmlFor="teacher-folder-name" className="text-sm font-medium">
          Chapter or unit name
        </label>
        <input
          id="teacher-folder-name"
          type="text"
          value={name}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder="Chapter 1 — Number systems"
          className={cn(inputClass, "mt-2")}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "teacher-folder-error" : "teacher-folder-hint"}
        />
        <p id="teacher-folder-hint" className="mt-2 text-xs text-text-muted">
          The folder stays inside this subject shelf and becomes an upload destination.
        </p>
        {error ? (
          <p id="teacher-folder-error" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Creating…" : "Create folder"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function UploadDialog({
  subject,
  shelf,
  onClose,
  onUploaded,
}: {
  subject: TeacherSubject;
  shelf: Shelf;
  onClose: () => void;
  onUploaded: (result: {
    message: string;
    jobs: Array<{ jobId: string; fileName: string }>;
  }) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const shelfRoot = `${subject.folderPath}/${shelf}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0 });
  const completedJobs = useRef<Array<{ jobId: string; fileName: string }>>([]);
  const accept =
    shelf === "Syllabus"
      ? TEACHER_SYLLABUS_FILE_ACCEPT
      : ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) {
      setError("Choose one or more files first.");
      return;
    }
    setBusy(true);
    setError("");
    setUploadStatus({ current: 0, total: files.length });
    const failed: Array<{ file: File; error: string }> = [];
    const warnings: string[] = [];

    for (const [index, file] of files.entries()) {
      setUploadStatus({ current: index + 1, total: files.length });
      try {
        const payload = await uploadTeacherDocument(file, shelfRoot);
        completedJobs.current.push({ jobId: text(payload.jobId), fileName: file.name });
        const warning = text(payload.previewWarning);
        if (warning) warnings.push(`${file.name}: ${warning}`);
      } catch (caught) {
        failed.push({
          file,
          error: caught instanceof Error ? caught.message : "Could not upload this file.",
        });
      }
    }

    if (failed.length) {
      setFiles(failed.map((item) => item.file));
      setError(
        `${failed.length} file${failed.length === 1 ? "" : "s"} could not be uploaded:\n${failed
          .map((item) => `${item.file.name}: ${item.error}`)
          .join(
            "\n",
          )}\n\nSuccessful files are already indexing. Retry to upload only the files listed here.`,
      );
      setBusy(false);
      setUploadStatus({ current: 0, total: 0 });
      return;
    }

    const uploadedCount = completedJobs.current.length;
    onUploaded({
      message: warnings.length
        ? warnings.join("\n")
        : `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded and indexing started`,
      jobs: completedJobs.current,
    });
  }

  return (
    <Dialog title={`Upload to ${shelf}`} onClose={onClose} closeDisabled={busy}>
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <p className="font-medium">{titleCase(subject.name)}</p>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">
          {subject.folderPath}/{shelf}
        </p>
      </div>
      <form className="mt-5" onSubmit={submit}>
        <label htmlFor="teacher-upload-file" className="block text-sm font-medium">
          Choose files
        </label>
        <input
          id="teacher-upload-file"
          type="file"
          accept={accept}
          multiple
          disabled={busy}
          className={cn(
            inputClass,
            "mt-2 min-w-0 max-w-full overflow-hidden text-ellipsis file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          )}
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            const accepted: File[] = [];
            const rejected: string[] = [];

            selected.forEach((file) => {
              const sizeError = teacherUploadSizeError(file.size);
              if (sizeError) rejected.push(`${file.name}: ${sizeError}`);
              else accepted.push(file);
            });

            setFiles(accepted);
            setError(rejected.join("\n"));
            event.currentTarget.value = "";
          }}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "teacher-upload-error" : "teacher-upload-hint"}
        />
        <p id="teacher-upload-hint" className="mt-2 text-xs text-text-muted">
          Each file uploads to the teacher collection, queues indexing, and keeps a private preview
          copy. Maximum size per file: {TEACHER_UPLOAD_MAX_LABEL}.
        </p>
        <SelectedFileRows
          label={shelf}
          files={files}
          disabled={busy}
          onRemove={(index) => {
            setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
            setError("");
          }}
        />
        {busy && uploadStatus.total ? (
          <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4" role="status">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium">Uploading and indexing</span>
              <span className="text-text-muted">
                {uploadStatus.current} of {uploadStatus.total}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-text-primary transition-[width] duration-300"
                style={{
                  width: `${Math.round((uploadStatus.current / uploadStatus.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {error ? (
          <p
            id="teacher-upload-error"
            role="alert"
            className="mt-3 whitespace-pre-line text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !files.length} aria-busy={busy}>
            {busy
              ? `Uploading ${uploadStatus.current} of ${uploadStatus.total}…`
              : files.length
                ? `Upload ${files.length} file${files.length === 1 ? "" : "s"} and index`
                : "Upload files and index"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DocumentDialog({
  document,
  onClose,
  onChanged,
}: {
  document: TeacherDocument;
  onClose: () => void;
  onChanged: (message: string, jobId?: string, jobLabel?: string) => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<ApiRecord>({});
  const [file, setFile] = useState<ApiRecord | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"reindex" | "delete" | "">("");

  useEffect(() => {
    void fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        setDetail(asRecord(payload.document));
        setFile(payload.file ? asRecord(payload.file) : null);
        setState("ready");
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not load the document.");
        setState("error");
      });
  }, [document.id]);

  async function reindex() {
    setBusyAction("reindex");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
          method: "POST",
          headers: { Accept: "application/json" },
        }),
      );
      onChanged(`${document.name} queued for re-indexing`, text(payload.jobId), document.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not re-index the document.");
      setBusyAction("");
    }
  }

  async function remove() {
    setBusyAction("delete");
    setError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      onChanged(`${document.name} deleted`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the document.");
      setBusyAction("");
    }
  }

  const previewUrl = file ? text(file.previewUrl) : "";
  const mimeType = file ? text(file.mimeType) : "";

  return (
    <Dialog title={document.name} onClose={onClose}>
      {state === "loading" ? (
        <div className="space-y-4" role="status" aria-label="Loading document preview">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
          <SkeletonBlock className="h-72" />
          <div className="grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="rounded-lg border border-destructive/30 p-5">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button className="mt-4" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : null}
      {state === "ready" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={document.status} />
            <span className="text-sm text-text-muted">
              {numberValue(detail.word_count)} words ·{" "}
              {numberValue(detail.chunk_count) || document.chunks} sections
            </span>
          </div>
          <div className="mt-5 min-h-64 overflow-hidden rounded-lg border border-border">
            {previewUrl && mimeType.startsWith("image/") ? (
              // Signed storage URLs are dynamic and intentionally bypass Next image optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`Preview of ${document.name}`}
                className="max-h-[58vh] w-full object-contain"
              />
            ) : previewUrl ? (
              <iframe
                title={`Preview of ${document.name}`}
                src={previewUrl}
                className="h-[58vh] w-full"
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center p-8 text-center">
                <div>
                  <h3 className="font-display text-lg font-semibold">Preview unavailable</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                    Older external-only uploads have metadata but no private preview copy. Re-upload
                    the original file to enable preview.
                  </p>
                </div>
              </div>
            )}
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm font-medium",
                  interactive,
                )}
              >
                Open or download
              </a>
            ) : null}
            <span className="flex-1" />
            <Button
              variant="outline"
              onClick={() => void reindex()}
              disabled={Boolean(busyAction)}
              aria-busy={busyAction === "reindex"}
            >
              {busyAction === "reindex" ? "Queueing…" : "Re-index"}
            </Button>
            <Button
              variant="danger"
              onClick={() => void remove()}
              disabled={Boolean(busyAction)}
              aria-busy={busyAction === "delete"}
            >
              {busyAction === "delete" ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

function SubjectConfig({
  subject,
  documentCount,
  onRemoved,
}: {
  subject: TeacherSubject;
  documentCount: number;
  onRemoved: (message: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"delete" | "">("");
  const [error, setError] = useState("");

  async function remove() {
    if (confirmation.trim() !== subject.name) {
      setError("Type the exact subject name before permanent deletion.");
      return;
    }
    setBusy("delete");
    setError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}?deleteFiles=1`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      onRemoved(`${titleCase(subject.name)} and its files deleted`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the subject.");
      setBusy("");
    }
  }

  return (
    <div className="mt-6 max-w-2xl">
      <div>
        <h2 className="font-display text-xl font-semibold">Subject settings</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Review this subject and manage its stored source files.
        </p>
      </div>
      <div className="mt-5 rounded-lg border border-border p-4">
        <p className="font-medium">{titleCase(subject.name)}</p>
        <p className="mt-1 text-sm text-text-muted">
          {documentCount} files in {subject.folderPath}
        </p>
      </div>
      <section className="mt-6">
        <h3 className="font-display text-lg font-semibold text-destructive">
          Delete subject and files
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Permanently removes the source folder, documents, cleaned text, and indexed sections.
        </p>
        <label htmlFor="subject-delete-confirmation" className="mt-4 block text-sm font-medium">
          Type {subject.name} to confirm
        </label>
        <input
          id="subject-delete-confirmation"
          className={cn(inputClass, "mt-2")}
          value={confirmation}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "subject-config-error" : undefined}
        />
        {error ? (
          <p id="subject-config-error" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          className="mt-4"
          variant="danger"
          onClick={() => void remove()}
          disabled={Boolean(busy)}
        >
          {busy === "delete" ? "Deleting…" : "Delete subject and files"}
        </Button>
      </section>
    </div>
  );
}

function SourceTree({ tree }: { tree: ApiRecord }) {
  const nodes = list(tree.tree);
  const draw = (node: ApiRecord, depth: number): ReactNode => {
    const children = list(node.children);
    const label = text(node.name) || text(node.path).split("/").pop() || "Untitled";
    if (children.length) {
      return (
        <details
          key={`${label}-${depth}`}
          open={depth === 0}
          className="py-1"
          style={{ marginLeft: `${depth * 12}px` }}
        >
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">
            {label} <span className="text-text-muted">{children.length}</span>
          </summary>
          {children.map((child, index) => (
            <div key={`${text(child.path)}-${index}`}>{draw(child, depth + 1)}</div>
          ))}
        </details>
      );
    }
    return (
      <p
        key={`${label}-${depth}`}
        className="min-h-10 border-b border-border py-2 text-sm"
        style={{ marginLeft: `${depth * 12}px` }}
      >
        {label}
      </p>
    );
  };
  return nodes.length ? (
    <div>
      {nodes.map((node, index) => (
        <div key={`${text(node.path)}-${index}`}>{draw(node, 0)}</div>
      ))}
    </div>
  ) : (
    <p className="py-5 text-sm text-text-muted">No folders or files yet.</p>
  );
}

function CollectionOverviewDialog({
  workspace,
  onClose,
  onChanged,
}: {
  workspace: Workspace;
  onClose: () => void;
  onChanged: (message: string, jobId?: string, jobLabel?: string) => void;
}) {
  const [busy, setBusy] = useState<"index" | "">("");
  const [error, setError] = useState("");
  const [usageState, setUsageState] = useState<WorkspaceState>("loading");
  const [usage, setUsage] = useState<ApiRecord>({});

  useEffect(() => {
    void fetch("/api/teacher/collection/usage", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        setUsage(asRecord(payload.usage));
        setUsageState("ready");
      })
      .catch(() => setUsageState("error"));
  }, []);

  async function action(type: "index-all") {
    setBusy("index");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action: type }),
        }),
      );
      onChanged(
        "All pending documents queued for indexing",
        text(payload.jobId),
        "Collection documents",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the collection.");
      setBusy("");
    }
  }

  const fileCount =
    numberValue(
      workspace.collection.files ||
        workspace.collection.indexed_files ||
        workspace.collection.total_files ||
        workspace.collection.file_count,
    ) || workspace.documents.length;

  const indexedSectionCount =
    numberValue(
      workspace.collection.chunks ||
        workspace.collection.indexed_chunks ||
        workspace.collection.total_chunks ||
        workspace.collection.chunk_count,
    ) || workspace.documents.reduce((acc, doc) => acc + (doc.chunks || 0), 0);

  const subjectCount = workspace.subjects.length;

  return (
    <Dialog title="Collection overview" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Files", fileCount],
          ["Indexed sections", indexedSectionCount],
          ["Subjects", subjectCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-4">
            <p className="text-xs text-text-muted">{label}</p>
            <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-7 rounded-lg border border-border p-5">
        <h3 className="font-display text-lg font-semibold">AI usage</h3>
        {usageState === "loading" ? (
          <div
            className="mt-4 grid gap-3 sm:grid-cols-3"
            role="status"
            aria-label="Loading AI usage"
          >
            <SkeletonBlock className="h-20" />
            <SkeletonBlock className="h-20" />
            <SkeletonBlock className="h-20" />
          </div>
        ) : usageState === "error" ? (
          <p className="mt-3 text-sm text-text-muted">
            Usage is temporarily unavailable. Collection tools still work normally.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              [
                "Total tokens",
                numberValue(usage.total_tokens || asRecord(usage.totals).total_tokens),
              ],
              [
                "Input tokens",
                numberValue(
                  usage.input_tokens || usage.prompt_tokens || asRecord(usage.totals).input_tokens,
                ),
              ],
              [
                "Output tokens",
                numberValue(
                  usage.output_tokens ||
                    usage.completion_tokens ||
                    asRecord(usage.totals).output_tokens,
                ),
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-bg-secondary p-4">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="mt-2 font-display text-xl font-semibold">
                  {Number(value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="mt-7">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Collection folders</h3>
            <p className="mt-1 text-sm text-text-muted">The source tree for this collection.</p>
          </div>
          <span className="flex-1" />
          <Button
            variant="outline"
            onClick={() => void action("index-all")}
            disabled={Boolean(busy)}
          >
            {busy === "index" ? "Queueing…" : "Index all documents"}
          </Button>
        </div>
        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-border p-4">
          <SourceTree tree={workspace.sourceTree} />
        </div>
      </section>
      {error ? (
        <p id="collection-overview-error" role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
