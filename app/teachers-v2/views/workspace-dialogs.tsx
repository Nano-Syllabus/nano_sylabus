"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isTeacherSyllabusFileSupported, TEACHER_MATERIAL_FILE_ACCEPT, TEACHER_SYLLABUS_FILE_ACCEPT, TEACHER_UPLOAD_MAX_LABEL, teacherUploadSizeError } from "@/lib/teacher-upload";
import { cn, titleCase } from "@/lib/utils";
import {
  ApiRecord,
  WorkspaceState,
  Shelf,
  TeacherSubject,
  TeacherDocument,
  Workspace,
  TeacherDashboard,
  SyllabusUnit,
  interactive,
  asRecord,
  text,
  numberValue,
  list,
  ResponseError,
  responsePayload,
  DriveImportQueue,
  SkeletonBlock,
} from "@/app/teachers-v2/workspace-shared";
import {
  knownDriveFolderSupport,
  rememberDriveFolderSupport,
  SubjectCreationResult,
  inputClass,
  byteSizeLabel,
  fileSizeLabel,
  selectedFilesTitle,
  selectedFilesHint,
  uploadShelfLabel,
  parseSyllabusOutline,
  uploadTeacherDocument,
  DriveCandidate,
  resolveDriveLink,
  enqueueDriveImports,
  Dialog,
  StatusChip,
} from "@/app/teachers-v2/views/workspace-view-shared";

export function CreateClassroomDialog({
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

export function CreateSubjectDialog({
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
  /**
   * A Drive folder, collected here and imported after the subject exists.
   *
   * It cannot be resolved at this step: `drive-resolve` runs
   * `validateDestination` against the shelf it would land on, and this subject's
   * shelves are created by `createSubject` a moment from now. So the wizard
   * writes the link down and the import happens on the far side of creation —
   * which is also the gesture the upload dialog already makes, where queueing
   * hands the work to a drain worker and lets the creator go.
   */
  const [driveLink, setDriveLink] = useState("");
  const [driveShelf, setDriveShelf] = useState<"Notes" | "Question Bank">("Notes");
  /** Kept apart from `error`: the subject WAS created, so this is not a failure
   *  of the wizard and must not read like one. */
  const [driveError, setDriveError] = useState("");
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0, shelf: "" });
  /**
   * True once nothing further is needed FROM THIS PAGE.
   *
   * Only the browser-side uploads need it: those bytes live in this tab and no
   * server can fetch them. Indexing, and the whole Drive import, run on our side
   * — so holding the creator here for those is asking them to watch a progress
   * bar for work their machine is not doing. See the notice below.
   */
  const [detachable, setDetachable] = useState(false);
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
      // A run with no browser-side file (Drive-only, or a pasted syllabus) never
      // needed this page in the first place.
      setDetachable(uploads.length === 0);
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
      // Every byte that had to leave this tab has left it. Whatever remains —
      // indexing, and the Drive queue below — is ours.
      setDetachable(true);
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
      // The Drive folder, now that the shelf it lands on exists. Queued, not
      // awaited to completion: a drain worker does the fetching, and a folder of
      // twenty files must not hold this dialog open. A link that cannot be read
      // is reported without losing the subject — it is already created, and its
      // files are already uploaded.
      const pastedLink = driveLink.trim();
      if (pastedLink) {
        setProgress("Queueing the Google Drive folder…");
        const shelfPath = `${folderPath}/${driveShelf}`;
        try {
          const resolved = await resolveDriveLink(pastedLink, shelfPath);
          const importable = resolved.filter((file) => file.supported && !file.tooLarge);
          if (!importable.length) {
            setDriveError(
              resolved.length
                ? `The subject was created, but none of the ${resolved.length} file(s) at that Drive link can go on the ${driveShelf} shelf.`
                : "The subject was created, but that Drive link did not resolve to any file.",
            );
          } else {
            await enqueueDriveImports(importable, shelfPath, pastedLink);
            setDriveLink("");
          }
        } catch (caught) {
          setDriveError(
            `The subject was created, but the Drive link could not be read: ${
              caught instanceof Error ? caught.message : "unknown error"
            }`,
          );
        }
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
    // Closable mid-run, on purpose. Dismissing the dialog does not cancel
    // anything: the upload loop is an ordinary async function that keeps running
    // in this tab, and the subject, its shelves and its Drive queue are already
    // server-side records. Refusing the close taught creators that the work was
    // theirs to babysit, which it is not.
    <Dialog title="Add a subject" onClose={onClose}>
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
          {/* ── Google Drive ──────────────────────────────────────────────
              A creator whose material already lives in Drive should not have to
              download twenty files to upload them again. The link is collected
              here and imported once the shelves exist; see `driveLink`. */}
          <div className="mt-5 rounded-lg border border-border bg-bg-secondary p-4">
            <label htmlFor="subject-drive-link" className="font-display text-sm font-semibold">
              Or import from a Google Drive folder
            </label>
            <p className="mt-1 text-sm text-text-muted">
              Paste a shared link. Anyone with the link must be able to view it. The files are
              fetched on our side after the subject is created — you do not have to stay on
              this page for them.
            </p>
            <input
              id="subject-drive-link"
              type="url"
              inputMode="url"
              value={driveLink}
              onChange={(event) => {
                setDriveLink(event.target.value);
                setDriveError("");
              }}
              placeholder="https://drive.google.com/drive/folders/…"
              className="mt-3 min-h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            />
            {driveLink.trim() ? (
              <fieldset className="mt-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Put these on
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["Notes", "Question Bank"] as const).map((shelf) => (
                    <label
                      key={shelf}
                      className={cn(
                        "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
                        driveShelf === shelf
                          ? "border-text-primary bg-bg-primary"
                          : "border-border hover:bg-bg-primary",
                      )}
                    >
                      <input
                        type="radio"
                        name="subject-drive-shelf"
                        value={shelf}
                        checked={driveShelf === shelf}
                        onChange={() => setDriveShelf(shelf)}
                        className="sr-only"
                      />
                      {shelf}
                    </label>
                  ))}
                </div>
                {/* The shelf decides which file types are accepted, so saying it
                    here is cheaper than a rejection after the fact. */}
                <p className="mt-2 text-xs text-text-muted">
                  {driveShelf === "Notes"
                    ? "PDF, Word, PowerPoint, text, or image files."
                    : "PDF, Word, Markdown, or plain-text files."}
                </p>
              </fieldset>
            ) : null}
            {driveError ? (
              <p role="alert" className="mt-3 whitespace-pre-line text-sm text-red-500">
                {driveError}
              </p>
            ) : null}
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
              {/* What is actually safe to do, stated plainly and truthfully.
                  The two cases are genuinely different: bytes still in this tab
                  can only be sent by this tab, while indexing and the Drive queue
                  are server-side and need nothing from the creator. */}
              <p className="mt-3 border-t border-border pt-3 text-sm text-text-secondary">
                {detachable ? (
                  <>
                    <span className="font-medium text-text-primary">
                      You can close this page.
                    </span>{" "}
                    Indexing{driveLink.trim() ? " and the Drive import" : ""} finishes on our
                    side — it will be waiting in the subject when you come back.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-text-primary">
                      Keep this tab open until the files finish uploading
                    </span>{" "}
                    — they are being sent from this device. You can close this dialog; it
                    does not stop them.
                  </>
                )}
              </p>
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
                  : driveLink.trim()
                    ? "Create subject · import from Drive"
                    : "Create the subject"}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function SelectedFileRows({
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

export function CreateFolderDialog({
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

export function UploadDialog({
  subject,
  shelf,
  onClose,
  onUploaded,
  onQueueSettled,
}: {
  subject: TeacherSubject;
  shelf: Shelf;
  onClose: () => void;
  onUploaded: (result: {
    message: string;
    jobs: Array<{ jobId: string; fileName: string }>;
  }) => void;
  /** Called when a background import lands, so the shelf can pick it up. */
  onQueueSettled?: () => void;
}) {
  const [source, setSource] = useState<"files" | "drive">("files");
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveCandidate[]>([]);
  const [resolving, setResolving] = useState(false);
  const [folderSupport, setFolderSupport] = useState<boolean | null>(knownDriveFolderSupport());
  const shelfRoot = `${subject.folderPath}/${shelf}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0 });
  /** How many files this dialog has handed to the queue. Non-zero switches the
   *  footer from "Cancel / Queue" to "Done", because the work is already away. */
  const [queuedCount, setQueuedCount] = useState(0);
  const completedJobs = useRef<Array<{ jobId: string; fileName: string }>>([]);
  const accept = shelf === "Syllabus" ? TEACHER_SYLLABUS_FILE_ACCEPT : TEACHER_MATERIAL_FILE_ACCEPT;
  // A file that cannot be read by this shelf, or is over the ceiling, is shown
  // in the list and skipped — telling the creator WHICH of twenty files was left
  // out is the whole point of resolving before importing.
  const importable = driveFiles.filter((file) => file.supported && !file.tooLarge);
  const pending = source === "files" ? files.length : importable.length;

  /** One item's worth of work, whichever source it came from. */
  type Job = { name: string; run: () => Promise<ApiRecord> };

  async function runJobs(jobs: Job[], verb: string) {
    setBusy(true);
    setError("");
    setUploadStatus({ current: 0, total: jobs.length });
    const failed: Array<{ name: string; error: string }> = [];
    const warnings: string[] = [];

    for (const [index, job] of jobs.entries()) {
      setUploadStatus({ current: index + 1, total: jobs.length });
      try {
        const payload = await job.run();
        completedJobs.current.push({ jobId: text(payload.jobId), fileName: job.name });
        const warning = text(payload.previewWarning);
        if (warning) warnings.push(`${job.name}: ${warning}`);
      } catch (caught) {
        failed.push({
          name: job.name,
          error: caught instanceof Error ? caught.message : `Could not ${verb} this file.`,
        });
      }
    }
    return { failed, warnings };
  }

  function reportFailures(
    failed: Array<{ name: string; error: string }>,
    keep: () => void,
    verb: string,
  ) {
    keep();
    setError(
      `${failed.length} file${failed.length === 1 ? "" : "s"} could not be ${verb}:\n${failed
        .map((item) => `${item.name}: ${item.error}`)
        .join(
          "\n",
        )}\n\nSuccessful files are already indexing. Retry to ${verb === "uploaded" ? "upload" : "import"} only the files listed here.`,
    );
    setBusy(false);
    setUploadStatus({ current: 0, total: 0 });
  }

  function finish(warnings: string[], verb: string) {
    const count = completedJobs.current.length;
    onUploaded({
      message: warnings.length
        ? warnings.join("\n")
        : `${count} file${count === 1 ? "" : "s"} ${verb} and indexing started`,
      jobs: completedJobs.current,
    });
  }

  async function checkLink() {
    const pasted = link.trim();
    if (!pasted) {
      setError("Paste a Google Drive link first.");
      return;
    }
    setResolving(true);
    setError("");
    setDriveFiles([]);
    try {
      const resolved = await resolveDriveLink(pasted, shelfRoot);
      setFolderSupport(knownDriveFolderSupport());
      setDriveFiles(resolved);
      const skipped = resolved.filter((file) => !file.supported || file.tooLarge);
      if (skipped.length) {
        setError(
          `${skipped.length} file${skipped.length === 1 ? "" : "s"} will be skipped:\n${skipped
            .map(
              (file) =>
                `${file.name}: ${file.tooLarge ? `larger than ${TEACHER_UPLOAD_MAX_LABEL}` : `${shelf} cannot read this type`}`,
            )
            .join("\n")}`,
        );
      }
    } catch (caught) {
      // A folder link refused for want of a key is itself the answer to "can
      // this deployment read folders", so the hint stops offering it.
      if (caught instanceof ResponseError && caught.code === "unsupported") {
        rememberDriveFolderSupport(false);
        setFolderSupport(false);
      }
      setError(caught instanceof Error ? caught.message : "That link could not be read.");
    } finally {
      setResolving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (source === "drive") {
      // A link the creator typed but never checked should import, not scold.
      if (!driveFiles.length) {
        await checkLink();
        return;
      }
      if (!importable.length) {
        // "cannot be added to this shelf" reads as a file-TYPE problem, and for a
        // single oversize PDF that is simply the wrong explanation.
        const oversize = driveFiles.filter((file) => file.tooLarge).length;
        const wrongType = driveFiles.filter((file) => !file.supported).length;
        setError(
          oversize && !wrongType
            ? `${oversize === 1 ? "That file is" : `All ${oversize} files are`} larger than ${TEACHER_UPLOAD_MAX_LABEL}, which is the most this portal accepts.`
            : "None of the files at that link can be added to this shelf.",
        );
        return;
      }
      /**
       * Queue and go.
       *
       * The dialog's job ends here: the files are written down server-side and
       * the importing happens behind this call. It used to sit on a per-file
       * loop with the dialog locked open, which meant a twenty-file folder held
       * the creator hostage and a closed lid lost the remainder.
       */
      setBusy(true);
      setError("");
      try {
        const count = await enqueueDriveImports(importable, shelfRoot, link.trim());
        /**
         * The dialog stays OPEN, and shows the queue.
         *
         * Closing it on success would have been the obvious move, and it is the
         * wrong one: the creator has just handed over twenty files and the only
         * thing they want to know is which of them worked. `onUploaded` closes
         * this dialog, so it is not called — the queue panel below is the
         * report, and Done dismisses it once they have read it.
         */
        setQueuedCount((current) => current + count);
        setDriveFiles([]);
        setLink("");
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Those files could not be queued for import.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!files.length) {
      setError("Choose one or more files first.");
      return;
    }
    const { failed, warnings } = await runJobs(
      files.map((file) => ({ name: file.name, run: () => uploadTeacherDocument(file, shelfRoot) })),
      "upload",
    );
    if (failed.length) {
      const names = new Set(failed.map((item) => item.name));
      reportFailures(
        failed,
        () => setFiles(files.filter((file) => names.has(file.name))),
        "uploaded",
      );
      return;
    }
    finish(warnings, "uploaded");
  }

  return (
    <Dialog title={`Upload to ${shelf}`} onClose={onClose} closeDisabled={busy}>
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <p className="font-medium">{titleCase(subject.name)}</p>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">
          {subject.folderPath}/{shelf}
        </p>
      </div>
      <div
        className="mt-5 flex gap-1 rounded-lg border border-border bg-bg-secondary p-1"
        role="tablist"
      >
        {(
          [
            ["files", "Choose files"],
            ["drive", "Google Drive link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={source === value}
            disabled={busy}
            onClick={() => {
              setSource(value);
              setError("");
            }}
            className={cn(
              "min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              source === value
                ? "bg-bg-primary text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <form className="mt-5" onSubmit={submit}>
        <div className={source === "drive" ? undefined : "hidden"}>
          <label htmlFor="teacher-upload-link" className="block text-sm font-medium">
            Paste a Drive link
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="teacher-upload-link"
              type="url"
              inputMode="url"
              placeholder="https://drive.google.com/file/d/…"
              value={link}
              disabled={busy}
              className={cn(inputClass, "min-w-0 flex-1")}
              onChange={(event) => {
                setLink(event.target.value);
                setDriveFiles([]);
                setError("");
              }}
              aria-describedby="teacher-upload-link-hint"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void checkLink()}
              disabled={busy || resolving || !link.trim()}
              aria-busy={resolving}
            >
              {resolving ? "Checking…" : "Check link"}
            </Button>
          </div>
          <p id="teacher-upload-link-hint" className="mt-2 text-xs text-text-muted">
            The file must be shared as{" "}
            <strong className="font-medium text-text-secondary">Anyone with the link</strong> — open
            it in Drive, press Share, and set General access.{" "}
            {folderSupport === true
              ? "A folder link adds every document inside it. "
              : folderSupport === false
                ? "Link one file at a time — folder links need a Drive API key this deployment does not have. "
                : ""}
            Google Docs and Slides are converted to PDF, Sheets to CSV.
          </p>
          <DriveImportQueue onSettled={onQueueSettled} />
          {driveFiles.length ? (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-secondary/70">
              {driveFiles.map((file) => {
                const skipped = !file.supported || file.tooLarge;
                return (
                  <div
                    key={file.id}
                    className="flex min-h-12 items-center gap-3 bg-bg-primary px-3 py-2"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                        skipped
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-success/15 text-success",
                      )}
                      aria-hidden="true"
                    >
                      {skipped ? "!" : "✓"}
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                      {shelf}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {file.name || "Drive file"}
                    </span>
                    <span className="text-xs text-text-muted">
                      {skipped ? "Skipped" : byteSizeLabel(file.sizeBytes)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className={source === "files" ? undefined : "hidden"}>
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
            Each file uploads to the teacher collection, queues indexing, and keeps a private
            preview copy. Maximum size per file: {TEACHER_UPLOAD_MAX_LABEL}.
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
        </div>
        {busy && source === "files" && uploadStatus.total ? (
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
            {queuedCount ? "Done" : "Cancel"}
          </Button>
          <Button
            type="submit"
            disabled={busy || resolving || (source === "files" ? !files.length : !link.trim())}
            aria-busy={busy}
          >
            {busy
              ? source === "drive"
                ? "Queueing…"
                : `Uploading ${uploadStatus.current} of ${uploadStatus.total}…`
              : source === "drive"
                ? pending
                  ? `Queue ${pending} file${pending === 1 ? "" : "s"} for import`
                  : queuedCount
                    ? "Queue another link"
                    : "Check link"
                : pending
                  ? `Upload ${pending} file${pending === 1 ? "" : "s"} and index`
                  : "Upload files and index"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DocumentDialog({
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
    void fetch(
      `/api/teacher/documents/${encodeURIComponent(document.id)}?path=${encodeURIComponent(document.path)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    )
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
  }, [document.id, document.path]);

  async function reindex() {
    setBusyAction("reindex");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/documents/${encodeURIComponent(document.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ path: document.path }),
        }),
      );
      onChanged(
        `${document.name} queued for ${document.status === "ready" ? "re-indexing" : "indexing"}`,
        text(payload.jobId),
        document.name,
      );
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
              {busyAction === "reindex"
                ? "Queueing…"
                : document.status === "ready"
                  ? "Re-index"
                  : document.status === "error"
                    ? "Retry indexing"
                    : "Index now"}
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

export function CollectionOverviewDialog({
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

export function SourceTree({ tree }: { tree: ApiRecord }) {
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
