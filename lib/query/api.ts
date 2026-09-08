/**
 * The one fetch every client query and mutation goes through.
 *
 * WHY A SHARED FETCHER AND NOT `fetch` AT EACH CALL SITE
 * ------------------------------------------------------
 * Forty-odd components each wrote their own `fetch` + `response.ok` + `await
 * response.json()` + try/catch. Three things went wrong every time it was
 * written again:
 *
 *   1. `cache: "no-store"` was pasted in almost everywhere. That is not a
 *      "give me fresh data" instruction — it tells the *browser* to skip its
 *      HTTP cache entirely, so a conditional request is never sent and the
 *      server never gets the chance to answer `304 Not Modified` with an empty
 *      body. On Nepali mobile data that is the difference between a 40 KB
 *      payload and a header exchange. Freshness is TanStack Query's job
 *      (`staleTime`), not the transport's.
 *   2. Errors arrived as strings, so nothing downstream could tell a 401 from
 *      a 500 — which matters, because one of those is worth retrying and the
 *      other is worth redirecting on.
 *   3. Nothing carried an `AbortSignal`, so a query cancelled by a route
 *      change still ran to completion and still wrote its result.
 *
 * `ApiError` carries the status so `shouldRetry` in `lib/query/client.ts` can
 * decide without parsing a message.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  /** 4xx that is not 408/429 — the request itself is wrong, so a retry repeats it. */
  get isClientError() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

/** Thrown when the network never produced a response at all. Status 0. */
export class NetworkError extends ApiError {
  constructor(message = "Network request failed") {
    super(message, 0);
    this.name = "NetworkError";
  }
}

type JsonInit = Omit<RequestInit, "body"> & { body?: unknown };

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; detail?: string };
    return {
      message: payload?.error || payload?.detail || fallback,
      payload,
    };
  } catch {
    return { message: fallback, payload: undefined };
  }
}

/**
 * A JSON request that either returns `T` or throws an `ApiError`.
 *
 * `cache` is deliberately left at the browser default. Route handlers under
 * `app/api` now send `ETag` and a short `Cache-Control` (see
 * `lib/http/cache.ts`), so the default mode is what lets a repeat request go
 * out as `If-None-Match` and come back as a bodyless 304. TanStack Query still
 * decides *whether* to ask; this decides how cheap asking is.
 */
export async function apiFetch<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const method = (rest.method || "GET").toUpperCase();

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  } catch (error) {
    // A cancelled query is not a failure — rethrow so TanStack Query can tell
    // the difference and drop the result silently.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError(error instanceof Error ? error.message : "Network request failed");
  }

  if (!response.ok) {
    const { message, payload } = await readError(response, `Request to ${path} failed.`);
    throw new ApiError(message, response.status, payload);
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(`Response from ${path} was not JSON.`, response.status);
  }
}

/**
 * `apiFetch` shaped for a `queryFn`: it forwards the signal TanStack Query
 * hands it, so a query cancelled by unmount or by a newer key stops on the
 * wire instead of running to completion and being discarded.
 */
export function queryFetcher<T>(path: string, init: JsonInit = {}) {
  return ({ signal }: { signal?: AbortSignal }) => apiFetch<T>(path, { ...init, signal });
}

/** `?a=1&b=2` from a record, skipping empty values, or `""` when there are none. */
export function queryString(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}
