"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Monitor, Smartphone, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { LandingTemplateId } from "@/lib/landing-content";
import { LANDING_TEMPLATES } from "@/lib/landing-templates";
import styles from "@/components/landing-template-picker.module.css";

export function LandingTemplatePicker({
  value,
  onChange,
}: {
  value: LandingTemplateId;
  onChange: (value: LandingTemplateId) => void;
}) {
  const [preview, setPreview] = useState<LandingTemplateId | null>(null);
  const [phone, setPhone] = useState(false);
  if (preview) {
    const sample = LANDING_TEMPLATES.find((sample) => sample.id === preview)!;
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 text-sm font-medium"
            onClick={() => setPreview(null)}
          >
            <ArrowLeft size={15} />
            All samples
          </button>
          <span className="text-sm font-medium">{sample.name}</span>
          <div className="flex gap-1" role="group" aria-label="Sample preview size">
            {[false, true].map((small) => (
              <button
                key={String(small)}
                type="button"
                aria-pressed={phone === small}
                aria-label={small ? "Phone sample preview" : "Desktop sample preview"}
                onClick={() => setPhone(small)}
                className={`grid size-9 place-items-center rounded-lg ${phone === small ? "bg-blue-600/10 text-blue-600" : "bg-muted"}`}
              >
                {small ? <Smartphone size={16} /> : <Monitor size={16} />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-muted p-2">
          <iframe
            title={`${sample.name} landing page sample`}
            src={`/admin/landing-samples/${preview}`}
            className="h-[min(55dvh,560px)] max-w-full rounded-md border-0 bg-white"
            style={{ width: phone ? 390 : "100%" }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(preview);
            setPreview(null);
          }}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
        >
          <Check size={16} />
          Select {sample.name}
        </button>
      </div>
    );
  }
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      role="group"
      aria-label="Landing page samples"
    >
      {LANDING_TEMPLATES.map((sample, i) => (
        <article
          key={sample.id}
          className={`overflow-hidden rounded-xl border bg-card ${value === sample.id ? "border-blue-600 ring-1 ring-blue-600" : "border-border"}`}
        >
          <button
            type="button"
            onClick={() => onChange(sample.id)}
            aria-pressed={value === sample.id}
            aria-label={`Select ${sample.name} sample`}
            className="block w-full text-left focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <div
              className={styles.thumbnail}
              data-template={sample.id}
              style={
                {
                  "--sample-primary": sample.primary,
                  "--sample-accent": sample.accent,
                  "--sample-bg": sample.background,
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <div className={styles.nav}>
                <span>n.</span>
                <span />
                <i />
              </div>
              <div className={styles.hero}>
                <div>
                  <strong>
                    {
                      [
                        "10x your exam",
                        "A little learning.",
                        "Your next exam.",
                        "Big ambitions.",
                        "Find your people.",
                      ][i]
                    }
                    <em>
                      {
                        [
                          "preparation.",
                          "A lasting habit.",
                          "Your clear plan.",
                          "Small steps.",
                          "Build momentum.",
                        ][i]
                      }
                    </em>
                  </strong>
                  <div className={styles.lines} />
                  <b />
                </div>
                <div className={styles.visual}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className={styles.cards}>
                {[0, 1, 2, 3].map((item) => (
                  <span key={item}>
                    <i />
                    <b />
                  </span>
                ))}
              </div>
            </div>
            <div className="px-3 pb-1 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{sample.name}</span>
                {value === sample.id && <Check size={15} className="text-blue-600" />}
              </div>
              <p className="mt-1 min-h-10 text-xs leading-relaxed text-muted-foreground">
                {sample.description}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPreview(sample.id)}
            aria-label={`Preview ${sample.name} sample`}
            className="m-3 mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Eye size={14} />
            Preview full page
          </button>
        </article>
      ))}
    </div>
  );
}

export function LandingTemplateDialog({
  initialTemplate,
  onClose,
  onApply,
  editing = false,
}: {
  initialTemplate: LandingTemplateId;
  onClose: () => void;
  onApply?: (template: LandingTemplateId, keepContent: boolean) => void;
  editing?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialTemplate);
  const [keepContent, setKeepContent] = useState(true);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      aria-labelledby="landing-samples-title"
      className="m-auto max-h-[90dvh] w-[min(900px,calc(100%_-_32px))] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/50 sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="landing-samples-title" className="text-lg font-semibold">
            Five landing page samples
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a starting point. Every sample has editable content, colours, images, and
            sections.
          </p>
        </div>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted"
          onClick={onClose}
          aria-label="Close samples"
        >
          <X size={18} />
        </button>
      </div>
      <LandingTemplatePicker value={selected} onChange={setSelected} />
      {editing && (
        <label className="mt-5 flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            checked={keepContent}
            onChange={(event) => setKeepContent(event.target.checked)}
            className="mt-1 size-4 accent-blue-600"
          />
          <span>
            <strong className="block font-medium">Keep my current text and branding</strong>
            <span className="text-xs text-muted-foreground">
              Only the layout and design settings change. Uncheck to load sample text and colours;
              your logo and community destination stay in place.
            </span>
          </span>
        </label>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          onClick={onClose}
        >
          {onApply ? "Cancel" : "Close"}
        </button>
        {onApply && (
          <button
            type="button"
            className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => onApply(selected, keepContent)}
          >
            {editing ? "Apply sample to draft" : "Create with this sample"}
          </button>
        )}
      </div>
    </dialog>
  );
}
