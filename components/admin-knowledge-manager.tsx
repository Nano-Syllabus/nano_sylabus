"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type {
  AdminKnowledgeDocumentSummary,
  AdminKnowledgeNotebookDetail,
  AdminKnowledgeNotebookSummary,
  KnowledgeDocumentType,
  KnowledgeResourceKind,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const RESOURCE_KINDS: Array<{ value: KnowledgeResourceKind; label: string }> = [
  { value: "syllabus", label: "Syllabus" },
  { value: "study_material", label: "Study material" },
  { value: "question_bank", label: "Question bank" },
];

const RESOURCE_SUBTYPES: Record<KnowledgeResourceKind, Array<{ value: KnowledgeDocumentType; label: string }>> = {
  syllabus: [
    { value: "curriculum", label: "Curriculum" },
    { value: "syllabus", label: "Syllabus" },
    { value: "micro_syllabus", label: "Micro-syllabus" },
    { value: "learning_outcomes", label: "Learning outcomes" },
  ],
  study_material: [
    { value: "textbook", label: "Textbook" },
    { value: "notes", label: "Notes" },
    { value: "solutions", label: "Solutions" },
    { value: "guides", label: "Guides" },
    { value: "other", label: "Other" },
  ],
  question_bank: [
    { value: "question_bank", label: "Question bank" },
    { value: "past_questions", label: "Past questions" },
    { value: "example_questions", label: "Example questions" },
    { value: "other", label: "Other" },
  ],
};

type NotebookFormState = {
  title: string;
  board: string;
  level: string;
  faculty: string;
  subject: string;
  curriculum: string;
  description: string;
};

type ResourceFormState = {
  resourceKind: KnowledgeResourceKind;
  resourceSubtype: KnowledgeDocumentType;
  title: string;
  chapter: string;
  sourceName: string;
  sourceType: string;
  rawContent: string;
};

const EMPTY_NOTEBOOK: NotebookFormState = {
  title: "",
  board: "NEB",
  level: "Class 11",
  faculty: "",
  subject: "",
  curriculum: "",
  description: "",
};

const EMPTY_RESOURCE: ResourceFormState = {
  resourceKind: "study_material",
  resourceSubtype: "textbook",
  title: "",
  chapter: "",
  sourceName: "",
  sourceType: "manual_text",
  rawContent: "",
};

function toNotebookFormState(notebook: AdminKnowledgeNotebookDetail): NotebookFormState {
  return {
    title: notebook.title,
    board: notebook.board,
    level: notebook.level,
    faculty: notebook.faculty,
    subject: notebook.subject,
    curriculum: notebook.curriculum,
    description: notebook.description,
  };
}

function toResourceFormState(resource: AdminKnowledgeDocumentSummary): ResourceFormState {
  return {
    resourceKind: resource.resourceKind,
    resourceSubtype: resource.resourceSubtype,
    title: resource.title,
    chapter: resource.chapter ?? "",
    sourceName: resource.sourceName,
    sourceType: resource.sourceType,
    rawContent: resource.rawContent,
  };
}

export function AdminKnowledgeManager({
  initialNotebooks,
}: {
  initialNotebooks: AdminKnowledgeNotebookSummary[];
}) {
  const [notebooks, setNotebooks] = useState(initialNotebooks);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>(initialNotebooks[0]?.id ?? "new");
  const [notebookDetail, setNotebookDetail] = useState<AdminKnowledgeNotebookDetail | null>(null);
  const [notebookForm, setNotebookForm] = useState<NotebookFormState>(EMPTY_NOTEBOOK);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("new");
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(EMPTY_RESOURCE);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    "idle" | "loading" | "savingNotebook" | "deletingNotebook" | "savingResource" | "processing" | "deletingResource" | "uploading"
  >("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAutoProcess, setUploadAutoProcess] = useState(true);

  const filteredNotebooks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notebooks;
    return notebooks.filter((notebook) =>
      [notebook.title, notebook.board, notebook.level, notebook.faculty, notebook.subject, notebook.curriculum]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [notebooks, query]);

  const selectedResource =
    selectedResourceId === "new"
      ? null
      : notebookDetail?.resources.find((resource) => resource.id === selectedResourceId) ?? null;

  useEffect(() => {
    let ignore = false;

    async function loadNotebook(notebookId: string) {
      if (notebookId === "new") {
        setNotebookDetail(null);
        setNotebookForm(EMPTY_NOTEBOOK);
        setSelectedResourceId("new");
        setResourceForm(EMPTY_RESOURCE);
        return;
      }

      setBusy("loading");
      setFeedback(null);
      try {
        const response = await fetch(`/api/admin/notebooks/${notebookId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load notebook.");
        }
        if (ignore) return;
        const notebook = payload.notebook as AdminKnowledgeNotebookDetail;
        setNotebookDetail(notebook);
        setNotebookForm(toNotebookFormState(notebook));
        const firstResource = notebook.resources[0] ?? null;
        setSelectedResourceId(firstResource?.id ?? "new");
        setResourceForm(firstResource ? toResourceFormState(firstResource) : EMPTY_RESOURCE);
      } catch (error) {
        if (!ignore) {
          setFeedback(error instanceof Error ? error.message : "Failed to load notebook.");
        }
      } finally {
        if (!ignore) setBusy("idle");
      }
    }

    void loadNotebook(selectedNotebookId);

    return () => {
      ignore = true;
    };
  }, [selectedNotebookId]);

  useEffect(() => {
    if (!notebookDetail) return;
    if (selectedResourceId === "new") return;
    const resource = notebookDetail.resources.find((item) => item.id === selectedResourceId);
    if (!resource) {
      setSelectedResourceId("new");
      setResourceForm(EMPTY_RESOURCE);
      return;
    }
    setResourceForm(toResourceFormState(resource));
  }, [notebookDetail, selectedResourceId]);

  function updateNotebook<K extends keyof NotebookFormState>(key: K, value: NotebookFormState[K]) {
    setNotebookForm((current) => ({ ...current, [key]: value }));
  }

  function updateResource<K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) {
    setResourceForm((current) => ({ ...current, [key]: value }));
  }

  function resetNotebook() {
    setSelectedNotebookId("new");
    setNotebookDetail(null);
    setNotebookForm(EMPTY_NOTEBOOK);
    setSelectedResourceId("new");
    setResourceForm(EMPTY_RESOURCE);
    setUploadFile(null);
    setFeedback(null);
  }

  function startNewResource() {
    setSelectedResourceId("new");
    setResourceForm(EMPTY_RESOURCE);
    setUploadFile(null);
    setFeedback(null);
  }

  function handleResourceKindChange(nextKind: KnowledgeResourceKind) {
    const fallbackSubtype = RESOURCE_SUBTYPES[nextKind][0]?.value ?? "other";
    setResourceForm((current) => ({
      ...current,
      resourceKind: nextKind,
      resourceSubtype: RESOURCE_SUBTYPES[nextKind].some((option) => option.value === current.resourceSubtype)
        ? current.resourceSubtype
        : fallbackSubtype,
    }));
  }

  async function refreshNotebooks(nextNotebookId?: string) {
    const response = await fetch("/api/admin/notebooks");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh notebooks.");
    }

    setNotebooks(payload.notebooks);
    if (nextNotebookId) {
      setSelectedNotebookId(nextNotebookId);
    } else if (!payload.notebooks.some((notebook: AdminKnowledgeNotebookSummary) => notebook.id === selectedNotebookId)) {
      setSelectedNotebookId(payload.notebooks[0]?.id ?? "new");
    }
  }

  async function refreshNotebookDetail(notebookId: string) {
    const response = await fetch(`/api/admin/notebooks/${notebookId}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh notebook detail.");
    }
    const notebook = payload.notebook as AdminKnowledgeNotebookDetail;
    setNotebookDetail(notebook);
    setNotebookForm(toNotebookFormState(notebook));
    return notebook;
  }

  async function saveNotebook() {
    setBusy("savingNotebook");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedNotebookId === "new" ? "/api/admin/notebooks" : `/api/admin/notebooks/${selectedNotebookId}`,
        {
          method: selectedNotebookId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notebookForm),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save notebook.");
      }
      const notebook = payload.notebook as AdminKnowledgeNotebookDetail;
      await refreshNotebooks(notebook.id);
      setNotebookDetail(notebook);
      setNotebookForm(toNotebookFormState(notebook));
      setFeedback(selectedNotebookId === "new" ? "Notebook created." : "Notebook updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save notebook.");
    } finally {
      setBusy("idle");
    }
  }

  async function deleteNotebook() {
    if (!notebookDetail) return;
    const confirmed = window.confirm(`Delete notebook "${notebookDetail.title}" and all its resources?`);
    if (!confirmed) return;

    setBusy("deletingNotebook");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/notebooks/${notebookDetail.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete notebook.");
      }
      await refreshNotebooks();
      resetNotebook();
      setFeedback("Notebook deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete notebook.");
    } finally {
      setBusy("idle");
    }
  }

  async function saveResource() {
    if (!notebookDetail && selectedNotebookId === "new") {
      setFeedback("Create the notebook first, then add resources under it.");
      return;
    }

    const notebookId = notebookDetail?.id ?? selectedNotebookId;
    setBusy("savingResource");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedResourceId === "new"
          ? "/api/admin/knowledge-documents"
          : `/api/admin/knowledge-documents/${selectedResourceId}`,
        {
          method: selectedResourceId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notebookId,
            board: notebookForm.board,
            grade: notebookForm.level,
            faculty: notebookForm.faculty,
            curriculum: notebookForm.curriculum,
            subject: notebookForm.subject,
            chapter: resourceForm.chapter.trim() || null,
            resourceKind: resourceForm.resourceKind,
            resourceSubtype: resourceForm.resourceSubtype,
            title: resourceForm.title,
            sourceName: resourceForm.sourceName,
            sourceType: resourceForm.sourceType,
            rawContent: resourceForm.rawContent,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save resource.");
      }

      await refreshNotebooks(notebookId);
      const notebook = await refreshNotebookDetail(notebookId);
      const savedResource = notebook.resources.find((resource) => resource.id === payload.document.id) ?? null;
      setSelectedResourceId(savedResource?.id ?? "new");
      setResourceForm(savedResource ? toResourceFormState(savedResource) : EMPTY_RESOURCE);
      setFeedback(selectedResourceId === "new" ? "Resource created." : "Resource updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save resource.");
    } finally {
      setBusy("idle");
    }
  }

  async function processResource() {
    if (!selectedResource) return;
    setBusy("processing");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${selectedResource.id}/process`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to process resource.");
      }
      await refreshNotebooks(selectedNotebookId);
      const notebook = await refreshNotebookDetail(selectedNotebookId);
      const refreshedResource = notebook.resources.find((resource) => resource.id === selectedResource.id) ?? null;
      setSelectedResourceId(refreshedResource?.id ?? "new");
      setResourceForm(refreshedResource ? toResourceFormState(refreshedResource) : EMPTY_RESOURCE);
      setFeedback(`Processed successfully. ${payload.document.chunkCount} chunks ready.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to process resource.");
    } finally {
      setBusy("idle");
    }
  }

  async function deleteResource() {
    if (!selectedResource) return;
    const confirmed = window.confirm(`Delete resource "${selectedResource.title}"? This also removes its chunks.`);
    if (!confirmed) return;

    setBusy("deletingResource");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${selectedResource.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete resource.");
      }

      await refreshNotebooks(selectedNotebookId);
      const notebook = await refreshNotebookDetail(selectedNotebookId);
      const firstResource = notebook.resources[0] ?? null;
      setSelectedResourceId(firstResource?.id ?? "new");
      setResourceForm(firstResource ? toResourceFormState(firstResource) : EMPTY_RESOURCE);
      setFeedback("Resource deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete resource.");
    } finally {
      setBusy("idle");
    }
  }

  async function uploadResourceFile() {
    if (!uploadFile) {
      setFeedback("Choose a file to upload first.");
      return;
    }
    if (!notebookDetail && selectedNotebookId === "new") {
      setFeedback("Create the notebook first, then upload resources into it.");
      return;
    }

    const notebookId = notebookDetail?.id ?? selectedNotebookId;
    setBusy("uploading");
    setFeedback(null);
    try {
      const payload = new FormData();
      payload.set("file", uploadFile);
      payload.set("documentId", selectedResource?.id ?? "new");
      payload.set("notebookId", notebookId);
      payload.set("board", notebookForm.board);
      payload.set("grade", notebookForm.level);
      payload.set("faculty", notebookForm.faculty);
      payload.set("curriculum", notebookForm.curriculum);
      payload.set("subject", notebookForm.subject);
      payload.set("chapter", resourceForm.chapter);
      payload.set("title", resourceForm.title);
      payload.set("sourceName", resourceForm.sourceName);
      payload.set("resourceKind", resourceForm.resourceKind);
      payload.set("resourceSubtype", resourceForm.resourceSubtype);
      payload.set("autoProcess", uploadAutoProcess ? "true" : "false");

      const response = await fetch("/api/admin/knowledge-documents/upload", {
        method: "POST",
        body: payload,
      });
      const uploadResult = await response.json();
      if (!response.ok) {
        throw new Error(uploadResult.error || "Failed to upload resource file.");
      }

      await refreshNotebooks(notebookId);
      const notebook = await refreshNotebookDetail(notebookId);
      const savedResource = notebook.resources.find((resource) => resource.id === uploadResult.document.id) ?? null;
      setSelectedResourceId(savedResource?.id ?? "new");
      setResourceForm(savedResource ? toResourceFormState(savedResource) : EMPTY_RESOURCE);
      setUploadFile(null);
      setFeedback(
        uploadAutoProcess
          ? `Uploaded and processed ${uploadResult.extracted.sourceName}. ${uploadResult.document.chunkCount} chunks ready.`
          : `Uploaded ${uploadResult.extracted.sourceName}. Extracted ${uploadResult.extracted.characterCount} characters into the resource.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to upload resource file.");
    } finally {
      setBusy("idle");
    }
  }

  const subtypeOptions = RESOURCE_SUBTYPES[resourceForm.resourceKind];

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <div className="rounded-3xl border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl">Notebooks</p>
              <p className="mt-1 text-sm text-text-secondary">Board, level, faculty, subject containers</p>
            </div>
            <Button size="sm" onClick={resetNotebook}>
              New
            </Button>
          </div>
          <div className="mt-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search board, level, subject..."
            />
          </div>
          <div className="mt-4 space-y-2 xl:max-h-[36rem] xl:overflow-y-auto xl:pr-1">
            {filteredNotebooks.length ? (
              filteredNotebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => setSelectedNotebookId(notebook.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedNotebookId === notebook.id
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{notebook.title}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {notebook.board} · {notebook.level} · {notebook.subject}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {notebook.resourceCount} resources · {notebook.readyChunkCount} ready chunks
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                No notebooks found.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl">Resources</p>
              <p className="mt-1 text-sm text-text-secondary">
                {notebookDetail ? `${notebookDetail.resources.length} linked resources` : "Create a notebook first"}
              </p>
            </div>
            <Button size="sm" onClick={startNewResource} disabled={!notebookDetail}>
              New
            </Button>
          </div>
          <div className="mt-4 space-y-2 xl:max-h-[34rem] xl:overflow-y-auto xl:pr-1">
            {notebookDetail?.resources.length ? (
              notebookDetail.resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedResourceId === resource.id
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{resource.title}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {RESOURCE_KINDS.find((kind) => kind.value === resource.resourceKind)?.label} · {resource.resourceSubtype}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {resource.processingStatus} · {resource.chunkCount} chunks · updated {formatDate(resource.updatedAt)}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                No resources yet.
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="space-y-6">
        <div className="rounded-3xl border border-border bg-bg-primary p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-3xl">
                {selectedNotebookId === "new" ? "Create notebook" : notebookDetail?.title ?? "Notebook detail"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                A notebook groups syllabus resources, study material, and question banks under one academic context.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshNotebooks()} disabled={busy !== "idle"}>
                Refresh
              </Button>
              <Button onClick={saveNotebook} disabled={busy !== "idle"}>
                {busy === "savingNotebook" ? "Saving..." : selectedNotebookId === "new" ? "Create notebook" : "Save notebook"}
              </Button>
              {notebookDetail ? (
                <Button variant="danger" onClick={deleteNotebook} disabled={busy !== "idle"}>
                  Delete notebook
                </Button>
              ) : null}
            </div>
          </div>

          {feedback ? (
            <div className="mt-4 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              {feedback}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Notebook title">
              <Input value={notebookForm.title} onChange={(event) => updateNotebook("title", event.target.value)} />
            </Field>
            <Field label="Board">
              <Input value={notebookForm.board} onChange={(event) => updateNotebook("board", event.target.value)} />
            </Field>
            <Field label="Level">
              <Input value={notebookForm.level} onChange={(event) => updateNotebook("level", event.target.value)} />
            </Field>
            <Field label="Faculty">
              <Input value={notebookForm.faculty} onChange={(event) => updateNotebook("faculty", event.target.value)} />
            </Field>
            <Field label="Subject">
              <Input value={notebookForm.subject} onChange={(event) => updateNotebook("subject", event.target.value)} />
            </Field>
            <Field label="Curriculum">
              <Input value={notebookForm.curriculum} onChange={(event) => updateNotebook("curriculum", event.target.value)} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <Textarea
                rows={3}
                value={notebookForm.description}
                onChange={(event) => updateNotebook("description", event.target.value)}
                placeholder="What this notebook covers and why it exists..."
              />
            </Field>
          </div>
        </div>

        <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-bg-primary p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-3xl">
                    {selectedResourceId === "new" ? "Create resource" : selectedResource?.title ?? "Resource detail"}
                  </p>
                  <p className="mt-2 text-sm text-text-secondary">
                    Use one of the three resource buckets, then upload or paste content for chunking and retrieval.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedResource ? (
                    <>
                      <Button variant="outline" onClick={processResource} disabled={busy !== "idle"}>
                        {busy === "processing" ? "Processing..." : "Chunk + vectorize"}
                      </Button>
                      {selectedResource.storagePath ? (
                        <>
                          <a
                            href={`/api/admin/knowledge-documents/${selectedResource.id}/source`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm font-medium text-text-primary transition hover:bg-bg-secondary"
                          >
                            Open source file
                          </a>
                          <a
                            href={`/api/admin/knowledge-documents/${selectedResource.id}/source?download=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm font-medium text-text-primary transition hover:bg-bg-secondary"
                          >
                            Download file
                          </a>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <Button onClick={saveResource} disabled={busy !== "idle" || !notebookDetail}>
                    {busy === "savingResource" ? "Saving..." : selectedResourceId === "new" ? "Create resource" : "Save resource"}
                  </Button>
                  {selectedResource ? (
                    <Button variant="danger" onClick={deleteResource} disabled={busy !== "idle"}>
                      Delete resource
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Resource bucket">
                  <select
                    value={resourceForm.resourceKind}
                    onChange={(event) => handleResourceKindChange(event.target.value as KnowledgeResourceKind)}
                    className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                  >
                    {RESOURCE_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Subtype">
                  <select
                    value={resourceForm.resourceSubtype}
                    onChange={(event) => updateResource("resourceSubtype", event.target.value as KnowledgeDocumentType)}
                    className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                  >
                    {subtypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <Input value={resourceForm.title} onChange={(event) => updateResource("title", event.target.value)} />
                </Field>
                <Field label="Chapter / Topic">
                  <Input value={resourceForm.chapter} onChange={(event) => updateResource("chapter", event.target.value)} />
                </Field>
                <Field label="Source name">
                  <Input value={resourceForm.sourceName} onChange={(event) => updateResource("sourceName", event.target.value)} />
                </Field>
                <Field label="Source type">
                  <Input value={resourceForm.sourceType} onChange={(event) => updateResource("sourceType", event.target.value)} />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Resource content">
                  <Textarea
                    rows={10}
                    value={resourceForm.rawContent}
                    onChange={(event) => updateResource("rawContent", event.target.value)}
                    placeholder="Paste syllabus, study material, or question bank content here..."
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-bg-primary p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-2xl">Upload into this resource</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    PDF, DOCX, TXT, or Markdown. Upload to create or replace the selected resource, then optionally process immediately.
                  </p>
                </div>
                <Button variant="outline" onClick={uploadResourceFile} disabled={busy !== "idle" || !uploadFile || !notebookDetail}>
                  {busy === "uploading" ? "Uploading..." : selectedResource ? "Replace from file" : "Upload and create"}
                </Button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <Field label="Choose file">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    className="block w-full rounded-2xl border border-dashed border-border bg-bg-secondary px-4 py-6 text-sm text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-text-primary"
                  />
                </Field>
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={uploadAutoProcess}
                    onChange={(event) => setUploadAutoProcess(event.target.checked)}
                  />
                  Auto process after upload
                </label>
              </div>
            </div>
        </div>
      </section>
      </div>
    </div>
  );
}
