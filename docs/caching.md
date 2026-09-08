# Caching, end to end

How a byte gets from the NSDI backend to a student's screen, and every layer
that stops it having to make the trip again.

This is one document for three repositories because the layers only make sense
together — each one is placed where it is *because* of what the layer above and
below it does, and tuning one in isolation is how you get a cache that is both
stale and slow.

```
   browser
     │  TanStack Query           in-memory + localStorage, per tab
     │    ↓ staleTime decides whether to ask at all
     │  HTTP cache               ETag / 304, Cache-Control
     ▼
   Next.js  (nano_sylabus)
     │  Router Cache             RSC payloads, staleTimes in next.config.ts
     │  route handlers           privateJson / publicJson → ETag
     │  lib/http/memo.ts         TTL + stale-while-revalidate + single-flight
     ▼
   NSDI API  (nano_syllabus_sample)
     │  ConditionalJSONMiddleware  ETag / 304 / gzip
     │  router TTL caches          _SUBJECTS_CACHE, marketplace, stats
     ▼
   ioevid  (video-gen-check)
     │  ConditionalJSONMiddleware  ETag / 304 / gzip
     │  memo.from_file             mtime-keyed YAML + run-trail parsing
     └  image store                content-addressed, immutable, self-healing
```

---

## The principle

**Three different costs, three different layers.** A slow request is slow for
three separable reasons, and a cache only helps if it removes the one that is
actually dominant:

| cost | what removes it | where |
|---|---|---|
| doing the work | a TTL memo | `lib/http/memo.ts`, `_SUBJECTS_CACHE`, `memo.from_file` |
| sending the bytes | ETag → `304` | the two `ConditionalJSONMiddleware`s, `lib/http/cache.ts` |
| asking at all | `staleTime` | `lib/query/client.ts` |

They stack. A student opening the course browser for the second time in a
minute pays none of the three: TanStack Query does not ask, and if it did the
route would answer `304` without a body, and if it needed a body the memo would
supply it without touching the tenant API.

**Freshness comes from invalidation, not from short timeouts.** Every number
below is chosen on the assumption that the mutation which makes data wrong also
says so. A `staleTime` is not "how long until this is wrong" — it is "how long a
user would not notice it being wrong", and it is safe to make it generous
precisely because `invalidateQueries` is exact.

---

## Layer 1 — TanStack Query (`lib/query/`)

| file | what it owns |
|---|---|
| `client.ts` | defaults, the `STALE.*` scale, retry policy, what may be persisted |
| `keys.ts` | every cache key in the app, as one factory |
| `api.ts` | `apiFetch` — the one fetch, with typed `ApiError` |
| `catalog.ts` | the shared catalog / subjects / credits hooks |
| `chat-sessions.ts` | the sidebar's infinite list and its optimistic mutations |
| `hydrate.tsx` | server-side prefetch → `HydrationBoundary` |
| `server.ts` | the same keys, filled in-process instead of over HTTP |

### The staleness scale

```ts
STALE.LIVE     0        credit balance — the number a student watches change
STALE.SHORT    30s      their courses, classrooms, subject list
STALE.SESSION  5min     notes index, the materials library
STALE.STATIC   30min    the published catalog, plan prices
```

`SHORT` is 30 seconds because `staleTimes.dynamic` in `next.config.ts` is also
30 and `CACHE.SHORT` in `lib/http/cache.ts` is also 30. Three caches sit in
front of one another; if their windows disagree, one serves what another has
already discarded and you get a UI that flickers between two versions of the
truth. **Change one, change all three.**

### What is written to disk, and what is not

`localStorage` persistence is **opt-in per query**, via `meta: { persist: true }`.
Only catalog-shaped data carries it — the published subject list, plan prices —
because those are identical for every student and expensive to rebuild.

Nothing user-specific is ever persisted. That is not tidiness, it is the reason
one storage key is enough for every account on a machine: a shared campus
computer must not keep the last student's chat titles, invoices or grades. If
you ever mark a user-specific query persistable you break that invariant.

The in-memory half is cleared on account change by `<QueryIdentity>`, which each
authenticated layout renders. The cache is keyed by endpoint and the endpoint
does not change when the cookie does.

### Window focus refetching is off

A study app lives in a tab beside a PDF for an hour. Every alt-tab back would
otherwise fire every mounted query at once. Reconnect refetching stays **on** —
coming back from a dropped hotspot is the one case where the cache really is
behind and the user knows it.

---

## Layer 2 — HTTP caching in the Next route handlers

`lib/http/cache.ts` replaces `NextResponse.json(...)` on read routes:

```ts
return privateJson({ courses }, { request, profile: CACHE.SHORT });
```

It attaches a weak ETag over the serialised body and answers `304` when the
client's `If-None-Match` matches. The database work still happens — computing
the tag needs the body — so this removes **transfer and parse**, not query time.
That is the right trade for these routes, and it is why the genuinely slow
upstream read (the tenant catalog) is *also* memoised server-side.

`private` is the default and `publicJson` the exception, because nearly every
route here is scoped by cookie rather than by URL. `/api/billing/invoices` is
one URL and one response per account; a shared cache storing it under the URL
would serve one student's invoices to the next.

`errorJson` exists so a 500 never inherits a freshness window — a cached 401
survives the sign-in that was meant to fix it.

**Routes converted so far:** `tenant/catalog`, `tenant/subjects`,
`chat/sessions`, `student/courses`, `student/classrooms`,
`student/teacher-exams`, `billing/plans`, `billing/credits`, `communities`,
`public/courses`.

---

## Layer 3 — `lib/http/memo.ts`

TTL + stale-while-revalidate + single-flight, in process.

```
FRESH (age < ttl)      → return it. No upstream call.
STALE (age < ttl+swr)  → return it NOW, refresh behind it. Nobody waits.
COLD                   → await one load. Concurrent callers join the same
                         promise instead of each starting their own.
```

The third property is the one that matters under load: without it, a cold start
with twenty students on the page is twenty simultaneous requests to the backend
that is already the slow part.

**Rejections are never cached.** Storing one would turn a single upstream blip
into a full TTL of guaranteed failure for everybody. `getPublishedCatalog`
rethrows rather than caching its empty-catalog fallback for exactly this reason.

Currently used for `getPublishedCatalog` (120s fresh / 600s stale), which joins
`/api/marketplace` and `/api/v1/subjects` from the tenant API and is the slowest
and least personal read in the product.

---

## Layer 4 — the NSDI API (`nano_syllabus_sample`)

`api_service/caching.py` — one ASGI middleware, registered last so it is
outermost and sees the finished body.

- **ETag + 304** on every buffered JSON GET.
- **gzip** at level 5 on bodies ≥ 512 bytes.
- **`Cache-Control` by path prefix** (`DEFAULT_CACHE_RULES`), matching the TTLs
  the routers already keep in memory so a client is never told to hold
  something longer than the server considers valid.
- **`Vary: Authorization`** on every `private` response, for the caches that
  honour `Vary` but not `private`.

### The rule that must not be broken

**Streamed responses are never touched.** The most important latency in this
product is the gap between pressing enter and the first token, and that arrives
over `text/event-stream`. A compressor holds bytes back until it has a block to
emit — exactly the buffering those routes set `X-Accel-Buffering: no` to
prevent. Starlette's own `GZipMiddleware` would silently undo them, which is why
this is a custom middleware and not that one.

The exclusion is **structural, not a path list**: a response Starlette buffered
has a `Content-Length` and a streamed one does not, and that is checked on
`http.response.start` before any body is withheld. Adding a new SSE route needs
no change here.

Covered by `api-service/tests/test_http_caching.py`.

---

## Layer 5 — ioevid (`video-gen-check`)

Media was already right: figures, posters, gifs and mp4s are content-addressed,
so they ship `public, max-age=31536000, immutable` and the second reader never
asks again. Two things were added around them.

**`ioevid/http_cache.py`** — the same middleware, the same streaming rule, for
the JSON: `/api/config`, `/api/topics`, `/api/prompts`, `/api/plans`, and the
`/status` poll a browser hits every second or two for the 9–60 seconds a figure
takes to draw. Those polls now get `max-age=0, must-revalidate` (they must
always ask — that is the whole question) plus an ETag, so the answer while it
stays "no" is a couple of hundred bytes instead of a JSON body.

**`ioevid/memo.py`** — cache a value derived from a file, keyed on the file's
own `(mtime_ns, size)`. Not a TTL, and the difference is the point: a TTL is a
guess that is wrong in both directions, whereas the file's identity changes when
and only when its contents do. Editing `library/pricing.yaml` is picked up on
the very next request with nothing to restart, and an unchanged
`output/*/run.jsonl` is never re-parsed. `/api/usage` used to re-read and
re-total every build ever made on every request.

It is a near-copy of the api-service middleware, deliberately: the two services
deploy separately and neither may import the other. ~100 duplicated lines is the
cheaper side of that trade against a third versioned package.

Covered by `tests/test_http_cache.py`.

---

## Development

```bash
npm run dev            # Turbopack — ready in ~1.5s
npm run dev:webpack    # fallback, own dist dir so the two never collide
```

Turbopack is the default because cold start went from tens of seconds to about
two, and a change to one route recompiles that route rather than the graph
around it.

**The devtools panel is how you verify all of the above.** In `next dev`, open
the TanStack Query inspector (bottom-left) and navigate between tabs: a query
that refetches when it should have been served from cache shows up immediately
as a row flipping to "fetching". It is the fastest way to catch a `staleTime`
that did not take, a query key that is not stable across renders, or a mutation
invalidating more than it needed to.

It is excluded from production builds *structurally* — `next.config.ts` aliases
`components/query-devtools.tsx` to a stub. A `NODE_ENV` check would only remove
the render, and a dynamic `import()` behind one still emits the chunk; the alias
removes the bytes.

### Checking a route by hand

```bash
# should print an ETag and a Cache-Control
curl -sI localhost:3000/api/tenant/catalog -b "$COOKIE" | grep -i "etag\|cache-control"

# feed the tag back — should be 304 with no body
curl -sI localhost:3000/api/tenant/catalog -b "$COOKIE" -H 'If-None-Match: W/"…"'
```

---

## Adding a cached read

1. Add the key to `lib/query/keys.ts`. Never inline an array at a call site —
   invalidation is prefix-based and only works if the prefix is spelled
   identically everywhere.
2. Wrap the route handler's success path in `privateJson` (or `publicJson` if
   it reads no session at all) with the right `CACHE.*` profile.
3. Write the hook with the matching `STALE.*`.
4. If the read is slow *and* the same for everyone, add `memo(...)` behind it.
5. Invalidate it from the mutation that changes it. This is the step that makes
   every number above safe.
