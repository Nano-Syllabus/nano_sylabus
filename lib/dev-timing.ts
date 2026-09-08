/**
 * Stage timings for the server-rendered data paths, in development only.
 *
 * WHY THIS EXISTS
 * ---------------
 * `GET /app/community 200 in 2300ms` tells you a page is slow and nothing
 * about which of its dozen Supabase round trips is responsible. These pages
 * are waterfalls — `getActiveCommunity` then `getCommunity` then a membership
 * lookup then a batch of eight — and the difference between "one query is
 * slow" and "eight fast queries are running in sequence" is the difference
 * between adding an index and restructuring the function. Guessing between
 * those two costs more than measuring.
 *
 * COST IN PRODUCTION: NONE. `IS_DEV` is `process.env.NODE_ENV === "development"`,
 * which Next inlines at build time, so the branch folds to `false` and the
 * whole body is dropped. `next build` sets NODE_ENV to "production"
 * unconditionally, so this cannot be switched on in a deployment by mistake —
 * the same guarantee `dev-auth-bypass.ts` relies on.
 */

/**
 * OFF BY DEFAULT, even in development.
 *
 * These lines are per-stage and there are half a dozen per page, which is
 * exactly what you want while hunting a waterfall and pure noise the rest of
 * the time. Turn them on for a session:
 *
 *     PERF_TIMING=1 npm run dev
 *
 * Still gated on NODE_ENV as well, so setting the variable in a deployment
 * does nothing — `next build` fixes NODE_ENV to "production", the same
 * guarantee `dev-auth-bypass.ts` relies on.
 */
const IS_DEV = process.env.NODE_ENV === "development" && process.env.PERF_TIMING === "1";

/** Slower than this and the line is marked, so it stands out in a busy log. */
const SLOW_MS = 250;

/**
 * Time one awaited stage and log what it cost.
 *
 * ```ts
 * const community = await timed("community-hub:getCommunity", () =>
 *   getCommunity(slug, userId, admin),
 * );
 * ```
 *
 * Returns the value untouched and never swallows a rejection — a timing
 * wrapper that changes control flow is a debugging tool that causes bugs.
 */
export async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!IS_DEV) return run();

  const started = performance.now();
  try {
    return await run();
  } finally {
    const ms = performance.now() - started;
    const mark = ms >= SLOW_MS ? " ← SLOW" : "";
    console.log(`  [timing] ${label.padEnd(46)} ${ms.toFixed(0).padStart(6)}ms${mark}`);
  }
}

/**
 * Time a whole request path and print a header, so stages group visibly when
 * several pages render at once.
 */
export async function timedRoute<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!IS_DEV) return run();

  const started = performance.now();
  console.log(`  [timing] ── ${label} ──`);
  try {
    return await run();
  } finally {
    console.log(
      `  [timing] ── ${label} TOTAL ${(performance.now() - started).toFixed(0)}ms ──\n`,
    );
  }
}
