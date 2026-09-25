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

/** The response for a lost entitlement, or null for any other failure. */
export function challengeAccessResponse(error: unknown) {
  return error instanceof ChallengeAccessError
    ? NextResponse.json({ error: error.message, code: "access_revoked" }, { status: 403 })
    : null;
}
