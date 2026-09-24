"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
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
const CommunityTopicExtractionControl = dynamic(() =>
  import("@/components/community-topic-extraction-control").then(
    (m) => m.CommunityTopicExtractionControl,
  ),
);
const TeacherCoursesClient = dynamic(
  () => import("@/components/teacher-courses-client").then((m) => m.TeacherCoursesClient),
  { loading: () => <SkeletonCard lines={6} /> },
);
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  aheadOfCount,
  gradeTopicEvaluation,
  scoreDistribution,
} from "@/lib/teacher-score-insights";
import {
  isTeacherSyllabusFileSupported,
  TEACHER_MATERIAL_FILE_ACCEPT,
  TEACHER_SYLLABUS_FILE_ACCEPT,
  TEACHER_UPLOAD_MAX_LABEL,
  teacherUploadSizeError,
} from "@/lib/teacher-upload";
import { teacherLegacySubjectHref, teacherSubjectsHref } from "@/lib/teacher-subject-navigation";
import { CommunityDeleteControl } from "@/components/community-delete-control";
import { subjectAccessLabel, type SubjectCommunity } from "@/lib/teacher-subject-access";
import type { CommunityDetail } from "@/lib/communities";
import type { CommunitySubjectWorkspace } from "@/lib/data/community-subjects";
import { withRenamedDocument } from "@/lib/teacher-document-name";
import { cn, titleCase } from "@/lib/utils";

import {
  ApiRecord,
  ExamWorkspaceSkeleton,
  WorkspaceState,
  DashboardState,
  SubjectTab,
  Shelf,
  TeacherSubject,
  TeacherDocument,
  Workspace,
  TeacherDashboard,
  SyllabusUnit,
  SyllabusState,
  ChatMessage,
  interactive,
  asRecord,
  text,
  numberValue,
  list,
  ResponseError,
  responsePayload,
  DriveImportQueue,
  SkeletonBlock,
  SkeletonCard,
  DashboardSkeleton,
  DashboardError,
  initials,
  formatDate,
} from "@/app/teachers-v2/workspace-shared";

/**
 * THE VIEWS A TEACHER IS NOT LOOKING AT YET.
 *
 * This screen is eight views and a stack of dialogs, and it used to ship as one
 * module: 12,148 lines, 131 kB of route JavaScript against 25 kB for the next
 * largest route in the app. All of it was downloaded, parsed and hydrated before
 * the first view could paint — including the exam workflow, the classroom
 * register and a 936-line subject wizard, for a teacher who opened the page on
 * "My communities" and may never touch any of them.
 *
 * Each of these is rendered behind a `view === "..."` test or a dialog state, so
 * none of it is needed for the first paint. `dynamic()` makes that explicit:
 * the chunk is fetched when the teacher actually opens the tab, and the default
 * view carries none of it.
 */
const ExamsView = dynamic(
  () => import("./views/exams-view").then((m) => m.ExamsView),
  { loading: () => <ExamWorkspaceSkeleton /> },
);
const ClassroomsView = dynamic(
  () => import("./views/classrooms-view").then((m) => m.ClassroomsView),
  { loading: () => <DashboardSkeleton /> },
);
const TeacherSettingsView = dynamic(
  () => import("./views/settings-view").then((m) => m.TeacherSettingsView),
  { loading: () => <SkeletonCard /> },
);
const SubjectsView = dynamic(
  () => import("./views/subject-view").then((m) => m.SubjectsView),
  { loading: () => <SkeletonCard /> },
);
const SubjectView = dynamic(
  () => import("./views/subject-view").then((m) => m.SubjectView),
  { loading: () => <SkeletonCard /> },
);
const CreateClassroomDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.CreateClassroomDialog));
const CreateSubjectDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.CreateSubjectDialog));
const CreateFolderDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.CreateFolderDialog));
const CommunityChallengeFormatSettings = dynamic(() =>
  import("@/components/challenge-format-picker").then((m) => m.CommunityChallengeFormatSettings),
);
const UploadDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.UploadDialog));
const DocumentDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.DocumentDialog));
const CollectionOverviewDialog = dynamic(() => import("./views/workspace-dialogs").then((m) => m.CollectionOverviewDialog));
type RecoveryState = "idle" | "recovering" | "missing" | "recreating";
type MainView =
  | "today"
  | "communities"
  | "subjects"
  | "activity"
  | "courses"
  | "classrooms"
  | "exams"
  | "settings";
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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
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
      ["ok", "ready", "indexed", "complete", "completed", "success"].includes(rawStatus)
        ? "ready"
        : // `empty` is the indexer's verdict that there was nothing readable in
          // the file. It is an outcome, not a stage, and waiting will not change
          // it — so it belongs with the failures.
          ["failed", "error", "cancelled", "canceled", "empty"].includes(rawStatus)
          ? "error"
          : // Only a status that NAMES work in progress reads as in progress.
            ["queued", "running", "processing", "pending", "indexing"].includes(rawStatus)
            ? "processing"
            : "unindexed";
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
    stale: payload.stale === true,
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

/**
 * Live status for the import queue.
 *
 * Shown inside the upload dialog, but it is not the dialog's progress bar: it
 * reads the server's queue, so it says the same thing after a reload, on another
 * device, and to a creator who closed this dialog ten minutes ago and came back.
 */
/**
 * Activity: what the workspace is doing when the creator is not watching.
 *
 * A Drive folder is imported by a drain worker AFTER the dialog that queued it
 * has closed — that is the whole point of the queue, and it is also why there
 * was no way to find out how it went. The subject wizard closes on success, so
 * a creator who pasted a twenty-file link had nowhere to learn which files
 * landed, which failed, or whether anything was still running.
 *
 * `DriveImportQueue` already answers all of that and polls for itself; it simply
 * had no home outside the upload dialog. This gives it one.
 *
 * It renders nothing when the queue is empty, so the empty state lives here
 * rather than inside it — a panel that vanishes is right inside a dialog and
 * wrong as a whole page.
 */
function ActivityView({ onSettled }: { onSettled?: () => void }) {
  return (
    <section>
      <h1 className="font-display text-2xl font-semibold">Activity</h1>
      <p className="mt-2 max-w-prose text-sm text-text-secondary">
        Imports run in the background, so you can close a dialog or this tab and they carry on.
        Anything still running, finished or failed in the last while shows here.
      </p>
      <DriveImportQueue onSettled={onSettled} emptyMessage="Nothing has been imported recently." />
    </section>
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
  const [workspaceErrorCode, setWorkspaceErrorCode] = useState("");
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("idle");
  const [recoveryError, setRecoveryError] = useState("");
  const [recreateConfirmation, setRecreateConfirmation] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardState>("loading");
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardData, setDashboard] = useState<TeacherDashboard | null>(null);
  // What has already been loaded this session, per community.
  //
  // `dashboard` used to go hard null the moment `communitySlug` changed, so every
  // switch — including switching straight back to one just looked at — emptied
  // the page and waited on a cold request. Deliberately NOT keyed loosely: a
  // community shows only its OWN cached numbers, because the one thing worse
  // than waiting is reading another community's counts under this one's name.
  // A community not seen this session still gets a spinner, which is honest —
  // nothing is known about it yet.
  const dashboardCache = useRef(new Map<string, TeacherDashboard>());
  const dashboard =
    loadedDashboardKey === dashboardKey
      ? dashboardData
      : (dashboardCache.current.get(dashboardKey) ?? null);
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
  /** The file names this session has an indexing job running for — what keeps a
   *  card that was just queued from reading "Not indexed". */
  const indexingNames = useMemo(() => new Set(Object.values(indexingJobs)), [indexingJobs]);
  const [communityReturnTo, setCommunityReturnTo] = useState("");

  const loadWorkspace = useCallback(async () => {
    setWorkspaceState("loading");
    setWorkspaceError("");
    setWorkspaceErrorCode("");
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
      setWorkspaceErrorCode(error instanceof ResponseError ? error.code : "workspace_load_failed");
      setWorkspaceState("error");
      return null;
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    const request = ++dashboardRequest.current;
    // Only spin if there is genuinely nothing to show for THIS community. With a
    // cached copy the page stays up and reconciles behind it, which is the same
    // rule the student dashboard already follows: paint what is known, refresh
    // once, never blank a screen that had content a moment ago.
    setDashboardState(dashboardCache.current.has(dashboardKey) ? "ready" : "loading");
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
      const next = normalizeDashboard(payload);
      dashboardCache.current.set(dashboardKey, next);
      setDashboard(next);
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

  /**
   * Queue one file for indexing and watch it through.
   *
   * By PATH, not by document id. A file that has never been indexed has no row
   * in the collection index, and the id the source tree shows for it is derived
   * from its path rather than stored — so `/v1/collection/documents/<id>` and an
   * index request keyed by that id both 404. The path is what the tenant API can
   * still resolve, and it is the one thing that works for both a file that was
   * never indexed and one whose indexing failed.
   */
  const indexDocument = useCallback(
    async (document: TeacherDocument) => {
      const payload = await responsePayload(
        await fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ path: document.path }),
        }),
      );
      const id = text(payload.jobId);
      if (id) {
        void pollIndexingJob(id, document.name);
        setToast(`${document.name} queued for indexing`);
        return;
      }
      await loadWorkspace();
    },
    [loadWorkspace, pollIndexingJob],
  );

  /**
   * Rename one file — optimistically, and without reloading anything.
   *
   * The card shows the new name the moment the creator presses Enter. The API's
   * answer then settles it (it may tidy what was typed), and a refusal puts the
   * old name back and reaches the card as an error. Nothing is refetched either
   * way: the response already says all there is to know, and a reload of the
   * workspace would only be told it again (the cache-first rule). The file keeps
   * its path and id, which is why patching the one entry is the whole update.
   *
   * An indexing job this session is following is keyed by file NAME, so a file
   * renamed mid-index carries its job across rather than dropping back to "Not
   * indexed" until the job ends.
   */
  const renameDocument = useCallback(async (document: TeacherDocument, name: string) => {
    const show = (from: string, to: string) => {
      setWorkspace((current) =>
        // Only if the file still shows the name being replaced — a slower,
        // earlier rename must not undo a later one.
        current?.documents.some((item) => item.path === document.path && item.name === from)
          ? withRenamedDocument(current, document.path, to)
          : current,
      );
      setIndexingJobs((current) =>
        Object.values(current).includes(from)
          ? Object.fromEntries(
              Object.entries(current).map(([jobId, label]) => [jobId, label === from ? to : label]),
            )
          : current,
      );
    };

    show(document.name, name);
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ name, path: document.path }),
        }),
      );
      const saved = text(payload.name) || name;
      if (saved !== name) show(name, saved);
      setToast(
        payload.mirrorSynced === false
          ? `Renamed to ${saved}. Students may still see the old name until you rename it again.`
          : `Renamed to ${saved}`,
      );
    } catch (error) {
      show(name, document.name);
      throw error;
    }
  }, []);

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
  /**
   * Warm the dialog chunk once the page is idle.
   *
   * Splitting the dialogs out is what took this route from 131 kB to 24 kB, but
   * it moves their download to the moment the teacher clicks — and a dialog is
   * the one thing on this screen that has to feel instant, because a button
   * that does nothing for half a second reads as broken rather than as loading.
   * A tab switch does not have that problem: it has a skeleton and the teacher
   * expects a beat.
   *
   * So the cost is paid after the first paint instead of before it, which is
   * the whole point — the critical path stays short and the click stays sharp.
   * `requestIdleCallback` keeps it off the main thread while anything else is
   * happening; Safari does not have it, hence the timeout.
   */
  useEffect(() => {
    const warm = () => {
      void import("./views/workspace-dialogs");
    };
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(handle);
  }, []);
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
      requestedView === "activity" ||
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
    ? dashboard.communityWorkspace.terms
        .flatMap((term) => term.subjects)
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
    const canReconnect = workspaceErrorCode === "invalid_workspace_key";
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

        {canReconnect && recoveryState === "missing" ? (
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
        ) : canReconnect ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button disabled={isBusy} aria-busy={isBusy} onClick={() => void recoverWorkspace()}>
              {recoveryState === "recovering" ? "Reconnecting…" : "Reconnect workspace"}
            </Button>
            <Button variant="outline" disabled={isBusy} onClick={() => void loadWorkspace()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button disabled={isBusy} onClick={() => void loadWorkspace()}>
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
          <Image
            src="/nanologo.png"
            alt=""
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-lg object-contain"
          />
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
              ["activity", "Activity"],
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
              className="grid h-10 w-10 place-items-center rounded-lg transition hover:opacity-80"
            >
              <Image
                src="/nanologo.png"
                alt="Nano Syllabus"
                width={34}
                height={34}
                className="h-[34px] w-[34px] rounded-lg object-contain"
              />
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
              ["activity", "Activity"],
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
          {/* The workspace opened from the last read that succeeded, because the
              creator service did not answer this one. Said plainly and in one
              line: the teacher is looking at their own collection, and the only
              thing they cannot trust is how recent it is. The alternative this
              replaced was the whole screen refusing to open. */}
          {workspace.stale ? (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-strong bg-bg-primary p-4 text-sm"
            >
              <span className="text-text-secondary">
                The creator service is busy, so this is your workspace as it was a few minutes ago.
                Anything you add now is saved normally.
              </span>
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className={cn("font-medium underline underline-offset-4", interactive)}
              >
                Reload now
              </button>
            </div>
          ) : null}
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
          {view === "activity" ? <ActivityView onSettled={() => void loadWorkspace()} /> : null}
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
                onIndexDocument={indexDocument}
                onRenameDocument={renameDocument}
                indexingNames={indexingNames}
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
                onSubjectRenamed={async (name) => {
                  setWorkspace((current) =>
                    current
                      ? {
                          ...current,
                          subjects: current.subjects.map((subject) =>
                            subject.slug === selectedSubject.slug ? { ...subject, name } : subject,
                          ),
                        }
                      : current,
                  );
                  setToast(`${titleCase(name)} renamed`);
                  await Promise.all([loadWorkspace(), loadDashboard()]);
                }}
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
          onQueueSettled={() => void loadWorkspace()}
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

      {/* A community setting, and the first thing its admin page offers: which
          questions every student's challenge exam asks. Existing communities
          choose it here too — they run on QnA until they do. */}
      {!subjectsMode && selected.canManage ? (
        <CommunityChallengeFormatSettings key={`format-${selected.slug}`} slug={selected.slug} />
      ) : null}

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

