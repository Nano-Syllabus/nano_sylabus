import { getTenantApiEnv } from "@/lib/env";
import { agentFor, transportFor } from "@/lib/http-agents";
import { trackApiRequest } from "@/lib/api-request-tracking";
import { createLimiter } from "@/lib/http/limit";
import { invalidateMemo, memo } from "@/lib/http/memo";

export type ApiRecord = Record<string, unknown>;

export type TeacherChallengeTopic = {
  topic_key: string;
  title: string;
  unit_number?: string;
  order_index: number;
};

/** One real question this subject's papers set on the topic. Never carries a
 *  solution: worked solutions are step three, after the reading. */
export type TeacherChallengePastQuestion = {
  id: string;
  text: string;
  topic?: string;
  topic_key?: string;
  marks?: number | null;
  year?: string;
  /** `text` with its mathematics in LaTeX, once the question has been worked.
   *  Display only — `text` is the question's identity. */
  display_text?: string;
  /** Every session the bank printed it in, oldest first; `year` is the latest. */
  years?: string[];
};

export type TeacherChallengeReading = {
  headline: string;
  content: string;
  focus: string;
  /** The one sentence the topic reduces to. Absent on a reading cached before the
   *  concept-led rewrite, so every reader must tolerate it being missing. */
  big_idea?: string;
  overview?: string;
  steps?: Array<{
    heading?: string;
    intuition?: string;
    why?: string;
    body?: string;
    formula?: string;
    exam_use?: string;
    worked_example?: string;
  }>;
  formulas?: string[];
  connections?: string[];
  pitfalls?: string[];
  sources: Array<{
    chunk_id?: string;
    document_id?: string;
    filename?: string;
    source_path?: string;
    chapter?: string;
  }>;
};

export type TeacherChallengeSolvedQuestion = {
  id: string;
  text: string;
  solution: string;
  topic: string;
  topic_key: string;
  marks?: number | null;
  year?: string | null;
  source?: string;
  /** `text` typeset for display; `text` is what it is matched to step one by. */
  display_text?: string;
  years?: string[];
};

export type TeacherChallengeExam = {
  attempt_id: string;
  subject: string;
  topics: TeacherChallengeTopic[];
  questions: Array<{
    id: string;
    topic_key: string;
    topic: string;
    marks: number;
    question_type: string;
    text: string;
  }>;
  total_marks: number;
  pass_marks: number;
  duration_minutes: number;
  expires_at: string;
  warning?: string | null;
};

export type TeacherChallengePastQuestionsResponse = {
  collection: string;
  subject: string;
  subject_slug: string;
  topics: TeacherChallengeTopic[];
  topic_source: "syllabus" | "stored" | "index_chapters" | "none";
  can_start: boolean;
  questions: TeacherChallengePastQuestion[];
  /** False => the bank has nothing on this topic, so `questions` is empty rather
   *  than filled from a neighbouring chapter. */
  grounded: boolean;
  blockers: string[];
  warnings: string[];
  note: string;
};

/** A challenge's texts in Roman Nepali, aligned item for item with the request. */
export type TeacherChallengeTranslateResponse = {
  collection: string;
  subject: string;
  language: "rn";
  /** An item that could not be translated faithfully comes back as sent. */
  texts: string[];
  translated: boolean[];
  served_from: "cache" | "model" | "mixed" | "none";
  warnings: string[];
};

/** A fundamentals MCQ as the backend sends it to THIS server — key included.
 *  Never forward `correct` or `explanation` to a student before they answer. */
export type TeacherChallengeMcqQuestion = {
  id: string;
  text: string;
  options: Array<{ key: string; text: string }>;
  correct: string;
  explanation?: string;
};

export type TeacherChallengeMcqResponse = {
  collection: string;
  subject: string;
  subject_slug: string;
  topics: TeacherChallengeTopic[];
  questions: TeacherChallengeMcqQuestion[];
  served_from: "cache" | "lane_notes_llm" | string;
};

/** Where one render got to: `derivatives` fills in as each file lands. */
export type TeacherAnimationReply = {
  spec_hash: string;
  concept: string;
  status: string;
  derivatives: Partial<Record<"poster" | "gif" | "mp4", string>>;
  error: string;
  updated_at: string;
};

export type TeacherChallengeLearnResponse = {
  collection: string;
  subject: string;
  subject_slug: string;
  topics: TeacherChallengeTopic[];
  reading: TeacherChallengeReading;
  served_from: string;
  warnings: string[];
};

export type TeacherChallengeSolvedResponse = {
  collection: string;
  subject: string;
  subject_slug: string;
  topics: TeacherChallengeTopic[];
  questions: TeacherChallengeSolvedQuestion[];
  grounded: boolean;
  warnings: string[];
};

export type TeacherChallengeGradeResponse = {
  attempt_id: string;
  subject: string;
  results: Array<{
    question_id: string;
    topic_key?: string;
    topic?: string;
    question: string;
    marks: number;
    student_answer?: string;
    score: number;
    feedback: string;
  }>;
  total_score: number;
  total_marks: number;
  percentage: number;
  pass_marks: number;
  passed: boolean;
  graded: boolean;
  stored?: boolean;
  evaluation?: import("@/lib/tenant/client").PracticeEvaluation;
  verdict?: string;
};

export type TeacherPracticePaperGradeResponse = {
  submission_id: string;
  set_id: string;
  student_name: string;
  source: string;
  results: Array<{
    question_id: string;
    chapter?: string;
    question: string;
    marks: number;
    student_answer?: string;
    score: number;
    feedback: string;
  }>;
  total_score: number;
  total_marks: number;
  graded: boolean;
  evaluation: import("@/lib/tenant/client").PracticeEvaluation;
};

export type TeacherStandaloneGradeResponse = {
  results: Array<{
    question_id: string;
    chapter?: string;
    question: string;
    marks: number;
    score: number;
    feedback: string;
  }>;
  total_score: number;
  total_marks: number;
  graded: boolean;
  evaluation: import("@/lib/tenant/client").PracticeEvaluation;
};

export type TeacherSubjectStreamEvent =
  | { type: "status"; message: string; query?: string; served_from?: string }
  | { type: "token"; text: string }
  | {
      type: "sources";
      sources?: unknown[];
      chunks?: unknown[];
      chunks_retrieved?: number;
      served_from?: string;
      next_topic?: string;
      next_context_chunk?: ApiRecord;
    }
  | {
      type: "done";
      ok?: boolean;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    }
  | { type: "error"; message: string };

export class TeacherApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
    /**
     * Seconds the API asked us to wait, from its `Retry-After` header.
     *
     * Its bounded worker pools refuse a saturated burst immediately rather than
     * holding the caller past their own timeout, and that refusal carries how
     * long the queue in front of them is expected to take. Retrying sooner than
     * it says is not a faster recovery, it is a second rejection — the pool is
     * still full a quarter of a second later.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TeacherApiError";
  }
}

function formatApiErrorValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(formatApiErrorValue).filter(Boolean).join("; ");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as ApiRecord;
  const location = Array.isArray(record.loc)
    ? record.loc
        .map((part) => String(part))
        .filter((part) => part !== "body")
        .join(".")
    : "";
  const validationMessage = typeof record.msg === "string" ? record.msg.trim() : "";
  if (validationMessage) {
    return location ? `${location}: ${validationMessage}` : validationMessage;
  }

  for (const key of ["message", "detail", "error", "reason"] as const) {
    const message = formatApiErrorValue(record[key]);
    if (message) return message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function formatTeacherApiError(payload: unknown, status: number): string {
  return formatApiErrorValue(payload) || `Teacher API request failed (${status})`;
}

type TeacherRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  /**
   * This POST only reads, so a retry cannot double anything.
   *
   * `retries` is ignored on a non-GET by default, and that default is right:
   * most of this API's POSTs issue a paper, start a clock or record a
   * submission, and replaying one of those after a timeout is worse than the
   * failure it was trying to paper over. But the challenge surface deliberately
   * uses POST for reads too — the four steps share one `{subject, topics}` body
   * and a `topics` list does not survive a query string — so the shape of the
   * request stopped predicting whether it is safe to repeat. This says so
   * explicitly, per call, instead of inferring it from the verb.
   */
  idempotent?: boolean;
};

async function teacherRequestOnce<T>(
  path: string,
  collectionSk: string,
  options: TeacherRequestOptions = {},
): Promise<T> {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const requestTimeoutMs = options.timeoutMs ?? timeoutMs;

  return trackApiRequest(
    "collection",
    () =>
      new Promise<T>((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const transport = transportFor(url);
        const serializedBody =
          options.body === undefined ? undefined : JSON.stringify(options.body);
        const request = transport.request(
          url,
          {
            method: options.method ?? "GET",
            rejectUnauthorized,
            agent: agentFor(url),
            headers: {
              Authorization: `Bearer ${collectionSk}`,
              Accept: "application/json",
              ...(serializedBody
                ? {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(serializedBody),
                  }
                : {}),
            },
          },
          (response) => {
            let raw = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              raw += chunk;
            });
            response.on("end", () => {
              let payload: unknown = {};
              if (raw.trim()) {
                try {
                  payload = JSON.parse(raw);
                } catch {
                  reject(
                    new TeacherApiError(
                      `Teacher API returned invalid JSON: ${raw.slice(0, 300)}`,
                      response.statusCode ?? 502,
                    ),
                  );
                  return;
                }
              }

              const status = response.statusCode ?? 502;
              if (status >= 400) {
                const detail = formatTeacherApiError(payload, status);
                const retryAfter = Number(response.headers?.["retry-after"]);
                reject(
                  new TeacherApiError(
                    detail,
                    status,
                    payload,
                    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
                  ),
                );
                return;
              }
              resolve(payload as T);
            });
          },
        );

        request.setTimeout(requestTimeoutMs, () => {
          request.destroy(
            new TeacherApiError(`Teacher API timed out after ${requestTimeoutMs}ms`, 504),
          );
        });
        request.on("error", reject);
        if (serializedBody) request.write(serializedBody);
        request.end();
      }),
  );
}

async function teacherRequest<T>(
  path: string,
  collectionSk: string,
  options: TeacherRequestOptions = {},
): Promise<T> {
  const replayable = !options.method || options.method === "GET" || options.idempotent === true;
  const retries = replayable ? Math.max(0, options.retries ?? 0) : 0;

  let lastError: unknown;
  for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex += 1) {
    try {
      return await teacherRequestOnce<T>(path, collectionSk, options);
    } catch (error) {
      lastError = error;
      const status = error instanceof TeacherApiError ? error.status : 0;
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
      const transient =
        [408, 429, 500, 502, 503, 504].includes(status) ||
        ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"].includes(code);
      if (!transient || attemptIndex >= retries) throw error;
      // The API's own estimate wins over our guess when it gives one, capped so
      // a header can never hold a request past the caller's timeout budget.
      const askedFor =
        error instanceof TeacherApiError && error.retryAfterSeconds
          ? Math.min(error.retryAfterSeconds, 10) * 1000
          : 0;
      await new Promise((resolve) => setTimeout(resolve, Math.max(askedFor, 250 * (attemptIndex + 1))));
    }
  }
  throw lastError;
}

function parseTeacherSseEvent(rawEvent: string): TeacherSubjectStreamEvent | null {
  const eventName = rawEvent.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "message";
  const data = [...rawEvent.matchAll(/^data:\s?(.*)$/gm)].map((match) => match[1]).join("\n");
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    parsed = { message: data };
  }

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ApiRecord) : {};
  const readNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const normalizeUsage = (value: unknown) => {
    const usageValue = Array.isArray(value) ? value[0] : value;
    if (!usageValue || typeof usageValue !== "object") return undefined;
    const usage = usageValue as ApiRecord;
    const inputTokens =
      readNumber(usage.promptTokens) ||
      readNumber(usage.prompt_tokens) ||
      readNumber(usage.inputTokens) ||
      readNumber(usage.input_tokens);
    const outputTokens =
      readNumber(usage.completionTokens) ||
      readNumber(usage.completion_tokens) ||
      readNumber(usage.outputTokens) ||
      readNumber(usage.output_tokens);
    const totalTokens =
      readNumber(usage.totalTokens) || readNumber(usage.total_tokens) || inputTokens + outputTokens;
    return { inputTokens, outputTokens, totalTokens };
  };

  if (eventName === "status") {
    return {
      type: "status",
      message: String(payload.message ?? ""),
      query: typeof payload.query === "string" ? payload.query : undefined,
      served_from: typeof payload.served_from === "string" ? payload.served_from : undefined,
    };
  }
  if (eventName === "token") {
    return {
      type: "token",
      text: String(payload.text ?? payload.delta ?? payload.content ?? ""),
    };
  }
  if (eventName === "sources") {
    return {
      type: "sources",
      sources: Array.isArray(payload.sources) ? payload.sources : undefined,
      chunks: Array.isArray(payload.chunks) ? payload.chunks : undefined,
      chunks_retrieved:
        typeof payload.chunks_retrieved === "number" ? payload.chunks_retrieved : undefined,
      served_from: typeof payload.served_from === "string" ? payload.served_from : undefined,
      next_topic: typeof payload.next_topic === "string" ? payload.next_topic : undefined,
      next_context_chunk:
        payload.next_context_chunk &&
        typeof payload.next_context_chunk === "object" &&
        !Array.isArray(payload.next_context_chunk)
          ? (payload.next_context_chunk as ApiRecord)
          : undefined,
    };
  }
  if (eventName === "done") {
    return {
      type: "done",
      ok: typeof payload.ok === "boolean" ? payload.ok : undefined,
      usage: normalizeUsage(payload.usage),
    };
  }
  if (eventName === "error") {
    return { type: "error", message: String(payload.message ?? payload.error ?? data) };
  }
  if (typeof payload.text === "string" || typeof payload.delta === "string") {
    return { type: "token", text: String(payload.text ?? payload.delta ?? "") };
  }

  return null;
}

async function teacherStreamRequest(
  path: string,
  collectionSk: string,
  body: unknown,
  onEvent: (event: TeacherSubjectStreamEvent) => void | Promise<void>,
  timeoutMs?: number,
) {
  const { baseUrl, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const requestTimeoutMs = timeoutMs ?? defaultTimeoutMs;

  await trackApiRequest(
    "collection",
    () =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        let buffer = "";
        const url = new URL(path, baseUrl);
        const transport = transportFor(url);
        const serializedBody = JSON.stringify(body);
        const request = transport.request(
          url,
          {
            method: "POST",
            rejectUnauthorized,
            agent: agentFor(url),
            headers: {
              Authorization: `Bearer ${collectionSk}`,
              Accept: "text/event-stream",
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(serializedBody),
            },
          },
          (response) => {
            response.setEncoding("utf8");
            if ((response.statusCode ?? 500) >= 400) {
              let raw = "";
              response.on("data", (chunk: string) => {
                raw += chunk;
              });
              response.on("end", () => {
                if (settled) return;
                settled = true;
                let payload: unknown = raw;
                try {
                  payload = raw.trim() ? JSON.parse(raw) : {};
                } catch {}
                reject(
                  new TeacherApiError(
                    formatTeacherApiError(payload, response.statusCode ?? 502),
                    response.statusCode ?? 502,
                    payload,
                  ),
                );
              });
              return;
            }

            // Ordered, one at a time, with backpressure — the same contract
            // `chatTenantStream` holds and for the same reason: Node does not
            // await a listener, so an `async` handler that awaited `onEvent`
            // inside a loop let two chunks arriving together run concurrently
            // and deliver an answer's tokens out of order.
            let chain: Promise<void> = Promise.resolve();
            let consumerFailed = false;
            const deliver = (event: TeacherSubjectStreamEvent) => {
              chain = chain.then(() => {
                if (consumerFailed) return;
                return onEvent(event);
              }).catch((error) => {
                consumerFailed = true;
                request.destroy(error instanceof Error ? error : new Error(String(error)));
              });
            };

            response.on("data", (chunk: string) => {
              buffer += chunk;
              const parts = buffer.split(/\r?\n\r?\n/);
              buffer = parts.pop() ?? "";
              if (parts.length === 0) return;

              response.pause();
              for (const part of parts) {
                const event = parseTeacherSseEvent(part);
                if (event) deliver(event);
              }
              chain = chain.then(() => {
                if (!consumerFailed) response.resume();
              });
            });

            response.on("end", async () => {
              if (settled) return;
              if (buffer.trim()) {
                const event = parseTeacherSseEvent(buffer);
                if (event) deliver(event);
              }
              // Queued events may still be in flight after the socket ends;
              // resolving before they land drops the tail of the answer.
              await chain;
              if (settled) return;
              settled = true;
              if (consumerFailed) {
                reject(new TeacherApiError("Teacher API stream consumer failed.", 500));
                return;
              }
              resolve();
            });
          },
        );

        request.setTimeout(requestTimeoutMs, () => {
          request.destroy(new Error(`Teacher API timed out after ${requestTimeoutMs}ms`));
        });
        request.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        request.write(serializedBody);
        request.end();
      }),
  );
}

// Workspace metadata IS fast — 0.15s of work each, measured in-process on the
// production box. What it is not is alone on that box, and a timeout here is
// almost never the collection being slow to read; it is this request waiting
// behind whatever else the single uvicorn worker was handed.
//
// 6s was too tight for that. Two attempts at 6s gave the whole screen 12.5s and
// then showed "Couldn't load your workspace" — which on 2026-09-16 is exactly
// what every one of the day's 47 collection reads did, three seconds behind a
// 105-request topic sweep that is now gated (see `practiceTopicsGate`). Ten
// seconds is still far under the route's own budget and survives a burst that
// the gate has already made much smaller.
const workspaceReadOptions = { timeoutMs: 10_000, retries: 1 } as const;

export const getTeacherMe = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/me", key, workspaceReadOptions);

export const getTeacherSubjects = (key: string) =>
  teacherRequest<{ subjects: ApiRecord[] }>("/v1/collection/subjects", key, workspaceReadOptions);

export const getTeacherSourceTree = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/source-tree", key, workspaceReadOptions);

export const getTeacherDocuments = (key: string) =>
  teacherRequest<ApiRecord | ApiRecord[]>("/v1/collection/documents", key, workspaceReadOptions);

/**
 * THE LAST WORKSPACE THAT LOADED, KEPT ONLY TO SURVIVE A BUSY UPSTREAM.
 *
 * This is NOT a cache: the fresh read is always attempted and always wins, so a
 * file uploaded a second ago is in the tree a second later, exactly as before.
 * The snapshot is consulted in one situation — the fresh read failed with
 * something transient — and in that situation the alternative is not fresher
 * data, it is an error page.
 *
 * Which is the real change. The creator workspace is four independent reads and
 * it rendered only if ALL FOUR returned; one slow `source-tree` took down the
 * subjects, the papers, the classrooms and the public profile with it. A
 * teacher's own collection from a few minutes ago is a far better answer than
 * "Couldn't load your workspace", and `stale` is carried out to the UI so it can
 * say so rather than pretend.
 *
 * ONLY TRANSIENT FAILURES FALL BACK. A revoked or rotated key is 401 and must
 * keep reaching the caller, which turns it into "ask an administrator to rotate
 * it" — serving a snapshot there would hide the one error the teacher can act
 * on, for a quarter of an hour, and let them edit a workspace they can no longer
 * write to.
 *
 * SCOPE: one Node process, like `lib/http/memo.ts`, and keyed by the collection
 * secret, so it is per-teacher by construction and nothing crosses accounts.
 */
const WORKSPACE_SNAPSHOT_MS = 15 * 60 * 1000;
const WORKSPACE_SNAPSHOT_MAX_ENTRIES = 200;
const workspaceSnapshots = new Map<string, { value: unknown; storedAt: number }>();

function isTransientTeacherError(error: unknown): boolean {
  if (error instanceof TeacherApiError) return [408, 429, 500, 502, 503, 504].includes(error.status);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND"].includes(code);
}

async function withWorkspaceSnapshot<T>(
  name: string,
  key: string,
  load: () => Promise<T>,
): Promise<{ value: T; stale: boolean }> {
  const cacheKey = `${name}:${key}`;
  try {
    const value = await load();
    // A Map re-insert does not move an existing key, so delete first: the
    // eviction below drops the OLDEST entry and that is only true if a refreshed
    // entry counts as recently used.
    workspaceSnapshots.delete(cacheKey);
    workspaceSnapshots.set(cacheKey, { value, storedAt: Date.now() });
    if (workspaceSnapshots.size > WORKSPACE_SNAPSHOT_MAX_ENTRIES) {
      const oldest = workspaceSnapshots.keys().next();
      if (!oldest.done) workspaceSnapshots.delete(oldest.value);
    }
    return { value, stale: false };
  } catch (error) {
    const snapshot = workspaceSnapshots.get(cacheKey);
    if (!isTransientTeacherError(error) || !snapshot) throw error;
    if (Date.now() - snapshot.storedAt > WORKSPACE_SNAPSHOT_MS) {
      workspaceSnapshots.delete(cacheKey);
      throw error;
    }
    console.error(`[teacher-workspace] ${name} failed; serving the last good read`, error);
    return { value: snapshot.value as T, stale: true };
  }
}

/** For tests, and for anything that must prove a read went upstream. */
export function clearTeacherWorkspaceSnapshots() {
  workspaceSnapshots.clear();
}

export type TeacherWorkspaceReads = {
  collection: ApiRecord;
  subjects: { subjects: ApiRecord[] };
  sourceTree: ApiRecord;
  documents: ApiRecord | ApiRecord[];
  /** At least one of the four came from the snapshot above. */
  stale: boolean;
};

/** The four reads the creator workspace is built from, in one round of fan-out. */
export async function readTeacherWorkspace(key: string): Promise<TeacherWorkspaceReads> {
  const [collection, subjects, sourceTree, documents] = await Promise.all([
    withWorkspaceSnapshot("me", key, () => getTeacherMe(key)),
    withWorkspaceSnapshot("subjects", key, () => getTeacherSubjects(key)),
    withWorkspaceSnapshot("source-tree", key, () => getTeacherSourceTree(key)),
    withWorkspaceSnapshot("documents", key, () => getTeacherDocuments(key)),
  ]);
  return {
    collection: collection.value,
    subjects: subjects.value,
    sourceTree: sourceTree.value,
    documents: documents.value,
    stale: collection.stale || subjects.stale || sourceTree.stale || documents.stale,
  };
}

export const getTeacherDocument = (key: string, documentId: string) =>
  teacherRequest<ApiRecord>(`/v1/collection/documents/${encodeURIComponent(documentId)}`, key);

export function fetchTeacherDocumentRaw(key: string, documentId: string) {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();

  const readRaw = (path: string) =>
    trackApiRequest(
      "collection",
      () =>
        new Promise<{ body: Buffer; contentType: string }>((resolve, reject) => {
          const url = new URL(path, baseUrl);
          const transport = transportFor(url);
          const request = transport.request(
            url,
            { method: "GET", rejectUnauthorized, agent: agentFor(url), headers: { Authorization: `Bearer ${key}` } },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk: Buffer) => chunks.push(chunk));
              response.on("error", reject);
              response.on("end", () => {
                const status = response.statusCode ?? 502;
                if (status >= 400) {
                  reject(
                    new TeacherApiError(
                      `Teacher API ${url.pathname} failed with ${status}`,
                      status,
                    ),
                  );
                  return;
                }
                resolve({
                  body: Buffer.concat(chunks),
                  contentType:
                    String(response.headers["content-type"] || "") || "application/octet-stream",
                });
              });
            },
          );
          request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Teacher API timed out after ${timeoutMs}ms`));
          });
          request.on("error", reject);
          request.end();
        }),
    );

  // The COLLECTION route first, because that is the one this key is scoped for.
  // The order used to be the other way round, and the tenant route is gated on a
  // `documents:read` scope that no collection key carries — so every teacher
  // material download paid a guaranteed 403 round trip before falling back, and
  // then fell back onto a path the backend did not serve at all. Both halves are
  // fixed: the collection twin exists now, and it is asked first.
  //
  // The tenant route is kept as the fallback rather than dropped: a tenant-wide
  // key (the teachers-app operator key) can read documents outside any one
  // collection, and that is the case the collection route correctly refuses.
  const encodedId = encodeURIComponent(documentId);
  return readRaw(`/v1/collection/documents/${encodedId}/raw`).catch((error) => {
    if (error instanceof TeacherApiError && [401, 403, 404].includes(error.status)) {
      return readRaw(`/api/v1/documents/${encodedId}/raw`);
    }
    throw error;
  });
}

export const getTeacherJob = (key: string, jobId: string) =>
  teacherRequest<ApiRecord>(`/v1/jobs/${encodeURIComponent(jobId)}`, key);

export const createTeacherFolder = (key: string, path: string) =>
  teacherRequest<ApiRecord>("/v1/collection/mkdir", key, {
    method: "POST",
    body: { path },
  });

export async function createTeacherSubject(key: string, subjectName: string) {
  // The three shelves are independent folders, so they are created together
  // rather than one round trip after another — this is a teacher waiting on a
  // "create subject" button, and it was three sequential calls to the VPS.
  //
  // `allSettled` rather than `all`: a 409 means the folder is already there,
  // which is success for this purpose, and `all` would reject the whole batch on
  // the first one. Anything else is still raised, once every shelf has reported.
  const shelves = await Promise.allSettled(
    ["Syllabus", "Notes", "Question Bank"].map((shelf) =>
      createTeacherFolder(key, `${subjectName}/${shelf}`),
    ),
  );
  for (const outcome of shelves) {
    if (outcome.status !== "rejected") continue;
    const error = outcome.reason;
    if (!(error instanceof TeacherApiError) || error.status !== 409) throw error;
  }
  const response = await teacherRequest<{ collection: string; subject: ApiRecord }>(
    "/v1/collection/subjects",
    key,
    {
      method: "POST",
      body: { name: subjectName, folder_path: subjectName },
    },
  );

  const subject = response.subject;
  if (
    !subject ||
    typeof subject.name !== "string" ||
    typeof subject.slug !== "string" ||
    typeof subject.folder_path !== "string"
  ) {
    throw new Error("Teacher API returned an invalid subject response.");
  }
  return subject;
}

export const deleteTeacherSubject = (
  key: string,
  slug: string,
  options: { deleteFolder?: boolean } = {},
) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/subjects/${encodeURIComponent(slug)}?delete_folder=${options.deleteFolder ? "true" : "false"}`,
    key,
    { method: "DELETE" },
  );

export const deleteTeacherPath = (key: string, path: string) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/source-tree/${path.split("/").map(encodeURIComponent).join("/")}`,
    key,
    { method: "DELETE" },
  );

export const deleteTeacherDocument = (key: string, documentId: string) =>
  teacherRequest<ApiRecord>(`/v1/collection/documents/${encodeURIComponent(documentId)}`, key, {
    method: "DELETE",
  });

export const indexAllTeacherDocuments = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/index-all", key, { method: "POST" });

export const indexTeacherDocument = (key: string, input: { documentId?: string; path?: string }) =>
  teacherRequest<ApiRecord>("/v1/collection/index-document", key, {
    method: "POST",
    body: {
      ...(input.documentId ? { document_id: input.documentId } : {}),
      ...(input.path ? { path: input.path } : {}),
    },
  });

export const regenerateTeacherCollectionKey = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/api-key/regenerate", key, {
    method: "POST",
  });

export const askTeacherQuestion = (
  key: string,
  query: string,
  topK: number,
  namespace: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
) =>
  teacherRequest<ApiRecord>("/v1/answer", key, {
    method: "POST",
    body: { query, top_k: topK, namespace, conversation_history: conversationHistory },
  });

export const retrieveTeacherChunks = (
  key: string,
  query: string,
  topK: number,
  namespace: string,
) =>
  teacherRequest<ApiRecord>("/v1/query", key, {
    method: "POST",
    body: { query, top_k: topK, namespace },
  });

function withQuery(
  path: string,
  values: Record<string, string | number | boolean | string[] | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([name, value]) => {
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) return;
    if (Array.isArray(value)) value.forEach((item) => params.append(name, item));
    else params.set(name, String(value));
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const askTeacherSubject = (
  key: string,
  subject: string,
  query: string,
  topK: number,
  prompt: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
) =>
  teacherRequest<ApiRecord>("/v1/collection/ask", key, {
    method: "POST",
    body: {
      subject,
      query,
      top_k: topK,
      prompt,
      conversation_history: conversationHistory,
    },
  });

/**
 * An attachment on the wire: raw base64 with the `data:` header stripped.
 *
 * The browser hands these over as data URLs, and the collection endpoint wants
 * the payload on its own — it decodes straight to the bytes it passes the model.
 */
export type TeacherSubjectAttachment = {
  mime_type: string;
  data: string;
  name: string;
};

export const toTeacherSubjectAttachments = (
  attachments: Array<{ name?: string; mimeType?: string; dataUrl?: string }>,
): TeacherSubjectAttachment[] =>
  attachments.flatMap((attachment) => {
    const dataUrl = attachment.dataUrl ?? "";
    const comma = dataUrl.indexOf(",");
    // Anything that is not a base64 data URL is dropped here rather than sent as
    // junk the server would only drop again, one round trip later.
    if (comma < 0 || !dataUrl.slice(0, comma).includes("base64")) return [];
    const data = dataUrl.slice(comma + 1);
    if (!data) return [];
    return [
      {
        mime_type: attachment.mimeType || dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png",
        data,
        name: attachment.name ?? "",
      },
    ];
  });

export const askTeacherSubjectStream = (
  key: string,
  subject: string,
  query: string,
  topK: number,
  prompt: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  onEvent: (event: TeacherSubjectStreamEvent) => void | Promise<void>,
  attachments: TeacherSubjectAttachment[] = [],
) =>
  teacherStreamRequest(
    "/v1/collection/ask/stream",
    key,
    {
      subject,
      query,
      top_k: topK,
      prompt,
      conversation_history: conversationHistory,
      attachments,
    },
    onEvent,
  );

export const getTeacherCollectionWeightage = (key: string, subject: string) =>
  teacherRequest<ApiRecord>(withQuery("/v1/collection/weightage", { subject }), key);

export const getTeacherCollectionCapture = (key: string, subject: string) =>
  teacherRequest<ApiRecord>(withQuery("/v1/collection/capture", { subject }), key);

export const getTeacherCollectionReadiness = (key: string, subject: string) =>
  teacherRequest<ApiRecord>(withQuery("/v1/collection/readiness", { subject }), key);

/**
 * The topic list for one subject, memoised in-process.
 *
 * WHY THIS ONE MATTERS MORE THAN THE OTHERS ON THIS PAGE
 * ------------------------------------------------------
 * It is on the critical path of `/app/today`, and it is called ONCE PER
 * SUBJECT: `getStudentChallengeDashboard` maps over every subject a student
 * has and awaits this inside each one. A student with four subjects paid four
 * round trips to the tenant VPS before the dashboard could render, every time
 * they opened the app — and those sit behind an already deep chain of Supabase
 * queries, so they land at the worst possible moment. That is the difference
 * between a Today page that renders in under a second and one that takes
 * fifteen.
 *
 * It is also the most cacheable thing in the request. A topic list is
 * editorial: it is derived from what a teacher indexed, it is identical for
 * every student in that collection, and it changes when someone uploads
 * material — not when a student opens a page.
 *
 * `refresh: true` BYPASSES THE MEMO, and must. It is the caller explicitly
 * asking the tenant API to recompute, which is what the teacher-facing
 * "regenerate topics" path uses; serving that from a cache would make the
 * button appear broken.
 *
 * TTL 300s / stale 900s: after the first load nobody waits for this again,
 * including the request that finds the entry expired — it is served from
 * memory while the refresh runs behind it.
 *
 * AND IT IS GATED, because the memo only helps the SECOND load.
 * ------------------------------------------------------------
 * Every caller of this maps over subjects with `Promise.all`, so a cold process
 * asks for all of them in the same instant. For one community that is 35
 * requests, and on 2026-09-16 three concurrent renders made it 105 inside two
 * seconds — enough to saturate the tenant API's `weightage` pool (103 rejected)
 * and push the creator workspace's own reads past their timeout, three seconds
 * later, on a box where each of those reads is 0.15s of work. See
 * `lib/http/limit.ts` for the measurement. Four in flight keeps a fan-out a
 * queue instead of a burst; the work is not reduced, only spread.
 */
const practiceTopicsGate = createLimiter(4);

export const getTeacherPracticeTopics = (
  key: string,
  subject: string,
  options: { totalMarks?: number; maxQuestions?: number; refresh?: boolean } = {},
) => {
  const request = () =>
    practiceTopicsGate(() =>
      teacherRequest<ApiRecord>(
        withQuery("/api/v1/practice/topics", {
          subject,
          total_marks: options.totalMarks,
          max_questions: options.maxQuestions,
          refresh: options.refresh,
        }),
        key,
      ),
    );

  if (options.refresh) return request();

  // The key carries everything that changes the answer. `totalMarks` and
  // `maxQuestions` are in it because they are query parameters the tenant API
  // shapes its response by — two callers asking with different budgets must
  // not share an entry.
  return memo(
    `teacher:practice-topics:${key}:${subject}:${options.totalMarks ?? ""}:${options.maxQuestions ?? ""}`,
    request,
    { ttlSeconds: 300, staleSeconds: 900 },
  );
};

/** Drop cached topic lists for a collection, after material is (re)indexed. */
export function invalidateTeacherPracticeTopics(key: string) {
  invalidateMemo(`teacher:practice-topics:${key}`);
}

export const getTeacherPracticeChapters = (key: string, subject: string) =>
  teacherRequest<ApiRecord>(withQuery("/api/v1/practice/chapters", { subject }), key);

export const getTeacherCollectionUsage = (key: string, since?: string) =>
  teacherRequest<ApiRecord>(withQuery("/v1/collection/usage", { since }), key);

export const getTeacherCollectionPapers = (key: string, subject?: string) =>
  teacherRequest<ApiRecord | ApiRecord[]>(withQuery("/v1/collection/papers", { subject }), key);

export const getTeacherCollectionPaper = (key: string, paperId: string) =>
  teacherRequest<ApiRecord>(`/v1/collection/papers/${encodeURIComponent(paperId)}`, key);

/**
 * Step one of a challenge, and the heaviest thing on the collection API that
 * does not call a model: it walks the question bank and unit-filters its chunks,
 * which is CPU-bound on a box whose API runs one uvicorn worker.
 *
 * `retries: 1` is new and is what makes the server's pool safe to add. The pool
 * refuses a saturated burst with a fast 429 rather than holding the caller past
 * its own timeout, and this route is a read — replaying it issues nothing and
 * starts no clock — so the honest response to "busy, retry shortly" is to retry
 * shortly. Without this, `teacherRequest` would hand that 429 straight to a
 * student pressing Start, because it does not retry a POST unless told the POST
 * is replayable.
 */
export const getTeacherChallengePastQuestions = (
  key: string,
  input: { subject: string; topics: string[]; limit?: number },
) =>
  teacherRequest<TeacherChallengePastQuestionsResponse>(
    "/v1/collection/challenge/past-questions",
    key,
    { method: "POST", body: input, timeoutMs: 120_000, idempotent: true, retries: 1 },
  );

export const getTeacherChallengeReading = (
  key: string,
  input: { subject: string; topics: string[]; instruction?: string },
) =>
  teacherRequest<TeacherChallengeLearnResponse>("/v1/collection/challenge/learn", key, {
    method: "POST",
    body: input,
    timeoutMs: 180_000,
  });

/**
 * The micro-topic's five fundamentals MCQs, answer key included (see
 * `TeacherChallengeMcqQuestion`). Set once per topic upstream and cached there,
 * so every call after the first is a read — hence idempotent and retried once
 * on a busy upstream, like the past questions.
 */
export const getTeacherChallengeMcq = (key: string, input: { subject: string; topics: string[] }) =>
  teacherRequest<TeacherChallengeMcqResponse>("/v1/collection/challenge/mcq", key, {
    method: "POST",
    body: input,
    timeoutMs: 120_000,
    idempotent: true,
    retries: 1,
  });

/**
 * Queue a short animated explainer. `fresh` makes it a render of its own, never
 * handed back to a later identical request — for one student's one wrong
 * answer. NOT idempotent: each call queues (and bills) a render.
 */
export const requestTeacherExplainerAnimation = (
  key: string,
  input: { concept: string; subject: string; notes: string; seconds: number; style: "card"; fresh: true },
) =>
  teacherRequest<TeacherAnimationReply>("/api/v1/media/animations", key, {
    method: "POST",
    body: input,
    timeoutMs: 30_000,
  });

export type TeacherMediaImageResponse = {
  /** `/api/figure/<id>.png`, served through this app by app/api/figure. */
  url: string | null;
  /** `queued` is a success: the URL is valid and fetching it waits for the draw.
   *  `unavailable` means nothing will come, and `detail` says why. */
  status: "ready" | "queued" | "unavailable" | string;
  detail?: string;
};

/**
 * Ask the render service to draw a figure from a description.
 *
 * Returns as soon as the figure is NAMED — the picture itself is drawn behind
 * the response, and a request for its URL is where a reader waits. Idempotent:
 * figures are content-addressed, so the same brief names the same picture.
 */
export const requestTeacherMediaImage = (key: string, input: { brief: string; alt?: string }) =>
  teacherRequest<TeacherMediaImageResponse>("/api/v1/media/image", key, {
    method: "POST",
    body: input,
    timeoutMs: 30_000,
    idempotent: true,
  });

export const getTeacherChallengeSolvedQuestions = (
  key: string,
  /** `questions`: the exact past-question texts to answer — step one's list. */
  input: { subject: string; topics: string[]; limit?: number; questions?: string[] },
) =>
  teacherRequest<TeacherChallengeSolvedResponse>("/v1/collection/challenge/solved-questions", key, {
    method: "POST",
    body: input,
    timeoutMs: 180_000,
  });

/**
 * A challenge's reading and worked answers in Roman Nepali. The course API keeps
 * each translation per text, so a topic is translated once for every student.
 * Idempotent — the same texts give the same translations — so it may retry.
 */
export const translateTeacherChallengeTexts = (
  key: string,
  input: { subject: string; texts: string[] },
) =>
  teacherRequest<TeacherChallengeTranslateResponse>("/v1/collection/challenge/translate", key, {
    method: "POST",
    body: { language: "rn", ...input },
    timeoutMs: 180_000,
    idempotent: true,
  });

export const createTeacherChallengeExam = (
  key: string,
  input: {
    subject: string;
    topics: string[];
    questions?: number;
    duration_minutes?: number;
    pass_percent?: number;
    /**
     * Question TEXTS this student has already been shown — the worked examples
     * from /solved-questions. Nothing about a student is remembered upstream
     * between calls, so passing these is the difference between being examined
     * and being re-shown a solution.
     */
    exclude_questions?: string[];
  },
) =>
  teacherRequest<TeacherChallengeExam>("/v1/collection/challenge/exam", key, {
    method: "POST",
    body: input,
    timeoutMs: 120_000,
  });

export const submitTeacherChallengeExam = (
  key: string,
  attemptId: string,
  input: { answers: Array<{ question_id: string; answer_text: string }> },
) =>
  teacherRequest<TeacherChallengeGradeResponse>(
    `/v1/collection/challenge/exam/${encodeURIComponent(attemptId)}/submit`,
    key,
    { method: "POST", body: input, timeoutMs: 180_000 },
  );

export async function submitTeacherChallengeExamFile(
  key: string,
  attemptId: string,
  input: { studentName?: string; file: { name: string; mimeType: string; buffer: Buffer } },
) {
  const { baseUrl, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const url = new URL(
    `/v1/collection/challenge/exam/${encodeURIComponent(attemptId)}/submit-file`,
    baseUrl,
  );
  const boundary = `----padhai-challenge-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = input.file.name.replace(/["\r\n]/g, "_");
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="student_name"\r\n\r\n${input.studentName?.trim() || "Student"}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${input.file.mimeType || "application/octet-stream"}\r\n\r\n`,
    ),
    input.file.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const transport = transportFor(url);
  return trackApiRequest(
    "collection",
    () =>
      new Promise<TeacherChallengeGradeResponse>((resolve, reject) => {
        const request = transport.request(
          url,
          {
            method: "POST",
            rejectUnauthorized,
            agent: agentFor(url),
            headers: {
              Authorization: `Bearer ${key}`,
              Accept: "application/json",
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": body.length,
            },
          },
          (response) => {
            let raw = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              raw += chunk;
            });
            response.on("end", () => {
              let payload: unknown = {};
              try {
                payload = raw.trim() ? JSON.parse(raw) : {};
              } catch {}
              const status = response.statusCode ?? 502;
              if (status >= 400) {
                reject(
                  new TeacherApiError(formatTeacherApiError(payload, status), status, payload),
                );
                return;
              }
              resolve(payload as TeacherChallengeGradeResponse);
            });
          },
        );
        request.setTimeout(Math.max(defaultTimeoutMs, 180_000), () =>
          request.destroy(new Error("Challenge scan grading timed out.")),
        );
        request.on("error", reject);
        request.write(body);
        request.end();
      }),
  );
}

export const generateTeacherCollectionPaper = (
  key: string,
  input: {
    subject: string;
    chapters?: string[];
    bands?: TeacherPracticeBand[];
    mimic_question_bank?: boolean;
    title?: string;
    instruction?: string;
    university?: string;
    pass_marks?: number;
  },
) =>
  teacherRequest<ApiRecord>("/v1/collection/generate", key, {
    method: "POST",
    body: input,
    timeoutMs: 120_000,
  });

export type TeacherPracticeBand = {
  label: string;
  question_type: string;
  count: number;
  marks_each: number;
};

export const gradeTeacherPracticePaper = (
  key: string,
  paperId: string,
  input: {
    student_name?: string;
    instruction?: string;
    answers: Array<{ question_id: string; answer_text: string }>;
  },
) =>
  teacherRequest<TeacherPracticePaperGradeResponse>(`/api/v1/practice/papers/${encodeURIComponent(paperId)}/grade`, key, {
    method: "POST",
    body: input,
    timeoutMs: 120_000,
  });

/**
 * Grade answers with no stored paper behind them — the caller resends every
 * question, its marks, and (when it has one) its reference answer.
 *
 * This is the SAFETY NET under the pooled challenge exam. That exam's attempt
 * lives in the course API's memory (`_ATTEMPTS`, capped at 500, dropped on
 * restart), so a student who is mid-sitting when the API restarts would
 * otherwise have nothing to hand in to. The questions themselves are durable —
 * this app persists them on the challenge row — so the sitting can still be
 * marked here, question by question.
 *
 * `reference_answer` is optional upstream and this path has none to send: the
 * exam response deliberately withholds them so the paper cannot be read out of
 * itself. Marking is therefore a shade less exact than `/exam/{id}/submit`,
 * which is the correct trade against losing a student's twenty minutes.
 */
export const gradeTeacherAnswers = (
  key: string,
  input: {
    instruction?: string;
    items: Array<{
      question_id: string;
      question: string;
      marks: number;
      chapter?: string;
      reference_answer?: string;
      student_answer: string;
    }>;
  },
) =>
  teacherRequest<TeacherStandaloneGradeResponse>("/api/v1/practice/grade", key, {
    method: "POST",
    body: input,
    timeoutMs: 180_000,
  });

export async function gradeTeacherPracticePaperFile(
  key: string,
  paperId: string,
  input: {
    studentName?: string;
    instruction?: string;
    file: { name: string; mimeType: string; buffer: Buffer };
  },
) {
  const { baseUrl, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const url = new URL(`/api/v1/practice/papers/${encodeURIComponent(paperId)}/grade-file`, baseUrl);
  const boundary = `----padhai-teacher-grade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  const pushText = (value: string) => chunks.push(Buffer.from(value, "utf8"));
  const fields = [
    ["student_name", input.studentName?.trim() || "Student"],
    ["instruction", input.instruction?.trim() || ""],
  ];

  fields.forEach(([name, value]) => {
    pushText(`--${boundary}\r\n`);
    pushText(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    pushText(`${value}\r\n`);
  });
  pushText(`--${boundary}\r\n`);
  pushText(
    `Content-Disposition: form-data; name="file"; filename="${input.file.name.replace(/["\r\n]/g, "_")}"\r\n`,
  );
  pushText(`Content-Type: ${input.file.mimeType || "application/octet-stream"}\r\n\r\n`);
  chunks.push(input.file.buffer);
  pushText("\r\n");
  pushText(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);
  const transport = transportFor(url);
  const timeoutMs = Math.max(defaultTimeoutMs, 120_000);

  return trackApiRequest(
    "collection",
    () =>
      new Promise<TeacherPracticePaperGradeResponse>((resolve, reject) => {
        const request = transport.request(
          url,
          {
            method: "POST",
            rejectUnauthorized,
            agent: agentFor(url),
            headers: {
              Authorization: `Bearer ${key}`,
              Accept: "application/json",
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": body.length,
            },
          },
          (response) => {
            let raw = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              raw += chunk;
            });
            response.on("end", () => {
              let payload: unknown = {};
              if (raw.trim()) {
                try {
                  payload = JSON.parse(raw);
                } catch {
                  reject(
                    new TeacherApiError(
                      `Teacher API returned invalid JSON: ${raw.slice(0, 300)}`,
                      response.statusCode ?? 502,
                    ),
                  );
                  return;
                }
              }
              const status = response.statusCode ?? 502;
              if (status >= 400) {
                reject(
                  new TeacherApiError(formatTeacherApiError(payload, status), status, payload),
                );
                return;
              }
              resolve(payload as TeacherPracticePaperGradeResponse);
            });
          },
        );

        request.setTimeout(timeoutMs, () => {
          request.destroy(new Error(`Teacher API timed out after ${timeoutMs}ms`));
        });
        request.on("error", reject);
        request.write(body);
        request.end();
      }),
  );
}

/**
 * Rename one document: what it is CALLED, and nothing else.
 *
 * The collection API records the name beside the file rather than moving it, so
 * the path, the document id, the chunks and the index all stay as they were and
 * nothing is re-indexed. `path` is the one the creator is looking at; the API
 * refuses the rename if it no longer matches the id. Safe to retry: the same
 * name twice is the same result.
 */
export const renameTeacherDocument = (
  key: string,
  documentId: string,
  input: { name: string; path?: string },
) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/documents/${encodeURIComponent(documentId)}/rename`,
    key,
    {
      method: "POST",
      body: { name: input.name, ...(input.path ? { path: input.path } : {}) },
      idempotent: true,
      retries: 1,
    },
  );

/**
 * What the course API holds for one topic of the global challenge pool.
 *
 * `ready` carries the WHOLE topic bank in `content`; `building` means a job is
 * queued or running upstream and the caller should poll again later; `failed`
 * is worth retrying; `unavailable` means the material cannot produce one.
 */
export type TeacherChallengePrepareState = "ready" | "building" | "failed" | "unavailable";

export type TeacherChallengePrepareManifest = {
  past_question_count: number;
  solved_count: number;
  unsolved_count: number;
  has_reading: boolean;
  exam_pool_depth: number;
  figure_count: number;
  figures_ready: boolean;
};

/** A topic's bank as prepared: every past question, every worked answer the
 *  pool holds for them (or worked examples from the notes when the topic has no
 *  bank), the reading, and the topics it resolved to. */
export type TeacherChallengePrepareContent = {
  past_questions: TeacherChallengePastQuestion[];
  solved: TeacherChallengeSolvedQuestion[];
  reading: TeacherChallengeReading | null;
  topics: TeacherChallengeTopic[];
};

export type TeacherChallengePrepareResponse = {
  state: TeacherChallengePrepareState;
  subject: string;
  topic: string;
  revision: string;
  collection_revision: string;
  manifest: TeacherChallengePrepareManifest | null;
  /** Only when `state` is `ready`. */
  content: TeacherChallengePrepareContent | null;
  error: string | null;
};

/**
 * Prepare one topic of the global challenge pool — or report how far along it is.
 *
 * Called by the pool sweep (lib/data/challenge-pool.ts), never from a student's
 * request. It never marks questions served, so asking again is free: a poll,
 * not a second build. `force` asks for a rebuild and is therefore not replayed.
 */
export const prepareTeacherChallengeTopic = (
  key: string,
  input: { subject: string; topic: string; force?: boolean },
) =>
  teacherRequest<TeacherChallengePrepareResponse>("/v1/collection/challenge/prepare", key, {
    method: "POST",
    body: input,
    timeoutMs: 60_000,
    idempotent: !input.force,
    retries: input.force ? 0 : 1,
  });

/** The material revision a subject's pooled topics were built from. */
export const getTeacherChallengeRevision = (key: string, subject: string) =>
  teacherRequest<{ collection_revision: string }>(
    withQuery("/v1/collection/challenge/revision", { subject }),
    key,
    { timeoutMs: 30_000, retries: 1 },
  );
