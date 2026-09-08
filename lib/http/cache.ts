import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Conditional-request support for the JSON routes under `app/api`.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every route handler here ends in `NextResponse.json(...)`, which sends no
 * validator at all. So a client that asks for the same list twice gets the
 * whole list twice — and these lists are not small: `/api/tenant/catalog`
 * enriches every published subject from two Supabase tables, `/api/chat/
 * sessions` is a page of titles and timestamps, `/api/student/materials` a
 * document index. On a Nepali mobile connection the bytes are the latency.
 *
 * An `ETag` turns the second ask into `If-None-Match: "<hash>"` and a `304` with
 * an empty body. The server still does the work (see the note below on why
 * that is still worth it, and when it is not), but the wire cost collapses from
 * tens of kilobytes to a couple of hundred bytes, and — the part that shows on
 * screen — the browser reuses the parsed response instead of re-parsing it.
 *
 * WHAT `private` MEANS HERE, AND WHY IT IS THE DEFAULT
 * ---------------------------------------------------
 * Nearly everything under `app/api` is scoped to the signed-in user by cookie,
 * not by URL. `/api/billing/invoices` is one URL and one response per account,
 * so a shared cache — a CDN, a corporate proxy, the Vercel edge — that stored
 * it under the URL would serve one student's invoices to the next. `private`
 * is the directive that forbids exactly that, and it is why every helper here
 * takes it as the default rather than an option someone remembers to pass.
 * `publicJson` exists for the handful of routes whose answer genuinely does not
 * depend on who asked.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not skip the query. Computing the ETag needs the body, so the
 * database work has already happened by the time we can answer 304. That is
 * still the right trade for these routes — the expensive part is transfer and
 * parse, not the indexed Supabase read — but it is why the genuinely slow
 * upstream reads (the tenant catalog) are ALSO memoised server-side in
 * `lib/http/memo.ts`. Those two layers stack: the memo skips the work, the
 * ETag skips the bytes.
 */

/** Cache profiles, named so the numbers are chosen once rather than per route. */
export const CACHE = {
  /**
   * Revalidate every time, but cheaply. The browser always asks; the answer is
   * a 304 unless something changed. For per-user lists that must never appear
   * stale after a write but are re-requested constantly.
   */
  REVALIDATE: { maxAge: 0, swr: 0 },
  /**
   * 30s of silence, then a background revalidate. Matches `staleTimes.dynamic`
   * in next.config.ts and `STALE.SHORT` in lib/query/client.ts, so the three
   * caches in front of one another expire together instead of one serving what
   * another has already discarded.
   */
  SHORT: { maxAge: 30, swr: 120 },
  /** 5 minutes. Data that changes when the user acts, and that action
   *  invalidates the query key anyway. */
  SESSION: { maxAge: 300, swr: 600 },
  /** 30 minutes. Editorial data: the published catalog, plan prices. */
  STATIC: { maxAge: 1800, swr: 3600 },
} as const;

type CacheProfile = { maxAge: number; swr: number };

type JsonCacheOptions = {
  /** The incoming request, for its `If-None-Match`. Omit and no 304 is possible. */
  request?: Request;
  /** One of `CACHE.*`. */
  profile?: CacheProfile;
  /** Extra headers to merge in. */
  headers?: Record<string, string>;
  /** Response status for the 200 path. 304 is chosen by this helper. */
  status?: number;
};

/**
 * A weak ETag over the serialised body.
 *
 * WEAK (`W/`) AND NOT STRONG, deliberately. A strong validator promises the
 * bytes are identical, which licenses a client to use it for byte-range
 * requests and to treat two responses as interchangeable at that level. What
 * we can actually promise is that the *value* is the same — JSON key order
 * out of Supabase is stable in practice but is not a contract, and nothing
 * here serves ranges. Weak is the honest claim, and `If-None-Match` compares
 * weakly by default, so it costs nothing.
 *
 * sha1 rather than sha256: this runs on every response, it is not a security
 * boundary (an attacker who can choose a body can also just send that body),
 * and it is meaningfully faster on the payload sizes involved.
 */
function etagFor(body: string) {
  return `W/"${createHash("sha1").update(body).digest("base64url")}"`;
}

/**
 * Does the request already hold this version?
 *
 * `If-None-Match` may be a list, and a client that received a weak tag may
 * echo it with or without the `W/` prefix depending on how it was stored, so
 * both sides are normalised before comparing. `*` matches anything that exists,
 * which by definition includes whatever we are about to send.
 */
function matchesEtag(request: Request | undefined, etag: string) {
  const header = request?.headers.get("if-none-match");
  if (!header) return false;
  if (header.trim() === "*") return true;
  const normalise = (value: string) => value.trim().replace(/^W\//, "");
  const wanted = normalise(etag);
  return header.split(",").some((candidate) => normalise(candidate) === wanted);
}

function cacheControl(profile: CacheProfile, scope: "private" | "public") {
  if (profile.maxAge === 0 && profile.swr === 0) {
    // `must-revalidate` rather than `no-store`: the response IS stored, it just
    // may not be reused without asking. That is the whole point — a stored copy
    // is what makes the next request conditional and therefore a 304.
    return `${scope}, max-age=0, must-revalidate`;
  }
  const swr = profile.swr ? `, stale-while-revalidate=${profile.swr}` : "";
  return `${scope}, max-age=${profile.maxAge}${swr}`;
}

function build(
  data: unknown,
  scope: "private" | "public",
  { request, profile = CACHE.REVALIDATE, headers = {}, status = 200 }: JsonCacheOptions,
) {
  const body = JSON.stringify(data);
  const etag = etagFor(body);
  const control = cacheControl(profile, scope);

  if (matchesEtag(request, etag)) {
    // A 304 carries no body and MUST NOT: some clients treat a body on a 304 as
    // a protocol error and drop the response entirely. The validator and the
    // freshness directives are repeated because a 304 refreshes the stored
    // response's headers, and omitting them would leave the browser holding a
    // copy it thinks is already expired.
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": control, ...headers },
    });
  }

  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "Cache-Control": control,
      // Two accounts share every URL here, so anything that caches by URL alone
      // would cross them. `Vary: Cookie` is what tells a shared cache the
      // response depends on the session — belt and braces beside `private`,
      // and the directive that actually keeps a browser's own cache from
      // reusing one user's entry after a sign-in.
      ...(scope === "private" ? { Vary: "Cookie, Accept-Encoding" } : { Vary: "Accept-Encoding" }),
      ...headers,
    },
  });
}

/**
 * JSON for one signed-in user: ETag, `304` when unchanged, never shared.
 *
 * The drop-in for `NextResponse.json(data)` on an authenticated GET. Pass the
 * `request` or there is nothing to compare against and every response is a
 * full body.
 */
export function privateJson(data: unknown, options: JsonCacheOptions = {}) {
  return build(data, "private", options);
}

/**
 * JSON that does not depend on who asked: cacheable by proxies and the CDN.
 *
 * Only for routes where that is literally true. If the handler reads the
 * session for anything at all — even to decide whether to answer — it is
 * `privateJson`.
 */
export function publicJson(data: unknown, options: JsonCacheOptions = {}) {
  return build(data, "public", options);
}

/**
 * An error response, explicitly uncacheable.
 *
 * Worth being deliberate about: a 500 that inherits a 30s `Cache-Control` from
 * a shared helper is a 30s outage for that user even after the backend
 * recovers, and a cached 401 survives the sign-in that was supposed to fix it.
 */
export function errorJson(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
