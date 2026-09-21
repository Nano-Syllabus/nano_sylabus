"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DashboardState,
  TeacherSubject,
  TeacherDocument,
  TeacherDashboard,
  interactive,
  text,
  numberValue,
  list,
  responsePayload,
  SkeletonCard,
  DashboardSkeleton,
  DashboardError,
  initials,
} from "@/app/teachers-v2/workspace-shared";
import {
  ClassroomTab,
  ClassroomDetail,
  ExamPaper,
  inputClass,
  bytesLabel,
  fullDate,
  localDateTimeValue,
  normalizeClassroomDetail,
  normalizeExamPaper,
  Dialog,
  ClassroomDetailSkeleton,
  humanizedExamWindowChip,
  masteryLabelAndColor,
} from "@/app/teachers-v2/views/workspace-view-shared";
import { UploadDialog, DocumentDialog } from "@/app/teachers-v2/views/workspace-dialogs";

// The whole QR library, for one dialog inside one view. It was in the initial
// chunk of every teacher who opened the page, including the ones who never
// share a classroom code.
export const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  loading: () => <div className="h-[180px] w-[180px] animate-pulse rounded bg-bg-tertiary" />,
});

export function ClassroomConceptMapSVG({
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

export function ClassroomCard({
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

export function ClassroomsView({
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

export function ClassroomDetailView({
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
              onQueueSettled={() => void onChanged("Drive import indexed")}
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

export function ReusePaperDialog({
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
