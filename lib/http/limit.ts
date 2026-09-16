/**
 * A concurrency gate for calls that fan out one request per subject.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tenant API is ONE uvicorn worker on a small VPS, deliberately
 * (`api-service` sizes its pools against that). A page that asks it for
 * something "per subject" therefore does not cost N small requests — it costs
 * one burst that the whole process has to absorb while it is GIL-serialised.
 *
 * Measured in production on 2026-09-16: the Challenge Hub's topic catalogue
 * read is `Promise.all` over every subject, which for one community is 35
 * requests, and three concurrent server renders made it 105 inside two seconds
 * (nginx 06:43:36-37 and 07:03:46-47). The tenant API's `weightage` pool
 * saturated and rejected 103 of them. Three seconds behind that burst the
 * creator workspace asked for its four `/v1/collection/*` reads — 0.15s of work
 * each, measured in-process on the box — and every one of them queued past the
 * client's timeout. Every workspace request that day was abandoned; the teacher
 * saw "Couldn't load your workspace".
 *
 * Nothing was slow. The server was busy with work one page had asked for all at
 * once, and the fix is to stop asking for it all at once.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a rate limit and not a retry budget: the work still all happens, and
 * every caller still gets its answer. Only the number in flight at any instant
 * is bounded, so a fan-out behaves like a queue instead of a thundering herd.
 *
 * SCOPE: one Node process, like `lib/http/memo.ts`. Several serverless
 * instances each keep their own gate, so the ceiling the backend sees is
 * `limit x instances` — still bounded, and small next to an unbounded
 * `Promise.all` per render.
 */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * `run(task)` starts `task` immediately while fewer than `limit` are running,
 * and otherwise queues it FIFO. Rejections release the slot exactly like a
 * resolution does — a gate that leaks a slot on failure closes for good, which
 * is a worse outage than the one it was added to prevent.
 */
export function createLimiter(limit: number): Limiter {
  const ceiling = Math.max(1, Math.floor(limit));
  const waiting: Array<() => void> = [];
  let running = 0;

  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= ceiling) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
