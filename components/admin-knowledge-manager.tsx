"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminEntityListPanel } from "@/components/admin/entity-list-panel";
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
  AdminKnowledgeDocumentDetail,
  AdminKnowledgeDocumentSummary,
  AdminKnowledgeNotebookDetail,
  AdminKnowledgeNotebookSummary,
  KnowledgeDocumentType,
  KnowledgeResourceKind,
  TopicCard,
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

type TopicCardFormState = {
  title: string;
  topic: string;
  keyTerms: string;
  coreExplanation: string;
  formulaSheet: string;
  exampleLine: string;
  commonMistake: string;
  examAngle: string;
  status: "draft" | "reviewed" | "published";
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

const EMPTY_TOPIC_CARD: TopicCardFormState = {
  title: "",
  topic: "",
  keyTerms: "",
  coreExplanation: "",
  formulaSheet: "",
  exampleLine: "",
  commonMistake: "",
  examAngle: "",
  status: "draft",
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

function toTopicCardFormState(topicCard: TopicCard): TopicCardFormState {
  return {
    title: topicCard.title,
    topic: topicCard.topic,
    keyTerms: topicCard.keyTerms.join(", "),
    coreExplanation: topicCard.coreExplanation.join("\n"),
    formulaSheet: topicCard.formulaSheet.join("\n"),
    exampleLine: topicCard.exampleLine ?? "",
    commonMistake: topicCard.commonMistake ?? "",
    examAngle: topicCard.examAngle ?? "",
    status: topicCard.status,
  };
}

function normalizeListField(value: string, separator: RegExp | string = /[\n,]+/) {
  return value
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
  const [selectedNotebookIds, setSelectedNotebookIds] = useState<string[]>([]);
  const [notebookDetail, setNotebookDetail] = useState<AdminKnowledgeNotebookDetail | null>(null);
  const [notebookForm, setNotebookForm] = useState<NotebookFormState>(EMPTY_NOTEBOOK);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("new");
  const [selectedResourceDetail, setSelectedResourceDetail] = useState<AdminKnowledgeDocumentDetail | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(EMPTY_RESOURCE);
  const [selectedTopicCardId, setSelectedTopicCardId] = useState<string>("new");
  const [topicCardForm, setTopicCardForm] = useState<TopicCardFormState>(EMPTY_TOPIC_CARD);
  const [query, setQuery] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourcePage, setResourcePage] = useState(1);
  const [resourcePageSize, setResourcePageSize] = useState(20);
  const [resourceTotal, setResourceTotal] = useState(0);
  const [resourceTotalPages, setResourceTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    | "idle"
    | "loading"
    | "savingNotebook"
    | "deletingNotebook"
    | "savingResource"
    | "processing"
    | "deletingResource"
    | "uploading"
    | "bulkProcessing"
    | "savingTopicCard"
    | "deletingTopicCard"
    | "seedingTopicCards"
  >("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAutoProcess, setUploadAutoProcess] = useState(true);

  const selectedResource =
    selectedResourceId === "new"
      ? null
      : notebookDetail?.resources.find((resource) => resource.id === selectedResourceId) ?? null;
  const selectedTopicCard =
    selectedTopicCardId === "new"
      ? null
      : selectedResourceDetail?.topicCards.find((topicCard) => topicCard.id === selectedTopicCardId) ?? null;

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

  useEffect(() => {
    let ignore = false;

    async function loadSelectedResourceDetail(resourceId: string) {
      if (resourceId === "new") {
        setSelectedResourceDetail(null);
        setSelectedTopicCardId("new");
        setTopicCardForm(EMPTY_TOPIC_CARD);
        return;
      }

      try {
        const response = await fetch(`/api/admin/knowledge-documents/${resourceId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load resource detail.");
        }
        if (ignore) return;
        const document = payload.document as AdminKnowledgeDocumentDetail;
        setSelectedResourceDetail(document);
        const nextTopicCard = document.topicCards[0] ?? null;
        setSelectedTopicCardId(nextTopicCard?.id ?? "new");
        setTopicCardForm(nextTopicCard ? toTopicCardFormState(nextTopicCard) : EMPTY_TOPIC_CARD);
      } catch (error) {
        if (!ignore) {
          setFeedback(error instanceof Error ? error.message : "Failed to load resource detail.");
        }
      }
    }

    void loadSelectedResourceDetail(selectedResourceId);

    return () => {
      ignore = true;
    };
  }, [selectedResourceId]);

  useEffect(() => {
    if (!selectedResourceDetail) return;
    if (selectedTopicCardId === "new") return;
    const topicCard = selectedResourceDetail.topicCards.find((item) => item.id === selectedTopicCardId);
    if (!topicCard) {
      setSelectedTopicCardId("new");
      setTopicCardForm(EMPTY_TOPIC_CARD);
      return;
    }
    setTopicCardForm(toTopicCardFormState(topicCard));
  }, [selectedResourceDetail, selectedTopicCardId]);

  useEffect(() => {
    if (!notebookDetail) {
      setSelectedResourceIds([]);
      return;
    }
    setSelectedResourceIds((current) =>
      current.filter((resourceId) => notebookDetail.resources.some((resource) => resource.id === resourceId)),
    );
  }, [notebookDetail]);

  useEffect(() => {
    setSelectedNotebookIds((current) =>
      current.filter((notebookId) => notebooks.some((notebook) => notebook.id === notebookId)),
    );
  }, [notebooks]);

  function updateNotebook<K extends keyof NotebookFormState>(key: K, value: NotebookFormState[K]) {
    setNotebookForm((current) => ({ ...current, [key]: value }));
  }

  function updateResource<K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) {
    setResourceForm((current) => ({ ...current, [key]: value }));
  }

  function updateTopicCard<K extends keyof TopicCardFormState>(key: K, value: TopicCardFormState[K]) {
    setTopicCardForm((current) => ({ ...current, [key]: value }));
  }

  function resetNotebook() {
    setSelectedNotebookId("new");
    setNotebookDetail(null);
    setNotebookForm(EMPTY_NOTEBOOK);
    setSelectedResourceId("new");
    setSelectedResourceDetail(null);
    setResourceForm(EMPTY_RESOURCE);
    setSelectedTopicCardId("new");
    setTopicCardForm(EMPTY_TOPIC_CARD);
    setResourceQuery("");
    setResourcePage(1);
    setResourceTotal(0);
    setResourceTotalPages(1);
    setUploadFile(null);
    setFeedback(null);
  }

  function startNewResource() {
    setSelectedResourceId("new");
    setSelectedResourceDetail(null);
    setResourceForm(EMPTY_RESOURCE);
    setSelectedTopicCardId("new");
    setTopicCardForm(EMPTY_TOPIC_CARD);
    setUploadFile(null);
    setFeedback(null);
  }

  function startNewTopicCard() {
    if (!selectedResourceDetail) return;
    setSelectedTopicCardId("new");
    setTopicCardForm({
      ...EMPTY_TOPIC_CARD,
      title: selectedResourceDetail.title,
      topic: selectedResourceDetail.chapter || selectedResourceDetail.title,
    });
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

  async function refreshSelectedResourceDetail(resourceId: string) {
    const response = await fetch(`/api/admin/knowledge-documents/${resourceId}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load resource detail.");
    }
    const document = payload.document as AdminKnowledgeDocumentDetail;
    setSelectedResourceDetail(document);
    setSelectedTopicCardId((currentSelectedTopicCardId) => {
      const nextSelectedTopicCardId =
        document.topicCards.find((topicCard) => topicCard.id === currentSelectedTopicCardId)?.id ??
        document.topicCards[0]?.id ??
        "new";
      const nextTopicCard =
        document.topicCards.find((topicCard) => topicCard.id === nextSelectedTopicCardId) ?? null;
      setTopicCardForm(nextTopicCard ? toTopicCardFormState(nextTopicCard) : EMPTY_TOPIC_CARD);
      return nextSelectedTopicCardId;
    });
    return document;
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
      if (savedResource) {
        await refreshSelectedResourceDetail(savedResource.id);
      }
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
      if (refreshedResource) {
        await refreshSelectedResourceDetail(refreshedResource.id);
      }
      setFeedback(
        `Processed successfully. ${payload.document.chunkCount} chunks ready. ${
          payload.document.topicCards?.length ? `${payload.document.topicCards.length} topic cards ready.` : ""
        }`.trim(),
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to process resource.");
    } finally {
      setBusy("idle");
    }
  }

  async function bulkProcessResources() {
    if (!selectedResourceIds.length) {
      setFeedback("Select at least one resource first.");
      return;
    }

    setBusy("bulkProcessing");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/knowledge-documents/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process",
          documentIds: selectedResourceIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to run bulk resource process.");
      }

      await refreshNotebooks(selectedNotebookId, notebookPage);
      await refreshNotebookDetail(selectedNotebookId, { resourcePage });
      if (selectedResourceId !== "new") {
        await refreshSelectedResourceDetail(selectedResourceId);
      }
      setSelectedResourceIds([]);
      setFeedback(
        `Bulk processing completed: ${payload.succeeded}/${payload.total} succeeded${
          payload.failed ? `, ${payload.failed} failed` : ""
        }.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to run bulk resource process.");
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
      setSelectedResourceDetail(null);
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
      if (savedResource) {
        await refreshSelectedResourceDetail(savedResource.id);
      }
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

  async function generateTopicCards() {
    if (!selectedResourceDetail) return;
    setBusy("seedingTopicCards");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${selectedResourceDetail.id}/topic-cards/seed`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate topic cards.");
      }
      const document = await refreshSelectedResourceDetail(selectedResourceDetail.id);
      setSelectedTopicCardId(document.topicCards[0]?.id ?? "new");
      setFeedback(`${document.topicCards.length} topic cards ready for review.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to generate topic cards.");
    } finally {
      setBusy("idle");
    }
  }

  async function saveTopicCard() {
    if (!selectedResourceDetail) return;
    setBusy("savingTopicCard");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedTopicCardId === "new" ? "/api/admin/topic-cards" : `/api/admin/topic-cards/${selectedTopicCardId}`,
        {
          method: selectedTopicCardId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: selectedResourceDetail.id,
            board: selectedResourceDetail.board,
            grade: selectedResourceDetail.grade,
            subject: selectedResourceDetail.subject,
            chapter: selectedResourceDetail.chapter,
            topic: topicCardForm.topic,
            title: topicCardForm.title,
            keyTerms: normalizeListField(topicCardForm.keyTerms, /[,]+/),
            coreExplanation: normalizeListField(topicCardForm.coreExplanation),
            formulaSheet: normalizeListField(topicCardForm.formulaSheet),
            exampleLine: topicCardForm.exampleLine || null,
            commonMistake: topicCardForm.commonMistake || null,
            examAngle: topicCardForm.examAngle || null,
            status: topicCardForm.status,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save topic card.");
      }
      const document = await refreshSelectedResourceDetail(selectedResourceDetail.id);
      setSelectedTopicCardId(payload.topicCard.id);
      const savedTopicCard = document.topicCards.find((topicCard) => topicCard.id === payload.topicCard.id) ?? null;
      setTopicCardForm(savedTopicCard ? toTopicCardFormState(savedTopicCard) : EMPTY_TOPIC_CARD);
      setFeedback(selectedTopicCardId === "new" ? "Topic card created." : "Topic card updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save topic card.");
    } finally {
      setBusy("idle");
    }
  }

  async function setTopicCardStatus(status: TopicCardFormState["status"]) {
    if (!selectedResourceDetail) return;
    if (selectedTopicCardId === "new") {
      setTopicCardForm((current) => ({ ...current, status }));
      return;
    }
    setBusy("savingTopicCard");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/topic-cards/${selectedTopicCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedResourceDetail.id,
          board: selectedResourceDetail.board,
          grade: selectedResourceDetail.grade,
          subject: selectedResourceDetail.subject,
          chapter: selectedResourceDetail.chapter,
          topic: topicCardForm.topic,
          title: topicCardForm.title,
          keyTerms: normalizeListField(topicCardForm.keyTerms, /[,]+/),
          coreExplanation: normalizeListField(topicCardForm.coreExplanation),
          formulaSheet: normalizeListField(topicCardForm.formulaSheet),
          exampleLine: topicCardForm.exampleLine || null,
          commonMistake: topicCardForm.commonMistake || null,
          examAngle: topicCardForm.examAngle || null,
          status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update topic card status.");
      }
      await refreshSelectedResourceDetail(selectedResourceDetail.id);
      setTopicCardForm((current) => ({ ...current, status }));
      setFeedback(`Topic card marked ${status}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to update topic card status.");
    } finally {
      setBusy("idle");
    }
  }

  async function deleteTopicCard() {
    if (!selectedResourceDetail || !selectedTopicCard) return;
    const confirmed = window.confirm(`Delete topic card "${selectedTopicCard.title}"?`);
    if (!confirmed) return;

    setBusy("deletingTopicCard");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/topic-cards/${selectedTopicCard.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete topic card.");
      }
      const document = await refreshSelectedResourceDetail(selectedResourceDetail.id);
      const firstTopicCard = document.topicCards[0] ?? null;
      setSelectedTopicCardId(firstTopicCard?.id ?? "new");
      setTopicCardForm(firstTopicCard ? toTopicCardFormState(firstTopicCard) : EMPTY_TOPIC_CARD);
      setFeedback("Topic card deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete topic card.");
    } finally {
      setBusy("idle");
    }
  }

  const subtypeOptions = RESOURCE_SUBTYPE_OPTIONS[resourceForm.resourceKind];

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <AdminEntityListPanel
          title={NOTEBOOK_COLLECTION.label}
          subtitle={NOTEBOOK_COLLECTION.subtitle}
          searchPlaceholder={NOTEBOOK_COLLECTION.searchPlaceholder}
          emptyMessage={NOTEBOOK_COLLECTION.emptyMessage}
          query={query}
          onQueryChange={setQuery}
          listLoading={notebookListLoading}
          items={notebooks}
          getId={(notebook) => notebook.id}
          getItemView={(notebook) => ({
            title: notebook.title,
            subtitle: `${notebook.board} · ${notebook.level} · ${notebook.subject}`,
            meta: `${notebook.resourceCount} resources · ${notebook.readyChunkCount} ready chunks`,
          })}
          selectedId={selectedNotebookId}
          onSelect={(id) => {
            setResourceQuery("");
            setResourcePage(1);
            setSelectedNotebookId(id);
          }}
          selectedIds={selectedNotebookIds}
          onSelectedIdsChange={setSelectedNotebookIds}
          page={notebookPage}
          totalPages={notebookTotalPages}
          total={notebookTotal}
          pageSize={notebookPageSize}
          onPrevPage={() => void refreshNotebooks(undefined, Math.max(1, notebookPage - 1))}
          onNextPage={() => void refreshNotebooks(undefined, Math.min(notebookTotalPages, notebookPage + 1))}
          disabled={busy !== "idle"}
          maxListHeightClassName="xl:max-h-[36rem]"
          headerAction={
            <Button size="sm" onClick={resetNotebook} disabled={busy !== "idle"}>
              New
            </Button>
          }
        />

        <AdminEntityListPanel
          title={RESOURCE_COLLECTION.label}
          subtitle={notebookDetail ? `${resourceTotal} linked resources` : "Create a notebook first"}
          searchPlaceholder={RESOURCE_COLLECTION.searchPlaceholder || "Search title, chapter, subtype..."}
          emptyMessage={RESOURCE_COLLECTION.emptyMessage}
          query={resourceQuery}
          onQueryChange={(value) => {
            setResourceQuery(value);
            setResourcePage(1);
          }}
          listLoading={busy === "loading" || busy === "bulkProcessing"}
          items={notebookDetail?.resources ?? []}
          getId={(resource) => resource.id}
          getItemView={(resource) => ({
            title: resource.title,
            subtitle: `${RESOURCE_KIND_OPTIONS.find((kind) => kind.value === resource.resourceKind)?.label} · ${resource.resourceSubtype}`,
            meta: `${resource.processingStatus} · ${resource.chunkCount} chunks · updated ${formatDate(resource.updatedAt)}`,
          })}
          selectedId={selectedResourceId}
          onSelect={setSelectedResourceId}
          selectedIds={selectedResourceIds}
          onSelectedIdsChange={setSelectedResourceIds}
          page={resourcePage}
          totalPages={resourceTotalPages}
          total={resourceTotal}
          pageSize={resourcePageSize}
          onPrevPage={() => setResourcePage((current) => Math.max(1, current - 1))}
          onNextPage={() => setResourcePage((current) => Math.min(resourceTotalPages, current + 1))}
          disabled={!notebookDetail || busy !== "idle"}
          maxListHeightClassName="xl:max-h-[34rem]"
          headerAction={
            <Button size="sm" onClick={startNewResource} disabled={!notebookDetail || busy !== "idle"}>
              New
            </Button>
          }
          bulkActions={[
            {
              key: "bulk-process",
              label: busy === "bulkProcessing" ? "Bulk processing..." : "Bulk process selected",
              onRun: () => bulkProcessResources(),
              disabled: !notebookDetail || busy !== "idle",
            },
          ]}
        />
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

            <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <p className="font-display text-2xl">Topic cards</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Review and publish teaching-ready cards so concept answers use cleaner academic context.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={generateTopicCards} disabled={busy !== "idle" || !selectedResourceDetail}>
                    {busy === "seedingTopicCards" ? "Generating..." : "Generate draft cards"}
                  </Button>
                  <Button variant="outline" onClick={startNewTopicCard} disabled={busy !== "idle" || !selectedResourceDetail}>
                    New topic card
                  </Button>
                  <Button onClick={saveTopicCard} disabled={busy !== "idle" || !selectedResourceDetail}>
                    {busy === "savingTopicCard" ? "Saving..." : "Save topic card"}
                  </Button>
                  <Button variant="outline" onClick={() => void setTopicCardStatus("reviewed")} disabled={busy !== "idle" || !selectedResourceDetail}>
                    Mark reviewed
                  </Button>
                  <Button variant="outline" onClick={() => void setTopicCardStatus("published")} disabled={busy !== "idle" || !selectedResourceDetail}>
                    Publish
                  </Button>
                  {selectedTopicCard ? (
                    <Button variant="danger" onClick={deleteTopicCard} disabled={busy !== "idle"}>
                      Delete topic card
                    </Button>
                  ) : null}
                </div>
              </div>

              {!selectedResourceDetail ? (
                <div className="px-5 py-8 text-sm text-text-secondary">
                  Select a resource first. After chunking a resource, draft topic cards can be generated here.
                </div>
              ) : (
                <div className="grid gap-6 px-5 py-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                      {selectedResourceDetail.topicCards.length} topic cards
                    </p>
                    <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                      {selectedResourceDetail.topicCards.map((topicCard) => (
                        <button
                          key={topicCard.id}
                          type="button"
                          onClick={() => setSelectedTopicCardId(topicCard.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selectedTopicCardId === topicCard.id
                              ? "border-border-strong bg-bg-secondary"
                              : "border-border bg-bg-primary hover:bg-bg-secondary"
                          }`}
                        >
                          <p className="text-sm font-medium text-text-primary">{topicCard.title}</p>
                          <p className="mt-1 text-xs text-text-secondary">{topicCard.topic}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">
                            {topicCard.status}
                          </p>
                        </button>
                      ))}
                      {!selectedResourceDetail.topicCards.length ? (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-secondary">
                          No topic cards yet. Process the resource, then generate draft cards.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Card title">
                        <Input value={topicCardForm.title} onChange={(event) => updateTopicCard("title", event.target.value)} />
                      </Field>
                      <Field label="Topic">
                        <Input value={topicCardForm.topic} onChange={(event) => updateTopicCard("topic", event.target.value)} />
                      </Field>
                    </div>

                    <Field label="Key terms (comma separated)">
                      <Input value={topicCardForm.keyTerms} onChange={(event) => updateTopicCard("keyTerms", event.target.value)} />
                    </Field>

                    <Field label="Core explanation (one idea per line)">
                      <Textarea
                        rows={6}
                        value={topicCardForm.coreExplanation}
                        onChange={(event) => updateTopicCard("coreExplanation", event.target.value)}
                        placeholder="Explain the concept clearly in short teaching lines..."
                      />
                    </Field>

                    <Field label="Formula sheet (one formula per line)">
                      <Textarea
                        rows={4}
                        value={topicCardForm.formulaSheet}
                        onChange={(event) => updateTopicCard("formulaSheet", event.target.value)}
                        placeholder="I = V / R"
                      />
                    </Field>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Example line">
                        <Textarea rows={3} value={topicCardForm.exampleLine} onChange={(event) => updateTopicCard("exampleLine", event.target.value)} />
                      </Field>
                      <Field label="Common mistake">
                        <Textarea rows={3} value={topicCardForm.commonMistake} onChange={(event) => updateTopicCard("commonMistake", event.target.value)} />
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                      <Field label="Exam angle">
                        <Textarea rows={3} value={topicCardForm.examAngle} onChange={(event) => updateTopicCard("examAngle", event.target.value)} />
                      </Field>
                      <Field label="Status">
                        <select
                          value={topicCardForm.status}
                          onChange={(event) => updateTopicCard("status", event.target.value as TopicCardFormState["status"])}
                          className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                        >
                          <option value="draft">Draft</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="published">Published</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </section>
      </div>
    </div>
  );
}
