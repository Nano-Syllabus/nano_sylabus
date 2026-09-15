import { afterEach, describe, expect, it } from "vitest";
import { mayRestartChallenges } from "@/lib/challenge-refetch";

const original = process.env.CHALLENGE_REFETCH_EMAILS;
afterEach(() => {
  process.env.CHALLENGE_REFETCH_EMAILS = original;
});

/**
 * "Restart challenge" re-issues the lesson and the paper for an attempt that has
 * already been graded — a model call, and a second run at a topic whose score is
 * recorded. It is allowlisted rather than offered to everyone.
 */
describe("who may restart a graded challenge", () => {
  it("allows an address on the list", () => {
    process.env.CHALLENGE_REFETCH_EMAILS = "surfwithprashant@gmail.com";
    expect(mayRestartChallenges("surfwithprashant@gmail.com")).toBe(true);
  });

  it("refuses everyone else", () => {
    process.env.CHALLENGE_REFETCH_EMAILS = "surfwithprashant@gmail.com";
    expect(mayRestartChallenges("someone@else.com")).toBe(false);
    expect(mayRestartChallenges("")).toBe(false);
    expect(mayRestartChallenges(null)).toBe(false);
    expect(mayRestartChallenges(undefined)).toBe(false);
  });

  it("ignores case and surrounding spaces, on both sides", () => {
    // Supabase hands back whatever the user typed at sign-up.
    process.env.CHALLENGE_REFETCH_EMAILS = " SurfWithPrashant@Gmail.com , other@x.com ";
    expect(mayRestartChallenges("surfwithprashant@gmail.com")).toBe(true);
    expect(mayRestartChallenges("  Other@X.com ")).toBe(true);
  });

  it("grants nobody when the list is unset or empty", () => {
    // A misconfigured deployment that gave this to everyone would be the
    // expensive failure, so absence closes the door rather than opening it.
    delete process.env.CHALLENGE_REFETCH_EMAILS;
    expect(mayRestartChallenges("surfwithprashant@gmail.com")).toBe(false);
    process.env.CHALLENGE_REFETCH_EMAILS = "  , ,  ";
    expect(mayRestartChallenges("surfwithprashant@gmail.com")).toBe(false);
  });
});
