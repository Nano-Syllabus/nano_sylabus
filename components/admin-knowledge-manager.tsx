"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NOTEBOOK_COLLECTION,
  RESOURCE_COLLECTION,
  RESOURCE_KIND_OPTIONS,
  RESOURCE_SUBTYPE_OPTIONS,
} from "@/lib/admin-resource-definitions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type {
  AdminListPage,
  AdminKnowledgeDocumentSummary,
  AdminKnowledgeNotebookDetail,
  AdminKnowledgeNotebookSummary,
  KnowledgeDocumentType,
  KnowledgeResourceKind,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

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
  initialNotebookPage,
}: {
  initialNotebooks: AdminKnowledgeNotebookSummary[];
  initialNotebookPage: AdminListPage<AdminKnowledgeNotebookSummary>;
}) {
  const [notebooks, setNotebooks] = useState(initialNotebooks);
  const [notebookPage, setNotebookPage] = useState(initialNotebookPage.page);
  const [notebookPageSize, setNotebookPageSize] = useState(initialNotebookPage.pageSize);
  const [notebookTotal, setNotebookTotal] = useState(initialNotebookPage.total);
  const [notebookTotalPages, setNotebookTotalPages] = useState(initialNotebookPage.totalPages);
  const [notebookListLoading, setNotebookListLoading] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>(initialNotebooks[0]?.id ?? "new");
  const [notebookDetail, setNotebookDetail] = useState<AdminKnowledgeNotebookDetail | null>(null);
  const [notebookForm, setNotebookForm] = useState<NotebookFormState>(EMPTY_NOTEBOOK);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("new");
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(EMPTY_RESOURCE);
  const [query, setQuery] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourcePage, setResourcePage] = useState(1);
  const [resourcePageSize, setResourcePageSize] = useState(20);
  const [resourceTotal, setResourceTotal] = useState(0);
  const [resourceTotalPages, setResourceTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    "idle" | "loading" | "savingNotebook" | "deletingNotebook" | "savingResource" | "processing" | "deletingResource" | "uploading"
  >("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAutoProcess, setUploadAutoProcess] = useState(true);

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
        setResourceTotal(0);
        setResourceTotalPages(1);
        return;
      }

      setBusy("loading");
      setFeedback(null);
      try {
        const params = new URLSearchParams();
        params.set("resourcePage", String(resourcePage));
        params.set("resourcePageSize", String(resourcePageSize));
        if (resourceQuery.trim()) {
          params.set("resourceQ", resourceQuery.trim());
        }

        const response = await fetch(`/api/admin/notebooks/${notebookId}?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load notebook.");
        }
        if (ignore) return;
        const notebook = payload.notebook as AdminKnowledgeNotebookDetail;
        setNotebookDetail(notebook);
        setResourcePage(notebook.resourcePage);
        setResourcePageSize(notebook.resourcePageSize);
        setResourceTotal(notebook.resourceTotal);
        setResourceTotalPages(notebook.resourceTotalPages);
        setNotebookForm(toNotebookFormState(notebook));
        const firstResource = notebook.resources[0] ?? null;
        setSelectedResourceId((currentSelectedResourceId) => {
          const nextSelectedResourceId =
            notebook.resources.find((resource) => resource.id === currentSelectedResourceId)?.id ??
            firstResource?.id ??
            "new";
          const nextSelectedResource =
            notebook.resources.find((resource) => resource.id === nextSelectedResourceId) ?? null;
          setResourceForm(nextSelectedResource ? toResourceFormState(nextSelectedResource) : EMPTY_RESOURCE);
          return nextSelectedResourceId;
        });
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
  }, [selectedNotebookId, resourcePage, resourcePageSize, resourceQuery]);

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
    setResourceQuery("");
    setResourcePage(1);
    setResourceTotal(0);
    setResourceTotalPages(1);
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
    const fallbackSubtype = RESOURCE_SUBTYPE_OPTIONS[nextKind][0]?.value ?? "other";
    setResourceForm((current) => ({
      ...current,
      resourceKind: nextKind,
      resourceSubtype: RESOURCE_SUBTYPE_OPTIONS[nextKind].some((option) => option.value === current.resourceSubtype)
        ? current.resourceSubtype
        : fallbackSubtype,
    }));
  }

  const refreshNotebooks = useCallback(async (nextNotebookId?: string, requestedPage?: number) => {
    const targetPage = requestedPage ?? 1;
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("pageSize", String(notebookPageSize));
    if (query.trim()) {
      params.set("q", query.trim());
    }

    setNotebookListLoading(true);
    const response = await fetch(`/api/admin/notebooks?${params.toString()}`);
    const payload = await response.json();
    setNotebookListLoading(false);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh notebooks.");
    }

    setNotebooks(payload.items);
    setNotebookPage(payload.page);
    setNotebookPageSize(payload.pageSize);
    setNotebookTotal(payload.total);
    setNotebookTotalPages(payload.totalPages);
    setSelectedNotebookId((currentSelectedNotebookId) => {
      if (nextNotebookId) return nextNotebookId;
      return payload.items.some((notebook: AdminKnowledgeNotebookSummary) => notebook.id === currentSelectedNotebookId)
        ? currentSelectedNotebookId
        : (payload.items[0]?.id ?? "new");
    });
  }, [notebookPageSize, query]);

  async function refreshNotebookDetail(notebookId: string, options?: { resourcePage?: number; resourceQ?: string }) {
    const params = new URLSearchParams();
    params.set("resourcePage", String(options?.resourcePage ?? resourcePage));
    params.set("resourcePageSize", String(resourcePageSize));
    const nextResourceQ = options?.resourceQ ?? resourceQuery;
    if (nextResourceQ.trim()) {
      params.set("resourceQ", nextResourceQ.trim());
    }
    const response = await fetch(`/api/admin/notebooks/${notebookId}?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh notebook detail.");
    }
    const notebook = payload.notebook as AdminKnowledgeNotebookDetail;
    setNotebookDetail(notebook);
    setResourcePage(notebook.resourcePage);
    setResourcePageSize(notebook.resourcePageSize);
    setResourceTotal(notebook.resourceTotal);
    setResourceTotalPages(notebook.resourceTotalPages);
    setNotebookForm(toNotebookFormState(notebook));
    return notebook;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshNotebooks(undefined, 1);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, refreshNotebooks]);

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
      setResourceQuery("");
      setResourcePage(1);
      await refreshNotebooks(notebook.id, 1);
      const freshNotebook = await refreshNotebookDetail(notebook.id, { resourcePage: 1, resourceQ: "" });
      setNotebookDetail(freshNotebook);
      setNotebookForm(toNotebookFormState(freshNotebook));
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
      await refreshNotebooks(undefined, 1);
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

      await refreshNotebooks(notebookId, notebookPage);
      const notebook = await refreshNotebookDetail(notebookId, {
        resourcePage: 1,
        resourceQ: "",
      });
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
      await refreshNotebooks(selectedNotebookId, notebookPage);
      const notebook = await refreshNotebookDetail(selectedNotebookId, {
        resourcePage,
      });
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

      await refreshNotebooks(selectedNotebookId, notebookPage);
      const notebook = await refreshNotebookDetail(selectedNotebookId, {
        resourcePage,
      });
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

      await refreshNotebooks(notebookId, notebookPage);
      const notebook = await refreshNotebookDetail(notebookId, {
        resourcePage: 1,
        resourceQ: "",
      });
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

  const subtypeOptions = RESOURCE_SUBTYPE_OPTIONS[resourceForm.resourceKind];

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="font-semibold">{NOTEBOOK_COLLECTION.label}</p>
              <p className="mt-1 text-xs text-text-secondary">{NOTEBOOK_COLLECTION.subtitle}</p>
            </div>
            <Button size="sm" onClick={resetNotebook}>
              New
            </Button>
          </div>
          <div className="border-b border-border px-4 py-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={NOTEBOOK_COLLECTION.searchPlaceholder}
            />
          </div>
          <div className="xl:max-h-[36rem] xl:overflow-y-auto">
            {notebooks.length ? (
              notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => {
                    setResourceQuery("");
                    setResourcePage(1);
                    setSelectedNotebookId(notebook.id);
                  }}
                  className={`w-full border-b border-border px-4 py-3 text-left transition last:border-b-0 ${
                    selectedNotebookId === notebook.id
                      ? "bg-[#f7f0b4] text-slate-950"
                      : "bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{notebook.title}</p>
                  <p className={`mt-1 text-xs ${selectedNotebookId === notebook.id ? "text-slate-700" : "text-text-secondary"}`}>
                    {notebook.board} · {notebook.level} · {notebook.subject}
                  </p>
                  <p className={`mt-1 text-[11px] ${selectedNotebookId === notebook.id ? "text-slate-600" : "text-text-muted"}`}>
                    {notebook.resourceCount} resources · {notebook.readyChunkCount} ready chunks
                  </p>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                {NOTEBOOK_COLLECTION.emptyMessage}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
            <span>
              {notebookListLoading
                ? "Loading..."
                : `Showing ${notebookTotal === 0 ? 0 : (notebookPage - 1) * notebookPageSize + 1}-${Math.min(
                    notebookTotal,
                    notebookPage * notebookPageSize,
                  )} of ${notebookTotal}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshNotebooks(undefined, Math.max(1, notebookPage - 1))}
                disabled={notebookListLoading || notebookPage <= 1}
              >
                Prev
              </Button>
              <span>
                {notebookPage}/{Math.max(1, notebookTotalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshNotebooks(undefined, Math.min(notebookTotalPages, notebookPage + 1))}
                disabled={notebookListLoading || notebookPage >= notebookTotalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="font-semibold">{RESOURCE_COLLECTION.label}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {notebookDetail ? `${resourceTotal} linked resources` : "Create a notebook first"}
              </p>
            </div>
            <Button size="sm" onClick={startNewResource} disabled={!notebookDetail}>
              New
            </Button>
          </div>
          <div className="border-b border-border px-4 py-3">
            <Input
              value={resourceQuery}
              onChange={(event) => {
                setResourceQuery(event.target.value);
                setResourcePage(1);
              }}
              placeholder={RESOURCE_COLLECTION.searchPlaceholder || "Search title, chapter, subtype..."}
              disabled={!notebookDetail}
            />
          </div>
          <div className="xl:max-h-[34rem] xl:overflow-y-auto">
            {notebookDetail?.resources.length ? (
              notebookDetail.resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={`w-full border-b border-border px-4 py-3 text-left transition last:border-b-0 ${
                    selectedResourceId === resource.id
                      ? "bg-[#f7f0b4] text-slate-950"
                      : "bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{resource.title}</p>
                  <p className={`mt-1 text-xs ${selectedResourceId === resource.id ? "text-slate-700" : "text-text-secondary"}`}>
                    {RESOURCE_KIND_OPTIONS.find((kind) => kind.value === resource.resourceKind)?.label} · {resource.resourceSubtype}
                  </p>
                  <p className={`mt-1 text-[11px] ${selectedResourceId === resource.id ? "text-slate-600" : "text-text-muted"}`}>
                    {resource.processingStatus} · {resource.chunkCount} chunks · updated {formatDate(resource.updatedAt)}
                  </p>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                {RESOURCE_COLLECTION.emptyMessage}
              </div>
            )}
          </div>
          {notebookDetail ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
              <span>
                Showing {resourceTotal === 0 ? 0 : (resourcePage - 1) * resourcePageSize + 1}-
                {Math.min(resourceTotal, resourcePage * resourcePageSize)} of {resourceTotal}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setResourcePage((current) => Math.max(1, current - 1))}
                  disabled={resourcePage <= 1}
                >
                  Prev
                </Button>
                <span>
                  {resourcePage}/{Math.max(1, resourceTotalPages)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setResourcePage((current) => Math.min(resourceTotalPages, current + 1))}
                  disabled={resourcePage >= resourceTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="space-y-6">
        <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <p className="font-display text-3xl">
                {selectedNotebookId === "new" ? "Create notebook" : notebookDetail?.title ?? "Notebook detail"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                A notebook groups syllabus resources, study material, and question banks under one academic context.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshNotebooks(undefined, notebookPage)} disabled={busy !== "idle"}>
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
            <div className="mx-5 mt-4 border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              {feedback}
            </div>
          ) : null}

          <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
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

          <div className="px-5 pb-5">
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
            <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
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

              <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Resource bucket">
                  <select
                    value={resourceForm.resourceKind}
                    onChange={(event) => handleResourceKindChange(event.target.value as KnowledgeResourceKind)}
                    className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                  >
                    {RESOURCE_KIND_OPTIONS.map((kind) => (
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

              <div className="px-5 pb-5">
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

            <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
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

              <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_220px]">
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
