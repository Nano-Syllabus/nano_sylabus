"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { Language, PromptPurpose, PromptTemplate } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type PromptFormState = {
  name: string;
  slug: string;
  purpose: PromptPurpose;
  language: Language;
  description: string;
  content: string;
  isActive: boolean;
};

const EMPTY_FORM: PromptFormState = {
  name: "",
  slug: "",
  purpose: "system",
  language: "EN",
  description: "",
  content: "",
  isActive: false,
};

function toFormState(prompt: PromptTemplate): PromptFormState {
  return {
    name: prompt.name,
    slug: prompt.slug,
    purpose: prompt.purpose,
    language: prompt.language,
    description: prompt.description ?? "",
    content: prompt.content,
    isActive: prompt.isActive,
  };
}

function placeholdersForPurpose(purpose: PromptPurpose) {
  if (purpose === "system") {
    return [
      "{{STUDENT_NAME}}",
      "{{STUDENT_COLLEGE}}",
      "{{STUDENT_BOARD}}",
      "{{STUDENT_GRADE}}",
      "{{STUDENT_SCORE}}",
      "{{STUDENT_SUBJECTS}}",
      "{{STUDENT_TARGET_GRADE}}",
      "{{SUBJECT_CONTEXT_LINE}}",
      "{{RESPONSE_LANGUAGE_RULES}}",
      "{{GROUNDING_CONTEXT}}",
    ];
  }

  if (purpose === "followup") {
    return ["{{RESPONSE_LANGUAGE}}", "{{SUBJECT_CONTEXT_LINE}}", "{{QUESTION}}", "{{ANSWER}}"];
  }

  return ["{{REWRITE_RULES}}", "{{SUBJECT_CONTEXT_LINE}}", "{{QUESTION}}", "{{ANSWER}}"];
}

export function AdminPromptManager({ initialPrompts }: { initialPrompts: PromptTemplate[] }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [selectedId, setSelectedId] = useState<string>(initialPrompts[0]?.id ?? "new");
  const [form, setForm] = useState<PromptFormState>(
    initialPrompts[0] ? toFormState(initialPrompts[0]) : EMPTY_FORM,
  );
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "saving" | "deleting" | "loading">("idle");

  const filteredPrompts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return prompts;
    return prompts.filter((prompt) =>
      [prompt.name, prompt.slug, prompt.purpose, prompt.language, prompt.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [prompts, query]);

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedId) ?? null;

  function updateForm<K extends keyof PromptFormState>(key: K, value: PromptFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function primeNewPrompt() {
    setSelectedId("new");
    setForm(EMPTY_FORM);
    setFeedback(null);
  }

  function selectPrompt(prompt: PromptTemplate) {
    setSelectedId(prompt.id);
    setForm(toFormState(prompt));
    setFeedback(null);
  }

  async function refreshPrompts(nextSelectedId?: string) {
    const response = await fetch("/api/admin/prompt-templates");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh prompts.");
    }

    setPrompts(payload.prompts);
    if (nextSelectedId) {
      const nextPrompt = payload.prompts.find((prompt: PromptTemplate) => prompt.id === nextSelectedId);
      setSelectedId(nextSelectedId);
      if (nextPrompt) {
        setForm(toFormState(nextPrompt));
      }
      return;
    }

    if (!payload.prompts.some((prompt: PromptTemplate) => prompt.id === selectedId)) {
      const first = payload.prompts[0];
      if (first) {
        setSelectedId(first.id);
        setForm(toFormState(first));
      } else {
        primeNewPrompt();
      }
    }
  }

  async function handleSave() {
    setBusy("saving");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedId === "new" ? "/api/admin/prompt-templates" : `/api/admin/prompt-templates/${selectedId}`,
        {
          method: selectedId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save prompt.");
      }

      await refreshPrompts(payload.prompt.id);
      setFeedback(selectedId === "new" ? "Prompt created." : "Prompt updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save prompt.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleDelete() {
    if (!selectedPrompt) return;
    const confirmed = window.confirm(`Delete "${selectedPrompt.name}"?`);
    if (!confirmed) return;

    setBusy("deleting");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/prompt-templates/${selectedPrompt.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete prompt.");
      }

      await refreshPrompts();
      primeNewPrompt();
      setFeedback("Prompt deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete prompt.");
    } finally {
      setBusy("idle");
    }
  }

  const placeholders = placeholdersForPurpose(form.purpose);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-3xl border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl">Templates</p>
              <p className="mt-1 text-sm text-text-secondary">Live behavior controls</p>
            </div>
            <Button size="sm" onClick={primeNewPrompt}>
              New
            </Button>
          </div>
          <div className="mt-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, slug, purpose..."
            />
          </div>
          <div className="mt-4 space-y-2">
            {filteredPrompts.length ? (
              filteredPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => selectPrompt(prompt)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedId === prompt.id
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{prompt.name}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {prompt.purpose} · {prompt.language} · {prompt.slug}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {prompt.isActive ? "Active" : "Inactive"} · updated {formatDate(prompt.updatedAt)}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                No prompt templates found.
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
                {selectedId === "new" ? "Create prompt template" : selectedPrompt?.name ?? "Prompt detail"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                One active prompt per purpose and language. If none is active, the app falls back to its built-in default.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshPrompts()} disabled={busy !== "idle"}>
                Refresh
              </Button>
              <Button onClick={handleSave} disabled={busy !== "idle"}>
                {busy === "saving" ? "Saving..." : selectedId === "new" ? "Create prompt" : "Save changes"}
              </Button>
              {selectedPrompt ? (
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

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Name">
              <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
            </Field>
            <Field label="Slug">
              <Input value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} placeholder="auto-from-name-if-empty" />
            </Field>
            <Field label="Purpose">
              <select
                value={form.purpose}
                onChange={(event) => updateForm("purpose", event.target.value as PromptPurpose)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                <option value="system">system</option>
                <option value="followup">followup</option>
                <option value="rewrite">rewrite</option>
              </select>
            </Field>
            <Field label="Language">
              <select
                value={form.language}
                onChange={(event) => updateForm("language", event.target.value as Language)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                <option value="EN">EN</option>
                <option value="RN">RN</option>
              </select>
            </Field>
            <Field label="Description">
              <Input value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
            </Field>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateForm("isActive", event.target.checked)}
              />
              Activate this template for {form.purpose} / {form.language}
            </label>
          </div>

          <div className="mt-4">
            <Field
              label="Prompt content"
              hint="Use placeholder tokens below. The runtime will replace them with live student, retrieval, and language context."
            >
              <Textarea
                rows={18}
                value={form.content}
                onChange={(event) => updateForm("content", event.target.value)}
                placeholder="Write the full prompt template here..."
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-bg-primary p-5">
            <p className="font-display text-2xl">Supported placeholders</p>
            <div className="mt-4 space-y-2 text-sm text-text-secondary">
              {placeholders.map((placeholder) => (
                <div key={placeholder}>• {placeholder}</div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-bg-primary p-5">
            <p className="font-display text-2xl">Usage notes</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-text-secondary">
              <p>• `system` prompts shape the main grounded answer.</p>
              <p>• `followup` prompts generate the suggested next questions after each answer.</p>
              <p>• `rewrite` prompts are the safety layer that forces final answer language back into EN or RN.</p>
              <p>• Only one active template per purpose and language can be live at a time.</p>
              <p>• If the active template is deleted or missing, Nano Syllabus falls back to its code default automatically.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
