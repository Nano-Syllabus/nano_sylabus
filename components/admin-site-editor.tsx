"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Monitor,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { AdminSiteDeleteDialog } from "@/components/admin-site-delete-dialog";
import type { CommunityChoice, LandingSiteDetail } from "@/lib/data/landing-sites";
import {
  LANDING_LIST_LIMITS,
  LANDING_SECTIONS,
  DEFAULT_LANDING_CONTENT,
  sanitizeLandingContent,
  type LandingContent,
  type LandingField,
  type LandingList,
  type LandingSection,
} from "@/lib/landing-content";
import { describeLandingPath, getIn, parsePath, setIn, type LandingPath } from "@/lib/landing-edits";
import { MAIN_SITE_SLUG } from "@/lib/landing-site-host";
import type { LandingPreviewEvent, LandingPreviewMessage } from "@/components/landing-preview";

import { AdminExamSettings } from "@/components/admin-exam-settings";
import type { SubscriptionPlan } from "@/lib/types";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";
const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
/** Panels fill the screen below the top bar and scroll on their own. */
const panelHeight = "lg:h-[calc(100vh-150px)]";

type SaveState = "saved" | "saving" | "unsaved" | "error";
type Selection = { section: string | null; path: string | null };

/** What the non-text controls (community picker, logo upload) and field highlighting need. */
const EditorContext = createContext<{ slug: string; communities: CommunityChoice[]; flashPath: string | null }>({
  slug: "",
  communities: [],
  flashPath: null,
});

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload as { site: LandingSiteDetail };
}

export function AdminSiteEditor({
  initialSite,
  rootDomain,
  communities,
  plans,
  studentCount = 0,
  canDelete = true,
}: {
  initialSite: LandingSiteDetail;
  /** Deleting a subdomain is a super admin's call. */
  canDelete?: boolean;
  rootDomain: string;
  /** Students who picked a faculty on this site (the delete dialog says so). */
  studentCount?: number;
  communities: CommunityChoice[];
  plans: SubscriptionPlan[];
}) {
  const router = useRouter();
  const [site, setSite] = useState(initialSite);
  const [draft, setDraft] = useState<LandingContent>(initialSite.draft);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<"publish" | "status" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [selection, setSelection] = useState<Selection>({ section: null, path: null });
  const [flashPath, setFlashPath] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview" | "ai">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [chatOpen, setChatOpen] = useState(true);
  // Below xl the assistant floats over the preview, so it starts closed there.
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1280px)").matches) setChatOpen(false);
  }, []);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef(JSON.stringify(initialSite.draft));
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isMain = site.slug === MAIN_SITE_SLUG;
  const domain = isMain ? rootDomain : `${site.slug}.${rootDomain}`;
  const draftJson = JSON.stringify(draft);
  const hasUnpublished = draftJson !== JSON.stringify(site.content);
  const openSection = LANDING_SECTIONS.find((section) => section.key === selection.section) ?? null;

  /* ── Live preview ── */

  const postToPreview = useCallback((message: LandingPreviewMessage) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    postToPreview({ type: "landing-preview:content", content: draft });
  }, [draft, postToPreview]);

  useEffect(() => {
    postToPreview({ type: "landing-preview:selected", section: selection.section, path: selection.path });
  }, [selection, postToPreview]);

  /**
   * Opens a section's fields — from the navigator, a click in the preview, or
   * an AI change — and, with a path, scrolls to that field and lights it up.
   */
  const select = useCallback(
    (next: Selection, options: { scrollPreview?: boolean; focusField?: boolean } = {}) => {
      setSelection(next);
      if (next.section && options.scrollPreview) postToPreview({ type: "landing-preview:scroll", section: next.section });
      if (next.path && options.focusField !== false) {
        setFlashPath(next.path);
        setMobileTab((tab) => (tab === "ai" ? tab : "edit"));
      }
    },
    [postToPreview],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as LandingPreviewEvent;
      if (message?.type === "landing-preview:ready") {
        postToPreview({ type: "landing-preview:content", content: draftRef.current });
      } else if (message?.type === "landing-preview:select") {
        select({ section: message.section, path: message.path });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postToPreview, select]);

  // Bring the flashed field into view and put the cursor in it.
  useEffect(() => {
    if (!flashPath) return;
    const frame = window.requestAnimationFrame(() => {
      const target = fieldsRef.current?.querySelector<HTMLElement>(`[data-field-path="${CSS.escape(flashPath)}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=file]), textarea, select")?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setFlashPath(null), 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flashPath, selection.section]);

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

  function onSiteDeleted() {
    // Nothing left to autosave: the site is gone.
    lastSaved.current = JSON.stringify(draftRef.current);
    setSaveState("saved");
    router.push("/admin/sites");
    router.refresh();
  }

  const update = (path: LandingPath, value: unknown) => setDraft((current) => setIn(current, path, value));

  function stepSection(offset: number) {
    const index = LANDING_SECTIONS.findIndex((section) => section.key === selection.section);
    const next = LANDING_SECTIONS[(index + offset + LANDING_SECTIONS.length) % LANDING_SECTIONS.length];
    select({ section: next.key, path: null }, { scrollPreview: true });
    fieldsRef.current?.scrollTo({ top: 0 });
  }

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

      <AdminExamSettings
        slug={site.slug}
        initialConfig={site.examConfig}
        communities={communities}
        plans={plans}
      />

      {/* Phone: one pane at a time */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 lg:hidden" role="tablist" aria-label="Editor view">
        {(["edit", "preview", "ai"] as const).map((tab) => (
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
            {tab === "edit" ? <PencilLine size={15} /> : tab === "preview" ? <Eye size={15} /> : <Sparkles size={15} />}
            {tab === "edit" ? "Edit" : tab === "preview" ? "Preview" : "AI"}
          </button>
        ))}
      </div>

      <div
        className={`grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] ${
          chatOpen ? "xl:grid-cols-[320px_minmax(0,1fr)_360px]" : "xl:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        {/* Navigator: every section, or one section's fields */}
        <aside
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card ${panelHeight} ${
            mobileTab === "edit" ? "" : "hidden lg:flex"
          }`}
          aria-label="Page sections"
        >
          <EditorContext.Provider value={{ slug: site.slug, communities, flashPath }}>
            {openSection ? (
              <>
                <div className="flex items-center gap-1 border-b border-border px-2 py-2">
                  <button
                    type="button"
                    onClick={() => select({ section: null, path: null })}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft size={14} aria-hidden="true" />
                    All sections
                  </button>
                  <span className="flex-1" />
                  <button type="button" className={iconButton} onClick={() => stepSection(-1)} aria-label="Previous section">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" className={iconButton} onClick={() => stepSection(1)} aria-label="Next section">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div
                  ref={fieldsRef}
                  className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4"
                  onFocusCapture={(event) => {
                    const path = (event.target as HTMLElement).closest("[data-field-path]")?.getAttribute("data-field-path");
                    if (path && path !== selection.path) select({ section: openSection.key, path }, { focusField: false });
                  }}
                >
                  <SectionFields
                    section={openSection}
                    value={draft[openSection.key] as Record<string, unknown>}
                    onChange={(path, value) => update([openSection.key, ...path], value)}
                  />
                </div>
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <p className="flex items-start gap-2 px-2 pb-3 pt-2 text-xs text-muted-foreground">
                  <MousePointerClick size={15} className="mt-px shrink-0 text-blue-600" aria-hidden="true" />
                  Click anything on the preview to edit it, or pick a section.
                </p>
                <ul className="space-y-0.5">
                  {LANDING_SECTIONS.map((section, index) => {
                    const value = draft[section.key] as Record<string, unknown>;
                    const hidden = section.hideable && value.hidden === true;
                    return (
                      <li key={section.key} className="group relative">
                        <button
                          type="button"
                          onClick={() => {
                            select({ section: section.key, path: null }, { scrollPreview: true });
                            setMobileTab("edit");
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 pr-11 text-left hover:bg-muted"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground group-hover:bg-background">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium ${hidden ? "text-muted-foreground line-through decoration-1" : "text-foreground"}`}>
                              {section.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{section.where}</span>
                          </span>
                        </button>
                        {section.hideable ? (
                          <button
                            type="button"
                            onClick={() => update([section.key, "hidden"], !hidden)}
                            aria-label={hidden ? `Show ${section.title}` : `Hide ${section.title}`}
                            aria-pressed={!hidden}
                            title={hidden ? "Hidden — click to show" : "Shown — click to hide"}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 ${iconButton} ${hidden ? "text-amber-600" : "opacity-60 group-hover:opacity-100"}`}
                          >
                            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        ) : (
                          <ChevronRight size={15} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                        )}
                      </li>
                    );
                  })}
                </ul>

                {!isMain && canDelete ? (
                  <div className="mx-2 mt-6 rounded-xl border border-red-500/30 p-4">
                    <h2 className="text-sm font-semibold">Delete this website</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {domain} will send visitors to {rootDomain}. The text can’t be recovered.
                    </p>
                    <AdminSiteDeleteDialog
                      slug={site.slug}
                      domain={domain}
                      rootDomain={rootDomain}
                      studentCount={studentCount}
                      disabled={busy !== null}
                      onDeleted={onSiteDeleted}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </EditorContext.Provider>
        </aside>

        {/* Preview */}
        <div className={`flex min-w-0 flex-col ${panelHeight} ${mobileTab === "preview" ? "" : "hidden lg:flex"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              Preview — click any part to edit it{hasUnpublished ? " (not live yet)" : ""}
            </span>
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => setChatOpen((open) => !open)}
                aria-pressed={chatOpen}
                className="hidden min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted lg:inline-flex"
              >
                {chatOpen ? <PanelRightClose size={15} aria-hidden="true" /> : <PanelRightOpen size={15} aria-hidden="true" />}
                AI assistant
              </button>
            </div>
          </div>
          <PreviewFrame frameRef={frameRef} slug={site.slug} device={device} />
        </div>

        {/* AI assistant: below xl it is the phone "AI" tab only */}
        <div
          className={`min-w-0 ${mobileTab === "ai" ? "" : "hidden"} ${
            chatOpen
              ? "lg:fixed lg:bottom-4 lg:right-4 lg:top-[150px] lg:z-40 lg:block lg:h-auto lg:w-[360px] lg:shadow-2xl xl:static xl:h-[calc(100vh-150px)] xl:w-auto xl:shadow-none"
              : "lg:hidden"
          }`}
        >
          <AssistantPanel
            slug={site.slug}
            draftRef={draftRef}
            selection={selection}
            onClearSelection={() => select({ section: null, path: null })}
            onApply={(next) => setDraft(next)}
            onJump={(path) => select({ section: parsePath(path)[0] as string, path }, { scrollPreview: true })}
          />
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

/* ── AI assistant ── */

type AssistantChange = { path: string; label: string; before: string | boolean | null; after: string | boolean | null };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  changes?: AssistantChange[];
  undone?: boolean;
  error?: boolean;
};

const SUGGESTIONS = [
  "Rewrite the whole page for licence exam preparation",
  "Make the hero headline punchier",
  "Switch to a deep green and soft yellow colour scheme",
  "Add two FAQs about paying with eSewa",
  "Hide the cash prize section",
];

function messageId() {
  return Math.random().toString(36).slice(2, 10);
}

function readStoredChat(slug: string): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(`site-assistant:${slug}`);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

/** Puts the changed fields back as they were; a FAQ that grew or shrank gets its old list back whole. */
function revertChanges(current: LandingContent, changes: AssistantChange[], before: LandingContent | null) {
  let next: LandingContent = current;
  for (const change of changes) {
    const path = parsePath(change.path);
    if ((change.before === null || change.after === null) && before) {
      const listPath = path.slice(0, path.findIndex((part) => typeof part === "number"));
      if (listPath.length) {
        next = setIn(next, listPath, getIn(before, listPath));
        continue;
      }
    }
    if (change.before !== null) next = setIn(next, path, change.before);
  }
  return sanitizeLandingContent(next);
}

function AssistantPanel({
  slug,
  draftRef,
  selection,
  onClearSelection,
  onApply,
  onJump,
}: {
  slug: string;
  draftRef: React.RefObject<LandingContent>;
  selection: Selection;
  onClearSelection: () => void;
  onApply: (draft: LandingContent) => void;
  onJump: (path: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const snapshots = useRef(new Map<string, LandingContent>());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMessages(readStoredChat(slug)), [slug]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(`site-assistant:${slug}`, JSON.stringify(messages.slice(-40)));
    } catch {
      /* private mode: the chat just isn't kept */
    }
  }, [messages, slug]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const focusLabel = selection.path
    ? describeLandingPath(selection.path)
    : selection.section
      ? LANDING_SECTIONS.find((section) => section.key === selection.section)?.title ?? selection.section
      : null;

  async function send(text: string) {
    const request = text.trim();
    if (!request || pending) return;
    const userMessage: ChatMessage = { id: messageId(), role: "user", text: request };
    const history = [...messages.filter((message) => !message.error), userMessage];
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    const before = draftRef.current;
    try {
      const response = await fetch(`/api/admin/sites/${slug}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: before,
          messages: history.map((message) => ({ role: message.role, text: message.text })),
          focus: selection.section ? selection : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reply?: string;
        draft?: LandingContent;
        changes?: AssistantChange[];
        error?: string;
      };
      if (!response.ok || !payload.draft) throw new Error(payload.error || "The AI assistant couldn’t answer just now.");
      const changes = payload.changes ?? [];
      const id = messageId();
      if (changes.length) {
        snapshots.current.set(id, before);
        // Edits typed while the AI was thinking are kept; only its fields change.
        const merged = draftRef.current === before ? payload.draft : changes.reduce(
          (current, change) => (change.after === null ? current : setIn(current, parsePath(change.path), change.after)),
          draftRef.current,
        );
        onApply(sanitizeLandingContent(merged));
      }
      setMessages((current) => [...current, { id, role: "assistant", text: payload.reply || "Done.", changes }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "The AI assistant couldn’t answer just now.",
          error: true,
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function undo(message: ChatMessage) {
    if (!message.changes?.length) return;
    onApply(revertChanges(draftRef.current, message.changes, snapshots.current.get(message.id) ?? null));
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, undone: true } : item)));
  }

  return (
    <section className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label="AI assistant">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
          <Sparkles size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">AI assistant</h2>
          <p className="truncate text-xs text-muted-foreground">Tell it what to change — it edits the draft</p>
        </div>
        {messages.length ? (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask for anything the page’s text and colours can do. Select a part of the preview first to say “change this”.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground hover:border-blue-600/40 hover:bg-blue-600/5"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm text-white">
                {message.text}
              </p>
            </div>
          ) : (
            <div key={message.id} className="max-w-[95%]">
              <p
                className={`whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2 text-sm ${
                  message.error ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-muted text-foreground"
                }`}
              >
                {message.text}
              </p>
              {message.changes?.length ? (
                <ChangeList message={message} onJump={onJump} onUndo={() => undo(message)} />
              ) : null}
            </div>
          ),
        )}

        {pending ? (
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm text-muted-foreground">
            <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Editing the page…
          </div>
        ) : null}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        {focusLabel ? (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-blue-600/10 py-1 pl-2.5 pr-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              <MousePointerClick size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{focusLabel}</span>
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Stop focusing this part"
                className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-blue-600/20"
              >
                <X size={11} />
              </button>
            </span>
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 focus-within:ring-2 focus-within:ring-blue-600/40">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder={focusLabel ? `Change ${focusLabel.toLowerCase()}…` : "e.g. Make the page about +2 science"}
            aria-label="Message the AI assistant"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </form>
    </section>
  );
}

function ChangeList({ message, onJump, onUndo }: { message: ChatMessage; onJump: (path: string) => void; onUndo: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const changes = message.changes ?? [];
  const shown = expanded ? changes : changes.slice(0, 5);
  const show = (value: string | boolean | null) =>
    value === null ? "—" : typeof value === "boolean" ? (value ? "Hidden" : "Shown") : value || "(empty)";

  return (
    <div className={`mt-1.5 rounded-xl border border-border ${message.undone ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          {message.undone ? "Undone" : `${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        </span>
        {!message.undone ? (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Undo2 size={12} aria-hidden="true" />
            Undo
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {shown.map((change) => (
          <li key={change.path}>
            <button
              type="button"
              onClick={() => onJump(change.path)}
              className="block w-full px-3 py-1.5 text-left hover:bg-muted"
              title="Show this field"
            >
              <span className="block truncate text-[11px] font-medium text-muted-foreground">{change.label}</span>
              {change.path.startsWith("brand.") && /Color$/.test(change.path) && typeof change.after === "string" ? (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground">
                  <span className="size-3 rounded-sm border border-border" style={{ background: change.after }} />
                  {change.after}
                </span>
              ) : (
                <span className="line-clamp-2 text-xs text-foreground">{show(change.after)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {changes.length > 5 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="w-full border-t border-border px-3 py-1.5 text-left text-xs font-medium text-blue-600 hover:bg-muted"
        >
          {expanded ? "Show fewer" : `Show all ${changes.length}`}
        </button>
      ) : null}
    </div>
  );
}

/* ── One section's fields ── */

function SectionFields({
  section,
  value,
  onChange,
}: {
  section: LandingSection;
  value: Record<string, unknown>;
  onChange: (path: LandingPath, value: unknown) => void;
}) {
  const hidden = section.hideable && value.hidden === true;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{section.where}</p>
      </div>

      {section.hideable ? (
        <FieldFrame path={`${section.key}.hidden`}>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span>Show this section on the page</span>
            <input
              type="checkbox"
              checked={!hidden}
              onChange={(event) => onChange(["hidden"], !event.target.checked)}
              className="size-4 accent-blue-600"
            />
          </label>
        </FieldFrame>
      ) : null}

      {section.fields.map((field) => (
        <TextField
          key={field.key}
          path={`${section.key}.${field.key}`}
          field={field}
          value={String(value[field.key] ?? "")}
          onChange={(next) => onChange([field.key], next)}
        />
      ))}

      {section.lists?.map((list) => (
        <ListEditor
          key={list.key}
          path={`${section.key}.${list.key}`}
          list={list}
          limits={LANDING_LIST_LIMITS[`${section.key}.${list.key}`]}
          items={(value[list.key] as unknown[]) ?? []}
          onChange={(next) => onChange([list.key], next)}
        />
      ))}
    </div>
  );
}

/** Marks a field so a click in the preview (or an AI change) can find and light it up. */
function FieldFrame({ path, children }: { path: string; children: React.ReactNode }) {
  const { flashPath } = useContext(EditorContext);
  return (
    <div
      data-field-path={path}
      className={`-m-1.5 rounded-xl p-1.5 transition-[background-color,box-shadow] duration-500 ${
        flashPath === path ? "bg-blue-600/10 shadow-[0_0_0_2px_rgba(37,99,235,0.55)]" : ""
      }`}
    >
      {children}
    </div>
  );
}

function TextField({
  path,
  field,
  value,
  onChange,
}: {
  path: string;
  field: LandingField;
  value: string;
  onChange: (value: string) => void;
}) {
  let control: React.ReactNode;
  if (field.kind === "community") control = <CommunityField field={field} value={value} onChange={onChange} />;
  else if (field.kind === "image") control = <ImageField field={field} value={value} onChange={onChange} />;
  else if (field.kind === "color") control = <ColorField field={field} value={value} onChange={onChange} />;
  else {
    control = (
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
  return <FieldFrame path={path}>{control}</FieldFrame>;
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
          className={`${inputClass} min-h-10 min-w-0 font-mono`}
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
  path,
  list,
  limits,
  items,
  onChange,
}: {
  path: string;
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
            <FieldFrame path={`${path}.${index}`}>
              <input
                value={String(item ?? "")}
                onChange={(event) => onChange(setIn(items, [index], event.target.value))}
                aria-label={`${list.itemLabel} ${index + 1}`}
                className={`${inputClass} min-h-10`}
              />
            </FieldFrame>
          ) : (
            <div className="space-y-3">
              {list.fields.map((field) => (
                <TextField
                  key={field.key}
                  path={`${path}.${index}.${field.key}`}
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
      className="relative h-[calc(100vh-190px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-muted lg:h-auto lg:min-h-0 lg:flex-1"
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
