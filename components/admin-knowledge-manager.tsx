"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type {
  AdminKnowledgeDocumentDetail,
  AdminKnowledgeDocumentSummary,
  KnowledgeDocumentType,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const DOCUMENT_TYPES: KnowledgeDocumentType[] = [
  "micro_syllabus",
  "question_bank",
  "textbook",
  "notes",
  "curriculum",
  "syllabus",
  "other",
];

type KnowledgeFormState = {
  board: string;
  grade: string;
  faculty: string;
  curriculum: string;
  subject: string;
  chapter: string;
  title: string;
  sourceName: string;
  sourceType: string;
  documentType: KnowledgeDocumentType;
  rawContent: string;
};

const EMPTY_FORM: KnowledgeFormState = {
  board: "NEB",
  grade: "Class 11",
  faculty: "",
  curriculum: "",
  subject: "",
  chapter: "",
  title: "",
  sourceName: "",
  sourceType: "manual_text",
  documentType: "textbook",
  rawContent: "",
};

function toFormState(document: AdminKnowledgeDocumentDetail): KnowledgeFormState {
  return {
    board: document.board,
    grade: document.grade,
    faculty: document.faculty,
    curriculum: document.curriculum,
    subject: document.subject,
    chapter: document.chapter ?? "",
    title: document.title,
    sourceName: document.sourceName,
    sourceType: document.sourceType,
    documentType: document.documentType,
    rawContent: document.rawContent,
  };
}

export function AdminKnowledgeManager({
  initialDocuments,
}: {
  initialDocuments: AdminKnowledgeDocumentSummary[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedId, setSelectedId] = useState<string>(initialDocuments[0]?.id ?? "new");
  const [detail, setDetail] = useState<AdminKnowledgeDocumentDetail | null>(null);
  const [form, setForm] = useState<KnowledgeFormState>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "saving" | "processing" | "deleting" | "uploading">("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAutoProcess, setUploadAutoProcess] = useState(true);

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((document) =>
      [document.title, document.subject, document.board, document.grade, document.curriculum, document.faculty]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [documents, query]);

  useEffect(() => {
    let ignore = false;

    async function loadDetail(documentId: string) {
      if (documentId === "new") {
        setDetail(null);
        setForm(EMPTY_FORM);
        return;
      }

      setBusy("loading");
      setFeedback(null);
      try {
        const response = await fetch(`/api/admin/knowledge-documents/${documentId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load document.");
        }
        if (ignore) return;
        setDetail(payload.document);
        setForm(toFormState(payload.document));
      } catch (error) {
        if (!ignore) {
          setFeedback(error instanceof Error ? error.message : "Failed to load document.");
        }
      } finally {
        if (!ignore) setBusy("idle");
      }
    }

    void loadDetail(selectedId);

    return () => {
      ignore = true;
    };
  }, [selectedId]);

  function updateForm<K extends keyof KnowledgeFormState>(key: K, value: KnowledgeFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function primeNewDocument() {
    setSelectedId("new");
    setDetail(null);
    setForm(EMPTY_FORM);
    setFeedback(null);
    setUploadFile(null);
  }

  async function refreshDocuments(nextSelectedId?: string) {
    const response = await fetch("/api/admin/knowledge-documents");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh knowledge documents.");
    }

    setDocuments(payload.documents);
    if (nextSelectedId) {
      setSelectedId(nextSelectedId);
    } else if (!payload.documents.some((document: AdminKnowledgeDocumentSummary) => document.id === selectedId)) {
      setSelectedId(payload.documents[0]?.id ?? "new");
    }
  }

  async function handleSave() {
    setBusy("saving");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedId === "new" ? "/api/admin/knowledge-documents" : `/api/admin/knowledge-documents/${selectedId}`,
        {
          method: selectedId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            chapter: form.chapter.trim() || null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save document.");
      }

      setDetail(payload.document);
      setForm(toFormState(payload.document));
      await refreshDocuments(payload.document.id);
      setFeedback(selectedId === "new" ? "Document created." : "Document updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save document.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleProcess() {
    if (!detail) return;
    setBusy("processing");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${detail.id}/process`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to process document.");
      }
      setDetail(payload.document);
      setForm(toFormState(payload.document));
      await refreshDocuments(payload.document.id);
      setFeedback(`Processed successfully. ${payload.document.chunkCount} chunks ready.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to process document.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleDelete() {
    if (!detail) return;
    const confirmed = window.confirm(`Delete "${detail.title}"? This also removes its chunks.`);
    if (!confirmed) return;

    setBusy("deleting");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${detail.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete document.");
      }

      await refreshDocuments();
      primeNewDocument();
      setFeedback("Document deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete document.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleUpload() {
    if (!uploadFile) {
      setFeedback("Choose a PDF, DOCX, TXT, or Markdown file first.");
      return;
    }
    if (!form.subject.trim()) {
      setFeedback("Add the subject before uploading so the document lands in the right syllabus bucket.");
      return;
    }

    setBusy("uploading");
    setFeedback(null);
    try {
      const payload = new FormData();
      payload.set("file", uploadFile);
      payload.set("documentId", detail?.id ?? "new");
      payload.set("board", form.board);
      payload.set("grade", form.grade);
      payload.set("faculty", form.faculty);
      payload.set("curriculum", form.curriculum);
      payload.set("subject", form.subject);
      payload.set("chapter", form.chapter);
      payload.set("title", form.title);
      payload.set("sourceName", form.sourceName);
      payload.set("documentType", form.documentType);
      payload.set("autoProcess", uploadAutoProcess ? "true" : "false");

      const response = await fetch("/api/admin/knowledge-documents/upload", {
        method: "POST",
        body: payload,
      });
      const uploadResult = await response.json();
      if (!response.ok) {
        throw new Error(uploadResult.error || "Failed to upload knowledge file.");
      }

      setDetail(uploadResult.document);
      setForm(toFormState(uploadResult.document));
      await refreshDocuments(uploadResult.document.id);
      setUploadFile(null);
      setFeedback(
        uploadAutoProcess
          ? `Uploaded and processed ${uploadResult.extracted.sourceName}. ${uploadResult.document.chunkCount} chunks ready.`
          : `Uploaded ${uploadResult.extracted.sourceName}. Extracted ${uploadResult.extracted.characterCount} characters into the document.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to upload knowledge file.");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-3xl border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl">Documents</p>
              <p className="mt-1 text-sm text-text-secondary">Grounding source inventory</p>
            </div>
            <Button size="sm" onClick={primeNewDocument}>
              New
            </Button>
          </div>
          <div className="mt-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, subject, curriculum..."
            />
          </div>
          <div className="mt-4 space-y-2">
            {filteredDocuments.length ? (
              filteredDocuments.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedId(document.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedId === document.id
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{document.title}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {document.board} · {document.grade} · {document.subject}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {document.documentType} · {document.processingStatus} · {document.chunkCount} chunks
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                No documents found.
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
                {selectedId === "new" ? "Create knowledge document" : detail?.title ?? "Knowledge detail"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Capture the exact board, grade, faculty, and syllabus structure before processing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void refreshDocuments()}
                disabled={busy !== "idle"}
              >
                Refresh
              </Button>
              {detail ? (
                <Button
                  variant="outline"
                  onClick={handleProcess}
                  disabled={busy !== "idle"}
                >
                  {busy === "processing" ? "Processing..." : "Chunk + vectorize"}
                </Button>
              ) : null}
              {detail?.storagePath ? (
                <>
                  <a
                    href={`/api/admin/knowledge-documents/${detail.id}/source`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm font-medium text-text-primary transition hover:bg-bg-secondary"
                  >
                    Open source file
                  </a>
                  <a
                    href={`/api/admin/knowledge-documents/${detail.id}/source?download=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm font-medium text-text-primary transition hover:bg-bg-secondary"
                  >
                    Download file
                  </a>
                </>
              ) : null}
              <Button onClick={handleSave} disabled={busy !== "idle"}>
                {busy === "saving" ? "Saving..." : selectedId === "new" ? "Create document" : "Save changes"}
              </Button>
              {detail ? (
                <Button variant="danger" onClick={handleDelete} disabled={busy !== "idle"}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>

          {feedback ? (
            <div className="mt-4 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              {feedback}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border bg-bg-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl">Upload source file</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Upload PDF, DOCX, TXT, or Markdown. We will extract text, save the document, and optionally process it.
                </p>
              </div>
              <Button variant="outline" onClick={handleUpload} disabled={busy !== "idle" || !uploadFile}>
                {busy === "uploading" ? "Uploading..." : detail ? "Replace from file" : "Upload and create"}
              </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <Field
                label="Choose file"
                hint="Best for textbook PDFs, DOCX notes, question banks, or plain text dumps."
              >
                <Input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (!file) return;
                    if (!form.sourceName) {
                      updateForm("sourceName", file.name);
                    }
                    if (!form.title) {
                      updateForm("title", file.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
              </Field>

              <Field
                label="Processing mode"
                hint="Turn this off if you want to inspect the extracted text first."
              >
                <label className="flex h-11 items-center justify-between rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary">
                  <span>{uploadAutoProcess ? "Upload + process" : "Upload only"}</span>
                  <input
                    type="checkbox"
                    checked={uploadAutoProcess}
                    onChange={(event) => setUploadAutoProcess(event.target.checked)}
                  />
                </label>
              </Field>
            </div>

            {uploadFile ? (
              <p className="mt-3 text-xs text-text-muted">
                Selected: {uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Board">
              <Input value={form.board} onChange={(event) => updateForm("board", event.target.value)} />
            </Field>
            <Field label="Grade / Year">
              <Input value={form.grade} onChange={(event) => updateForm("grade", event.target.value)} />
            </Field>
            <Field label="Faculty">
              <Input value={form.faculty} onChange={(event) => updateForm("faculty", event.target.value)} placeholder="Science / Management / Humanities" />
            </Field>
            <Field label="Curriculum / syllabus">
              <Input value={form.curriculum} onChange={(event) => updateForm("curriculum", event.target.value)} placeholder="NEB 2081 core curriculum" />
            </Field>
            <Field label="Subject">
              <Input value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} />
            </Field>
            <Field label="Chapter / unit">
              <Input value={form.chapter} onChange={(event) => updateForm("chapter", event.target.value)} />
            </Field>
            <Field label="Document title">
              <Input value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
            </Field>
            <Field label="Source name">
              <Input value={form.sourceName} onChange={(event) => updateForm("sourceName", event.target.value)} placeholder="class11-english-unit1.pdf" />
            </Field>
            <Field label="Source type">
              <Input value={form.sourceType} onChange={(event) => updateForm("sourceType", event.target.value)} placeholder="pdf / manual_text / docx" />
            </Field>
            <Field label="Document type">
              <select
                value={form.documentType}
                onChange={(event) => updateForm("documentType", event.target.value as KnowledgeDocumentType)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Raw content"
              hint="Paste the textbook, micro syllabus, notes, or question bank content here. Processing will split it into chunks and embed it."
            >
              <Textarea
                rows={18}
                value={form.rawContent}
                onChange={(event) => updateForm("rawContent", event.target.value)}
                placeholder="Paste full source content..."
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-bg-primary p-5">
            <p className="font-display text-2xl">Processing state</p>
            {detail ? (
              <div className="mt-4 space-y-2 text-sm text-text-secondary">
                <div>• Status: {detail.processingStatus}</div>
                <div>• Chunks: {detail.chunkCount}</div>
                <div>• Updated: {formatDate(detail.updatedAt)}</div>
                <div>• Source file: {detail.storagePath ? detail.sourceName : "Not stored yet"}</div>
                {detail.sourceMimeType ? <div>• Mime type: {detail.sourceMimeType}</div> : null}
                {typeof detail.sourceSizeBytes === "number" ? (
                  <div>• File size: {(detail.sourceSizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                ) : null}
                {detail.processingError ? <div>• Error: {detail.processingError}</div> : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">Save a document first to process it.</p>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-bg-primary p-5">
            <p className="font-display text-2xl">Chunk preview</p>
            {detail?.chunks.length ? (
              <div className="mt-4 space-y-3">
                {detail.chunks.slice(0, 6).map((chunk) => (
                  <div key={chunk.id} className="rounded-2xl border border-border bg-bg-secondary p-4">
                    <p className="text-[11px] font-mono-ui uppercase text-text-muted">
                      Chunk {chunk.chunkIndex + 1} {chunk.topic ? `· ${chunk.topic}` : ""}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">{chunk.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">
                Process this document to generate and inspect vector-ready chunks.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
