"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowUp,
  Check,
  CircleDashed,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { CommunitySubjectWorkspace } from "@/lib/data/community-subjects";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const inputClass = `min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted ${focusRing}`;

export function CommunitySubjectWorkspaceClient({
  communitySlug,
  communitySubjectSlug,
  workspace,
}: {
  communitySlug: string;
  communitySubjectSlug: string;
  workspace: CommunitySubjectWorkspace;
}) {
  const router = useRouter();
  const [syncingTopics, setSyncingTopics] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [postNotice, setPostNotice] = useState("");
  const [postActionError, setPostActionError] = useState<{
    postId: string;
    message: string;
  } | null>(null);
  const [postActionNotice, setPostActionNotice] = useState<{
    postId: string;
    message: string;
  } | null>(null);
  const [votingPost, setVotingPost] = useState<string | null>(null);
  const [actingPost, setActingPost] = useState<string | null>(null);

  async function refreshTopics() {
    setSyncingTopics(true);
    setSyncError("");
    setSyncMessage("Reading the latest indexed material…");
    try {
      const sync = await fetch(
        `/api/communities/${encodeURIComponent(communitySlug)}/subjects/${encodeURIComponent(workspace.subjectId)}/sync-topics`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const syncPayload = (await sync.json().catch(() => ({}))) as { error?: string; topics?: unknown[] };
      if (!sync.ok) throw new Error(syncPayload.error || "Topics could not be refreshed.");
      setSyncMessage(
        `${syncPayload.topics?.length || 0} topics extracted. Member challenges are ready.`,
      );
      router.refresh();
    } catch (error) {
      setSyncMessage("");
      setSyncError(error instanceof Error ? error.message : "Topic refresh failed. Try again.");
    } finally {
      setSyncingTopics(false);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPosting(true);
    setPostError("");
    setPostNotice("");
    try {
      const form = new FormData(formElement);
      const response = await fetch(
        `/api/communities/${encodeURIComponent(communitySlug)}/subjects/${encodeURIComponent(workspace.subjectId)}/posts`,
        { method: "POST", body: form },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not publish the post.");
      formElement.reset();
      setPostNotice("Post published. Community members can now open and upvote it.");
      router.refresh();
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Could not publish the post.");
    } finally {
      setPosting(false);
    }
  }

  async function vote(postId: string) {
    setVotingPost(postId);
    setPostActionError(null);
    setPostActionNotice(null);
    try {
      const response = await fetch(`/api/community-posts/${encodeURIComponent(postId)}/vote`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; mergeError?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error || "Vote failed.");
      if (payload.mergeError) {
        setPostActionError({
          postId,
          message: `Your vote counted, but auto-merge will retry: ${payload.mergeError}`,
        });
      } else {
        setPostActionNotice({ postId, message: "Upvote counted." });
      }
      router.refresh();
    } catch (error) {
      setPostActionError({
        postId,
        message: error instanceof Error ? error.message : "Vote failed. Try again.",
      });
    } finally {
      setVotingPost(null);
    }
  }

  async function actOnPost(postId: string, action: "report" | "hide") {
    setActingPost(postId);
    setPostActionError(null);
    setPostActionNotice(null);
    try {
      const response = await fetch(
        `/api/community-posts/${encodeURIComponent(postId)}/${action === "hide" ? "moderate" : "report"}`,
        action === "report"
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Flagged by a community member for creator review." }) }
          : { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Could not ${action} this post.`);
      if (action === "report") {
        setPostActionNotice({
          postId,
          message: "Report saved. The community creator can review this post.",
        });
      }
      router.refresh();
    } catch (error) {
      setPostActionError({
        postId,
        message: error instanceof Error ? error.message : `Could not ${action} this post.`,
      });
    } finally {
      setActingPost(null);
    }
  }

  return (
    <div className="space-y-8 py-8">
      <section aria-labelledby="topics-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-text-muted">Learning map</p>
            <h2 id="topics-heading" className="mt-2 font-display text-2xl font-semibold">Extracted topics</h2>
          </div>
          {workspace.topics.length ? (
            <Link
              href={
                workspace.courseId && workspace.externalSubjectSlug
                  ? `/app/today?courseId=${encodeURIComponent(workspace.courseId)}&subject=${encodeURIComponent(workspace.externalSubjectSlug)}`
                  : "/app/today"
              }
              className={`inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse ${focusRing}`}
            >
              <Trophy className="size-4" aria-hidden="true" /> Open challenges
            </Link>
          ) : null}
        </div>
        {workspace.topics.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {workspace.topics.map((topic) => {
              const complete = topic.masteryStatus === "strong";
              return (
                <article key={topic.id} className="rounded-xl border border-border bg-bg-primary p-4">
                  <span className={`flex size-8 items-center justify-center rounded-full ${complete ? "bg-emerald-500/10 text-emerald-600" : "bg-bg-secondary text-text-muted"}`}>
                    {complete ? <Check className="size-4" aria-hidden="true" /> : <CircleDashed className="size-4" aria-hidden="true" />}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold">{topic.title}</h3>
                  {topic.blurb ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted">{topic.blurb}</p> : null}
                  <p className="mt-3 text-xs text-text-secondary">
                    {topic.masteryStatus === "not_attempted" ? "Challenge waiting" : `${Math.round(topic.percentage)}% mastery`}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center">
            <Sparkles className="mx-auto size-6 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Topics appear after the first material is indexed</p>
            <p className="mt-1 text-xs text-text-muted">
              The creator can add source files in Creator Workspace, then refresh this learning map.
            </p>
          </div>
        )}
      </section>

      {workspace.canManage ? (
        <section className="rounded-xl border border-border bg-bg-primary p-5" aria-labelledby="materials-heading">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-secondary">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="materials-heading" className="font-display text-xl font-semibold">
                Source material lives in Creator Workspace
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Manage the syllabus, notes, question bank, folders, and source files in the original
                subject workspace. This community reuses that same indexed content.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {workspace.externalSubjectSlug ? (
                  <Link
                    href={`/teachers?view=subjects&subject=${encodeURIComponent(workspace.externalSubjectSlug)}&tab=syllabus&returnTo=${encodeURIComponent(`/app/communities/${communitySlug}/subjects/${communitySubjectSlug}`)}`}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse ${focusRing}`}
                  >
                    Open Creator Workspace <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={syncingTopics}
                  aria-busy={syncingTopics}
                  onClick={() => void refreshTopics()}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-secondary disabled:opacity-50 ${focusRing}`}
                >
                  {syncingTopics ? (
                    <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  {syncingTopics ? "Refreshing…" : "Refresh extracted topics"}
                </button>
              </div>
            </div>
          </div>
          {syncMessage ? <p role="status" className="mt-3 text-sm text-text-secondary">{syncMessage}</p> : null}
          {syncError ? <p role="alert" className="mt-3 text-sm text-destructive">{syncError}</p> : null}
        </section>
      ) : null}

      <section aria-labelledby="forum-heading">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-1 size-5 text-text-muted" aria-hidden="true" />
          <div>
            <h2 id="forum-heading" className="font-display text-2xl font-semibold">Subject forum</h2>
            <p className="mt-1 text-sm text-text-secondary">Resources merge into this subject automatically at {workspace.contributionThreshold} upvotes.</p>
          </div>
        </div>
        <form onSubmit={createPost} className="mt-5 rounded-xl border border-border bg-bg-primary p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><label htmlFor="post-title" className="text-sm font-medium">Title</label><input id="post-title" name="title" required minLength={3} maxLength={160} placeholder="TCP/IP question bank from our college" className={`mt-2 ${inputClass}`} /></div>
            <div><label htmlFor="post-type" className="text-sm font-medium">Post type</label><select id="post-type" name="postType" className={`mt-2 ${inputClass}`}><option value="resource">Resource contribution</option><option value="discussion">Discussion</option></select></div>
            <div><label htmlFor="post-shelf" className="text-sm font-medium">Repository shelf</label><select id="post-shelf" name="shelf" className={`mt-2 ${inputClass}`}><option>Question Bank</option><option>Notes</option><option>Syllabus</option></select></div>
            <div className="md:col-span-2"><label htmlFor="post-body" className="text-sm font-medium">Note</label><textarea id="post-body" name="body" rows={3} maxLength={4000} placeholder="What is useful about this resource?" className={`mt-2 w-full resize-y rounded-lg border border-border bg-bg-primary px-3 py-3 text-sm ${focusRing}`} /></div>
            <div className="md:col-span-2"><label htmlFor="post-file" className="text-sm font-medium">Attachment <span className="font-normal text-text-muted">required for resources · max 20 MB</span></label><input id="post-file" name="file" type="file" accept=".pdf,.docx,.txt,image/jpeg,image/png,image/webp" className={`mt-2 block min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm ${focusRing}`} /></div>
          </div>
          <button type="submit" disabled={posting} className={`mt-4 inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse disabled:opacity-50 ${focusRing}`}>{posting ? "Publishing…" : "Publish to forum"}</button>
        </form>
        {postError ? <p role="alert" className="mt-3 text-sm text-destructive">{postError}</p> : null}
        {postNotice ? <p role="status" className="mt-3 text-sm text-text-secondary">{postNotice}</p> : null}
        <div className="mt-5 space-y-3">
          {workspace.posts.map((post) => {
            const votesRemaining = Math.max(
              0,
              workspace.contributionThreshold - post.voteCount,
            );
            const actionError =
              postActionError?.postId === post.id ? postActionError.message : "";
            const actionNotice =
              postActionNotice?.postId === post.id ? postActionNotice.message : "";
            return (
              <article key={post.id} className="rounded-xl border border-border bg-bg-primary p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{post.title}</h3>
                      {post.status === "merged" ? (
                        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                          Merged into repository
                        </span>
                      ) : post.status === "merge_pending" ? (
                        <span className="rounded-full bg-bg-secondary px-2.5 py-1 text-xs text-text-muted">
                          Merging…
                        </span>
                      ) : post.status === "merge_error" ? (
                        <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                          Merge will retry
                        </span>
                      ) : null}
                    </div>
                    {post.body ? (
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{post.body}</p>
                    ) : null}

                    {post.attachmentName ? (
                      <Link
                        href={`/api/community-posts/${encodeURIComponent(post.id)}/attachment`}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-3 inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 text-sm font-medium hover:border-border-strong hover:bg-bg-tertiary ${focusRing}`}
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">Open {post.attachmentName}</span>
                        <span className="shrink-0 text-xs font-normal text-text-muted">
                          {post.shelf}
                        </span>
                        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                      </Link>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={post.viewerVoted || votingPost === post.id}
                        aria-busy={votingPost === post.id}
                        onClick={() => void vote(post.id)}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium disabled:opacity-60 ${post.viewerVoted ? "border-text-primary bg-text-primary text-text-inverse" : "border-border hover:bg-bg-secondary"} ${focusRing}`}
                      >
                        {votingPost === post.id ? (
                          <Loader2
                            className="size-4 motion-safe:animate-spin"
                            aria-hidden="true"
                          />
                        ) : post.viewerVoted ? (
                          <Check className="size-4" aria-hidden="true" />
                        ) : (
                          <ArrowUp className="size-4" aria-hidden="true" />
                        )}
                        {votingPost === post.id
                          ? "Saving vote…"
                          : post.viewerVoted
                            ? `Voted · ${post.voteCount}`
                            : `Upvote · ${post.voteCount}`}
                      </button>
                      <button
                        type="button"
                        disabled={actingPost === post.id}
                        aria-busy={actingPost === post.id}
                        onClick={() =>
                          void actOnPost(post.id, workspace.canManage ? "hide" : "report")
                        }
                        className={`inline-flex min-h-10 items-center px-2 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline disabled:opacity-50 ${focusRing}`}
                      >
                        {actingPost === post.id
                          ? "Saving…"
                          : workspace.canManage
                            ? "Hide post"
                            : "Report post"}
                      </button>
                    </div>
                  </div>

                  {post.postType === "resource" ? (
                    <div className="min-w-32 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-right">
                      <p className="text-sm font-semibold">
                        {post.voteCount} / {workspace.contributionThreshold}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {post.status === "merged"
                          ? "Merged"
                          : `${votesRemaining} vote${votesRemaining === 1 ? "" : "s"} left`}
                      </p>
                    </div>
                  ) : null}
                </div>

                {actionError ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    {actionError}
                  </p>
                ) : null}
                {actionNotice ? (
                  <p role="status" className="mt-4 text-sm text-success">
                    {actionNotice}
                  </p>
                ) : null}

                {post.postType === "resource" && post.status !== "merged" ? (
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-bg-secondary"
                    role="progressbar"
                    aria-label={`${post.voteCount} of ${workspace.contributionThreshold} votes`}
                    aria-valuemin={0}
                    aria-valuemax={workspace.contributionThreshold}
                    aria-valuenow={post.voteCount}
                  >
                    <div
                      className="h-full rounded-full bg-text-primary transition-[width] motion-reduce:transition-none"
                      style={{
                        width: `${Math.min(
                          100,
                          (post.voteCount / workspace.contributionThreshold) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
          {!workspace.posts.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">No posts yet. Share the first useful resource or question.</div> : null}
        </div>
      </section>
    </div>
  );
}
