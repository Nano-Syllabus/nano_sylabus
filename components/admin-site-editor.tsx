"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Monitor,
  PencilLine,
  Plus,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import type { CommunityChoice, LandingSiteDetail } from "@/lib/data/landing-sites";
import {
  LANDING_LIST_LIMITS,
  LANDING_SECTIONS,
  DEFAULT_LANDING_CONTENT,
  type LandingContent,
  type LandingField,
  type LandingList,
  type LandingSection,
} from "@/lib/landing-content";
import { MAIN_SITE_SLUG } from "@/lib/landing-site-host";
import type { LandingPreviewMessage } from "@/components/landing-preview";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";

type SaveState = "saved" | "saving" | "unsaved" | "error";

/** What the non-text controls (community picker, logo upload) need. */
const EditorContext = createContext<{ slug: string; communities: CommunityChoice[] }>({
  slug: "",
  communities: [],
});
type Path = Array<string | number>;

/** A copy of `value` with `path` set to `next`; untouched branches are shared. */
function setIn<T>(value: T, path: Path, next: unknown): T {
  if (path.length === 0) return next as T;
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    const copy = [...value];
    copy[head as number] = setIn(copy[head as number], rest, next);
    return copy as T;
  }
  const record = value as Record<string, unknown>;
  return { ...record, [head]: setIn(record[head as string], rest, next) } as T;
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload as { site: LandingSiteDetail };
}

export function AdminSiteEditor({
  initialSite,
  rootDomain,
  communities,
}: {
  initialSite: LandingSiteDetail;
  rootDomain: string;
  communities: CommunityChoice[];
}) {
  const router = useRouter();
  const [site, setSite] = useState(initialSite);
  const [draft, setDraft] = useState<LandingContent>(initialSite.draft);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<"publish" | "status" | "delete" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("brand");
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastSaved = useRef(JSON.stringify(initialSite.draft));
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isMain = site.slug === MAIN_SITE_SLUG;
  const domain = isMain ? rootDomain : `${site.slug}.${rootDomain}`;
  const draftJson = JSON.stringify(draft);
  const hasUnpublished = draftJson !== JSON.stringify(site.content);

  /* ── Live preview ── */

  const postToPreview = useCallback((message: LandingPreviewMessage) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    postToPreview({ type: "landing-preview:content", content: draft });
  }, [draft, postToPreview]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "landing-preview:ready") {
        postToPreview({ type: "landing-preview:content", content: draftRef.current });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postToPreview]);

  /* ── Autosave: the draft is saved a moment after typing stops ── */

  const saveDraft = useCallback((json: string) => {
    saveChain.current = saveChain.current.then(async () => {
      if (json === lastSaved.current) return;
      setSaveState("saving");
      try {
        const { site: saved } = await readJson(
          await fetch(`/api/admin/sites/${site.slug}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft: JSON.parse(json) }),
          }),
        );
        lastSaved.current = json;
        setSite(saved);
        setSaveState(JSON.stringify(draftRef.current) === json ? "saved" : "unsaved");
      } catch {
        setSaveState("error");
      }
    });
    return saveChain.current;
  }, [site.slug]);

  useEffect(() => {
    if (draftJson === lastSaved.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => void saveDraft(draftJson), 1200);
    return () => window.clearTimeout(timer);
  }, [draftJson, saveDraft]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  /* ── Actions ── */

  async function publish() {
    setBusy("publish");
    setNotice(null);
    const json = JSON.stringify(draftRef.current);
    try {
      await saveChain.current;
      const { site: published } = await readJson(
        await fetch(`/api/admin/sites/${site.slug}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: JSON.parse(json) }),
        }),
      );
      lastSaved.current = json;
      setSite(published);
      setSaveState(JSON.stringify(draftRef.current) === json ? "saved" : "unsaved");
      setNotice({
        tone: "ok",
        text:
          published.status === "live"
            ? `Published. ${domain} shows the new text now.`
            : "Published, but the site is hidden. Turn it on to let visitors see it.",
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn’t publish." });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: "live" | "hidden") {
    setBusy("status");
    setNotice(null);
    try {
      const { site: saved } = await readJson(
        await fetch(`/api/admin/sites/${site.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      );
      setSite(saved);
      setNotice({
        tone: "ok",
        text: status === "live" ? `${domain} is live.` : `${domain} is hidden. Visitors go to ${rootDomain}.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn’t change that." });
    } finally {
      setBusy(null);
    }
  }

  async function deleteSite() {
    const typed = window.prompt(`This removes ${domain} for good. Type ${site.slug} to confirm.`);
    if (typed?.trim() !== site.slug) return;
    setBusy("delete");
    try {
      const response = await fetch(`/api/admin/sites/${site.slug}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t delete the site.");
      lastSaved.current = JSON.stringify(draftRef.current);
      setSaveState("saved");
      router.push("/admin/sites");
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn’t delete the site." });
      setBusy(null);
    }
  }

  function toggleSection(key: string) {
    const next = openSection === key ? null : key;
    setOpenSection(next);
    if (next) postToPreview({ type: "landing-preview:scroll", section: next });
  }

  const update = (path: Path, value: unknown) => setDraft((current) => setIn(current, path, value));

  /* ── Layout ── */

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/admin/sites"
            aria-label="All websites"
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold tracking-tight">{domain}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{site.name}</span>
              <span aria-hidden="true">·</span>
              <span>{site.status === "live" ? "Live" : "Hidden"}</span>
              <span aria-hidden="true">·</span>
              <SaveIndicator state={saveState} onRetry={() => void saveDraft(JSON.stringify(draftRef.current))} />
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isMain ? (
            <button
              type="button"
              className={secondaryButton}
              disabled={busy !== null}
              onClick={() => void setStatus(site.status === "live" ? "hidden" : "live")}
            >
              {site.status === "live" ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              {site.status === "live" ? "Hide site" : "Make live"}
            </button>
          ) : null}
          {site.status === "live" ? (
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
              View live
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : null}
          {hasUnpublished ? (
            <button
              type="button"
              className={secondaryButton}
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Throw away every change since the last publish?")) setDraft(site.content);
              }}
            >
              Discard changes
            </button>
          ) : null}
          <button
            type="button"
            className={primaryButton}
            disabled={busy !== null || !hasUnpublished}
            onClick={() => void publish()}
          >
            {busy === "publish" ? "Publishing…" : hasUnpublished ? "Publish" : "Published"}
          </button>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {/* Phone: one pane at a time */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 lg:hidden" role="tablist" aria-label="Editor view">
        {(["edit", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium ${
              mobileTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {tab === "edit" ? <PencilLine size={15} /> : <Eye size={15} />}
            {tab === "edit" ? "Edit text" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        {/* Fields */}
        <div
          className={`min-w-0 space-y-2 lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1 ${
            mobileTab === "edit" ? "" : "hidden lg:block"
          }`}
        >
          <EditorContext.Provider value={{ slug: site.slug, communities }}>
          {LANDING_SECTIONS.map((section) => (
            <SectionCard
              key={section.key}
              section={section}
              value={draft[section.key] as Record<string, unknown>}
              open={openSection === section.key}
              onToggle={() => toggleSection(section.key)}
              onChange={(path, value) => update([section.key, ...path], value)}
            />
          ))}
          </EditorContext.Provider>

          {!isMain ? (
            <div className="rounded-xl border border-red-500/30 bg-card p-4">
              <h2 className="text-sm font-semibold">Delete this website</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {domain} will send visitors to {rootDomain}. The text can’t be recovered.
              </p>
              <button
                type="button"
                onClick={() => void deleteSite()}
                disabled={busy !== null}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 px-3 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 size={14} aria-hidden="true" />
                {busy === "delete" ? "Deleting…" : "Delete website"}
              </button>
            </div>
          ) : null}
        </div>

        {/* Preview */}
        <div className={`min-w-0 ${mobileTab === "preview" ? "" : "hidden lg:block"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Preview — updates as you type{hasUnpublished ? " (not live yet)" : ""}
            </span>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Preview size">
              {(["desktop", "phone"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={device === option}
                  aria-label={option === "desktop" ? "Desktop preview" : "Phone preview"}
                  onClick={() => setDevice(option)}
                  className={`grid size-8 place-items-center rounded-md ${
                    device === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {option === "desktop" ? <Monitor size={15} /> : <Smartphone size={15} />}
                </button>
              ))}
            </div>
          </div>
          <PreviewFrame frameRef={frameRef} slug={site.slug} device={device} />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="font-medium text-red-600 underline underline-offset-2">
        Draft not saved — retry
      </button>
    );
  }
  const label = { saved: "Draft saved", saving: "Saving draft…", unsaved: "Unsaved changes" }[state];
  return <span className={state === "saved" ? "" : "text-amber-700 dark:text-amber-300"}>{label}</span>;
}

/* ── One section of the page ── */

function SectionCard({
  section,
  value,
  open,
  onToggle,
  onChange,
}: {
  section: LandingSection;
  value: Record<string, unknown>;
  open: boolean;
  onToggle: () => void;
  onChange: (path: Path, value: unknown) => void;
}) {
  const hidden = section.hideable && value.hidden === true;
  const panelId = `section-${section.key}`;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {section.title}
            {hidden ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Hidden
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{section.where}</span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div id={panelId} className="space-y-4 border-t border-border px-4 pb-4 pt-3">
          {section.hideable ? (
            <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span>Show this section on the page</span>
              <input
                type="checkbox"
                checked={!hidden}
                onChange={(event) => onChange(["hidden"], !event.target.checked)}
                className="size-4 accent-blue-600"
              />
            </label>
          ) : null}

          {section.fields.map((field) => (
            <TextField
              key={field.key}
              field={field}
              value={String(value[field.key] ?? "")}
              onChange={(next) => onChange([field.key], next)}
            />
          ))}

          {section.lists?.map((list) => (
            <ListEditor
              key={list.key}
              list={list}
              limits={LANDING_LIST_LIMITS[`${section.key}.${list.key}`]}
              items={(value[list.key] as unknown[]) ?? []}
              onChange={(next) => onChange([list.key], next)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: LandingField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === "community") return <CommunityField field={field} value={value} onChange={onChange} />;
  if (field.kind === "image") return <ImageField field={field} value={value} onChange={onChange} />;
  if (field.kind === "color") return <ColorField field={field} value={value} onChange={onChange} />;
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {field.label}
      {field.long ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-10`} />
      )}
      {field.hint ? <span className="font-normal">{field.hint}</span> : null}
    </label>
  );
}

type FieldProps = { field: LandingField; value: string; onChange: (value: string) => void };

function CommunityField({ field, value, onChange }: FieldProps) {
  const { communities } = useContext(EditorContext);
  const known = communities.some((community) => community.slug === value);
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {field.label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-10`}>
        <option value="">Let visitors choose their faculty</option>
        {value && !known ? <option value={value}>{value} (no longer active)</option> : null}
        {communities.map((community) => (
          <option key={community.slug} value={community.slug}>
            {community.name}
            {community.faculty && community.faculty !== community.name ? ` — ${community.faculty}` : ""}
          </option>
        ))}
      </select>
      {field.hint ? <span className="font-normal">{field.hint}</span> : null}
    </label>
  );
}

function ImageField({ field, value, onChange }: FieldProps) {
  const { slug } = useContext(EditorContext);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/admin/sites/${slug}/logo`, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t upload the logo.");
      onChange(payload.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t upload the logo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {field.label}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        <div className="grid h-12 w-28 shrink-0 place-items-center rounded-md bg-[#fafbf7]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Current logo" className="max-h-10 max-w-24 object-contain" />
          ) : (
            <span className="text-[11px] text-[#5b5e55]">Default logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`${secondaryButton} min-h-9 cursor-pointer`}>
            <Upload size={14} aria-hidden="true" />
            {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {value ? (
            <button type="button" onClick={() => onChange("")} className={`${secondaryButton} min-h-9`}>
              Use default
            </button>
          ) : null}
        </div>
      </div>
      {error ? <span className="font-normal text-red-600">{error}</span> : null}
      {field.hint ? <span className="font-normal">{field.hint}</span> : null}
    </div>
  );
}

function ColorField({ field, value, onChange }: FieldProps) {
  const fallback = DEFAULT_LANDING_CONTENT.brand[field.key as keyof LandingContent["brand"]] ?? "#000000";
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(value);

  return (
    <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{field.label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : fallback}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${field.label} picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1"
        />
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = event.target.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
          }}
          aria-label={`${field.label} hex code`}
          spellCheck={false}
          className={`${inputClass} min-h-10 font-mono`}
        />
        {value !== fallback ? (
          <button type="button" onClick={() => onChange(fallback)} className={`${secondaryButton} shrink-0`}>
            Reset
          </button>
        ) : null}
      </div>
      {field.hint ? <span className="font-normal">{field.hint}</span> : null}
    </div>
  );
}

function ListEditor({
  list,
  limits,
  items,
  onChange,
}: {
  list: LandingList;
  limits?: { min: number; max: number };
  items: unknown[];
  onChange: (items: unknown[]) => void;
}) {
  const canAdd = limits ? items.length < limits.max : false;
  const canRemove = limits ? items.length > limits.min : false;

  function blankItem() {
    if (list.kind === "strings") return "";
    return Object.fromEntries(list.fields.map((field) => [field.key, ""]));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{list.label}</legend>
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {list.itemLabel} {index + 1}
            </span>
            {canRemove ? (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, position) => position !== index))}
                aria-label={`Remove ${list.itemLabel.toLowerCase()} ${index + 1}`}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
          {list.kind === "strings" ? (
            <input
              value={String(item ?? "")}
              onChange={(event) => onChange(setIn(items, [index], event.target.value))}
              aria-label={`${list.itemLabel} ${index + 1}`}
              className={`${inputClass} min-h-10`}
            />
          ) : (
            <div className="space-y-3">
              {list.fields.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  value={String((item as Record<string, unknown>)?.[field.key] ?? "")}
                  onChange={(next) => onChange(setIn(items, [index, field.key], next))}
                />
              ))}
            </div>
          )}
        </div>
      ))}
      {canAdd ? (
        <button
          type="button"
          onClick={() => onChange([...items, blankItem()])}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus size={14} aria-hidden="true" />
          Add {list.itemLabel.toLowerCase()}
        </button>
      ) : null}
    </fieldset>
  );
}

/* ── The preview iframe, scaled to fit its column ── */

const DEVICE_WIDTH = { desktop: 1280, phone: 390 } as const;

function PreviewFrame({
  frameRef,
  slug,
  device,
}: {
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  slug: string;
  device: "desktop" | "phone";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualWidth = DEVICE_WIDTH[device];
  const scale = box.width ? Math.min(1, box.width / virtualWidth) : 1;
  const shownWidth = virtualWidth * scale;

  return (
    <div
      ref={boxRef}
      className="relative h-[calc(100vh-190px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-muted"
    >
      <iframe
        ref={frameRef}
        src={`/admin/sites/${slug}/preview`}
        title="Landing page preview"
        style={{
          width: virtualWidth,
          height: box.height / scale,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          left: Math.max(0, (box.width - shownWidth) / 2),
        }}
        className="absolute top-0 border-0 bg-white"
      />
    </div>
  );
}
