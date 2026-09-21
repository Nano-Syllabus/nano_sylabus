import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepChallengePool } from "@/lib/data/challenge-pool";
import { sweepSecret } from "@/lib/data/challenge-pool-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Drain the global challenge pool: mark what has gone stale, then prepare the
 * highest-priority queued topics through the course API.
 *
 * Called by a systemd timer on the app VPS every few minutes
 * (scripts/ops/challenge-pool-sweep.*), never by a browser. It is authenticated
 * by a shared secret alone — `Authorization: Bearer <secret>` — compared in
 * constant time. With no secret available the route is off (503), not open.
 */
export async function POST(request: Request) {
  const secret = sweepSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "The challenge pool sweep is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const summary = await sweepChallengePool({ limit: 6 });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[challenge-pool] sweep failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The challenge pool sweep could not run.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Constant time in the secret: both sides are hashed to the same length first. */
function authorized(header: string | null, secret: string) {
  const presented = /^Bearer\s+(.+)$/i.exec(header || "")?.[1]?.trim() || "";
  if (!presented) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(secret));
}
