/**
 * Upgrades the pictures the backend put in an answer, after they have rendered.
 *
 * The backend writes plain markdown images and nothing richer — `![RC charging
 * curve](/api/media/<hash>/poster.png)`, `![Diagram](/api/figure/<sha>.png)` —
 * and that is deliberate on its side: the answer is STORED, replayed months
 * later, and read by things that are not this component. So everything here is
 * an enhancement layered on markup that already reads correctly without it. If
 * this module never ran, the reader would still see the poster and the figure.
 *
 * Two upgrades, both driven by status routes the backend exposes for exactly
 * this purpose:
 *
 *   /api/media/<hash>         an animation's poster becomes a player once the
 *                             mp4 has finished rendering
 *   /api/figure/<sha>/status  a figure whose render is still running gets a
 *                             frame that says so, and the picture when it lands
 *
 * `/api/tikz/<sha>` images — figures drawn before the TikZ path was removed, whose
 * URLs are baked into stored answers — need neither: whatever is on disk for them
 * is final, so they are left to load as ordinary images.
 *
 * Both are polled, both stop polling, and both are safe to run against an
 * element that has been through them already.
 */

const MEDIA_PREFIX = "/api/media/";
const FIGURE_PREFIX = "/api/figure/";
const POLL_MS = 4_000;
/** Consecutive failures before a poller gives up. A renderer that has gone away
 *  should not be retried forever behind a tab somebody left open. */
const MAX_FAILURES = 5;
/** How long a poster may keep saying "generating" before it says so honestly. */
const MAX_WAIT_MS = 30 * 60 * 1000;

const LIVE_STATUSES = new Set(["queued", "planning", "rendering"]);

type AnimationStatus = {
  status?: string;
  derivatives?: { poster?: string; gif?: string; mp4?: string };
  error?: string;
};

type FigureStatus = {
  ready?: boolean;
  working?: boolean;
};

/** The spec hash in `/api/media/<hash>/poster.png`, or null if it is not one. */
function animationHash(src: string): string | null {
  if (!src.startsWith(MEDIA_PREFIX)) return null;
  const rest = src.slice(MEDIA_PREFIX.length).split("/");
  if (rest.length !== 2 || rest[1] !== "poster.png") return null;
  return /^[0-9a-f]{1,64}$/.test(rest[0]) ? rest[0] : null;
}

/** The digest in `/api/figure/<sha>.png`, or null. */
function figureDigest(src: string): string | null {
  if (!src.startsWith(FIGURE_PREFIX)) return null;
  const rest = src.slice(FIGURE_PREFIX.length);
  if (rest.includes("/")) return null;
  const stem = rest.endsWith(".png") ? rest.slice(0, -4) : rest;
  return /^[0-9a-f]{1,64}$/.test(stem) ? stem : null;
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wraps an animation poster in a figure that can become a player.
 *
 * The video is NOT loaded until the reader presses play. A transcript can hold a
 * dozen of these, and eagerly fetching every mp4 would spend tens of megabytes
 * to show pictures nobody asked to watch.
 */
function buildPlayer(img: HTMLImageElement) {
  const figure = document.createElement("figure");
  figure.className = "answer-animation";

  const status = document.createElement("p");
  status.className = "answer-animation-status";
  status.textContent = "Generating the video…";

  const action = document.createElement("button");
  action.type = "button";
  action.className = "answer-animation-play";
  action.textContent = "▶ Play";
  action.hidden = true;

  img.replaceWith(figure);
  figure.append(img, status, action);
  return { figure, status, action };
}

function attachAnimation(img: HTMLImageElement, hash: string, signal: AbortSignal) {
  const { figure, status, action } = buildPlayer(img);
  const startedAt = Date.now();
  let failures = 0;
  let timer: number | null = null;

  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  signal.addEventListener("abort", stop, { once: true });

  const play = (mp4: string) => {
    const video = document.createElement("video");
    video.src = mp4;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.className = "answer-animation-video";
    // The poster stays as the video's own poster so the frame does not go blank
    // between the press and the first decoded frame.
    video.poster = img.src;
    img.replaceWith(video);
    action.remove();
  };

  const ready = (mp4: string) => {
    status.remove();
    action.hidden = false;
    action.addEventListener("click", () => play(mp4), { once: true });
  };

  const fail = (message: string) => {
    stop();
    // The poster is a real picture of the thing being explained, so it stays.
    // Only the promise of a video is withdrawn.
    status.textContent = message;
    status.classList.add("answer-animation-failed");
  };

  const poll = async () => {
    if (signal.aborted) return;
    const state = await readJson<AnimationStatus>(`${MEDIA_PREFIX}${hash}`, signal);
    if (signal.aborted) return;

    if (!state) {
      failures += 1;
      if (failures >= MAX_FAILURES) return fail("The video could not be loaded.");
      timer = window.setTimeout(poll, POLL_MS);
      return;
    }
    failures = 0;

    const mp4 = state.derivatives?.mp4;
    if (mp4) {
      stop();
      ready(mp4);
      return;
    }
    if (state.error || (state.status && !LIVE_STATUSES.has(state.status))) {
      return fail("The video could not be generated for this answer.");
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      return fail("The video is taking longer than expected.");
    }
    timer = window.setTimeout(poll, POLL_MS);
  };

  void poll();
  return figure;
}

/**
 * Holds a frame open for a figure whose render has not finished.
 *
 * A figure's URL goes into the answer the moment the render is QUEUED, so the
 * `<img>` arrives pointing at something that is not drawn yet — and the browser's
 * default for that is a torn-page icon in the middle of the explanation. This
 * asks the server which of three things is happening and retries the image while
 * a picture is still coming.
 *
 * `working` is the state that matters: a render is running, OR a brief is on disk
 * with none against it, which the next request for the file turns back into a
 * running render. Without that middle state "still drawing" and "failed" are the
 * same 404, and the frame gets dropped on a picture one request away.
 */
function attachFigureFrame(img: HTMLImageElement, digest: string, signal: AbortSignal) {
  let failures = 0;
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  signal.addEventListener("abort", stop, { once: true });

  const retryImage = () => {
    // A fresh element rather than reassigning `src`: the browser keeps showing
    // whatever is there until the new bytes have decoded, so the swap has no
    // flash of empty box in it.
    const next = new Image();
    next.onload = () => {
      img.src = next.src;
      img.classList.remove("answer-figure-pending");
    };
    next.src = `${FIGURE_PREFIX}${digest}.png?r=${Date.now()}`;
  };

  const poll = async () => {
    if (signal.aborted) return;
    const state = await readJson<FigureStatus>(`${FIGURE_PREFIX}${digest}/status`, signal);
    if (signal.aborted) return;

    if (!state) {
      // One request that did not land is not a verdict — a wifi hiccup must not
      // cost the reader a figure that is on its way. It costs a poll, not the poll.
      failures += 1;
      if (failures >= MAX_FAILURES) return stop();
      timer = window.setTimeout(poll, POLL_MS);
      return;
    }
    failures = 0;

    if (state.ready) {
      stop();
      retryImage();
      return;
    }
    if (!state.working) return stop();   // nothing is coming
    img.classList.add("answer-figure-pending");
    timer = window.setTimeout(poll, POLL_MS);
  };

  // Only worth asking if the image did not simply load. A figure whose render
  // finished before the reader got here is the common case and costs nothing.
  img.addEventListener("error", () => void poll(), { once: true });
}

/**
 * Enhance every server-rendered figure under `root`. Returns a teardown.
 *
 * Idempotent: an element that has been enhanced carries `data-answer-media`, so
 * a re-render that reuses DOM does not start a second poller against it.
 */
export function enhanceAnswerMedia(root: HTMLElement): () => void {
  const controller = new AbortController();

  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img.answer-figure"))) {
    if (img.dataset.answerMedia) continue;
    // `img.src` is absolute once parsed; the pathname is what these match on.
    const path = img.getAttribute("src") ?? "";

    const hash = animationHash(path);
    if (hash) {
      img.dataset.answerMedia = "animation";
      attachAnimation(img, hash, controller.signal);
      continue;
    }

    const digest = figureDigest(path);
    if (digest) {
      img.dataset.answerMedia = "figure";
      attachFigureFrame(img, digest, controller.signal);
    }
  }

  return () => controller.abort();
}
