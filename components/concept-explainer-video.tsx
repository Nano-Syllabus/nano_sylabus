"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/*
 * "Watch the explainer": the topic as a ~90 second animated video, planned by
 * Claude and drawn by the manim renderer. Asked for on the first click; the
 * backend caches it by content, so after the first student it is instant.
 */

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "preparing"; hash: string; since: number }
  | { kind: "ready"; video: string; poster: string | null }
  | { kind: "error"; message: string };

type Reply = {
  explainer?: { hash: string; status: string; video: string | null; poster: string | null; error: string };
  error?: string;
};

const POLL_MS = 4000;
const GIVE_UP_MS = 6 * 60_000;

export function ConceptExplainerVideo({ challengeId }: { challengeId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While it is being made: ask the media proxy for the job's status.
  useEffect(() => {
    if (state.kind !== "preparing") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/media/${state.hash}`, { cache: "no-store" });
        const job = (await response.json().catch(() => ({}))) as {
          status?: string;
          derivatives?: { mp4?: string; poster?: string };
          error?: string;
        };
        if (cancelled) return;
        if (job.derivatives?.mp4) {
          setState({
            kind: "ready",
            video: `/api/media/${state.hash}/animation.mp4`,
            poster: job.derivatives.poster ? `/api/media/${state.hash}/poster.png` : null,
          });
          return;
        }
        if (job.status === "failed" || job.status === "error") {
          setState({ kind: "error", message: "The explainer couldn't be made for this topic. Try again later." });
          return;
        }
      } catch {
        /* A dropped poll is not news; the next one asks again. */
      }
      if (cancelled) return;
      if (Date.now() - state.since > GIVE_UP_MS) {
        setState({ kind: "error", message: "The explainer is taking longer than usual. Open it again in a few minutes." });
        return;
      }
      timer.current = window.setTimeout(() => void poll(), POLL_MS);
    };
    timer.current = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [state]);

  const ask = async () => {
    setState({ kind: "asking" });
    try {
      const response = await fetch(`/api/student/challenges/${encodeURIComponent(challengeId)}/explainer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "urgent" }),
      });
      const payload = (await response.json().catch(() => ({}))) as Reply;
      const explainer = payload.explainer;
      if (!response.ok || !explainer) {
        setState({ kind: "error", message: payload.error || "The explainer couldn't be prepared. Try again." });
        return;
      }
      if (explainer.video) setState({ kind: "ready", video: explainer.video, poster: explainer.poster });
      else setState({ kind: "preparing", hash: explainer.hash, since: Date.now() });
    } catch {
      setState({ kind: "error", message: "Couldn't reach NanoSyllabus. Try again." });
    }
  };

  if (state.kind === "ready") {
    return (
      <figure className="mb-video">
        <video
          src={state.video}
          poster={state.poster ?? undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-[4px] bg-black"
        />
        <figcaption className="mb-ui mt-2 text-sm text-text-muted">
          The topic in about 90 seconds. Then work through the figures and graphs below.
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="mb-video flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="mb-ui text-base font-semibold">Watch the explainer</p>
        <p className="text-[15px] text-text-muted">
          {state.kind === "preparing"
            ? "Animating this topic for the first time. It takes about a minute, and it is instant for everyone after you."
            : state.kind === "error"
              ? state.message
              : "This topic as a 90-second animation: the idea, each part built up, and a worked example."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void ask()}
        disabled={state.kind === "asking" || state.kind === "preparing"}
        className="mb-ui inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {state.kind === "asking" || state.kind === "preparing" ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <PlayCircle className="size-4" aria-hidden="true" />
        )}
        {state.kind === "preparing" ? "Preparing…" : state.kind === "error" ? "Try again" : "Play"}
      </button>
    </div>
  );
}
