"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn, titleCase } from "@/lib/utils";
import { TEACHER_SYLLABUS_FILE_ACCEPT } from "@/lib/teacher-upload";
import {
  createInitialTeacherWorkspace,
  workspaceStorageKey,
  type Chapter,
  type Classroom,
  type Exam,
  type KnowledgeLevel,
  type Material,
  type Question,
  type Result,
  type Student,
  type Subject,
  type TeacherWorkspaceData,
  type Topic,
} from "./workspace-data";

type View =
  | { name: "today" }
  | { name: "subjects" }
  | { name: "subject"; id: string }
  | { name: "classrooms" }
  | { name: "students" }
  | { name: "classroom"; id: string }
  | { name: "exam"; id: string; classroomId?: string }
  | { name: "marking" }
  | { name: "result"; id: string }
  | { name: "settings" };

type ModalState = { title: string; content: ReactNode; wide?: boolean } | null;
type SubjectTab = "syllabus" | "material" | "bank" | "test-chat" | "classrooms";
type ClassroomTab = "students" | "exams" | "performance" | "material" | "settings";
type ExamTab = "questions" | "schedule" | "submissions";
type ResultTab = "paper" | "answers" | "summary";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(value: string) {
  if (!value) return "Open anytime";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function offeringStatus(opens: string, closes: string) {
  const now = Date.now();
  if (opens && new Date(opens).getTime() > now) return "Opens later";
  if (closes && new Date(closes).getTime() < now) return "Closed";
  return "Open now";
}

function offeringWindow(opens: string, closes: string) {
  const now = Date.now();
  const opensAt = opens ? new Date(opens).getTime() : null;
  const closesAt = closes ? new Date(closes).getTime() : null;
  if (opensAt && opensAt > now) {
    return { state: "upcoming" as const, label: `Opens ${formatDate(opens)}` };
  }
  if (closesAt && closesAt < now) {
    return { state: "closed" as const, label: `Closed ${formatDate(closes)}` };
  }
  if (closesAt) {
    const days = Math.ceil((closesAt - now) / 86_400_000);
    return {
      state: "open" as const,
      label: days <= 1 ? "Closes today" : `Closes in ${days} days`,
    };
  }
  return { state: "open" as const, label: "Open now" };
}

function bytesLabel(file: File) {
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseImportedSyllabus(raw: string): Chapter[] {
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
        id: uid("chapter"),
        name:
          (lines.shift() || `Unit ${index + 1}`).replace(
            /^(Unit|Chapter|Module)\s*\d*[:.)-]?\s*/i,
            "",
          ) || `Unit ${index + 1}`,
        topics: lines.map((name) => ({
          id: uid("topic"),
          name,
          level: "not-started" as const,
          testScore: null,
          questionScore: null,
        })),
      };
    });
}

function classStatus(student: Student) {
  if (!student.joined) return "Not joined";
  if (student.average === null) return "Nothing handed in";
  if (student.average < 0.45) return "Needs attention";
  if (student.average > 0.8) return "Doing well";
  return "On track";
}

function levelLabel(level: KnowledgeLevel) {
  if (level === "struggling") return "Struggling";
  if (level === "developing") return "Getting there";
  if (level === "solid") return "Solid";
  return "Not started";
}

function levelForScore(score: number | null): KnowledgeLevel {
  if (score === null) return "not-started";
  if (score < 0.4) return "struggling";
  if (score < 0.7) return "developing";
  return "solid";
}

function studentTopicScore(student: Student, topic: Topic, source: "tests" | "questions") {
  const saved = student.topicScores?.[topic.id]?.[source];
  if (saved !== undefined) return saved;
  const classSignal = source === "tests" ? topic.testScore : topic.questionScore;
  if (!student.joined || student.average === null || classSignal === null) return null;
  const hash = `${student.id}:${topic.id}:${source}`
    .split("")
    .reduce((value, character) => value + character.charCodeAt(0), 0);
  const offset = ((hash % 15) - 7) / 100;
  return Math.max(0.08, Math.min(0.96, student.average * 0.58 + classSignal * 0.42 + offset));
}

function parseHash(hash: string): View {
  const raw = hash.replace(/^#/, "");
  const [name, id, classroomId] = raw.split(":");
  if (name === "subject" && id) return { name, id };
  if (name === "classroom" && id) return { name, id };
  if (name === "exam" && id) return { name, id, classroomId: classroomId || undefined };
  if (name === "result" && id) return { name, id };
  if (["today", "subjects", "classrooms", "students", "marking", "settings"].includes(name)) {
    return {
      name: name as "today" | "subjects" | "classrooms" | "students" | "marking" | "settings",
    };
  }
  return { name: "today" };
}

function hashFor(view: View) {
  if (view.name === "subject" || view.name === "classroom" || view.name === "result")
    return `#${view.name}:${view.id}`;
  if (view.name === "exam")
    return `#exam:${view.id}${view.classroomId ? `:${view.classroomId}` : ""}`;
  return `#${view.name}`;
}

function cloneWorkspace(workspace: TeacherWorkspaceData) {
  return JSON.parse(JSON.stringify(workspace)) as TeacherWorkspaceData;
}

function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        focusRing,
        size === "sm" && "px-3 text-xs",
        size === "md" && "px-4 text-sm",
        size === "lg" && "min-h-12 px-5 text-base",
        variant === "primary" && "bg-text-primary text-text-inverse hover:opacity-85",
        variant === "secondary" &&
          "border border-border bg-bg-primary text-text-primary hover:bg-bg-secondary",
        variant === "quiet" && "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
        variant === "danger" &&
          "border border-destructive text-destructive hover:bg-destructive hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-bg-primary", className)}>{children}</div>
  );
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "solid" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        tone === "neutral" && "border-border text-text-secondary",
        tone === "solid" && "border-text-primary bg-text-primary text-text-inverse",
        tone === "success" && "border-success/30 bg-[color:var(--note-green)] text-success",
        tone === "warning" && "border-warning/30 bg-[color:var(--note-yellow)] text-warning",
        tone === "danger" && "border-destructive/30 bg-[color:var(--note-red)] text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function KnowledgeDot({ level }: { level: KnowledgeLevel }) {
  return (
    <span
      aria-label={levelLabel(level)}
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/20",
        level === "struggling" && "bg-destructive",
        level === "developing" && "bg-warning",
        level === "solid" && "bg-success",
        level === "not-started" && "bg-bg-tertiary",
      )}
    />
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-secondary font-display text-lg">
        n
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

function Tabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-6 flex overflow-x-auto border-b border-border" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={cn(
            "min-h-11 shrink-0 border-b-2 px-4 text-sm transition-colors",
            focusRing,
            value === item.value
              ? "border-text-primary font-semibold text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary",
          )}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="ml-2 text-xs opacity-65">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Modal({ modal, onClose }: { modal: NonNullable<ModalState>; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-modal-title"
        className={cn(
          "max-h-[88vh] w-full overflow-y-auto rounded-xl border border-border bg-bg-primary shadow-2xl",
          modal.wide ? "max-w-4xl" : "max-w-xl",
        )}
      >
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-bg-primary px-5 py-4">
          <h2 id="teacher-modal-title" className="font-display text-lg font-semibold">
            {modal.title}
          </h2>
          <span className="flex-1" />
          <Button autoFocus type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="p-5">{modal.content}</div>
      </section>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs font-normal leading-5 text-text-secondary">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass = cn(
  "min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted",
  focusRing,
);

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-text-secondary">{detail}</p>
    </Card>
  );
}

function PseudoQr({ seed }: { seed: string }) {
  return (
    <div className="rounded-lg bg-white p-3" aria-label="Scannable invite QR code">
      <QRCodeSVG value={seed} size={160} level="M" marginSize={1} title="Invite QR code" />
    </div>
  );
}

export function TeacherWorkspace({ teacherHandle }: { teacherHandle: string }) {
  const [workspace, setWorkspace] = useState<TeacherWorkspaceData>(() =>
    createInitialTeacherWorkspace(teacherHandle),
  );
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ name: "today" });
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const [subjectTab, setSubjectTab] = useState<SubjectTab>("syllabus");
  const [classroomTab, setClassroomTab] = useState<ClassroomTab>("students");
  const [examTab, setExamTab] = useState<ExamTab>("questions");
  const [resultTab, setResultTab] = useState<ResultTab>("paper");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [studentSort, setStudentSort] = useState("low");
  const [studentClassFilter, setStudentClassFilter] = useState("all");
  const [studentVisible, setStudentVisible] = useState(12);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [classroomSearch, setClassroomSearch] = useState("");
  const [classroomTerm, setClassroomTerm] = useState<"current" | "past">("current");
  const [performanceSource, setPerformanceSource] = useState<"tests" | "questions">("tests");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [activePen, setActivePen] = useState<"tick" | "cross" | "marks" | "note">("tick");
  const [paperPage, setPaperPage] = useState(1);
  const [rewritingQuestionId, setRewritingQuestionId] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(workspaceStorageKey(teacherHandle));
    if (stored) {
      try {
        setWorkspace(JSON.parse(stored) as TeacherWorkspaceData);
      } catch {
        window.localStorage.removeItem(workspaceStorageKey(teacherHandle));
      }
    }
    setView(parseHash(window.location.hash));
    const onHashChange = () => setView(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    setReady(true);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [teacherHandle]);

  useEffect(() => {
    if (ready)
      window.localStorage.setItem(workspaceStorageKey(teacherHandle), JSON.stringify(workspace));
  }, [ready, teacherHandle, workspace]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function updateWorkspace(recipe: (draft: TeacherWorkspaceData) => void) {
    setWorkspace((current) => {
      const draft = cloneWorkspace(current);
      recipe(draft);
      return draft;
    });
  }

  function navigate(next: View) {
    const hash = hashFor(next);
    if (window.location.hash === hash) setView(next);
    else window.location.hash = hash;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setSelectedTopicId("");
  }

  function subjectOf(id: string) {
    return workspace.subjects.find((subject) => subject.id === id);
  }

  function classroomOf(id: string) {
    return workspace.classrooms.find((classroom) => classroom.id === id);
  }

  function studentOf(id: string) {
    return workspace.students.find((student) => student.id === id);
  }

  function examOf(id: string) {
    return workspace.exams.find((exam) => exam.id === id);
  }

  const waitingResults = workspace.results.filter((result) => !result.published);

  function openCreateSubject() {
    setModal({
      title: "Add a subject",
      wide: true,
      content: (
        <CreateSubjectWizard
          onCancel={() => setModal(null)}
          onCreate={async (subjectDraft) => {
            const materialTexts = await Promise.all(
              subjectDraft.materialFiles.map((file) =>
                /\.(txt|md|csv)$/i.test(file.name) ? file.text() : Promise.resolve(""),
              ),
            );
            const id = uid("subject");
            updateWorkspace((draft) => {
              draft.subjects.push({
                id,
                name: subjectDraft.name,
                code: subjectDraft.code,
                university: subjectDraft.university,
                programme: subjectDraft.programme,
                semester: subjectDraft.semester,
                description: subjectDraft.description || "Teacher-created subject workspace.",
                chapters: subjectDraft.chapters,
                materials: subjectDraft.materialFiles.map((file, index) => ({
                  id: uid("material"),
                  name: file.name.replace(/\.[^.]+$/, ""),
                  kind: /\.(ppt|pptx)$/i.test(file.name)
                    ? "Slides"
                    : file.type.startsWith("image/")
                      ? "Class notes"
                      : "Notes",
                  size: bytesLabel(file),
                  status: "ready",
                  previewType: file.type.startsWith("image/")
                    ? "image"
                    : /\.pdf$/i.test(file.name)
                      ? "pdf"
                      : /\.(ppt|pptx)$/i.test(file.name)
                        ? "slides"
                        : "document",
                  previewText: materialTexts[index].slice(0, 12_000) || undefined,
                })),
                questionBanks: subjectDraft.bankFiles.map((file) => ({
                  id: uid("bank"),
                  name: file.name,
                  size: bytesLabel(file),
                  questionsFound: 12 + Math.floor(Math.random() * 30),
                  status: "ready",
                })),
              });
            });
            setModal(null);
            setToast("Subject created. Add material or run it as a classroom.");
            navigate({ name: "subject", id });
          }}
        />
      ),
    });
  }

  function openCreateClassroom(subjectId?: string) {
    setModal({
      title: "Create classroom",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const batch = String(data.get("batch") || "new");
            const inherited = workspace.classrooms.find((item) => item.id === batch);
            const name =
              String(data.get("name") || "").trim() ||
              inherited?.name ||
              (batch === "online" ? "Open online classroom" : "New classroom");
            if (!name) return;
            const id = uid("classroom");
            updateWorkspace((draft) => {
              draft.classrooms.push({
                id,
                subjectId: String(data.get("subjectId")),
                name,
                college:
                  String(data.get("college") || "").trim() ||
                  inherited?.college ||
                  "Independent classroom",
                schedule: String(data.get("schedule") || "").trim() || "To be arranged",
                code: `${
                  name
                    .replace(/[^A-Za-z]/g, "")
                    .slice(0, 3)
                    .toUpperCase() || "CLS"
                }-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                groupCode:
                  inherited?.groupCode ||
                  `GRP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                term: String(data.get("term")) === "past" ? "past" : "current",
                mode:
                  batch === "online" || String(data.get("mode")) === "online" ? "online" : "campus",
                teachers: [workspace.teacher.name],
                studentIds: inherited?.studentIds || [],
              });
            });
            setModal(null);
            setToast("Classroom created. Share the invite code with students.");
            navigate({ name: "classroom", id });
          }}
        >
          <Field label="Subject">
            <select
              className={inputClass}
              name="subjectId"
              defaultValue={subjectId || workspace.subjects[0]?.id}
              required
            >
              {workspace.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {titleCase(subject.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Classroom or batch name">
            <input className={inputClass} name="name" placeholder="PUL BEI 081 A" />
          </Field>
          <Field label="Which batch of students?">
            <select className={inputClass} name="batch" defaultValue="new">
              {workspace.classrooms
                .filter((item) => item.term !== "past")
                .filter(
                  (item, index, all) =>
                    all.findIndex((candidate) => candidate.name === item.name) === index,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.college}
                  </option>
                ))}
              <option value="online">Anyone, online</option>
              <option value="new">A new classroom of students</option>
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Classroom type">
              <select className={inputClass} name="mode" defaultValue="campus">
                <option value="campus">Campus batch</option>
                <option value="online">Anyone, online</option>
              </select>
            </Field>
            <Field label="Term">
              <select className={inputClass} name="term" defaultValue="current">
                <option value="current">This term</option>
                <option value="past">Earlier</option>
              </select>
            </Field>
          </div>
          <Field label="College">
            <input
              className={inputClass}
              name="college"
              placeholder="Pulchowk Campus"
              autoComplete="organization"
            />
          </Field>
          <Field label="Schedule">
            <input className={inputClass} name="schedule" placeholder="Sun & Wed, 10:00" />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Create classroom</Button>
          </div>
        </form>
      ),
    });
  }

  function openCreateExam(classroomId?: string) {
    const classroom = classroomId ? classroomOf(classroomId) : undefined;
    setModal({
      title: classroom ? `New exam for ${classroom.name}` : "Create exam",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const id = uid("exam");
            const selectedSubjectId = classroom?.subjectId || String(data.get("subjectId"));
            updateWorkspace((draft) => {
              draft.exams.unshift({
                id,
                subjectId: selectedSubjectId,
                title: String(data.get("title") || "Untitled exam").trim(),
                kind: String(data.get("kind")) as Exam["kind"],
                marks: Number(data.get("marks") || 50),
                minutes: Number(data.get("minutes") || 60),
                attempts: Number(data.get("attempts") || 1),
                code: `EXM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                questions: [],
                offerings: classroom ? [{ classroomId: classroom.id, opens: "", closes: "" }] : [],
              });
            });
            setModal(null);
            setExamTab("questions");
            setToast("Exam created. Add questions, then set its dates.");
            navigate({ name: "exam", id, classroomId });
          }}
        >
          {!classroom ? (
            <Field label="Subject">
              <select className={inputClass} name="subjectId" required>
                {workspace.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {titleCase(subject.name)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Exam title">
            <input className={inputClass} name="title" placeholder="Midterm exam" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind">
              <select className={inputClass} name="kind" defaultValue="exam">
                <option value="exam">Exam</option>
                <option value="class test">Class test</option>
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
            </Field>
            <Field label="Total marks">
              <input
                className={inputClass}
                name="marks"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue="50"
              />
            </Field>
            <Field label="Time limit (minutes)">
              <input
                className={inputClass}
                name="minutes"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue="60"
              />
            </Field>
            <Field label="Attempts">
              <input
                className={inputClass}
                name="attempts"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue="1"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Create and add questions</Button>
          </div>
        </form>
      ),
    });
  }

  function openInvite(classroom: Classroom, exam?: Exam) {
    const code = exam?.code || classroom.groupCode || classroom.code;
    const link = `${window.location.origin}/?join=${encodeURIComponent(code)}`;
    setModal({
      title: exam ? "Share exam" : "Invite students",
      content: (
        <div className="flex flex-col items-center text-center">
          <PseudoQr seed={link} />
          <p className="mt-5 font-mono-ui text-2xl font-semibold tracking-[0.16em]">{code}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
            {exam
              ? "Students open this exam directly."
              : `One group code adds every subject connected to ${classroom.name}.`}
          </p>
          <div className="mt-5 w-full break-all rounded-lg border border-border bg-bg-secondary p-3 text-left font-mono-ui text-xs">
            {link}
          </div>
          {!exam ? (
            <div className="mt-4 flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Just this subject</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Use this for a student repeating only this classroom.
                </p>
              </div>
              <span className="font-mono-ui text-sm font-semibold tracking-[0.08em]">
                {classroom.code}
              </span>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(() => setToast("Invite link copied."))
              }
            >
              Copy link
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => printInviteCard(exam?.title || classroom.name, code, link)}
            >
              Print
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const nextCode = `${exam ? "EXM" : "CLS"}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                updateWorkspace((draft) => {
                  if (exam) {
                    const target = draft.exams.find((item) => item.id === exam.id);
                    if (target) target.code = nextCode;
                  } else {
                    const target = draft.classrooms.find((item) => item.id === classroom.id);
                    if (target) target.groupCode = nextCode;
                  }
                });
                setModal(null);
                setToast(`New code created: ${nextCode}`);
              }}
            >
              New code
            </Button>
            <Button type="button" onClick={() => setModal(null)}>
              Done
            </Button>
          </div>
          <p className="mt-4 text-xs text-text-muted">
            Frontend preview: the code is stored only in this browser until a backend is connected.
          </p>
        </div>
      ),
    });
  }

  function openAddMaterial(subject: Subject, bank = false) {
    setModal({
      title: bank ? "Add past papers" : "Add material",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
            const files = Array.from(input.files || []);
            if (!files.length) return;
            const data = new FormData(event.currentTarget);
            const requestedName = String(data.get("name") || "").trim();
            const requestedKind = String(data.get("kind") || "Notes") as Material["kind"];
            const addedIds: string[] = [];
            updateWorkspace((draft) => {
              const target = draft.subjects.find((item) => item.id === subject.id);
              if (!target) return;
              if (bank) {
                files.forEach((file) => {
                  const id = uid("bank");
                  addedIds.push(id);
                  target.questionBanks.push({
                    id,
                    name: file.name,
                    size: bytesLabel(file),
                    questionsFound: 0,
                    status: "processing",
                  });
                });
              } else {
                files.forEach((file) => {
                  const id = uid("material");
                  addedIds.push(id);
                  const previewType: Material["previewType"] = file.type.startsWith("image/")
                    ? "image"
                    : /\.pdf$/i.test(file.name)
                      ? "pdf"
                      : /\.(ppt|pptx|key)$/i.test(file.name)
                        ? "slides"
                        : /\.(txt|md|csv)$/i.test(file.name)
                          ? "text"
                          : "document";
                  target.materials.push({
                    id,
                    name:
                      requestedName && files.length === 1
                        ? requestedName
                        : file.name.replace(/\.[^.]+$/, ""),
                    kind: requestedKind,
                    size: bytesLabel(file),
                    status: "processing",
                    previewType,
                  });
                });
              }
            });
            if (!bank) {
              files.forEach((file, index) => {
                if (!/\.(txt|md|csv)$/i.test(file.name)) return;
                const reader = new FileReader();
                reader.onload = () =>
                  updateWorkspace((draft) => {
                    const material = draft.subjects
                      .find((item) => item.id === subject.id)
                      ?.materials.find((item) => item.id === addedIds[index]);
                    if (material)
                      material.previewText = String(reader.result || "").slice(0, 12_000);
                  });
                reader.readAsText(file);
              });
            }
            setModal(null);
            setToast(
              bank ? "Past papers added for local review." : "Material added to this subject.",
            );
            window.setTimeout(() => {
              updateWorkspace((draft) => {
                const target = draft.subjects.find((item) => item.id === subject.id);
                if (!target) return;
                if (bank) {
                  target.questionBanks.forEach((item) => {
                    if (addedIds.includes(item.id)) {
                      item.status = "ready";
                      item.questionsFound = 12 + Math.floor(Math.random() * 30);
                    }
                  });
                } else {
                  target.materials.forEach((item) => {
                    if (addedIds.includes(item.id)) item.status = "ready";
                  });
                }
              });
              setToast(bank ? "Question bank ready." : "Material is ready.");
            }, 1800);
          }}
        >
          <Field
            label={bank ? "Question papers" : "Teaching files"}
            hint="PDF, Word, slides and images are listed locally; content processing starts when the backend is connected."
          >
            <input
              className={cn(inputClass, "py-2")}
              name="file"
              type="file"
              multiple
              accept={
                bank
                  ? ".pdf,.doc,.docx"
                  : ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif"
              }
              required
            />
          </Field>
          {!bank ? (
            <>
              <Field label="Display name" hint="Optional when adding one file.">
                <input className={inputClass} name="name" placeholder="Unit 3 notes" />
              </Field>
              <Field label="Material kind">
                <select className={inputClass} name="kind">
                  <option>Notes</option>
                  <option>Past papers</option>
                  <option>Slides</option>
                  <option>Class notes</option>
                  <option>Textbook</option>
                </select>
              </Field>
            </>
          ) : null}
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Add files</Button>
          </div>
        </form>
      ),
    });
  }

  function openAddChapter(subject: Subject) {
    setModal({
      title: "Add unit",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get("name") || "").trim();
            const topics = String(data.get("topics") || "")
              .split(/[,\n]/)
              .map((item) => item.trim())
              .filter(Boolean);
            if (!name) return;
            updateWorkspace((draft) => {
              draft.subjects
                .find((item) => item.id === subject.id)
                ?.chapters.push({
                  id: uid("chapter"),
                  name,
                  topics: topics.map((topic) => ({
                    id: uid("topic"),
                    name: topic,
                    level: "not-started",
                    testScore: null,
                    questionScore: null,
                  })),
                });
            });
            setModal(null);
            setToast("Unit added to the syllabus.");
          }}
        >
          <Field label="Unit name">
            <input className={inputClass} name="name" placeholder="Induction" required />
          </Field>
          <Field label="Topics" hint="Separate topics with commas or new lines.">
            <textarea
              className={cn(inputClass, "min-h-28 py-3")}
              name="topics"
              placeholder="Faraday's law, Lenz's law, Self inductance"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Add unit</Button>
          </div>
        </form>
      ),
    });
  }

  function openUploadSyllabus(subject: Subject) {
    setModal({
      title: "Import syllabus",
      wide: true,
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const pasted = String(data.get("syllabus") || "").trim();
            const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
            const file = input.files?.[0];
            const review = (chapters: Chapter[]) => {
              if (!chapters.length) return;
              setModal({
                title: "Check the syllabus",
                wide: true,
                content: (
                  <SyllabusReview
                    initialChapters={chapters}
                    fileName={file?.name}
                    onBack={() => openUploadSyllabus(subject)}
                    onCommit={(accepted) => {
                      updateWorkspace((draft) => {
                        draft.subjects
                          .find((item) => item.id === subject.id)
                          ?.chapters.push(...accepted);
                      });
                      setModal(null);
                      setToast(
                        `${accepted.length} syllabus unit${accepted.length === 1 ? "" : "s"} added.`,
                      );
                    }}
                  />
                ),
              });
            };
            if (!pasted && file && /\.(txt|md)$/i.test(file.name)) {
              const reader = new FileReader();
              reader.onload = () => review(parseImportedSyllabus(String(reader.result || "")));
              reader.readAsText(file);
              return;
            }
            const chapters = parseImportedSyllabus(pasted);
            if (!chapters.length && file) {
              chapters.push({
                id: uid("chapter"),
                name: `Imported from ${file.name.replace(/\.[^.]+$/, "")}`,
                topics: ["Review imported outline", "Confirm topic breakdown"].map((name) => ({
                  id: uid("topic"),
                  name,
                  level: "not-started",
                  testScore: null,
                  questionScore: null,
                })),
              });
            }
            review(chapters);
          }}
        >
          <Field
            label="Syllabus file"
            hint="The file name is kept locally. Paste the outline below to preview its units immediately."
          >
            <input
              className={cn(inputClass, "py-2")}
              name="file"
              type="file"
              accept={TEACHER_SYLLABUS_FILE_ACCEPT}
            />
          </Field>
          <Field
            label="Syllabus outline"
            hint="Start each unit in a new paragraph; put its topics on following lines."
          >
            <textarea
              className={cn(inputClass, "min-h-56 py-3")}
              name="syllabus"
              placeholder={
                "Electrostatics\nElectric field\nGauss law\n\nCurrent electricity\nOhm's law\nKirchhoff laws"
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Import for review</Button>
          </div>
        </form>
      ),
    });
  }

  function openMaterialPreview(subject: Subject, material: Material) {
    setModal({
      title: material.name,
      wide: true,
      content: (
        <div>
          <div className="flex flex-wrap gap-2">
            <Chip>{material.kind}</Chip>
            <Chip tone={material.status === "ready" ? "success" : "solid"}>
              {material.status === "ready" ? "Ready" : "Local preview"}
            </Chip>
            <Chip>{material.size}</Chip>
          </div>
          {material.status === "error" ? (
            <div className="mt-5 rounded-xl border border-destructive/30 bg-bg-secondary p-6">
              <h3 className="font-display text-lg font-semibold">This file could not be read</h3>
              <p className="mt-2 text-sm text-text-secondary">
                It may be damaged or in an unsupported format. Close this preview and use Try again.
              </p>
            </div>
          ) : material.previewType === "slides" || material.kind === "Slides" ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(subject.chapters.length
                ? subject.chapters
                : [{ id: "empty", name: subject.name, topics: [] }]
              )
                .slice(0, 6)
                .map((chapter, index) => (
                  <div
                    key={chapter.id}
                    className="aspect-[4/3] rounded-xl border border-border bg-bg-secondary p-5"
                  >
                    <span className="font-mono-ui text-xs text-text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold">{chapter.name}</h3>
                    <ul className="mt-3 space-y-1 text-sm text-text-secondary">
                      {chapter.topics.slice(0, 4).map((topic) => (
                        <li key={topic.id}>• {topic.name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : material.previewType === "image" || material.kind === "Class notes" ? (
            <div className="mt-5 min-h-96 rounded-xl border-8 border-border-strong bg-text-primary p-8 text-text-inverse">
              <h3 className="font-display text-3xl font-semibold">
                {subject.chapters[0]?.name || subject.name}
              </h3>
              <div className="mt-8 space-y-5 font-display text-xl opacity-85">
                {(subject.chapters[0]?.topics || []).slice(0, 4).map((topic) => (
                  <p key={topic.id}>{topic.name}</p>
                ))}
              </div>
              <p className="mt-12 text-right font-mono-ui text-xs opacity-55">{material.name}</p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-border bg-bg-secondary p-4 sm:p-7">
              <div className="mx-auto max-w-3xl rounded-lg border border-border bg-bg-primary p-6 sm:p-10">
                <h3 className="font-display text-2xl font-semibold">{material.name}</h3>
                <p className="mt-2 text-sm text-text-muted">
                  {titleCase(subject.name)} · {subject.code}
                </p>
                {material.previewText ? (
                  <pre className="mt-7 whitespace-pre-wrap font-mono-ui text-sm leading-7 text-text-secondary">
                    {material.previewText}
                  </pre>
                ) : (
                  <div className="mt-7 space-y-6">
                    {subject.chapters.map((chapter, index) => (
                      <section key={chapter.id}>
                        <h4 className="font-display text-lg font-semibold">
                          {index + 1}. {chapter.name}
                        </h4>
                        <p className="mt-2 text-sm leading-7 text-text-secondary">
                          {chapter.topics.map((topic) => topic.name).join(", ") ||
                            "Notes for this unit"}
                          . Worked examples and exam-style questions follow this outline.
                        </p>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="mt-4 text-sm text-text-secondary">
            This is a browser-only preview. Page extraction and source citations will activate when
            document processing is connected.
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setModal(null)}>Done</Button>
          </div>
        </div>
      ),
    });
  }

  function openAddQuestion(exam: Exam) {
    const subject = subjectOf(exam.subjectId);
    const topics = subject?.chapters.flatMap((chapter) => chapter.topics) || [];
    setModal({
      title: "Add question",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const type = String(data.get("type")) as Question["type"];
            const prompt = String(data.get("prompt") || "").trim();
            if (!prompt) return;
            const options = String(data.get("options") || "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean);
            const correctOption = Math.max(
              0,
              options.findIndex((item) => item.startsWith("*")),
            );
            const cleanOptions = options.map((item) => item.replace(/^\*/, "").trim());
            updateWorkspace((draft) => {
              draft.exams
                .find((item) => item.id === exam.id)
                ?.questions.push({
                  id: uid("question"),
                  type,
                  prompt,
                  marks: Number(data.get("marks") || 1),
                  topicId: String(data.get("topicId") || "") || undefined,
                  options: type === "choice" ? cleanOptions : undefined,
                  correctOption: type === "choice" ? correctOption : undefined,
                });
            });
            setModal(null);
            setToast("Question added.");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Question type">
              <select className={inputClass} name="type">
                <option value="choice">Multiple choice</option>
                <option value="short">Short answer</option>
                <option value="long">Long answer</option>
              </select>
            </Field>
            <Field label="Marks">
              <input
                className={inputClass}
                name="marks"
                type="text"
                inputMode="decimal"
                defaultValue="5"
              />
            </Field>
          </div>
          <Field label="Question">
            <textarea className={cn(inputClass, "min-h-28 py-3")} name="prompt" required />
          </Field>
          <Field label="Topic">
            <select className={inputClass} name="topicId">
              <option value="">Not tagged</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Multiple-choice options"
            hint="One option per line. Put * before the correct answer."
          >
            <textarea className={cn(inputClass, "min-h-24 py-3")} name="options" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Add question</Button>
          </div>
        </form>
      ),
    });
  }

  function generateQuestions(exam: Exam) {
    const subject = subjectOf(exam.subjectId);
    if (!subject?.chapters.some((chapter) => chapter.topics.length)) {
      setToast("Add syllabus topics before generating questions.");
      return;
    }
    setModal({
      title: "Draft questions from syllabus",
      wide: true,
      content: (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const chapterIds = data.getAll("chapters").map(String);
            const topics = subject.chapters
              .filter((chapter) => chapterIds.includes(chapter.id))
              .flatMap((chapter) => chapter.topics);
            if (!topics.length) {
              setToast("Choose at least one unit with topics.");
              return;
            }
            const counts = {
              choice: Math.max(0, Number(data.get("choice") || 0)),
              short: Math.max(0, Number(data.get("short") || 0)),
              long: Math.max(0, Number(data.get("long") || 0)),
            };
            const generated: Question[] = [];
            (Object.entries(counts) as [Question["type"], number][]).forEach(([type, count]) => {
              for (let index = 0; index < count; index += 1) {
                const topic = topics[generated.length % topics.length];
                generated.push({
                  id: uid("question"),
                  type,
                  prompt:
                    type === "choice"
                      ? `Which statement best describes ${topic.name.toLowerCase()}?`
                      : type === "long"
                        ? `Explain ${topic.name.toLowerCase()} and solve one exam-style application.`
                        : `State ${topic.name.toLowerCase()} and explain the key condition.`,
                  marks: type === "choice" ? 1 : type === "short" ? 3 : 6,
                  topicId: topic.id,
                  options:
                    type === "choice"
                      ? ["The defining statement", "A common misconception", "Both", "Neither"]
                      : undefined,
                  correctOption: type === "choice" ? 0 : undefined,
                  rubric:
                    type === "long"
                      ? [
                          { label: "Clear statement", marks: 2 },
                          { label: "Worked method", marks: 3 },
                          { label: "Correct units", marks: 1 },
                        ]
                      : undefined,
                });
              }
            });
            if (!generated.length) return;
            setModal(null);
            updateWorkspace((draft) => {
              const target = draft.exams.find((item) => item.id === exam.id);
              if (target) target.drafting = true;
            });
            setToast("Writing questions from your material and past papers…");
            window.setTimeout(() => {
              updateWorkspace((draft) => {
                const target = draft.exams.find((item) => item.id === exam.id);
                if (!target) return;
                target.questions.push(...generated);
                target.drafting = false;
              });
              setToast(
                `${generated.length} draft question${generated.length === 1 ? "" : "s"} ready.`,
              );
            }, 1800);
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium">Units to include</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {subject.chapters.map((chapter) => (
                <label
                  key={chapter.id}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 text-sm"
                >
                  <input name="chapters" type="checkbox" value={chapter.id} defaultChecked />
                  <span className="flex-1">{chapter.name}</span>
                  <span className="text-xs text-text-muted">{chapter.topics.length} topics</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Multiple choice">
              <input className={inputClass} name="choice" inputMode="numeric" defaultValue="2" />
            </Field>
            <Field label="Short answers">
              <input className={inputClass} name="short" inputMode="numeric" defaultValue="3" />
            </Field>
            <Field label="Long answers">
              <input className={inputClass} name="long" inputMode="numeric" defaultValue="1" />
            </Field>
          </div>
          <Card className="bg-bg-secondary p-4">
            <p className="text-sm text-text-secondary">
              {subject.questionBanks.length
                ? `The wording follows ${subject.questionBanks.length} past-paper set${subject.questionBanks.length === 1 ? "" : "s"}. Rewrite any draft you do not like.`
                : "No past papers yet. Add a question bank to match the style and weighting students will face."}
            </p>
          </Card>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Create draft</Button>
          </div>
        </form>
      ),
    });
  }

  function openSchedule(exam: Exam, classroomId?: string) {
    const compatible = workspace.classrooms.filter(
      (classroom) => classroom.subjectId === exam.subjectId,
    );
    const existing =
      exam.offerings.find((offering) => offering.classroomId === classroomId) || exam.offerings[0];
    setModal({
      title: "Publish exam to a classroom",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const selectedClassroomId = String(data.get("classroomId"));
            updateWorkspace((draft) => {
              const target = draft.exams.find((item) => item.id === exam.id);
              if (!target) return;
              const offering = target.offerings.find(
                (item) => item.classroomId === selectedClassroomId,
              );
              const next = {
                classroomId: selectedClassroomId,
                opens: String(data.get("opens") || ""),
                closes: String(data.get("closes") || ""),
              };
              if (offering) Object.assign(offering, next);
              else target.offerings.push(next);
            });
            setModal(null);
            setToast("Exam published to the classroom.");
          }}
        >
          <Field label="Classroom">
            <select
              className={inputClass}
              name="classroomId"
              defaultValue={classroomId || existing?.classroomId || compatible[0]?.id}
            >
              {compatible.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens">
              <input
                className={inputClass}
                name="opens"
                type="datetime-local"
                defaultValue={existing?.opens || ""}
              />
            </Field>
            <Field label="Closes">
              <input
                className={inputClass}
                name="closes"
                type="datetime-local"
                defaultValue={existing?.closes || ""}
              />
            </Field>
          </div>
          <p className="rounded-lg bg-bg-secondary p-3 text-sm text-text-secondary">
            Leave both dates blank to keep the exam open anytime. Each classroom keeps separate
            dates and marks.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Publish exam</Button>
          </div>
        </form>
      ),
    });
  }

  function openScheduleMany(exam: Exam) {
    const compatible = workspace.classrooms.filter(
      (classroom) =>
        classroom.subjectId === exam.subjectId &&
        classroom.term !== "past" &&
        !exam.offerings.some((offering) => offering.classroomId === classroom.id),
    );
    if (!compatible.length) {
      setToast("Every current classroom teaching this subject already has the exam.");
      return;
    }
    setModal({
      title: "Give to several classrooms",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const selected = new FormData(event.currentTarget).getAll("classrooms").map(String);
            if (!selected.length) return;
            updateWorkspace((draft) => {
              const target = draft.exams.find((item) => item.id === exam.id);
              selected.forEach((classroomId) =>
                target?.offerings.push({ classroomId, opens: "", closes: "" }),
              );
            });
            setModal(null);
            setToast(
              `Exam added to ${selected.length} classroom${selected.length === 1 ? "" : "s"}.`,
            );
          }}
        >
          <p className="text-sm text-text-secondary">
            The same paper keeps separate dates, submissions and marks in each classroom.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Classrooms</legend>
            {compatible.map((classroom) => (
              <label
                key={classroom.id}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3"
              >
                <input name="classrooms" type="checkbox" value={classroom.id} defaultChecked />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{classroom.name}</span>
                  <span className="block text-xs text-text-muted">
                    {classroom.studentIds.length} students · {classroom.schedule}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Give it to them</Button>
          </div>
        </form>
      ),
    });
  }

  function openClassNote(classroom: Classroom) {
    setModal({
      title: "Classroom notice",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const note = String(data.get("note") || "").trim();
            updateWorkspace((draft) => {
              const target = draft.classrooms.find((item) => item.id === classroom.id);
              if (target)
                target.note = note ? { text: note, at: new Date().toISOString() } : undefined;
            });
            setModal(null);
            setToast(note ? "Notice posted." : "Notice removed.");
          }}
        >
          <Field
            label="What do students need to know?"
            hint="Clear the text and save to remove the current notice."
          >
            <textarea
              className={cn(inputClass, "min-h-32 py-3")}
              name="note"
              defaultValue={classroom.note?.text || ""}
              placeholder="Bring a calculator on Thursday."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Save notice</Button>
          </div>
        </form>
      ),
    });
  }

  function openAddTeacher(classroom: Classroom) {
    const availableTeachers = Array.from(
      new Set([
        ...workspace.classrooms.flatMap((item) => item.teachers),
        "Ramesh Koirala",
        "Mina Bhandari",
        "Sujan Gautam",
      ]),
    ).filter((teacher) => !classroom.teachers.includes(teacher));
    setModal({
      title: "Add co-teacher",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get("teacher") || "").trim();
            if (!name) return;
            updateWorkspace((draft) => {
              const target = draft.classrooms.find((item) => item.id === classroom.id);
              if (target && !target.teachers.includes(name)) target.teachers.push(name);
            });
            setModal(null);
            setToast(`${name} added to this classroom.`);
          }}
        >
          <Field label="Teacher" hint="Choose a teacher already in this local workspace directory.">
            <select className={inputClass} name="teacher" required defaultValue="">
              <option value="" disabled>
                Select a teacher
              </option>
              {availableTeachers.map((teacher) => (
                <option key={teacher}>{teacher}</option>
              ))}
            </select>
          </Field>
          <p className="rounded-lg bg-bg-secondary p-3 text-sm text-text-secondary">
            This frontend preview records the co-teacher in this browser only.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!availableTeachers.length}>
              Add teacher
            </Button>
          </div>
        </form>
      ),
    });
  }

  function exportMarks(classroom: Classroom) {
    const rows = [["Student", "Exam", "Score", "Out of", "Percent", "Published"]];
    workspace.results
      .filter((result) => result.classroomId === classroom.id)
      .forEach((result) => {
        rows.push([
          studentOf(result.studentId)?.name || "Student",
          examOf(result.examId)?.title || "Exam",
          String(result.score),
          String(result.outOf),
          `${Math.round((result.score / result.outOf) * 100)}%`,
          result.published ? "yes" : "no",
        ]);
      });
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    setModal({
      title: "Marks for the office",
      wide: true,
      content: (
        <div>
          <p className="text-sm text-text-secondary">
            Review {Math.max(0, rows.length - 1)} result rows before saving the CSV file.
          </p>
          <textarea
            className={cn(inputClass, "mt-4 min-h-64 py-3 font-mono-ui text-xs")}
            value={csv}
            readOnly
            aria-label="CSV marks preview"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                link.download = `${classroom.name.replace(/\W+/g, "-").toLowerCase()}-marks.csv`;
                link.click();
                URL.revokeObjectURL(link.href);
                setModal(null);
                setToast("Marks exported as CSV.");
              }}
            >
              Save as a file
            </Button>
          </div>
        </div>
      ),
    });
  }

  function publishResults(results: Result[]) {
    updateWorkspace((draft) => {
      const ids = new Set(results.map((result) => result.id));
      draft.results.forEach((result) => {
        if (ids.has(result.id)) {
          result.published = true;
          result.checked = true;
        }
      });
    });
    setToast(`${results.length} result${results.length === 1 ? "" : "s"} published.`);
  }

  function renderToday() {
    const currentClassrooms = workspace.classrooms.filter(
      (classroom) => (classroom.term || "current") === "current",
    );
    const currentEnrollmentCount = currentClassrooms.reduce(
      (count, classroom) => count + classroom.studentIds.length,
      0,
    );
    const currentStudentIds = new Set(
      currentClassrooms.flatMap((classroom) => classroom.studentIds),
    );
    const currentStudents = workspace.students.filter((student) =>
      currentStudentIds.has(student.id),
    );
    const currentAttentionStudents = currentStudents.filter(
      (student) => !student.joined || (student.average !== null && student.average < 0.45),
    );
    const runningExams = workspace.exams.flatMap((exam) =>
      exam.offerings
        .filter(
          (offering) =>
            currentClassrooms.some((classroom) => classroom.id === offering.classroomId) &&
            offeringWindow(offering.opens, offering.closes).state === "open",
        )
        .map((offering) => ({ exam, offering })),
    );
    const hero = waitingResults.length
      ? {
          title: `${waitingResults.length} papers are marked and waiting for you`,
          body: "Already marked. You look, you change what you disagree with, you publish.",
          action: (
            <Button variant="secondary" size="lg" onClick={() => navigate({ name: "marking" })}>
              Check and publish
            </Button>
          ),
        }
      : runningExams.length
        ? {
            title: `${runningExams.length} exam${runningExams.length === 1 ? " is" : "s are"} running now`,
            body: `${runningExams[0].exam.title} · ${classroomOf(runningExams[0].offering.classroomId)?.name || "Current classroom"}`,
            action: (
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  navigate({
                    name: "exam",
                    id: runningExams[0].exam.id,
                    classroomId: runningExams[0].offering.classroomId,
                  })
                }
              >
                See exams
              </Button>
            ),
          }
        : {
            title: "Nothing is waiting for you",
            body: "Every paper is published. A good moment to set the next exam.",
            action: (
              <Button variant="secondary" size="lg" onClick={() => openCreateExam()}>
                Set an exam
              </Button>
            ),
          };
    return (
      <>
        <PageHeader
          eyebrow="Today"
          title={`Good morning, ${workspace.teacher.name.split(" ")[0]}`}
          description={`${currentClassrooms.length} classes, ${currentEnrollmentCount} students.`}
        />
        <Card className="flex flex-col gap-5 bg-text-primary p-6 text-text-inverse md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold">{hero.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 opacity-70">{hero.body}</p>
          </div>
          {hero.action}
        </Card>
        <SectionHeader
          title="Your classrooms"
          count={currentClassrooms.length}
          action={
            <Button variant="quiet" onClick={() => navigate({ name: "classrooms" })}>
              See all
            </Button>
          }
        />
        {currentClassrooms.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
            {currentClassrooms.slice(0, 6).map(renderClassroomCard)}
          </div>
        ) : (
          <EmptyState
            title="No classrooms this term"
            body="Start one and hand out the code."
          />
        )}
        {currentAttentionStudents.length ? (
          <>
            <SectionHeader
              title="Needs Attention"
              count={`${currentAttentionStudents.length} students`}
              action={
                <Button variant="quiet" onClick={() => navigate({ name: "students" })}>
                  See all
                </Button>
              }
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
              {currentAttentionStudents.slice(0, 4).map((student) => renderStudentCard(student))}
            </div>
          </>
        ) : null}
      </>
    );
  }

  function renderStudentCard(student: Student, preferredClassroomId?: string) {
    const classroom =
      workspace.classrooms.find(
        (item) => item.id === preferredClassroomId && item.studentIds.includes(student.id),
      ) || workspace.classrooms.find((item) => item.studentIds.includes(student.id));
    return (
      <button
        key={student.id}
        type="button"
        className={cn(
          "min-h-36 rounded-xl border border-border-strong bg-bg-primary p-5 text-left transition-colors hover:bg-bg-secondary",
          focusRing,
        )}
        onClick={() => classroom && openStudent(student, classroom)}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-secondary text-xs font-semibold">
            {initials(student.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display font-semibold">{student.name}</span>
            <span className="block text-xs text-text-secondary">{classStatus(student)}</span>
          </span>
          <strong className="text-sm">{percent(student.average)}</strong>
        </div>
        <p className="mt-4 text-xs text-text-muted">{classroom?.name || "No classroom"}</p>
      </button>
    );
  }

  function renderSubjects() {
    const subjects = workspace.subjects.filter((subject) =>
      `${subject.name} ${subject.code}`.toLowerCase().includes(subjectSearch.toLowerCase()),
    );
    return (
      <>
        <PageHeader
          eyebrow="Teaching foundation"
          title="Subjects"
          description="One syllabus and material library can serve every classroom teaching the subject."
          action={<Button onClick={openCreateSubject}>Create subject</Button>}
        />
        <div className="mb-5">
          <input
            aria-label="Search subjects"
            className={inputClass}
            type="search"
            placeholder="Search your subjects"
            value={subjectSearch}
            onChange={(event) => setSubjectSearch(event.target.value)}
          />
        </div>
        {subjects.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => {
              const classrooms = workspace.classrooms.filter(
                (classroom) => classroom.subjectId === subject.id,
              );
              const gaps = !subject.chapters.length
                ? "No syllabus"
                : !subject.materials.length
                  ? "No material"
                  : !subject.questionBanks.length
                    ? "No past papers"
                    : "Ready";
              return (
                <button
                  key={subject.id}
                  type="button"
                  className={cn(
                    "min-h-48 rounded-xl border border-border bg-bg-primary p-5 text-left transition-colors hover:border-border-strong",
                    focusRing,
                  )}
                  onClick={() => navigate({ name: "subject", id: subject.id })}
                >
                  <div className="flex items-center gap-2">
                    <Chip>{subject.code || "No code"}</Chip>
                    <span className="flex-1" />
                    <span className="text-xs text-text-muted">Semester {subject.semester}</span>
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold">{titleCase(subject.name)}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {subject.programme} · {subject.university}
                  </p>
                  <p className="mt-4 text-sm text-text-secondary">
                    {subject.chapters.length} units · {subject.materials.length} files ·{" "}
                    {subject.questionBanks.length} paper sets
                  </p>
                  <div className="mt-5">
                    <Chip tone={gaps === "Ready" ? "success" : "solid"}>
                      {gaps === "Ready"
                        ? `${classrooms.length} classroom${classrooms.length === 1 ? "" : "s"}`
                        : gaps}
                    </Chip>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={workspace.subjects.length ? "No matching subjects" : "No subjects yet"}
            body={
              workspace.subjects.length
                ? "Try another name or subject code."
                : "Create a subject, add its syllabus and material, then run it as a classroom."
            }
            action={
              workspace.subjects.length ? undefined : (
                <Button onClick={openCreateSubject}>Create your first subject</Button>
              )
            }
          />
        )}
      </>
    );
  }

  function renderSubject(subject: Subject) {
    const classrooms = workspace.classrooms.filter(
      (classroom) => classroom.subjectId === subject.id,
    );
    const topicCount = subject.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0);
    return (
      <>
        <Breadcrumb
          items={[
            { label: "Subjects", onClick: () => navigate({ name: "subjects" }) },
            { label: subject.name },
          ]}
        />
        <PageHeader
          eyebrow={[subject.code, subject.programme, `Semester ${subject.semester}`]
            .filter(Boolean)
            .join(" · ")}
          title={titleCase(subject.name)}
          description={`${subject.chapters.length} units · ${topicCount} topics · ${subject.materials.length} files · ${classrooms.length} classrooms`}
          action={<Button onClick={() => openCreateClassroom(subject.id)}>Run as classroom</Button>}
        />
        <Tabs
          value={subjectTab}
          onChange={setSubjectTab}
          items={[
            { value: "syllabus", label: "Syllabus", count: subject.chapters.length },
            { value: "material", label: "Material", count: subject.materials.length },
            { value: "bank", label: "Question bank", count: subject.questionBanks.length },
            { value: "test-chat", label: "Test tutor" },
            { value: "classrooms", label: "Classrooms", count: classrooms.length },
          ]}
        />
        {subjectTab === "syllabus" ? renderSyllabus(subject) : null}
        {subjectTab === "material" ? renderMaterial(subject) : null}
        {subjectTab === "bank" ? renderQuestionBank(subject) : null}
        {subjectTab === "test-chat" ? renderTestChat(subject) : null}
        {subjectTab === "classrooms" ? renderSubjectClassrooms(subject, classrooms) : null}
      </>
    );
  }

  function renderSyllabus(subject: Subject) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => openAddChapter(subject)}>Add unit</Button>
          <Button variant="secondary" onClick={() => openUploadSyllabus(subject)}>
            Import syllabus
          </Button>
          <p className="text-sm text-text-secondary">
            The performance map is drawn from these topics.
          </p>
        </div>
        {subject.chapters.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {subject.chapters.map((chapter, index) => (
              <Card key={chapter.id} className="p-5">
                <div className="flex items-center gap-2">
                  <Chip>Unit {index + 1}</Chip>
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      updateWorkspace((draft) => {
                        const target = draft.subjects.find((item) => item.id === subject.id);
                        if (target)
                          target.chapters = target.chapters.filter(
                            (item) => item.id !== chapter.id,
                          );
                      });
                      setToast("Unit removed.");
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{chapter.name}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {chapter.topics.map((topic) => (
                    <Chip key={topic.id}>{topic.name}</Chip>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No syllabus yet"
            body="Add a unit or paste the university syllabus to build the topic map."
            action={<Button onClick={() => openAddChapter(subject)}>Add a unit</Button>}
          />
        )}
      </>
    );
  }

  function renderMaterial(subject: Subject) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => openAddMaterial(subject)}>Add material</Button>
          <p className="text-sm text-text-secondary">
            Shared by every classroom teaching this subject.
          </p>
        </div>
        {subject.materials.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subject.materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onOpen={() => openMaterialPreview(subject, material)}
                onRetry={() => {
                  updateWorkspace((draft) => {
                    const item = draft.subjects
                      .find((entry) => entry.id === subject.id)
                      ?.materials.find((entry) => entry.id === material.id);
                    if (item) item.status = "processing";
                  });
                  setToast("File queued for another local review.");
                  window.setTimeout(() => {
                    updateWorkspace((draft) => {
                      const item = draft.subjects
                        .find((entry) => entry.id === subject.id)
                        ?.materials.find((entry) => entry.id === material.id);
                      if (item) item.status = "ready";
                    });
                    setToast(`${material.name} is ready.`);
                  }, 1400);
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No material yet"
            body="Add notes, slides or a textbook. This becomes the approved source for the tutor and question generator."
            action={<Button onClick={() => openAddMaterial(subject)}>Add material</Button>}
          />
        )}
      </>
    );
  }

  function renderQuestionBank(subject: Subject) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => openAddMaterial(subject, true)}>Add past papers</Button>
          <p className="text-sm text-text-secondary">
            Generated questions should match the style and weight of these papers.
          </p>
        </div>
        {subject.questionBanks.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subject.questionBanks.map((bank) => (
              <Card key={bank.id} className="p-5">
                <div className="flex items-center">
                  <Chip>Question bank</Chip>
                  <span className="flex-1" />
                  <span className="text-xs text-text-muted">{bank.size}</span>
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{bank.name}</h3>
                <div className="mt-4">
                  <Chip tone={bank.status === "ready" ? "success" : "solid"}>
                    {bank.status === "ready"
                      ? `${bank.questionsFound} questions found`
                      : "Ready to process"}
                  </Chip>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No past papers yet"
            body="Add a few years of question papers to guide future assessment writing."
            action={<Button onClick={() => openAddMaterial(subject, true)}>Add past papers</Button>}
          />
        )}
      </>
    );
  }

  function renderTestChat(subject: Subject) {
    return (
      <TestTutor
        subject={subject}
        onChange={(messages) =>
          updateWorkspace((draft) => {
            const target = draft.subjects.find((item) => item.id === subject.id);
            if (target) target.testChat = messages;
          })
        }
      />
    );
  }

  function renderSubjectClassrooms(subject: Subject, classrooms: Classroom[]) {
    const active = classrooms.filter((classroom) => classroom.term !== "past");
    const past = classrooms.filter((classroom) => classroom.term === "past");
    return (
      <>
        {active.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.map(renderClassroomCard)}
          </div>
        ) : (
          <EmptyState
            title="Not running yet"
            body={`${titleCase(subject.name)} is ready. Create a classroom for a batch and share its join code.`}
            action={
              <Button onClick={() => openCreateClassroom(subject.id)}>Create classroom</Button>
            }
          />
        )}
        {past.length ? (
          <div className="mt-8">
            <SectionHeader title="Inactive classrooms" count={past.length} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {past.map(renderClassroomCard)}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderClassrooms() {
    const classrooms = workspace.classrooms
      .filter((classroom) => (classroom.term || "current") === classroomTerm)
      .filter((classroom) => {
        const subject = subjectOf(classroom.subjectId);
        return `${classroom.name} ${classroom.code} ${subject?.name || ""}`
          .toLowerCase()
          .includes(classroomSearch.toLowerCase());
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    return (
      <>
        <PageHeader
          eyebrow="Batches and teaching groups"
          title="Classrooms"
          description="Each classroom has its own students, exam windows, submissions and marks."
          action={<Button onClick={() => openCreateClassroom()}>Create classroom</Button>}
        />
        <div className="mb-5 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="inline-flex rounded-lg border border-border p-1">
            <Button
              size="sm"
              variant={classroomTerm === "current" ? "primary" : "quiet"}
              onClick={() => setClassroomTerm("current")}
            >
              This term
            </Button>
            <Button
              size="sm"
              variant={classroomTerm === "past" ? "primary" : "quiet"}
              onClick={() => setClassroomTerm("past")}
            >
              Earlier
            </Button>
          </div>
          <input
            aria-label="Search classrooms"
            className={inputClass}
            type="search"
            placeholder="Search by classroom code or subject"
            value={classroomSearch}
            onChange={(event) => setClassroomSearch(event.target.value)}
          />
        </div>
        {classrooms.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {classrooms.map(renderClassroomCard)}
          </div>
        ) : (
          <EmptyState
            title={
              classroomSearch
                ? "No matching classrooms"
                : classroomTerm === "past"
                  ? "No earlier classrooms"
                  : "No classrooms yet"
            }
            body={
              classroomSearch
                ? "Try another classroom code or subject."
                : "Run one of your subjects for a batch and hand out its code."
            }
            action={<Button onClick={() => openCreateClassroom()}>Create classroom</Button>}
          />
        )}
      </>
    );
  }

  function renderStudentsDirectory() {
    const filtered = workspace.students
      .filter((student) => student.name.toLowerCase().includes(studentSearch.toLowerCase()))
      .filter(
        (student) =>
          studentClassFilter === "all" ||
          workspace.classrooms
            .find((classroom) => classroom.id === studentClassFilter)
            ?.studentIds.includes(student.id),
      )
      .filter(
        (student) =>
          studentFilter === "all" ||
          (studentFilter === "help" && classStatus(student) === "Needs attention") ||
          (studentFilter === "not-joined" && !student.joined) ||
          (studentFilter === "well" && classStatus(student) === "Doing well"),
      )
      .sort((a, b) =>
        studentSort === "name"
          ? a.name.localeCompare(b.name)
          : studentSort === "high"
            ? (b.average ?? -1) - (a.average ?? -1)
            : (a.average ?? -1) - (b.average ?? -1),
      );
    return (
      <>
        <PageHeader
          eyebrow="Across every classroom"
          title="Students"
          description="Find a learner, review their standing and open their classroom record."
        />
        <div className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_180px_190px]">
          <input
            aria-label="Search students"
            className={inputClass}
            type="search"
            placeholder="Find a student"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
          />
          <select
            aria-label="Filter by classroom"
            className={inputClass}
            value={studentClassFilter}
            onChange={(event) => setStudentClassFilter(event.target.value)}
          >
            <option value="all">All classrooms</option>
            {workspace.classrooms
              .filter((classroom) => classroom.term !== "past")
              .map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name} · {subjectOf(classroom.subjectId)?.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Filter students"
            className={inputClass}
            value={studentFilter}
            onChange={(event) => setStudentFilter(event.target.value)}
          >
            <option value="all">Everyone</option>
            <option value="help">Need help</option>
            <option value="not-joined">Not joined</option>
            <option value="well">Doing well</option>
          </select>
          <select
            aria-label="Sort students"
            className={inputClass}
            value={studentSort}
            onChange={(event) => setStudentSort(event.target.value)}
          >
            <option value="low">Lowest average first</option>
            <option value="high">Highest average first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        {filtered.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered
              .slice(0, studentVisible)
              .map((student) =>
                renderStudentCard(
                  student,
                  studentClassFilter === "all" ? undefined : studentClassFilter,
                ),
              )}
          </div>
        ) : (
          <EmptyState title="No matching students" body="Try another name or filter." />
        )}
        {filtered.length > studentVisible ? (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setStudentVisible((count) => count + 18)}>
              Show {Math.min(18, filtered.length - studentVisible)} more
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  function renderClassroomCard(classroom: Classroom) {
    const subject = subjectOf(classroom.subjectId);
    const results = workspace.results.filter((result) => result.classroomId === classroom.id);
    const waiting = results.filter((result) => !result.published).length;
    const nextExam = workspace.exams
      .flatMap((exam) =>
        exam.offerings
          .filter((offering) => offering.classroomId === classroom.id)
          .map((offering) => ({
            exam,
            offering,
            window: offeringWindow(offering.opens, offering.closes),
          })),
      )
      .filter((item) => item.window.state !== "closed")
      .sort((a, b) => {
        const aTime = a.offering.closes
          ? new Date(a.offering.closes).getTime()
          : Number.POSITIVE_INFINITY;
        const bTime = b.offering.closes
          ? new Date(b.offering.closes).getTime()
          : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      })[0];
    return (
      <button
        key={classroom.id}
        type="button"
        className={cn(
          "min-h-44 rounded-xl border bg-bg-primary p-5 text-left transition-colors hover:border-border-strong",
          waiting ? "border-border-strong" : "border-border",
          focusRing,
        )}
        onClick={() => navigate({ name: "classroom", id: classroom.id })}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
            {subject?.name}
          </span>
          <span className="flex-1" />
          <KnowledgeDot level="developing" />
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold">{classroom.name}</h3>
        <p className="mt-1 text-sm text-text-secondary">{classroom.studentIds.length} students</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {waiting ? (
            <Chip tone="solid">{waiting} papers waiting</Chip>
          ) : nextExam ? (
            <Chip tone={nextExam.window.state === "open" ? "success" : "neutral"}>
              {nextExam.exam.title} · {nextExam.window.label.toLowerCase()}
            </Chip>
          ) : (
            <Chip>no exam set</Chip>
          )}
        </div>
      </button>
    );
  }

  function renderClassroom(classroom: Classroom) {
    const subject = subjectOf(classroom.subjectId);
    if (!subject)
      return <EmptyState title="Subject missing" body="This classroom no longer has a subject." />;
    const students = classroom.studentIds.map(studentOf).filter(Boolean) as Student[];
    const exams = workspace.exams.filter((exam) =>
      exam.offerings.some((offering) => offering.classroomId === classroom.id),
    );
    const results = workspace.results.filter((result) => result.classroomId === classroom.id);
    const waiting = results.filter((result) => !result.published);
    const classAverage = results.length
      ? results.reduce((sum, result) => sum + result.score / result.outOf, 0) / results.length
      : null;
    return (
      <>
        <Breadcrumb
          items={[
            { label: "Classrooms", onClick: () => navigate({ name: "classrooms" }) },
            { label: classroom.name },
          ]}
        />
        <PageHeader
          eyebrow={`${titleCase(subject.name)} · ${classroom.schedule}`}
          title={classroom.name}
          description={`${students.length} students${classAverage !== null ? ` · class average ${percent(classAverage)}` : ""}${results.length ? ` · ${results.length} submissions` : ""}`}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openInvite(classroom)}>
                Invite
              </Button>
              <Button onClick={() => openCreateExam(classroom.id)}>New exam</Button>
            </div>
          }
        />
        {classroom.note ? (
          <Card className="mb-5 border-l-4 border-l-border-strong p-4">
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Classroom notice</p>
                <p className="mt-1 text-sm text-text-secondary">{classroom.note.text}</p>
              </div>
              <Button size="sm" variant="quiet" onClick={() => openClassNote(classroom)}>
                Edit
              </Button>
            </div>
          </Card>
        ) : null}
        {waiting.length ? (
          <Card className="mb-5 flex flex-col gap-4 bg-text-primary p-5 text-text-inverse sm:flex-row sm:items-center">
            <div className="flex-1">
              <h2 className="font-display text-xl font-semibold">
                {waiting.length} papers waiting to be published
              </h2>
              <p className="mt-1 text-sm opacity-70">
                Students see nothing until you approve the marks.
              </p>
            </div>
            <Button variant="secondary" onClick={() => publishResults(waiting)}>
              Publish all
            </Button>
          </Card>
        ) : null}
        <Tabs
          value={classroomTab}
          onChange={setClassroomTab}
          items={[
            { value: "students", label: "Students", count: students.length },
            { value: "exams", label: "Exams", count: exams.length },
            { value: "performance", label: "Class performance" },
            { value: "material", label: "Material", count: subject.materials.length },
            { value: "settings", label: "Settings" },
          ]}
        />
        {classroomTab === "students" ? renderRoster(classroom, students) : null}
        {classroomTab === "exams" ? renderClassExams(classroom, subject, exams) : null}
        {classroomTab === "performance" ? renderPerformance(classroom, subject) : null}
        {classroomTab === "material" ? renderMaterial(subject) : null}
        {classroomTab === "settings" ? renderClassSettings(classroom) : null}
      </>
    );
  }

  function renderRoster(classroom: Classroom, students: Student[]) {
    const filtered = students
      .filter((student) => student.name.toLowerCase().includes(studentSearch.toLowerCase()))
      .filter(
        (student) =>
          studentFilter === "all" ||
          (studentFilter === "help" && classStatus(student) === "Needs attention") ||
          (studentFilter === "not-joined" && !student.joined) ||
          (studentFilter === "well" && classStatus(student) === "Doing well"),
      )
      .sort((a, b) =>
        studentSort === "name"
          ? a.name.localeCompare(b.name)
          : studentSort === "high"
            ? (b.average ?? -1) - (a.average ?? -1)
            : (a.average ?? -1) - (b.average ?? -1),
      );
    return (
      <>
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_190px_auto]">
          <label>
            <span className="sr-only">Search students</span>
            <input
              className={inputClass}
              type="search"
              placeholder="Find a student"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filter students</span>
            <select
              className={inputClass}
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
            >
              <option value="all">Everyone</option>
              <option value="help">Need help</option>
              <option value="not-joined">Not joined</option>
              <option value="well">Doing well</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Sort students</span>
            <select
              className={inputClass}
              value={studentSort}
              onChange={(event) => setStudentSort(event.target.value)}
            >
              <option value="low">Lowest average first</option>
              <option value="high">Highest average first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <Button variant="secondary" onClick={() => exportMarks(classroom)}>
            Export marks
          </Button>
        </div>
        {filtered.length ? (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {filtered.slice(0, studentVisible).map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary",
                    focusRing,
                  )}
                  onClick={() => openStudent(student, classroom)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg-secondary text-xs font-semibold">
                    {initials(student.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{student.name}</span>
                    <span className="block text-xs text-text-secondary">
                      {classStatus(student)}
                    </span>
                  </span>
                  <strong className="text-sm">{percent(student.average)}</strong>
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState title="Nobody matches" body="Clear a filter or search for another student." />
        )}
        {filtered.length > studentVisible ? (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setStudentVisible((count) => count + 18)}>
              Show {Math.min(18, filtered.length - studentVisible)} more
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  function openStudent(student: Student, classroom: Classroom) {
    const subject = subjectOf(classroom.subjectId);
    const sharedClassrooms = workspace.classrooms.filter((item) =>
      item.studentIds.includes(student.id),
    );
    const results = workspace.results.filter(
      (result) =>
        result.studentId === student.id &&
        sharedClassrooms.some((item) => item.id === result.classroomId),
    );
    setModal({
      title: student.name,
      wide: true,
      content: (
        <div>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-bg-secondary font-semibold">
              {initials(student.name)}
            </span>
            <div>
              <p className="font-medium">{student.email}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {classStatus(student)} · average {percent(student.average)}
              </p>
            </div>
          </div>
          {sharedClassrooms.length > 1 ? (
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {sharedClassrooms.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={item.id === classroom.id ? "primary" : "secondary"}
                  onClick={() => openStudent(student, item)}
                >
                  {subjectOf(item.subjectId)?.name}
                </Button>
              ))}
            </div>
          ) : null}
          <h3 className="mt-7 font-display text-lg font-semibold">Papers</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                className={cn(
                  "rounded-xl border border-border p-4 text-left hover:border-border-strong",
                  focusRing,
                )}
                onClick={() => {
                  setModal(null);
                  navigate({ name: "result", id: result.id });
                }}
              >
                <p className="text-sm font-semibold">{examOf(result.examId)?.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {subjectOf(classroomOf(result.classroomId)?.subjectId || "")?.name}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {result.score}/{result.outOf}
                </p>
                <div className="mt-3">
                  <Chip tone={result.published ? "success" : "solid"}>
                    {result.published ? "Published" : "Not published"}
                  </Chip>
                </div>
              </button>
            ))}
          </div>
          <h3 className="mt-7 font-display text-lg font-semibold">Chapter by chapter</h3>
          <p className="mt-1 text-xs text-text-muted">{subject?.name} · test performance</p>
          <Card className="mt-3 divide-y divide-border">
            {subject?.chapters
              .flatMap((chapter) => chapter.topics)
              .map((topic) => {
                const score = studentTopicScore(student, topic, "tests");
                const level = levelForScore(score);
                return (
                  <div key={topic.id} className="flex min-h-11 items-center gap-3 px-4">
                    <KnowledgeDot level={level} />
                    <span className="flex-1 text-sm">{topic.name}</span>
                    <span className="text-xs text-text-secondary">
                      {score === null
                        ? levelLabel(level)
                        : `${percent(score)} · ${levelLabel(level)}`}
                    </span>
                  </div>
                );
              })}
          </Card>
        </div>
      ),
    });
  }

  function renderClassExams(classroom: Classroom, subject: Subject, exams: Exam[]) {
    const reusable = workspace.exams.filter(
      (exam) =>
        exam.subjectId === subject.id &&
        !exam.offerings.some((offering) => offering.classroomId === classroom.id),
    );
    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => openCreateExam(classroom.id)}>New exam</Button>
          <Button
            variant="secondary"
            disabled={!reusable.length}
            onClick={() => openReuseExam(classroom, reusable)}
          >
            Reuse an exam
          </Button>
        </div>
        {exams.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {exams.map((exam) => renderExamCard(exam, classroom))}
          </div>
        ) : (
          <EmptyState
            title="No exam yet"
            body="Create a paper or reuse one you already wrote for this subject."
            action={<Button onClick={() => openCreateExam(classroom.id)}>Create exam</Button>}
          />
        )}
      </>
    );
  }

  function openReuseExam(classroom: Classroom, exams: Exam[]) {
    setModal({
      title: `Reuse an exam for ${classroom.name}`,
      content: (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Chip>{exam.kind}</Chip>
                  <h3 className="mt-3 font-display font-semibold">{exam.title}</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {exam.questions.length} questions · {exam.marks} marks
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    updateWorkspace((draft) => {
                      draft.exams
                        .find((item) => item.id === exam.id)
                        ?.offerings.push({ classroomId: classroom.id, opens: "", closes: "" });
                    });
                    setModal(null);
                    setToast("Exam added to this classroom. Set its dates when ready.");
                  }}
                >
                  Use this
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ),
    });
  }

  function renderExamCard(exam: Exam, classroom?: Classroom) {
    const offering = classroom
      ? exam.offerings.find((item) => item.classroomId === classroom.id)
      : exam.offerings[0];
    const results = workspace.results.filter(
      (result) => result.examId === exam.id && (!classroom || result.classroomId === classroom.id),
    );
    const waiting = results.filter((result) => !result.published).length;
    const average = results.length
      ? results.reduce((sum, result) => sum + result.score / result.outOf, 0) / results.length
      : null;
    const paperCount = results.filter((result) => result.paperMode).length;
    return (
      <button
        key={`${exam.id}-${classroom?.id || "all"}`}
        type="button"
        className={cn(
          "min-h-44 rounded-xl border bg-bg-primary p-5 text-left transition-colors hover:border-border-strong",
          waiting || !exam.questions.length ? "border-border-strong" : "border-border",
          focusRing,
        )}
        onClick={() => navigate({ name: "exam", id: exam.id, classroomId: classroom?.id })}
      >
        <div className="flex items-center">
          <Chip>{exam.kind}</Chip>
          <span className="flex-1" />
          <span className="text-xs text-text-muted">{exam.marks} marks</span>
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold">{exam.title}</h3>
        <p className="mt-1 text-sm text-text-secondary">
          {exam.questions.length ? `${exam.questions.length} questions` : "No questions yet"} ·{" "}
          {results.length} of {classroom?.studentIds.length || 0} handed in
          {average === null ? "" : ` · avg ${percent(average)}`}
          {paperCount ? ` · ${paperCount} on paper` : ""}
        </p>
        <div className="mt-5">
          <Chip
            tone={!exam.questions.length || waiting ? "solid" : offering ? "success" : "neutral"}
          >
            {!exam.questions.length
              ? "Add questions"
              : waiting
                ? `${waiting} to publish`
                : offering
                  ? offering.closes
                    ? `Closes ${formatDate(offering.closes)}`
                    : "Open anytime"
                  : "Unpublished"}
          </Chip>
        </div>
      </button>
    );
  }

  function renderPerformance(classroom: Classroom, subject: Subject) {
    const topics = subject.chapters.flatMap((chapter) => chapter.topics);
    const scoreFor = (topic: (typeof topics)[number]) =>
      performanceSource === "tests" ? topic.testScore : topic.questionScore;
    const selected = topics.find((topic) => topic.id === selectedTopicId);
    const levels = topics.map((topic) => scoreFor(topic));
    const counts = {
      solid: levels.filter((score) => score !== null && score >= 0.7).length,
      developing: levels.filter((score) => score !== null && score >= 0.4 && score < 0.7).length,
      struggling: levels.filter((score) => score !== null && score < 0.4).length,
      unstarted: levels.filter((score) => score === null).length,
    };
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-border bg-bg-primary p-1">
            <Button
              size="sm"
              variant={performanceSource === "tests" ? "primary" : "quiet"}
              onClick={() => setPerformanceSource("tests")}
            >
              From class tests
            </Button>
            <Button
              size="sm"
              variant={performanceSource === "questions" ? "primary" : "quiet"}
              onClick={() => setPerformanceSource("questions")}
            >
              From what they ask
            </Button>
          </div>
          <p className="text-sm text-text-secondary">Select a topic to see who needs help.</p>
        </div>
        {topics.length ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="Solid" value={String(counts.solid)} detail="70% or above" />
              <MetricCard label="Getting there" value={String(counts.developing)} detail="40–69%" />
              <MetricCard label="Struggling" value={String(counts.struggling)} detail="Below 40%" />
              <MetricCard
                label="Not started"
                value={String(counts.unstarted)}
                detail="No signal yet"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {subject.chapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      className="rounded-xl border border-border bg-bg-secondary p-4"
                    >
                      <h3 className="font-display font-semibold">{chapter.name}</h3>
                      <div className="relative mt-3 space-y-2 border-l border-dashed border-border-strong pl-3">
                        {chapter.topics.map((topic) => {
                          const score = scoreFor(topic);
                          const level: KnowledgeLevel =
                            score === null
                              ? "not-started"
                              : score < 0.4
                                ? "struggling"
                                : score < 0.7
                                  ? "developing"
                                  : "solid";
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              className={cn(
                                "flex min-h-10 w-full items-center gap-3 rounded-lg bg-bg-primary px-3 text-left text-sm hover:ring-1 hover:ring-border-strong",
                                focusRing,
                                selectedTopicId === topic.id && "ring-2 ring-border-strong",
                              )}
                              onClick={() => setSelectedTopicId(topic.id)}
                            >
                              <KnowledgeDot level={level} />
                              <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                              <span className="text-xs text-text-muted">{percent(score)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="self-start p-5">
                {selected ? (
                  <TopicDetail
                    topic={selected}
                    students={classroom.studentIds.map(studentOf).filter(Boolean) as Student[]}
                    source={performanceSource}
                    onStudent={(student) => openStudent(student, classroom)}
                  />
                ) : (
                  <>
                    <h3 className="font-display text-lg font-semibold">How to read it</h3>
                    <div className="mt-4 space-y-3">
                      {(
                        ["solid", "developing", "struggling", "not-started"] as KnowledgeLevel[]
                      ).map((level) => (
                        <div key={level} className="flex items-center gap-3">
                          <KnowledgeDot level={level} />
                          <span className="text-sm">{levelLabel(level)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 text-sm leading-6 text-text-secondary">
                      Tests show performance under assessment. Questions show which topics students
                      repeatedly ask the tutor about.
                    </p>
                  </>
                )}
              </Card>
            </div>
          </>
        ) : (
          <EmptyState
            title="No topics yet"
            body="Add the syllabus to build the class performance map."
          />
        )}
      </>
    );
  }

  function renderClassSettings(classroom: Classroom) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">Teachers</h3>
          <div className="mt-4 space-y-3">
            {classroom.teachers.map((teacher, index) => (
              <div key={teacher} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-secondary text-xs font-semibold">
                  {initials(teacher)}
                </span>
                <span className="flex-1 text-sm font-medium">{teacher}</span>
                <Chip>{index === 0 ? "Leads" : "Helps"}</Chip>
              </div>
            ))}
          </div>
          <Button className="mt-5" variant="secondary" onClick={() => openAddTeacher(classroom)}>
            Add co-teacher
          </Button>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">Codes and notices</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Invite students once and keep important classroom information visible.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openInvite(classroom)}>
              Code and QR
            </Button>
            <Button variant="secondary" onClick={() => openClassNote(classroom)}>
              {classroom.note ? "Edit notice" : "Post notice"}
            </Button>
          </div>
        </Card>
        <Card className="p-5 md:col-span-2">
          <h3 className="font-display text-lg font-semibold">Classroom details</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Classroom</dt>
              <dd className="mt-1 text-sm font-medium">{classroom.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">College</dt>
              <dd className="mt-1 text-sm font-medium">{classroom.college}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Schedule</dt>
              <dd className="mt-1 text-sm font-medium">{classroom.schedule}</dd>
            </div>
          </dl>
        </Card>
      </div>
    );
  }

  function renderExam(exam: Exam, classroom?: Classroom) {
    const subject = subjectOf(exam.subjectId);
    const offerings = classroom
      ? exam.offerings.filter((item) => item.classroomId === classroom.id)
      : exam.offerings;
    const results = workspace.results.filter(
      (result) => result.examId === exam.id && (!classroom || result.classroomId === classroom.id),
    );
    const waiting = results.filter((result) => !result.published);
    const used = exam.questions.reduce((sum, question) => sum + question.marks, 0);
    return (
      <>
        <Breadcrumb
          items={[
            {
              label: classroom ? classroom.name : "Classrooms",
              onClick: () =>
                classroom
                  ? navigate({ name: "classroom", id: classroom.id })
                  : navigate({ name: "classrooms" }),
            },
            { label: exam.title },
          ]}
        />
        <PageHeader
          eyebrow={`${classroom?.name || subject?.name} · ${exam.kind}`}
          title={exam.title}
          description={`${exam.minutes || "No"} minute limit · ${exam.marks} marks · ${offerings.length ? "Published" : "No classroom yet"}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => openRenameExam(exam)}>
                Edit details
              </Button>
              <Button variant="secondary" onClick={() => duplicateExam(exam)}>
                Copy
              </Button>
              <Button variant="secondary" onClick={() => printExam(exam)}>
                Print
              </Button>
              <Button onClick={() => openSchedule(exam, classroom?.id)}>Publish</Button>
            </div>
          }
        />
        {waiting.length ? (
          <Card className="mb-5 flex flex-col gap-4 bg-text-primary p-5 text-text-inverse sm:flex-row sm:items-center">
            <div className="flex-1">
              <h2 className="font-display text-xl font-semibold">
                {waiting.length} papers ready to publish
              </h2>
              <p className="mt-1 text-sm opacity-70">
                Review any automatic mark before students see it.
              </p>
            </div>
            <Button variant="secondary" onClick={() => publishResults(waiting)}>
              Publish all
            </Button>
          </Card>
        ) : null}
        <Tabs
          value={examTab}
          onChange={setExamTab}
          items={[
            { value: "questions", label: "Questions", count: exam.questions.length },
            { value: "schedule", label: "Schedule", count: offerings.length },
            { value: "submissions", label: "Submissions", count: results.length },
          ]}
        />
        {examTab === "questions" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => generateQuestions(exam)}>Write questions for me</Button>
              <Button variant="secondary" onClick={() => openAddQuestion(exam)}>
                Add one myself
              </Button>
              <span className="flex-1" />
              <Chip tone={used === exam.marks ? "success" : "neutral"}>
                {used} of {exam.marks} marks used
              </Chip>
            </div>
            {exam.drafting ? (
              <Card className="mb-4 p-5">
                <p className="font-medium">Writing questions from your material…</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  You can leave this page while the local draft is prepared.
                </p>
              </Card>
            ) : null}
            {exam.questions.length ? (
              <div className="space-y-3">
                {exam.questions.map((question, index) => renderQuestion(exam, question, index))}
              </div>
            ) : (
              <EmptyState
                title="No questions yet"
                body="Draft from the subject topics or write the first question yourself."
                action={<Button onClick={() => generateQuestions(exam)}>Draft questions</Button>}
              />
            )}
          </>
        ) : null}
        {examTab === "schedule" ? renderExamSchedule(exam, offerings, classroom) : null}
        {examTab === "submissions" ? renderSubmissions(exam, results, classroom) : null}
      </>
    );
  }

  function renderQuestion(exam: Exam, question: Question, index: number) {
    const subject = subjectOf(exam.subjectId);
    const topic = subject?.chapters
      .flatMap((chapter) => chapter.topics)
      .find((item) => item.id === question.topicId);
    return (
      <Card key={question.id} className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Question {index + 1}</Chip>
          <Chip>
            {question.type === "choice"
              ? "Multiple choice"
              : question.type === "short"
                ? "Short answer"
                : "Long answer"}
          </Chip>
          <Chip tone="success">{question.marks} marks</Chip>
          {topic ? <Chip>{topic.name}</Chip> : null}
          <span className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            disabled={rewritingQuestionId === question.id}
            onClick={() => rewriteQuestion(exam, question)}
          >
            {rewritingQuestionId === question.id ? "Rewriting…" : "Rewrite"}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() =>
              updateWorkspace((draft) => {
                const target = draft.exams.find((item) => item.id === exam.id);
                if (target)
                  target.questions = target.questions.filter((item) => item.id !== question.id);
              })
            }
          >
            Remove
          </Button>
        </div>
        <p className="mt-4 text-sm leading-6">{question.prompt}</p>
        {question.options ? (
          <ol className="mt-3 list-[lower-alpha] space-y-1 pl-6 text-sm text-text-secondary">
            {question.options.map((option, optionIndex) => (
              <li key={option}>
                {option}
                {optionIndex === question.correctOption ? (
                  <span className="ml-2 font-medium text-text-primary">· correct</span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        {question.rubric?.length ? (
          <div className="mt-4">
            <p className="text-xs text-text-muted">Marks are given for</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {question.rubric.map((item) => (
                <Chip key={item.label}>
                  {item.label} · {item.marks}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-1">
          <span className="text-xs text-text-muted">Rewrite as</span>
          {(["choice", "short", "long"] as Question["type"][]).map((type) => (
            <Button
              key={type}
              size="sm"
              variant="quiet"
              disabled={question.type === type}
              onClick={() => changeQuestionType(exam, question, type)}
            >
              {type === "choice"
                ? "Multiple choice"
                : type === "short"
                  ? "Short answer"
                  : "Long answer"}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  function rewriteQuestion(exam: Exam, question: Question) {
    const topic =
      subjectOf(exam.subjectId)
        ?.chapters.flatMap((chapter) => chapter.topics)
        .find((item) => item.id === question.topicId)?.name || "this topic";
    setRewritingQuestionId(question.id);
    window.setTimeout(() => {
      updateWorkspace((draft) => {
        const target = draft.exams
          .find((item) => item.id === exam.id)
          ?.questions.find((item) => item.id === question.id);
        if (target)
          target.prompt =
            target.type === "long"
              ? `Compare ${topic.toLowerCase()} with the previous topic. Show the derivation and one application.`
              : `Define ${topic.toLowerCase()} and state the condition students most often forget.`;
      });
      setRewritingQuestionId("");
      setToast("Question rewritten from the same topic.");
    }, 900);
  }

  function changeQuestionType(exam: Exam, question: Question, type: Question["type"]) {
    updateWorkspace((draft) => {
      const target = draft.exams
        .find((item) => item.id === exam.id)
        ?.questions.find((item) => item.id === question.id);
      if (!target) return;
      target.type = type;
      target.marks = type === "choice" ? 2 : type === "short" ? 3 : 6;
      if (type === "choice") {
        target.options = ["The first statement", "The second statement", "Both", "Neither"];
        target.correctOption = 0;
      } else {
        delete target.options;
        delete target.correctOption;
      }
      target.rubric =
        type === "long"
          ? [
              { label: "Clear statement", marks: 2 },
              { label: "Worked method", marks: 3 },
              { label: "Correct units", marks: 1 },
            ]
          : undefined;
    });
  }

  function duplicateExam(exam: Exam) {
    const id = uid("exam");
    updateWorkspace((draft) => {
      draft.exams.unshift({
        ...cloneWorkspace({
          teacher: workspace.teacher,
          subjects: [],
          classrooms: [],
          students: [],
          exams: [exam],
          results: [],
        }).exams[0],
        id,
        title: `${exam.title} (copy)`,
        code: `EXM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        offerings: [],
        questions: exam.questions.map((question) => ({ ...question, id: uid("question") })),
      });
    });
    setToast("Exam copied with all questions.");
    navigate({ name: "exam", id });
  }

  function printExam(exam: Exam) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setToast("Allow pop-ups to open the printable paper.");
      return;
    }
    popup.opener = null;
    const doc = popup.document;
    doc.title = `${exam.title} — printable paper`;
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#111}header{border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px}h1{margin:0 0 8px}ol{padding-left:24px}li{margin:0 0 24px;line-height:1.5}.meta{color:#555}.marks{float:right;font-weight:700}.options{margin-top:10px;color:#333}@media print{body{margin:0 auto}.no-print{display:none}}";
    doc.head.appendChild(style);
    const header = doc.createElement("header");
    const title = doc.createElement("h1");
    title.textContent = exam.title;
    const meta = doc.createElement("p");
    meta.className = "meta";
    meta.textContent = `${subjectOf(exam.subjectId)?.name || "Subject"} · ${exam.marks} marks · ${exam.minutes ? `${exam.minutes} minutes` : "No time limit"}`;
    header.append(title, meta);
    const list = doc.createElement("ol");
    exam.questions.forEach((question) => {
      const item = doc.createElement("li");
      const marks = doc.createElement("span");
      marks.className = "marks";
      marks.textContent = `[${question.marks}]`;
      item.append(marks, doc.createTextNode(question.prompt));
      if (question.options?.length) {
        const options = doc.createElement("div");
        options.className = "options";
        options.textContent = question.options
          .map((option, index) => `${String.fromCharCode(97 + index)}) ${option}`)
          .join("    ");
        item.appendChild(options);
      }
      list.appendChild(item);
    });
    const button = doc.createElement("button");
    button.className = "no-print";
    button.textContent = "Print paper";
    button.onclick = () => popup.print();
    doc.body.append(header, list, button);
  }

  function printInviteCard(titleText: string, code: string, link: string) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setToast("Allow pop-ups to open the printable invite.");
      return;
    }
    popup.opener = null;
    const doc = popup.document;
    doc.title = `${titleText} — invite`;
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:Arial,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center;color:#111}main{max-width:520px;padding:40px}h1{font-size:30px;margin:0 0 12px}.code{font-family:monospace;font-size:28px;font-weight:700;letter-spacing:.16em;margin:20px 0}.link{font-family:monospace;font-size:12px;overflow-wrap:anywhere;color:#555}svg{width:240px;height:240px}.no-print{margin-top:24px}@media print{.no-print{display:none}}";
    doc.head.appendChild(style);
    const main = doc.createElement("main");
    const heading = doc.createElement("h1");
    heading.textContent = titleText;
    const message = doc.createElement("p");
    message.textContent = "Scan to join, or enter the code.";
    const qr = document.querySelector('[aria-label="Scannable invite QR code"] svg');
    if (qr) main.appendChild(qr.cloneNode(true));
    const codeNode = doc.createElement("div");
    codeNode.className = "code";
    codeNode.textContent = code;
    const linkNode = doc.createElement("div");
    linkNode.className = "link";
    linkNode.textContent = link;
    const button = doc.createElement("button");
    button.className = "no-print";
    button.textContent = "Print invite";
    button.onclick = () => popup.print();
    main.prepend(heading, message);
    main.append(codeNode, linkNode, button);
    doc.body.appendChild(main);
  }

  function openRenameExam(exam: Exam) {
    setModal({
      title: "Edit exam details",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            updateWorkspace((draft) => {
              const target = draft.exams.find((item) => item.id === exam.id);
              if (!target) return;
              target.title = String(data.get("title") || target.title).trim();
              target.marks = Number(data.get("marks") || target.marks);
              target.minutes = Number(data.get("minutes") || target.minutes);
            });
            setModal(null);
            setToast("Exam details updated.");
          }}
        >
          <Field label="Exam title">
            <input className={inputClass} name="title" defaultValue={exam.title} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total marks">
              <input
                className={inputClass}
                name="marks"
                inputMode="numeric"
                defaultValue={exam.marks}
              />
            </Field>
            <Field label="Time limit (minutes)">
              <input
                className={inputClass}
                name="minutes"
                inputMode="numeric"
                defaultValue={exam.minutes}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      ),
    });
  }

  function renderExamSchedule(exam: Exam, offerings: Exam["offerings"], classroom?: Classroom) {
    return (
      <>
        <div className="mb-4">
          <Button onClick={() => openSchedule(exam, classroom?.id)}>
            Give to another classroom
          </Button>
          <Button className="ml-2" variant="secondary" onClick={() => openScheduleMany(exam)}>
            Give to several
          </Button>
        </div>
        {offerings.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {offerings.map((offering) => {
              const target = classroomOf(offering.classroomId);
              return (
                <Card key={offering.classroomId} className="p-5">
                  <div className="flex items-center">
                    <Chip
                      tone={
                        offeringStatus(offering.opens, offering.closes) === "Closed"
                          ? "neutral"
                          : "success"
                      }
                    >
                      {offeringStatus(offering.opens, offering.closes)}
                    </Chip>
                    <span className="flex-1" />
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => openSchedule(exam, offering.classroomId)}
                    >
                      Change dates
                    </Button>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{target?.name}</h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    Opens: {formatDate(offering.opens)}
                    <br />
                    Closes: {formatDate(offering.closes)}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => target && openInvite(target, exam)}
                    >
                      Code and QR
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setModal({
                          title: `Take exam off ${target?.name || "this classroom"}?`,
                          content: (
                            <div>
                              <p className="text-sm leading-6 text-text-secondary">
                                Students will no longer see this offering. Existing submissions and
                                marks stay in the workspace.
                              </p>
                              <div className="mt-5 flex justify-end gap-2">
                                <Button variant="secondary" onClick={() => setModal(null)}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="danger"
                                  onClick={() => {
                                    updateWorkspace((draft) => {
                                      const item = draft.exams.find(
                                        (entry) => entry.id === exam.id,
                                      );
                                      if (item)
                                        item.offerings = item.offerings.filter(
                                          (entry) => entry.classroomId !== offering.classroomId,
                                        );
                                    });
                                    setModal(null);
                                    setToast("Exam removed; existing marks were kept.");
                                  }}
                                >
                                  Take it off
                                </Button>
                              </div>
                            </div>
                          ),
                        });
                      }}
                    >
                      Take off
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Not published yet"
            body="Choose a classroom and set its dates. Leave dates blank for an always-open assessment."
            action={
              <Button onClick={() => openSchedule(exam, classroom?.id)}>
                Publish to classroom
              </Button>
            }
          />
        )}
      </>
    );
  }

  function renderSubmissions(exam: Exam, results: Result[], classroom?: Classroom) {
    const waiting = results.filter((result) => !result.published);
    return (
      <>
        {results.length ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-text-secondary">
                {results.length} paper{results.length === 1 ? "" : "s"} submitted
              </p>
              <span className="flex-1" />
              {waiting.length ? (
                <Button onClick={() => publishResults(waiting)}>
                  Publish all {waiting.length}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => bulkAdjust(exam, results)}>
                Adjust a question for all
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {results.map((result) => {
                const student = studentOf(result.studentId);
                return (
                  <button
                    key={result.id}
                    type="button"
                    className={cn(
                      "rounded-xl border bg-bg-primary p-5 text-left hover:border-border-strong",
                      result.published ? "border-border" : "border-border-strong",
                      focusRing,
                    )}
                    onClick={() => navigate({ name: "result", id: result.id })}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-secondary text-xs font-semibold">
                        {initials(student?.name || "Student")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display font-semibold">{student?.name}</h3>
                        <p className="text-xs text-text-secondary">
                          {result.paperMode ? "Handed in on paper" : "Typed"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-end">
                      <p className="font-display text-3xl font-semibold">
                        {result.score}
                        <span className="text-sm text-text-muted">/{result.outOf}</span>
                      </p>
                      <span className="flex-1" />
                      <Chip tone={result.published ? "success" : "solid"}>
                        {result.published ? "Published" : "Review"}
                      </Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="No submissions yet"
            body={
              classroom
                ? "Papers appear here as students hand them in."
                : "Publish this exam to a classroom first."
            }
          />
        )}
      </>
    );
  }

  function bulkAdjust(exam: Exam, results: Result[]) {
    const first = results[0];
    setModal({
      title: "Adjust one question for everyone",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const index = Number(data.get("question"));
            const action = String(data.get("action"));
            const value = Number(data.get("value") || 0);
            const note = String(data.get("note") || "");
            updateWorkspace((draft) => {
              draft.results
                .filter((result) => results.some((item) => item.id === result.id))
                .forEach((result) => {
                  const line = result.lines[index];
                  if (!line) return;
                  if (action === "full") line.score = line.max;
                  else if (action === "add") line.score = Math.min(line.max, line.score + value);
                  else {
                    line.score = 0;
                    line.max = 0;
                  }
                  if (note) line.teacherNote = note;
                  result.score = result.lines.reduce((sum, item) => sum + item.score, 0);
                  result.outOf = result.lines.reduce((sum, item) => sum + item.max, 0);
                  result.checked = true;
                });
            });
            setModal(null);
            setToast(`${results.length} papers updated.`);
          }}
        >
          <Field label="Question">
            <select className={inputClass} name="question">
              {first.lines.map((line, index) => (
                <option key={line.questionId} value={index}>
                  Question {index + 1} — {line.prompt.slice(0, 52)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Change">
            <select className={inputClass} name="action">
              <option value="full">Give full marks</option>
              <option value="add">Add marks</option>
              <option value="drop">Drop from total</option>
            </select>
          </Field>
          <Field label="Marks to add">
            <input
              className={inputClass}
              name="value"
              type="text"
              inputMode="decimal"
              defaultValue="1"
            />
          </Field>
          <Field label="Note for students">
            <textarea
              className={cn(inputClass, "min-h-24 py-3")}
              name="note"
              placeholder="The wording was ambiguous."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Apply to {results.length}</Button>
          </div>
        </form>
      ),
    });
  }

  function renderMarking() {
    return (
      <>
        <PageHeader
          eyebrow="Teacher review"
          title="Marking queue"
          description="Automatic marks stay private until you check and publish them."
          action={
            waitingResults.length ? (
              <Button onClick={() => publishResults(waitingResults)}>Publish all checked</Button>
            ) : undefined
          }
        />
        {waitingResults.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {waitingResults.map((result) => {
              const exam = examOf(result.examId);
              const student = studentOf(result.studentId);
              const classroom = classroomOf(result.classroomId);
              return (
                <button
                  key={result.id}
                  type="button"
                  className={cn(
                    "rounded-xl border border-border-strong bg-bg-primary p-5 text-left hover:bg-bg-secondary",
                    focusRing,
                  )}
                  onClick={() => navigate({ name: "result", id: result.id })}
                >
                  <div className="flex items-center">
                    <Chip tone="solid">Review</Chip>
                    <span className="flex-1" />
                    <span className="text-xs text-text-muted">
                      {result.paperMode ? "Paper" : "Typed"}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{student?.name}</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {exam?.title} · {classroom?.name}
                  </p>
                  <p className="mt-5 font-display text-3xl font-semibold">
                    {result.score}
                    <span className="text-sm text-text-muted">/{result.outOf}</span>
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="All caught up"
            body="Every reviewed result is published. New submissions will appear here."
          />
        )}
      </>
    );
  }

  function openAttachPaper(result: Result) {
    setModal({
      title: "The paper they handed in",
      content: (
        <div>
          <p className="text-sm leading-6 text-text-secondary">
            Choose a photo or scanned PDF. A PDF opens as multiple pages for marking.
          </p>
          <label
            className={cn(
              "mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong p-4 text-center hover:bg-bg-secondary",
              focusRing,
            )}
          >
            <span className="text-sm font-medium">Choose the scan</span>
            <span className="mt-1 text-xs text-text-muted">
              Image or PDF, up to 8 MB for photos
            </span>
            <input
              type="file"
              className="sr-only"
              accept="image/*,application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.type.startsWith("image/") && file.size > 8_000_000) {
                  setToast("That photo is very large. Choose one under 8 MB.");
                  return;
                }
                if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
                  updateWorkspace((draft) => {
                    const target = draft.results.find((item) => item.id === result.id);
                    if (!target) return;
                    target.paperMode = true;
                    target.paperPages = 2;
                    target.paperImages = [];
                  });
                  setPaperPage(1);
                  setModal(null);
                  setResultTab("paper");
                  setToast("PDF attached — two pages are ready to mark.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  updateWorkspace((draft) => {
                    const target = draft.results.find((item) => item.id === result.id);
                    if (!target || typeof reader.result !== "string") return;
                    target.paperMode = true;
                    target.paperPages = 1;
                    target.paperImage = reader.result;
                    target.paperImages = [reader.result];
                  });
                  setPaperPage(1);
                  setModal(null);
                  setResultTab("paper");
                  setToast("Scan attached and ready to mark.");
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateWorkspace((draft) => {
                  const target = draft.results.find((item) => item.id === result.id);
                  if (!target) return;
                  target.paperMode = true;
                  target.paperPages = 2;
                });
                setPaperPage(1);
                setModal(null);
                setResultTab("paper");
                setToast("Sample two-page paper loaded.");
              }}
            >
              Use sample paper
            </Button>
          </div>
        </div>
      ),
    });
  }

  function renderResult(result: Result) {
    const exam = examOf(result.examId);
    const student = studentOf(result.studentId);
    const classroom = classroomOf(result.classroomId);
    if (!exam || !student || !classroom)
      return <EmptyState title="Paper not found" body="The related exam or student is missing." />;
    const visibleResultTab = !result.paperMode && resultTab === "paper" ? "answers" : resultTab;
    return (
      <>
        <Breadcrumb
          items={[
            { label: "Classrooms", onClick: () => navigate({ name: "classrooms" }) },
            {
              label: classroom.name,
              onClick: () => navigate({ name: "classroom", id: classroom.id }),
            },
            {
              label: exam.title,
              onClick: () => navigate({ name: "exam", id: exam.id, classroomId: classroom.id }),
            },
            { label: student.name },
          ]}
        />
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Result status">
          <Chip tone={result.counts === false ? "neutral" : "success"}>
            {result.counts === false ? "Practice only" : "Counts towards the record"}
          </Chip>
          <Chip tone={result.published ? "success" : "solid"}>
            {result.published ? "Published" : "Not published yet"}
          </Chip>
          {result.paperMode ? <Chip>Handed in on paper</Chip> : <Chip>Typed submission</Chip>}
          <Chip>{classroom.name}</Chip>
        </div>
        <PageHeader
          eyebrow={`${classroom.name} · ${result.paperMode ? "Handed in on paper" : "Typed"}`}
          title={exam.title}
          description={`${student.name} · submitted ${formatDate(result.submittedAt)}`}
          action={
            <div className="flex items-center gap-3">
              {!result.paperMode ? (
                <Button variant="secondary" onClick={() => openAttachPaper(result)}>
                  Attach scan
                </Button>
              ) : null}
              {!result.published ? (
                <Button onClick={() => publishResults([result])}>Publish result</Button>
              ) : null}
              <p className="rounded-full border-2 border-border-strong px-4 py-3 font-display text-xl font-semibold">
                {result.score}/{result.outOf}
              </p>
            </div>
          }
        />
        <Tabs
          value={visibleResultTab}
          onChange={setResultTab}
          items={[
            ...(result.paperMode ? [{ value: "paper" as const, label: "Their paper" }] : []),
            { value: "answers", label: "Answers & feedback" },
            { value: "summary", label: "Summary" },
          ]}
        />
        {visibleResultTab === "paper" && result.paperMode ? renderPaper(result) : null}
        {visibleResultTab === "answers" ? renderAnswerLines(result) : null}
        {visibleResultTab === "summary" ? renderResultSummary(result, classroom) : null}
      </>
    );
  }

  function renderPaper(result: Result) {
    const pages = Math.max(1, result.paperPages || result.paperImages?.length || 1);
    const activePage = Math.min(pages, paperPage);
    const visiblePins = result.pins.filter((pin) => (pin.page || 1) === activePage);
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {pages > 1 ? (
              <div className="mr-auto inline-flex rounded-lg border border-border p-1">
                {Array.from({ length: pages }, (_, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={activePage === index + 1 ? "primary" : "quiet"}
                    onClick={() => setPaperPage(index + 1)}
                  >
                    Page {index + 1}
                  </Button>
                ))}
              </div>
            ) : null}
            {(["tick", "cross", "marks", "note"] as const).map((pen) => (
              <Button
                key={pen}
                size="sm"
                variant={activePen === pen ? "primary" : "secondary"}
                onClick={() => setActivePen(pen)}
              >
                {pen === "tick"
                  ? "✓ Tick"
                  : pen === "cross"
                    ? "✕ Cross"
                    : pen === "marks"
                      ? "+ Marks"
                      : "Note"}
              </Button>
            ))}
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                updateWorkspace((draft) => {
                  draft.results.find((item) => item.id === result.id)?.pins.pop();
                })
              }
            >
              Undo
            </Button>
          </div>
          <button
            type="button"
            aria-label="Place the selected marking annotation on the paper"
            className={cn(
              "relative block min-h-[680px] w-full overflow-hidden rounded-xl border border-border bg-[#fffdf7] text-left",
              focusRing,
            )}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - box.left) / box.width) * 100;
              const y = ((event.clientY - box.top) / box.height) * 100;
              if (activePen === "marks" || activePen === "note") {
                setModal({
                  title: activePen === "marks" ? "Marks for this part" : "A note on the page",
                  content: (
                    <form
                      className="space-y-4"
                      onSubmit={(submitEvent) => {
                        submitEvent.preventDefault();
                        const data = new FormData(submitEvent.currentTarget);
                        const text =
                          activePen === "marks"
                            ? String(data.get("marks") || "0")
                            : String(data.get("note") || "").trim() || "See me";
                        updateWorkspace((draft) => {
                          draft.results
                            .find((item) => item.id === result.id)
                            ?.pins.push({
                              id: uid("pin"),
                              kind: activePen,
                              x,
                              y,
                              text,
                              page: activePage,
                            });
                        });
                        setModal(null);
                      }}
                    >
                      {activePen === "marks" ? (
                        <Field label="Marks">
                          <input
                            className={inputClass}
                            name="marks"
                            inputMode="decimal"
                            defaultValue="2"
                          />
                        </Field>
                      ) : (
                        <Field label="What should the student read here?">
                          <textarea
                            className={cn(inputClass, "min-h-28 py-3")}
                            name="note"
                            placeholder="Units missing — this cost one mark."
                          />
                        </Field>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setModal(null)}>
                          Cancel
                        </Button>
                        <Button type="submit">Put it on the page</Button>
                      </div>
                    </form>
                  ),
                });
                return;
              }
              updateWorkspace((draft) => {
                draft.results
                  .find((item) => item.id === result.id)
                  ?.pins.push({
                    id: uid("pin"),
                    kind: activePen,
                    x,
                    y,
                    text: activePen === "tick" ? "✓" : "✕",
                    page: activePage,
                  });
              });
            }}
          >
            {result.paperImages?.[activePage - 1] ||
            (activePage === 1 ? result.paperImage : undefined) ? (
              // A teacher-selected local data URL should remain unoptimized and never leave the browser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.paperImages?.[activePage - 1] || result.paperImage}
                alt="Uploaded answer sheet"
                className="h-full w-full object-contain"
              />
            ) : (
              <SamplePaper />
            )}
            {visiblePins.map((pin) => (
              <button
                type="button"
                key={pin.id}
                aria-label="Remove this annotation"
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 font-semibold",
                  pin.kind === "tick" && "text-3xl text-success",
                  pin.kind === "cross" && "text-3xl text-destructive",
                  pin.kind === "marks" &&
                    "rounded-md border border-destructive bg-bg-primary px-2 py-1 text-sm text-destructive",
                  pin.kind === "note" &&
                    "max-w-40 rounded-full bg-text-primary px-3 py-1 text-xs text-text-inverse",
                )}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  updateWorkspace((draft) => {
                    const target = draft.results.find((item) => item.id === result.id);
                    if (target) target.pins = target.pins.filter((item) => item.id !== pin.id);
                  });
                }}
              >
                {pin.text}
              </button>
            ))}
          </button>
          <p className="mt-2 text-xs text-text-muted">
            Choose a pen, then tap the page. Tap an annotation to remove it, or use Undo.
          </p>
        </div>
        <Card className="self-start p-5">
          <h3 className="font-display text-lg font-semibold">Paper tools</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex">
              <dt className="flex-1 text-text-secondary">Ticks</dt>
              <dd className="font-semibold">
                {result.pins.filter((pin) => pin.kind === "tick").length}
              </dd>
            </div>
            <div className="flex">
              <dt className="flex-1 text-text-secondary">Crosses</dt>
              <dd className="font-semibold">
                {result.pins.filter((pin) => pin.kind === "cross").length}
              </dd>
            </div>
            <div className="flex">
              <dt className="flex-1 text-text-secondary">Notes</dt>
              <dd className="font-semibold">
                {result.pins.filter((pin) => pin.kind === "note").length}
              </dd>
            </div>
            <div className="flex">
              <dt className="flex-1 text-text-secondary">Marks written</dt>
              <dd className="font-semibold">
                {result.pins
                  .filter((pin) => pin.kind === "marks")
                  .reduce((sum, pin) => sum + (Number(pin.text) || 0), 0)}
              </dd>
            </div>
          </dl>
          {result.pins.some((pin) => pin.kind === "note") ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
                Notes on the paper
              </p>
              <div className="mt-2 divide-y divide-border">
                {result.pins
                  .filter((pin) => pin.kind === "note")
                  .map((pin) => (
                    <div key={pin.id} className="flex items-start gap-2 py-3 text-sm">
                      <Chip>Page {pin.page || 1}</Chip>
                      <p className="min-w-0 flex-1 leading-5 text-text-secondary">{pin.text}</p>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          <Button className="mt-5" variant="secondary" onClick={() => openAttachPaper(result)}>
            Replace scan
          </Button>
        </Card>
      </div>
    );
  }

  function renderAnswerLines(result: Result) {
    return (
      <div className="space-y-3">
        {result.lines.map((line, index) => (
          <Card key={line.questionId} className="overflow-hidden">
            <div className="border-b border-border p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Question {index + 1}</Chip>
                <Chip tone={line.score === line.max ? "success" : "neutral"}>
                  {line.score}/{line.max} marks
                </Chip>
                <span className="flex-1" />
                <Button size="sm" variant="quiet" onClick={() => openAdjustLine(result, index)}>
                  Change marks
                </Button>
              </div>
              <p className="mt-3 text-sm font-medium leading-6">{line.prompt}</p>
            </div>
            <div className="grid md:grid-cols-2">
              <div className="border-b border-border p-5 md:border-b-0 md:border-r">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
                  Student answer
                </p>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{line.answer}</p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
                  Feedback
                </p>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{line.feedback}</p>
                {line.teacherNote ? (
                  <p className="mt-3 rounded-lg bg-bg-secondary p-3 text-sm">
                    <strong>Teacher note:</strong> {line.teacherNote}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  function openAdjustLine(result: Result, index: number) {
    const line = result.lines[index];
    setModal({
      title: "Change marks",
      content: (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            updateWorkspace((draft) => {
              const target = draft.results.find((item) => item.id === result.id);
              if (!target) return;
              target.lines[index].score = Math.min(
                target.lines[index].max,
                Math.max(0, Number(data.get("score") || 0)),
              );
              target.lines[index].teacherNote = String(data.get("note") || "").trim();
              target.score = target.lines.reduce((sum, item) => sum + item.score, 0);
              target.checked = true;
            });
            setModal(null);
            setToast("Marks and teacher note saved.");
          }}
        >
          <Card className="bg-bg-secondary p-4">
            <p className="text-xs text-text-muted">Question</p>
            <p className="mt-2 text-sm leading-6">{line.prompt}</p>
          </Card>
          <Field label={`Marks out of ${line.max}`}>
            <input
              className={inputClass}
              name="score"
              type="text"
              inputMode="decimal"
              defaultValue={line.score}
            />
          </Field>
          <Field label="Note for the student">
            <textarea
              className={cn(inputClass, "min-h-28 py-3")}
              name="note"
              defaultValue={line.teacherNote || ""}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Save marks</Button>
          </div>
        </form>
      ),
    });
  }

  function renderResultSummary(result: Result, classroom: Classroom) {
    const peers = workspace.results.filter(
      (item) => item.examId === result.examId && item.classroomId === classroom.id,
    );
    const average = peers.length
      ? peers.reduce((sum, item) => sum + item.score / item.outOf, 0) / peers.length
      : 0;
    const bands = Array.from(
      { length: 5 },
      (_, index) =>
        peers.filter((peer) => {
          const band = Math.min(4, Math.floor((peer.score / peer.outOf) * 5));
          return band === index;
        }).length,
    );
    const maxBand = Math.max(1, ...bands);
    const below = peers.filter(
      (peer) => peer.score / peer.outOf < result.score / result.outOf,
    ).length;
    const strengths = result.strengths?.length
      ? result.strengths
      : result.lines
          .filter((line) => line.max > 0 && line.score / line.max >= 0.75)
          .slice(0, 3)
          .map(
            (line) =>
              `${line.prompt.slice(0, 58)}${line.prompt.length > 58 ? "…" : ""}: ${line.feedback}`,
          );
    const improvements = result.improvements?.length
      ? result.improvements
      : result.lines
          .filter((line) => line.max > 0 && line.score < line.max)
          .sort((a, b) => a.score / a.max - b.score / b.max)
          .slice(0, 3)
          .map(
            (line) =>
              `${line.prompt.slice(0, 58)}${line.prompt.length > 58 ? "…" : ""}: ${line.feedback}`,
          );
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">Marker summary</h3>
          <p className="mt-4 text-sm leading-7 text-text-secondary">{result.summary}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">Went well</p>
              <div className="mt-2 space-y-2">
                {(strengths.length
                  ? strengths
                  : ["The paper shows a clear attempt throughout."]
                ).map((item) => (
                  <p key={item} className="text-sm leading-5">
                    ✓ {item}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted">Cost marks</p>
              <div className="mt-2 space-y-2">
                {(improvements.length ? improvements : ["No recurring issue was identified."]).map(
                  (item) => (
                    <p key={item} className="text-sm leading-5">
                      → {item}
                    </p>
                  ),
                )}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">The number</h3>
          <div className="mt-5 flex items-end gap-5">
            <p className="font-display text-5xl font-semibold">
              {Math.round((result.score / result.outOf) * 100)}%
            </p>
            <p className="pb-2 text-sm text-text-secondary">
              Class average {Math.round(average * 100)}%
            </p>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-text-primary"
              style={{ width: `${Math.round((result.score / result.outOf) * 100)}%` }}
            />
          </div>
          {peers.length >= 3 ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs text-text-muted">How the classroom did</p>
              <div className="mt-3 flex h-20 items-end gap-2">
                {bands.map((count, index) => (
                  <div
                    key={index}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div
                      className={cn(
                        "w-full rounded-t bg-text-primary",
                        Math.min(4, Math.floor((result.score / result.outOf) * 5)) !== index &&
                          "opacity-25",
                      )}
                      style={{ height: `${Math.max(8, (count / maxBand) * 52)}px` }}
                    />
                    <span className="text-xs text-text-muted">
                      {index * 20}–{index * 20 + 19}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-text-secondary">
                Ahead of {below} of the other {Math.max(0, peers.length - 1)} students.
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  function renderSettings() {
    const currentClassrooms = workspace.classrooms.filter(
      (classroom) => (classroom.term || "current") === "current",
    );
    const currentStudentCount = new Set(
      currentClassrooms.flatMap((classroom) => classroom.studentIds),
    ).size;
    return (
      <>
        <PageHeader
          eyebrow="Teacher profile"
          title="Workspace settings"
          description="These preferences are stored only in this browser for now."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 md:col-span-2">
            <h2 className="font-display text-lg font-semibold">You are a teacher</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {currentClassrooms.length} class{currentClassrooms.length === 1 ? "" : "es"} ·{" "}
              {currentStudentCount} student{currentStudentCount === 1 ? "" : "s"} this term
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Your details</h2>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                updateWorkspace((draft) => {
                  draft.teacher.name = String(data.get("name") || draft.teacher.name);
                  draft.teacher.email = String(data.get("email") || draft.teacher.email);
                });
                setToast("Profile saved locally.");
              }}
            >
              <Field label="Name">
                <input
                  className={inputClass}
                  name="name"
                  autoComplete="name"
                  defaultValue={workspace.teacher.name}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={workspace.teacher.email}
                />
              </Field>
              <Button type="submit">Save profile</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Tutor answer defaults</h2>
            <div className="mt-5 space-y-5">
              <fieldset>
                <legend className="text-sm font-medium">Answer language</legend>
                <div className="mt-2 flex gap-2">
                  {(["English", "नेपाली"] as const).map((language) => (
                    <Button
                      key={language}
                      variant={
                        workspace.teacher.answerLanguage === language ? "primary" : "secondary"
                      }
                      onClick={() =>
                        updateWorkspace((draft) => {
                          draft.teacher.answerLanguage = language;
                        })
                      }
                    >
                      {language}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Answer style</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["Simple", "Exam focused"] as const).map((style) => (
                    <Button
                      key={style}
                      variant={workspace.teacher.answerStyle === style ? "primary" : "secondary"}
                      onClick={() =>
                        updateWorkspace((draft) => {
                          draft.teacher.answerStyle = style;
                        })
                      }
                    >
                      {style}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>
          </Card>
          <Card className="p-5 md:col-span-2">
            <h2 className="font-display text-lg font-semibold">Local workspace data</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Resetting removes only this browser&apos;s teacher demo data. Your account and student
              application are not affected.
            </p>
            <Button
              className="mt-5"
              variant="danger"
              onClick={() =>
                setModal({
                  title: "Reset local workspace?",
                  content: (
                    <div>
                      <p className="text-sm leading-6 text-text-secondary">
                        Subjects, classrooms, exams and marking changes in this browser will return
                        to the sample creator workspace.
                      </p>
                      <div className="mt-5 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setModal(null)}>
                          Keep workspace
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => {
                            window.localStorage.removeItem(workspaceStorageKey(teacherHandle));
                            setWorkspace(createInitialTeacherWorkspace(teacherHandle));
                            setModal(null);
                            setToast("Local creator workspace reset.");
                            navigate({ name: "today" });
                          }}
                        >
                          Reset data
                        </Button>
                      </div>
                    </div>
                  ),
                })
              }
            >
              Reset local workspace
            </Button>
          </Card>
        </div>
      </>
    );
  }

  function pageContent() {
    if (view.name === "today") return renderToday();
    if (view.name === "subjects") return renderSubjects();
    if (view.name === "subject") {
      const subject = subjectOf(view.id);
      return subject ? (
        renderSubject(subject)
      ) : (
        <EmptyState
          title="Subject not found"
          body="Return to Subjects and choose another one."
          action={<Button onClick={() => navigate({ name: "subjects" })}>Back to subjects</Button>}
        />
      );
    }
    if (view.name === "classrooms") return renderClassrooms();
    if (view.name === "students") return renderStudentsDirectory();
    if (view.name === "classroom") {
      const classroom = classroomOf(view.id);
      return classroom ? (
        renderClassroom(classroom)
      ) : (
        <EmptyState
          title="Classroom not found"
          body="Return to Classrooms and choose another one."
          action={
            <Button onClick={() => navigate({ name: "classrooms" })}>Back to classrooms</Button>
          }
        />
      );
    }
    if (view.name === "exam") {
      const exam = examOf(view.id);
      const classroom = view.classroomId ? classroomOf(view.classroomId) : undefined;
      return exam ? (
        renderExam(exam, classroom)
      ) : (
        <EmptyState title="Exam not found" body="The exam may have been removed." />
      );
    }
    if (view.name === "marking") return renderMarking();
    if (view.name === "result") {
      const result = workspace.results.find((item) => item.id === view.id);
      return result ? (
        renderResult(result)
      ) : (
        <EmptyState
          title="Paper not found"
          body="Return to the marking queue."
          action={<Button onClick={() => navigate({ name: "marking" })}>Marking queue</Button>}
        />
      );
    }
    return renderSettings();
  }

  if (!ready) return <TeacherWorkspaceSkeleton />;

  const nav = [
    { view: { name: "today" } as View, label: "Today" },
    { view: { name: "subjects" } as View, label: "Subjects" },
    {
      view: { name: "classrooms" } as View,
      label: "Classrooms",
      count: waitingResults.length,
    },
  ];

  return (
    <div className="min-h-screen bg-bg-secondary text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-[1440px] bg-bg-primary">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-bg-primary p-4 lg:flex lg:flex-col">
          <button
            type="button"
            className={cn("flex min-h-12 items-center gap-3 rounded-lg px-2 text-left", focusRing)}
            onClick={() => navigate({ name: "today" })}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-text-primary font-display font-bold text-text-inverse">
              n
            </span>
            <span>
              <span className="block font-display font-semibold">Nano Syllabus</span>
              <span className="block text-xs uppercase tracking-[0.14em] text-text-muted">
                Creator portal
              </span>
            </span>
          </button>
          <nav className="mt-8 space-y-1" aria-label="Creator workspace navigation">
            {nav.map((item) => (
              <WorkspaceNavButton
                key={item.label}
                active={
                  view.name === item.view.name ||
                  (item.view.name === "subjects" && view.name === "subject") ||
                  (item.view.name === "classrooms" &&
                    ["classroom", "exam", "students", "marking", "result"].includes(view.name))
                }
                label={item.label}
                count={item.count}
                onClick={() => navigate(item.view)}
              />
            ))}
          </nav>
          <div className="mt-auto border-t border-border pt-4">
            <WorkspaceNavButton
              active={view.name === "settings"}
              label="Settings"
              onClick={() => navigate({ name: "settings" })}
            />
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-bg-secondary p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-primary text-xs font-semibold">
                {initials(workspace.teacher.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{workspace.teacher.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  @{workspace.teacher.handle}
                </span>
              </span>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border bg-bg-primary/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-text-primary font-display font-bold text-text-inverse">
                n
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Creator workspace</p>
                <p className="text-xs text-text-muted">{workspace.teacher.name}</p>
              </div>
            </div>
            <nav
              className="mt-3 flex gap-1 overflow-x-auto"
              aria-label="Creator workspace navigation"
            >
              {nav.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "min-h-10 shrink-0 rounded-lg px-3 text-xs font-medium",
                    focusRing,
                    view.name === item.view.name ||
                      (item.view.name === "subjects" && view.name === "subject") ||
                      (item.view.name === "classrooms" &&
                        ["classroom", "exam", "students", "marking", "result"].includes(view.name))
                      ? "bg-text-primary text-text-inverse"
                      : "text-text-secondary hover:bg-bg-secondary",
                  )}
                  onClick={() => navigate(item.view)}
                >
                  {item.label}
                  {item.count ? ` · ${item.count}` : ""}
                </button>
              ))}
              <button
                type="button"
                className={cn(
                  "min-h-10 shrink-0 rounded-lg px-3 text-xs font-medium",
                  focusRing,
                  view.name === "settings"
                    ? "bg-text-primary text-text-inverse"
                    : "text-text-secondary hover:bg-bg-secondary",
                )}
                onClick={() => navigate({ name: "settings" })}
              >
                Settings
              </button>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
            {pageContent()}
          </main>
        </div>
      </div>
      {modal ? <Modal modal={modal} onClose={() => setModal(null)} /> : null}
      <div
        className="pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2"
        aria-live="polite"
      >
        {toast ? (
          <div className="rounded-lg bg-text-primary px-4 py-3 text-sm text-text-inverse shadow-xl">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type NewSubjectDraft = {
  name: string;
  code: string;
  university: string;
  programme: string;
  semester: number;
  description: string;
  chapters: Chapter[];
  materialFiles: File[];
  bankFiles: File[];
};

function CreateSubjectWizard({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (draft: NewSubjectDraft) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [university, setUniversity] = useState("Tribhuvan University");
  const [universityOther, setUniversityOther] = useState("");
  const [programme, setProgramme] = useState("BE Computer (BCT)");
  const [programmeOther, setProgrammeOther] = useState("");
  const [semester, setSemester] = useState("1");
  const [description, setDescription] = useState("");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function readSyllabus(file = syllabusFile) {
    setReading(true);
    setError("");
    try {
      let raw = syllabusText.trim();
      if (!raw && file && /\.(txt|md)$/i.test(file.name)) raw = await file.text();
      let parsed = parseImportedSyllabus(raw);
      if (!parsed.length && file) {
        parsed = [
          {
            id: uid("chapter"),
            name: `Imported from ${file.name.replace(/\.[^.]+$/, "")}`,
            topics: ["Review imported outline", "Confirm topic breakdown"].map((topic) => ({
              id: uid("topic"),
              name: topic,
              level: "not-started" as const,
              testScore: null,
              questionScore: null,
            })),
          },
        ];
      }
      if (!parsed.length) {
        setError("Paste a syllabus or choose a file before reading it.");
        return;
      }
      setChapters(parsed);
    } finally {
      setReading(false);
    }
  }

  function addFiles(current: File[], incoming: File[]) {
    const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    return [
      ...current,
      ...incoming.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`)),
    ];
  }

  const stages = ["What it is", "Syllabus", "Material"];
  return (
    <div>
      <ol className="mb-7 grid grid-cols-3 gap-2" aria-label="Create subject progress">
        {stages.map((label, index) => {
          const stage = (index + 1) as 1 | 2 | 3;
          const complete = step > stage;
          const active = step === stage;
          return (
            <li key={label} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    active || complete
                      ? "border-text-primary bg-text-primary text-text-inverse"
                      : "border-border bg-bg-secondary text-text-muted",
                  )}
                >
                  {complete ? "✓" : stage}
                </span>
                <span
                  className={cn("truncate text-xs", active ? "font-semibold" : "text-text-muted")}
                >
                  {label}
                </span>
              </div>
              {index < stages.length - 1 ? (
                <div className="ml-4 mt-2 h-px bg-border" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-bg-secondary p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <form
          className="space-y-5"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject name">
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Engineering Physics I"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Subject code">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="SH 401"
                autoComplete="off"
              />
            </Field>
            <Field label="University">
              <select
                className={inputClass}
                value={university}
                onChange={(event) => setUniversity(event.target.value)}
              >
                <option>Tribhuvan University</option>
                <option>Pokhara University</option>
                <option>Kathmandu University</option>
                <option>Other</option>
              </select>
            </Field>
            {university === "Other" ? (
              <Field label="University name">
                <input
                  className={inputClass}
                  value={universityOther}
                  onChange={(event) => setUniversityOther(event.target.value)}
                  placeholder="University name"
                  autoComplete="organization"
                  required
                />
              </Field>
            ) : null}
            <Field label="Programme">
              <select
                className={inputClass}
                value={programme}
                onChange={(event) => setProgramme(event.target.value)}
              >
                <option>BE Electronics (BEI)</option>
                <option>BE Computer (BCT)</option>
                <option>BE Civil</option>
                <option>BSc CSIT</option>
                <option>Other</option>
              </select>
            </Field>
            {programme === "Other" ? (
              <Field label="Programme name">
                <input
                  className={inputClass}
                  value={programmeOther}
                  onChange={(event) => setProgrammeOther(event.target.value)}
                  placeholder="Programme name"
                  autoComplete="off"
                  required
                />
              </Field>
            ) : null}
            <Field label="Semester">
              <input
                className={inputClass}
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </Field>
            <Field label="Short description">
              <input
                className={inputClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this subject covers"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Next: syllabus</Button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Upload the university syllabus or paste it below. Review every unit before it becomes
            part of the performance map.
          </p>
          <Field label="Syllabus file" hint="PDF, Word, text, JPG, PNG or WebP.">
            <input
              key={syllabusFile ? `${syllabusFile.name}-${syllabusFile.lastModified}` : "empty"}
              className={cn(inputClass, "py-2")}
              type="file"
              accept={TEACHER_SYLLABUS_FILE_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setSyllabusFile(file);
                if (file) void readSyllabus(file);
              }}
            />
          </Field>
          {syllabusFile ? (
            <div className="mt-3 flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
              <Chip>Syllabus</Chip>
              <span className="min-w-0 flex-1 truncate text-sm">{syllabusFile.name}</span>
              <span className="text-xs text-text-muted">{bytesLabel(syllabusFile)}</span>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                onClick={() => {
                  setSyllabusFile(null);
                  setChapters([]);
                }}
              >
                Remove
              </Button>
            </div>
          ) : null}
          <div className="mt-4">
            <Field
              label="Or paste it"
              hint="Put a unit heading on one line and its topics below it."
            >
              <textarea
                className={cn(inputClass, "min-h-36 py-3")}
                value={syllabusText}
                onChange={(event) => setSyllabusText(event.target.value)}
                placeholder={
                  "Unit 1: Magnetism\nBiot–Savart law, Ampère's law\n\nUnit 2: Induction\nFaraday's law, Lenz's law"
                }
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={reading}
              onClick={() => void readSyllabus()}
            >
              {reading ? "Reading…" : chapters.length ? "Read again" : "Read syllabus"}
            </Button>
            {chapters.length ? (
              <span className="text-sm text-text-secondary">
                {chapters.length} units ·{" "}
                {chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0)} topics found
              </span>
            ) : null}
          </div>
          {chapters.length ? (
            <div className="mt-5 space-y-3 border-t border-border pt-5">
              {chapters.map((chapter, index) => (
                <Card key={chapter.id} className="p-4">
                  <div className="flex items-center gap-2">
                    <Chip>Unit {index + 1}</Chip>
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {chapter.name}
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      onClick={() =>
                        setChapters((current) => current.filter((item) => item.id !== chapter.id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {chapter.topics.map((topic) => (
                      <Chip key={topic.id}>{topic.name}</Chip>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
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
                if ((syllabusFile || syllabusText.trim()) && !chapters.length) {
                  setError("Read the syllabus and review the units, or choose Skip for now.");
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
            Notes and slides become tutor sources. Past papers guide question style and weighting.
            Add what you have now; more can be added later.
          </p>
          <Field
            label="Notes and teaching material"
            hint="PDF, slides, Word, text or images; several at once."
          >
            <input
              className={cn(inputClass, "py-2")}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg"
              onChange={(event) => {
                setMaterialFiles((current) =>
                  addFiles(current, Array.from(event.target.files || [])),
                );
                event.currentTarget.value = "";
              }}
            />
          </Field>
          <FileSelectionList
            label="Notes"
            files={materialFiles}
            onRemove={(index) =>
              setMaterialFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          />
          <div className="mt-5">
            <Field label="Question bank and past papers" hint="PDF or Word; several at once.">
              <input
                className={cn(inputClass, "py-2")}
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                onChange={(event) => {
                  setBankFiles((current) =>
                    addFiles(current, Array.from(event.target.files || [])),
                  );
                  event.currentTarget.value = "";
                }}
              />
            </Field>
          </div>
          <FileSelectionList
            label="Questions"
            files={bankFiles}
            onRemove={(index) =>
              setBankFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          />
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              type="button"
              disabled={submitting}
              aria-busy={submitting}
              onClick={async () => {
                setSubmitting(true);
                setError("");
                try {
                  await onCreate({
                    name: name.trim(),
                    code: code.trim().toUpperCase(),
                    university:
                      university === "Other" ? universityOther.trim() || "Other" : university,
                    programme: programme === "Other" ? programmeOther.trim() || "Other" : programme,
                    semester: Number(semester) || 1,
                    description: description.trim(),
                    chapters,
                    materialFiles,
                    bankFiles,
                  });
                } catch {
                  setError(
                    "The subject could not be prepared. Your selections are still here; try again.",
                  );
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Creating…" : "Create the subject"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileSelectionList({
  label,
  files,
  onRemove,
}: {
  label: string;
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mt-3 divide-y divide-border rounded-lg border border-border">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.lastModified}`}
          className="flex min-h-12 items-center gap-3 px-3 py-2"
        >
          <Chip>{label}</Chip>
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <span className="text-xs text-text-muted">{bytesLabel(file)}</span>
          <Button type="button" size="sm" variant="quiet" onClick={() => onRemove(index)}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function WorkspaceNavButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors",
        focusRing,
        active
          ? "bg-text-primary text-text-inverse"
          : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
      )}
      onClick={onClick}
    >
      <span className="flex-1">{label}</span>
      {count ? <span className="text-xs opacity-65">{count}</span> : null}
    </button>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {count !== undefined ? <span className="text-sm text-text-muted">{count}</span> : null}
      <span className="flex-1" />
      {action}
    </div>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav
      className="mb-5 flex flex-wrap items-center gap-2 text-xs text-text-muted"
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {index ? <span>/</span> : null}
          {item.onClick ? (
            <button
              type="button"
              className={cn("min-h-10 rounded-md px-1 hover:text-text-primary", focusRing)}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ) : (
            <strong className="text-text-secondary">{item.label}</strong>
          )}
        </span>
      ))}
    </nav>
  );
}

function MaterialCard({
  material,
  onOpen,
  onRetry,
}: {
  material: Material;
  onOpen: () => void;
  onRetry: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center">
        <Chip>{material.kind}</Chip>
        <span className="flex-1" />
        <span className="text-xs text-text-muted">{material.size}</span>
      </div>
      <h3 className="mt-4 font-display text-base font-semibold">{material.name}</h3>
      <div className="mt-5 flex items-center gap-2">
        <Chip
          tone={
            material.status === "ready"
              ? "success"
              : material.status === "error"
                ? "danger"
                : "solid"
          }
        >
          {material.status === "ready"
            ? "Ready"
            : material.status === "error"
              ? "Couldn't read"
              : "Ready to process"}
        </Chip>
        {material.status === "error" ? (
          <Button size="sm" variant="quiet" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Open
        </Button>
      </div>
    </Card>
  );
}

function SyllabusReview({
  initialChapters,
  fileName,
  onBack,
  onCommit,
}: {
  initialChapters: Chapter[];
  fileName?: string;
  onBack: () => void;
  onCommit: (chapters: Chapter[]) => void;
}) {
  const [chapters, setChapters] = useState(initialChapters);
  const topicCount = chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0);
  return (
    <div>
      <p className="text-sm leading-6 text-text-secondary">
        Found {chapters.length} units and {topicCount} topics{fileName ? ` in ${fileName}` : ""}.
        Remove anything that is not a real syllabus unit before adding it.
      </p>
      <div className="mt-4 space-y-3">
        {chapters.map((chapter, index) => (
          <Card key={chapter.id} className="p-4">
            <div className="flex items-center gap-2">
              <Chip>Unit {index + 1}</Chip>
              <h3 className="min-w-0 flex-1 truncate font-display font-semibold">{chapter.name}</h3>
              <Button
                size="sm"
                variant="quiet"
                onClick={() =>
                  setChapters((items) => items.filter((item) => item.id !== chapter.id))
                }
              >
                Remove
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {chapter.topics.length ? (
                chapter.topics.map((topic) => <Chip key={topic.id}>{topic.name}</Chip>)
              ) : (
                <span className="text-sm text-text-muted">No topics under this unit.</span>
              )}
            </div>
          </Card>
        ))}
      </div>
      {!chapters.length ? (
        <EmptyState title="All units removed" body="Go back and read another outline." />
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!chapters.length} onClick={() => onCommit(chapters)}>
          Add {chapters.length} unit{chapters.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function TopicDetail({
  topic,
  students,
  source,
  onStudent,
}: {
  topic: Topic;
  students: Student[];
  source: "tests" | "questions";
  onStudent: (student: Student) => void;
}) {
  const value = source === "tests" ? topic.testScore : topic.questionScore;
  const scoredStudents = students
    .map((student) => ({ student, score: studentTopicScore(student, topic, source) }))
    .filter((row): row is { student: Student; score: number } => row.score !== null)
    .sort((a, b) => a.score - b.score);
  const strugglingStudents = scoredStudents.filter((row) => row.score < 0.4);
  const studentsToShow = (strugglingStudents.length ? strugglingStudents : scoredStudents).slice(
    0,
    6,
  );
  return (
    <>
      <div className="flex items-center gap-3">
        <KnowledgeDot level={topic.level} />
        <h3 className="font-display text-lg font-semibold">{topic.name}</h3>
      </div>
      <p className="mt-3 text-sm text-text-secondary">
        {source === "tests" ? "Class-test signal" : "Tutor-question signal"} · {percent(value)}
      </p>
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
          Students to check
        </p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">
          {strugglingStudents.length
            ? `${strugglingStudents.length} of ${scoredStudents.length} students are struggling with this topic.`
            : scoredStudents.length
              ? "Nobody is currently struggling with this topic."
              : "No student has a topic score yet."}
        </p>
        <div className="mt-2 space-y-1">
          {studentsToShow.map(({ student, score }) => (
            <button
              key={student.id}
              type="button"
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-bg-secondary",
                focusRing,
              )}
              onClick={() => onStudent(student)}
            >
              <KnowledgeDot level={levelForScore(score)} />
              <span className="min-w-0 flex-1 truncate text-sm">{student.name}</span>
              <span className="text-xs text-text-muted">{percent(score)}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function TestTutor({
  subject,
  onChange,
}: {
  subject: Subject;
  onChange: (messages: NonNullable<Subject["testChat"]>) => void;
}) {
  const [messages, setMessages] = useState<
    { from: "teacher" | "tutor"; text: string; sources?: string[] }[]
  >(subject.testChat || []);
  const [question, setQuestion] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean) return;
    const topic = subject.chapters
      .flatMap((chapter) => chapter.topics)
      .find((item) => clean.toLowerCase().includes(item.name.toLowerCase().split(" ")[0]));
    const source = subject.materials.find((item) => item.status === "ready");
    setMessages((current) => {
      const next: NonNullable<Subject["testChat"]> = [
        ...current,
        { from: "teacher", text: clean },
        {
          from: "tutor",
          text: `Draft answer for ${titleCase(subject.name)}: ${topic ? `start with ${topic.name}, state the governing idea, then show the method step by step.` : "state the key idea first, then show one worked step."}${source ? ` Source preview: ${source.name}.` : " Add material before enabling this for students."}`,
          sources: source ? [`${source.name} · ${source.kind}`] : [subject.name],
        },
      ];
      onChange(next);
      return next;
    });
    setQuestion("");
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="flex items-start gap-4 bg-bg-secondary p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">Test the tutor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Ask as a student. This private preview never appears in student chat.
          </p>
        </div>
        {messages.length ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMessages([]);
              onChange([]);
            }}
          >
            Clear chat
          </Button>
        ) : null}
      </Card>
      <div className="min-h-72 space-y-3 py-5">
        {messages.length ? (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[85%] rounded-xl border p-4 text-sm leading-6",
                message.from === "teacher"
                  ? "ml-auto border-text-primary bg-text-primary text-text-inverse"
                  : "border-border bg-bg-primary",
              )}
            >
              <p>{message.text}</p>
              {message.sources?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.sources.map((source) => (
                    <Chip key={source}>{source}</Chip>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState
            title="Try a student question"
            body="Test clarity and source coverage before the tutor reaches a classroom."
          />
        )}
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {(subject.chapters
          .flatMap((chapter) => chapter.topics)
          .slice(0, 3)
          .map((topic) => `Explain ${topic.name.toLowerCase()} simply`).length
          ? subject.chapters
              .flatMap((chapter) => chapter.topics)
              .slice(0, 3)
              .map((topic) => `Explain ${topic.name.toLowerCase()} simply`)
          : ["What should a student learn first?"]
        ).map((suggestion) => (
          <Button
            key={suggestion}
            size="sm"
            variant="secondary"
            onClick={() => setQuestion(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Test tutor question</span>
          <input
            className={inputClass}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question as a student…"
          />
        </label>
        <Button type="submit" disabled={!question.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function SamplePaper() {
  return (
    <div className="absolute inset-0 p-8 text-[#182754]">
      <div className="border-b border-[#d8d2c5] pb-4 font-serif text-xl">
        Engineering Physics I — Midterm
      </div>
      {Array.from({ length: 14 }, (_, index) => (
        <div key={index} className="relative mt-7 h-px bg-[#e7e1d4]">
          <span className="absolute -top-4 left-4 font-serif text-sm italic opacity-80">
            {index % 4 === 0
              ? `${Math.floor(index / 4) + 1}. The governing law gives the required direction and magnitude...`
              : index % 3 === 0
                ? "Substituting the values in the equation,"
                : "therefore the final result follows with the correct unit."}
          </span>
        </div>
      ))}
    </div>
  );
}

function TeacherWorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-bg-secondary p-5">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[256px_1fr]">
        <div className="hidden min-h-[90vh] animate-pulse rounded-xl bg-bg-tertiary lg:block" />
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-xl bg-bg-tertiary" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-bg-tertiary" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-bg-tertiary" />
        </div>
      </div>
    </div>
  );
}
