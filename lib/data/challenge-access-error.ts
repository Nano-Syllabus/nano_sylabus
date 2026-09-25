import { NextResponse } from "next/server";

/**
 * The challenge is the student's, but the course that set it no longer is —
 * they left the community (or were removed, or its subject was unpublished).
 *
 * A 403, not the 502 every other challenge failure maps to: a 502 reads as
 * "could not build, try again", and retrying cannot help here. The hub drops
 * the card when it sees one (another tab may still be showing it).
 */
export class ChallengeAccessError extends Error {
  readonly status = 403;
  constructor(
    message = "You no longer have access to this challenge — you left the community that set it.",
  ) {
    super(message);
    this.name = "ChallengeAccessError";
  }
}

/**
 * A free account has started its daily share of challenges (see
 * `challenge-daily-limit.ts`). 402: it is a plan boundary, not a fault and not
 * lost access — the hub locks its Start buttons and offers the upgrade.
 */
export class ChallengeDailyLimitError extends Error {
  readonly status = 402;
  constructor(readonly limit: number) {
    super(
      `You've completed today's ${limit} free challenges. Come back tomorrow, or upgrade to Plus or Pro for unlimited challenges.`,
    );
    this.name = "ChallengeDailyLimitError";
  }
}

/** The response for a lost entitlement or a used-up daily allowance, or null for any other failure. */
export function challengeAccessResponse(error: unknown) {
  if (error instanceof ChallengeDailyLimitError) {
    return NextResponse.json(
      { error: error.message, code: "daily_limit", limit: error.limit },
      { status: 402 },
    );
  }
  return error instanceof ChallengeAccessError
    ? NextResponse.json({ error: error.message, code: "access_revoked" }, { status: 403 })
    : null;
}
